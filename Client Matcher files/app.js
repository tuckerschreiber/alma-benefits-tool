// Shared-password gate. The real credential is the Airtable PAT each
// coordinator pastes in — this just keeps casual URL-guessers out.
const AUTH_FLAG = 'matcherAuth';

function showApp() {
    document.getElementById('authGate').hidden = true;
    document.getElementById('appRoot').hidden = false;
    renderSignOut();
}

function showGate() {
    document.getElementById('appRoot').hidden = true;
    document.getElementById('authGate').hidden = false;
    document.getElementById('authPassword').focus();
}

async function submitPassword(e) {
    e.preventDefault();
    const input = document.getElementById('authPassword');
    const err = document.getElementById('authError');
    err.hidden = true;
    const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input.value }),
    });
    if (res.ok) {
        localStorage.setItem(AUTH_FLAG, '1');
        showApp();
    } else {
        err.textContent = res.status === 401 ? 'Wrong password.' : 'Something went wrong. Try again.';
        err.hidden = false;
        input.value = '';
        input.focus();
    }
}

function renderSignOut() {
    const chip = document.getElementById('userChip');
    if (!chip || chip.dataset.rendered) return;
    chip.dataset.rendered = '1';
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'Sign out';
    link.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem(AUTH_FLAG);
        location.reload();
    });
    chip.appendChild(link);
}

function initAuth() {
    document.getElementById('authForm').addEventListener('submit', submitPassword);
    if (localStorage.getItem(AUTH_FLAG) === '1') {
        showApp();
    } else {
        showGate();
    }
}

window.addEventListener('load', initAuth);

// State
let settings = {};
let allClients = [];
let allCareTeam = [];
let selectedMatches = [];
let currentClient = null;
let geoCache = JSON.parse(localStorage.getItem('almaGeoCache') || '{}');
let allMatches = [];
let shiftsLoadFailure = null;
let filters = {
    credential: 'any',
    maxDistance: null,    // null means use settings.maxDistance
    status: 'any',
    hasAvailability: true, // default ON — hides 'conflict' and 'unknown'
};
let displayLimit = 15;

// Geocode a city in Ontario via /api/geocode (server-side Nominatim proxy).
async function geocodeCity(city) {
    if (!city) return null;
    const key = city.trim().toLowerCase();
    if (geoCache[key]) return geoCache[key];

    try {
        const res = await fetch(`/api/geocode?city=${encodeURIComponent(city.trim())}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            geoCache[key] = result;
            localStorage.setItem('almaGeoCache', JSON.stringify(geoCache));
            return result;
        }
    } catch (e) {
        console.warn('Geocoding failed for', city, e);
    }
    return null;
}

// Extract Forward Sortation Area (first 3 chars) from a Canadian postal code.
// Returns uppercase FSA like "M5V", or null if input is missing/invalid.
function extractFSA(postalCode) {
    if (!postalCode) return null;
    const cleaned = postalCode.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]\d[A-Z]/.test(cleaned)) return null;
    return cleaned.slice(0, 3);
}

// Geocode an FSA via /api/geocode. Cached in localStorage under key "fsa:M5V".
async function geocodeFSA(postalCode) {
    const fsa = extractFSA(postalCode);
    if (!fsa) return null;
    const key = `fsa:${fsa}`;
    if (geoCache[key]) return geoCache[key];

    try {
        const res = await fetch(`/api/geocode?postalcode=${fsa}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
            const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            geoCache[key] = result;
            localStorage.setItem('almaGeoCache', JSON.stringify(geoCache));
            return result;
        }
    } catch (e) {
        console.warn('FSA geocoding failed for', fsa, e);
    }
    return null;
}

// Resolve a record's location: try postal code (FSA) first, fall back to city.
async function geocodeLocation(postalCode, city) {
    const fsaCoord = await geocodeFSA(postalCode);
    if (fsaCoord) return fsaCoord;
    return await geocodeCity(city);
}

// Haversine distance in km
function haversineKm(c1, c2) {
    const R = 6371;
    const dLat = (c2.lat - c1.lat) * Math.PI / 180;
    const dLon = (c2.lng - c1.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(c1.lat * Math.PI / 180) * Math.cos(c2.lat * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Defaults baked in so teammates only need to paste their own API key.
const SETTINGS_DEFAULTS = {
    apiKey: '',
    baseId: 'appimHaFTD2NoqgrS',
    clientsTable: 'Clients',
    leadsTable: 'Hubspot Leads',
    careTeamTable: 'Care Team',
    maxDistance: 100,
    shiftsTable: 'tblnACbHC0hBIbB8v',
    loadThreshold: 30,
};

// Which workflow the user is currently in: 'client' or 'lead'. Drives
// table selection, dropdown rendering, scoring tolerance, and email template.
let activeMode = 'client';

// Minimum hours/week of booked load before "partially booked" fires. Avoids
// flagging members with a single short shift as partial. Effective floor is
// max(this, 20% of loadThreshold).
const PARTIAL_HOURS_FLOOR = 5;


// Fetch the team-shared API key from the Vercel env var (if set) and
// prefill the input. Silent if not configured — falls back to user-saved key.
async function loadSharedApiKey() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) return;
        const cfg = await res.json();
        if (cfg.apiKey) {
            document.getElementById('apiKey').value = cfg.apiKey;
            settings.apiKey = cfg.apiKey;
        }
    } catch (e) {
        // Offline / endpoint missing — fine, use whatever's already loaded.
    }
}

// Initialize
loadSettings();
const configReady = loadSharedApiKey();

function loadSettings() {
    const saved = localStorage.getItem('almaSettings');
    // Strip empty saved values so they don't override the defaults — older
    // versions of this app saved '' for unset fields.
    const cleaned = saved
        ? Object.fromEntries(Object.entries(JSON.parse(saved)).filter(([, v]) => v !== '' && v != null))
        : {};
    settings = { ...SETTINGS_DEFAULTS, ...cleaned };
    document.getElementById('apiKey').value = settings.apiKey;
    document.getElementById('baseId').value = settings.baseId;
    document.getElementById('clientsTable').value = settings.clientsTable;
    document.getElementById('leadsTable').value = settings.leadsTable;
    document.getElementById('careTeamTable').value = settings.careTeamTable;
    document.getElementById('maxDistance').value = settings.maxDistance;
    document.getElementById('shiftsTable').value = settings.shiftsTable;
    document.getElementById('loadThreshold').value = settings.loadThreshold;
}

function saveSettings() {
    settings = {
        apiKey: document.getElementById('apiKey').value.trim(),
        baseId: document.getElementById('baseId').value.trim() || SETTINGS_DEFAULTS.baseId,
        clientsTable: document.getElementById('clientsTable').value.trim() || SETTINGS_DEFAULTS.clientsTable,
        leadsTable: document.getElementById('leadsTable').value.trim() || SETTINGS_DEFAULTS.leadsTable,
        careTeamTable: document.getElementById('careTeamTable').value.trim() || SETTINGS_DEFAULTS.careTeamTable,
        maxDistance: parseInt(document.getElementById('maxDistance').value) || SETTINGS_DEFAULTS.maxDistance,
        shiftsTable: document.getElementById('shiftsTable').value.trim() || SETTINGS_DEFAULTS.shiftsTable,
        loadThreshold: parseInt(document.getElementById('loadThreshold').value) || SETTINGS_DEFAULTS.loadThreshold,
    };
    localStorage.setItem('almaSettings', JSON.stringify(settings));
    showMessage('Settings saved successfully!', 'success');
}

function showMessage(text, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.textContent = text;
    document.getElementById('messages').innerHTML = '';
    document.getElementById('messages').appendChild(div);
    setTimeout(() => div.remove(), 5000);
}

// Paginated Airtable fetch — Airtable returns max 100 records/page, so the
// "all clients" mode needs to follow the offset cursor until exhausted.
async function fetchAllRecords(table, formula) {
    const baseUrl = `https://api.airtable.com/v0/${settings.baseId}/${encodeURIComponent(table)}`;
    let offset;
    const records = [];
    do {
        const params = new URLSearchParams();
        if (formula) params.set('filterByFormula', formula);
        if (offset) params.set('offset', offset);
        const url = `${baseUrl}?${params.toString()}`;
        const res = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) {
            throw new Error(`Failed to fetch ${table}: ${res.status}`);
        }
        const data = await res.json();
        records.push(...data.records);
        offset = data.offset;
    } while (offset);
    return records;
}

function getSearchMode() {
    const checked = document.querySelector('input[name="searchMode"]:checked');
    return checked ? checked.value : 'unmatched';
}

// Record-shape abstraction. Each shape knows which Airtable table backs it,
// how to filter, and how to extract the human-facing fields (name, location,
// timeline) from a record. Downstream code reads through activeShape() so
// adding a third record type later is purely additive.
const RECORD_SHAPES = {
    client: {
        kind: 'client',
        recordNoun: 'client',
        sectionTitle: '👤 Select Client to Match',
        chooseLabel: 'Choose Client',
        loadButtonLabel: '📋 Load Clients',
        searchPlaceholder: 'Type a name to filter the dropdown...',
        dateFilterLabel: 'Start Date Filter (optional)',
        dateFilterHelp: 'Only show clients starting on or after this date',
        timelineNoun: 'Start',
        showSearchMode: true,
        table: () => settings.clientsTable,
        filterFor: (searchMode) => searchMode === 'unmatched'
            ? 'AND({Matching Stage}="Unmatched",{Deposit Received Date}!="",{Status}!="Cancelled")'
            : '{Status}!="Cancelled"',
        getName: (r) =>
            r.fields["Mama's Full Name"] || r.fields.Name || ('Client ' + r.id),
        getCity: (r) => r.fields['City'] || null,
        getPostal: (r) => r.fields['Postal Code'] || null,
        getCareType: (r) =>
            r.fields['Daytime/Overnight [Intake]'] || r.fields['Daytime/Overnight'] || null,
        getTimelineRaw: (r) => getStartDateRaw(r),
        getTimelineDate: (r) => getStartDate(r),
        // No re-sort — preserve the Airtable view order coordinators already
        // expect for the Clients workflow.
        sortRecords: (records) => records,
    },
    lead: {
        kind: 'lead',
        recordNoun: 'lead',
        sectionTitle: '👤 Select Lead to Match',
        chooseLabel: 'Choose Lead',
        loadButtonLabel: '📋 Load Leads',
        searchPlaceholder: 'Type a name to filter the dropdown...',
        dateFilterLabel: 'Due Date Filter (optional)',
        dateFilterHelp: 'Only show leads due on or after this date',
        timelineNoun: 'Due',
        showSearchMode: false,
        table: () => settings.leadsTable,
        // Stay strict on Lifecycle Stage so MQLs / Customers / junk don't
        // surface. Loosen if Kavya reports missing people.
        filterFor: () => '{Lifecycle Stage}="Lead"',
        getName: (r) => {
            const first = String(r.fields['First Name'] || '').trim();
            const last = String(r.fields['Last Name'] || '').trim();
            const full = [first, last].filter(Boolean).join(' ');
            return full
                || r.fields['Primary Email']
                || r.fields['Emails']
                || ('Lead ' + r.id);
        },
        getCity: (r) => r.fields['City'] || null,
        getPostal: (r) => r.fields['Postal Code'] || null,
        // Leads carry no care-type preference — return null so performMatching
        // skips the eligibility gate instead of rejecting everyone.
        getCareType: () => null,
        getTimelineRaw: (r) => r.fields['Due date'] || r.fields['Due Date'] || null,
        getTimelineDate: (r) => {
            const raw = r.fields['Due date'] || r.fields['Due Date'];
            if (!raw) return null;
            const d = new Date(raw);
            return isNaN(d.getTime()) ? null : d;
        },
        // Soonest due first — the most useful ordering during a live consult.
        // Records without a parsable due date sink to the bottom.
        sortRecords: (records) => {
            const withKey = records.map((r) => {
                const d = RECORD_SHAPES.lead.getTimelineDate(r);
                return { r, t: d ? d.getTime() : Number.POSITIVE_INFINITY };
            });
            withKey.sort((a, b) => a.t - b.t);
            return withKey.map((x) => x.r);
        },
    },
};

function activeShape() {
    return RECORD_SHAPES[activeMode] || RECORD_SHAPES.client;
}

// Switch workflow tab. Resets the dropdown to its empty state so the user
// always re-Loads after switching — keeps people from accidentally matching
// the wrong record type.
function setActiveMode(mode) {
    if (!RECORD_SHAPES[mode] || mode === activeMode) return;
    activeMode = mode;
    const shape = activeShape();

    // Tab visual state
    document.querySelectorAll('.record-tab').forEach((btn) => {
        const isActive = btn.dataset.mode === mode;
        btn.classList.toggle('tab-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Section title + labels
    document.getElementById('selectSectionTitle').textContent = shape.sectionTitle;
    document.getElementById('dateFilterLabel').textContent = shape.dateFilterLabel;
    document.getElementById('dateFilterHelp').textContent = shape.dateFilterHelp;
    document.getElementById('chooseRecordLabel').textContent = shape.chooseLabel;
    document.getElementById('loadBtn').textContent = shape.loadButtonLabel;

    // Search-mode radio only applies to the Clients workflow
    const modeGroup = document.getElementById('searchModeGroup');
    if (modeGroup) modeGroup.style.display = shape.showSearchMode ? '' : 'none';

    // Reset record state so stale clients/leads can't bleed across tabs
    allClients = [];
    allMatches = [];
    selectedMatches = [];
    currentClient = null;
    displayLimit = 15;
    const select = document.getElementById('clientSelect');
    select.innerHTML = `<option value="">-- Click "${shape.loadButtonLabel.replace(/^📋\s*/, '')}" below --</option>`;
    select.disabled = true;
    document.getElementById('matchBtn').disabled = true;
    document.getElementById('resultsArea').innerHTML = '';
    const filterInput = document.getElementById('clientNameFilter');
    if (filterInput) filterInput.value = '';
    const counter = document.getElementById('clientFilterCount');
    if (counter) counter.textContent = '';
}

async function loadClients() {
    await configReady;
    if (!settings.apiKey || !settings.baseId) {
        showMessage('Please configure and save your settings first', 'error');
        return;
    }

    const shape = activeShape();
    const noun = shape.recordNoun;        // 'client' or 'lead'
    const nounPlural = noun + 's';

    try {
        document.getElementById('resultsArea').innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading ${nounPlural} and care team...</p></div>`;

        const mode = shape.showSearchMode ? getSearchMode() : null;
        const formula = shape.filterFor(mode);

        let records = await fetchAllRecords(shape.table(), formula);

        // Date filter applies to the shape's timeline field (start date for
        // clients, due date for leads).
        const dateFilter = document.getElementById('startDateFilter').value;
        if (dateFilter) {
            const filterDate = new Date(dateFilter);
            records = records.filter((r) => {
                const d = shape.getTimelineDate(r);
                return d != null && d >= filterDate;
            });
        }

        records = shape.sortRecords(records);
        allClients = records;
        allCareTeam = await fetchAllRecords(settings.careTeamTable);

        // Populate dropdown. In Clients/'all' mode, show the Matching Stage
        // tag so prospects vs in-care are distinguishable at a glance.
        const select = document.getElementById('clientSelect');
        select.innerHTML = `<option value="">-- Select a ${noun} --</option>`;

        allClients.forEach((record, index) => {
            const option = document.createElement('option');
            option.value = index;
            const name = shape.getName(record);
            const raw = shape.getTimelineRaw(record);
            const stage = record.fields['Matching Stage'];
            const stageTag = (shape.kind === 'client' && mode === 'all' && stage) ? ` [${stage}]` : '';
            const cityTag = (shape.kind === 'lead' && record.fields['City']) ? ` — ${record.fields['City']}` : '';
            const timelineTag = raw ? ` (${shape.timelineNoun}: ${raw})` : '';
            option.textContent = name + cityTag + stageTag + timelineTag;
            select.appendChild(option);
        });

        select.disabled = false;
        document.getElementById('matchBtn').disabled = false;
        document.getElementById('resultsArea').innerHTML = '';

        // Reset name filter input
        const filterInput = document.getElementById('clientNameFilter');
        if (filterInput) {
            filterInput.value = '';
            filterClientList('');
        }

        const filterMsg = dateFilter ? ` ${shape.timelineNoun.toLowerCase()} on or after ${dateFilter}` : '';
        const modeMsg = (shape.kind === 'client' && mode === 'all') ? ' (all clients)' : '';
        showMessage(`Loaded ${allClients.length} ${nounPlural}${filterMsg}${modeMsg} and ${allCareTeam.length} care team members`, 'success');

        // Pre-warm geocode cache in the background so the first Find Matches
        // run isn't slow waiting for cold-cache FSA lookups.
        prewarmGeocodeCache();

    } catch (error) {
        console.error('Load error:', error);
        document.getElementById('resultsArea').innerHTML = '';
        showMessage('Error: ' + error.message, 'error');
    }
}

function filterClientList(query) {
    const q = (query || '').toLowerCase().trim();
    const select = document.getElementById('clientSelect');
    if (!select) return;
    let visible = 0;
    Array.from(select.options).forEach(opt => {
        if (!opt.value) return;
        const match = !q || opt.textContent.toLowerCase().includes(q);
        opt.hidden = !match;
        if (match) visible++;
    });
    const counter = document.getElementById('clientFilterCount');
    if (counter) {
        counter.textContent = q ? `${visible} match${visible === 1 ? '' : 'es'}` : '';
    }
}

// Fire-and-forget. Geocodes every unique care-team FSA so the first
// findMatches doesn't pay cold-cache latency. FSA lookups hit a static
// server-side table (no rate limit), so this runs fast.
function prewarmGeocodeCache() {
    if (!allCareTeam.length) return;
    const fsas = new Set();
    for (const m of allCareTeam) {
        const fsa = extractFSA(m.fields['Postal Code']);
        if (fsa && !geoCache[`fsa:${fsa}`]) fsas.add(fsa);
    }
    if (fsas.size === 0) return;
    (async () => {
        for (const fsa of fsas) {
            try { await geocodeFSA(fsa); } catch (e) { /* swallow — best effort */ }
        }
    })();
}

async function findMatches() {
    const clientIndex = document.getElementById('clientSelect').value;
    if (!clientIndex) {
        showMessage('Please select a client first', 'error');
        return;
    }

    const nextClient = allClients[clientIndex];
    if (!currentClient || currentClient.id !== nextClient.id) {
        selectedMatches = [];
        displayLimit = 15;
    }
    currentClient = nextClient;
    const resultsArea = document.getElementById('resultsArea');
    resultsArea.innerHTML = '<div class="loading"><div class="spinner"></div><p>Analyzing matches... This may take a moment...</p></div>';

    try {
        const matches = await performMatching(currentClient, allCareTeam);
        allMatches = matches;
        filters.maxDistance = settings.maxDistance;

        displayMatches(currentClient);
        showMessage(`Found ${matches.length} potential matches!`, 'success');

    } catch (error) {
        console.error('Match error:', error);
        resultsArea.innerHTML = '';
        showMessage('Error: ' + error.message, 'error');
    }
}

// Look up a field on a record with case/whitespace tolerance.
function getField(record, name) {
    if (record.fields[name] !== undefined) return record.fields[name];
    const target = name.toLowerCase().replace(/\s+/g, '');
    for (const k of Object.keys(record.fields)) {
        if (k.toLowerCase().replace(/\s+/g, '') === target) return record.fields[k];
    }
    return undefined;
}

const START_DATE_FIELDS = [
    'Requested Start Date [Intake]',
    'Start Date',
    'Start Date [Intake]',
    'Care Start Date',
    'Estimated Start Date',
    'Anticipated Start Date',
];

function getStartDateRaw(client) {
    for (const name of START_DATE_FIELDS) {
        const v = getField(client, name);
        if (v != null && String(v).trim() !== '') return v;
    }
    return null;
}

// Returns a valid Date or null. Trusts Airtable's ISO format but falls back
// to permissive parsing for free-text fields.
function getStartDate(client) {
    const raw = getStartDateRaw(client);
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

// Just the structured Accreditation(s) field — picklist values, suitable for
// the credential dropdown filter. Excludes the free-text bio fields that
// pollute the list with prose.
function getMemberAccreditations(member) {
    const raw = getField(member, 'Accreditation(s)') ?? getField(member, 'Accreditations');
    if (raw == null) return [];
    const items = Array.isArray(raw) ? raw : String(raw).split(/[,;]\s*/);
    const out = new Set();
    for (const item of items) {
        const t = String(item).trim();
        if (t) out.add(t);
    }
    return Array.from(out);
}

// Aggregate a care team member's credentials from the three attribute fields
// into a deduped array of strings. Tolerates array/string/missing shapes.
function getMemberCredentials(member) {
    const fields = ['Certifications', 'Accreditation(s)', 'Areas of Specialization'];
    const out = new Set();
    for (const f of fields) {
        const raw = getField(member, f);
        if (raw == null) continue;
        const items = Array.isArray(raw) ? raw : String(raw).split(/[,;]\s*/);
        for (const item of items) {
            const trimmed = String(item).trim();
            if (trimmed) out.add(trimmed);
        }
    }
    return Array.from(out);
}

// Pull the client's stated preferences from intake fields. Same shape tolerance.
function getClientPreferences(client) {
    const fields = ['Type(s) of Support? [Intake]', 'Education Goals [Intake]', 'Requested Add-Ons [Intake]'];
    const out = new Set();
    for (const f of fields) {
        const raw = getField(client, f);
        if (raw == null) continue;
        const items = Array.isArray(raw) ? raw : String(raw).split(/[,;]\s*/);
        for (const item of items) {
            const trimmed = String(item).trim();
            if (trimmed) out.add(trimmed);
        }
    }
    return Array.from(out);
}

// Score the overlap between client preferences and member credentials.
// +5 per credential that any client preference touches (case-insensitive
// substring either direction), capped at +30. Returns { score, hits } where
// hits is the list of credentials that matched, for UI highlighting.
function getCredentialsScore(clientPrefs, memberCreds) {
    if (clientPrefs.length === 0 || memberCreds.length === 0) {
        return { score: 0, hits: [] };
    }
    const lcPrefs = clientPrefs.map(p => p.toLowerCase());
    const hits = [];
    for (const cred of memberCreds) {
        const lc = cred.toLowerCase();
        const matched = lcPrefs.some(p => lc.includes(p) || p.includes(lc));
        if (matched) hits.push(cred);
    }
    return { score: Math.min(hits.length * 5, 30), hits };
}

// Pull all shifts where Start is within [startDate, startDate + weeks].
// Returns a Map keyed by care-team-member record ID → array of {start, end},
// or null if the Shifts table couldn't be read (so callers can distinguish
// "no shifts" from "couldn't determine"). If startDate is missing/invalid
// (e.g. "TBD"), defaults to today so the window is still meaningful.
async function loadShiftsForWindow(startDate, weeks = 8) {
    let start = startDate instanceof Date ? startDate : new Date(startDate);
    if (!start || isNaN(start.getTime())) start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + weeks * 7);

    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const formula = `AND(IS_AFTER({start_at}, '${startISO}'), IS_BEFORE({start_at}, '${endISO}'))`;
    const url = `https://api.airtable.com/v0/${settings.baseId}/${encodeURIComponent(settings.shiftsTable)}?filterByFormula=${encodeURIComponent(formula)}`;

    try {
        let offset;
        const records = [];
        do {
            const u = offset ? `${url}&offset=${offset}` : url;
            const res = await fetch(u, { headers: { 'Authorization': `Bearer ${settings.apiKey}` } });
            if (!res.ok) {
                console.warn('Shifts fetch failed:', res.status);
                shiftsLoadFailure = `Shifts table "${settings.shiftsTable}" returned ${res.status} from Airtable. Check the table name/ID in settings.`;
                return null;
            }
            const data = await res.json();
            records.push(...data.records);
            offset = data.offset;
        } while (offset);
        const byMember = new Map();
        for (const shift of records) {
            const memberIds = shift.fields['Care Team'] || [];
            const ids = Array.isArray(memberIds) ? memberIds : [memberIds];
            const shiftStart = shift.fields['start_at'];
            const shiftEnd = shift.fields['end_at'];
            if (!shiftStart || !shiftEnd) continue;
            for (const id of ids) {
                if (!byMember.has(id)) byMember.set(id, []);
                byMember.get(id).push({ start: new Date(shiftStart), end: new Date(shiftEnd) });
            }
        }
        return byMember;
    } catch (e) {
        console.warn('Shifts load error:', e);
        shiftsLoadFailure = `Shifts load error: ${e.message}. Availability will show as unknown.`;
        return null;
    }
}

// Determine availability state for a member given their bookings and the client.
// Returns 'available' | 'partial' | 'conflict' | 'unknown'.
function checkAvailability(member, client, bookedByMember) {
    if (bookedByMember == null) return 'unknown';
    const memberShifts = bookedByMember.get(member.id);
    if (!memberShifts || memberShifts.length === 0) return 'available';

    // Try specific weekly schedule first.
    const clientScheduleRaw = getField(client, 'Weekly Schedule') || getField(client, 'Schedule');
    if (clientScheduleRaw) {
        // Schedule expected as array of {dayOfWeek 0-6, startHour, endHour} or
        // string like "Mon 9-17,Wed 9-17". For now: any text presence triggers
        // overlap check by sampling — but if the structure is unknown we skip
        // strict mode and fall through to load-threshold mode.
        // (Document an explicit parser when the actual schedule field shape
        // is confirmed with the user.)
    }

    // Load-threshold mode: total booked hours / weeks in window.
    let start = activeShape().getTimelineDate(client) || new Date();
    const weeks = 8;
    const end = new Date(start);
    end.setDate(end.getDate() + weeks * 7);

    let totalHours = 0;
    for (const s of memberShifts) {
        const overlapStart = s.start > start ? s.start : start;
        const overlapEnd = s.end < end ? s.end : end;
        const diffMs = overlapEnd - overlapStart;
        if (diffMs > 0) totalHours += diffMs / 1000 / 60 / 60;
    }
    const hoursPerWeek = totalHours / weeks;
    const threshold = settings.loadThreshold || 30;
    // A single short shift shouldn't flag someone as "partially booked" — that
    // was confusing coordinators. Require meaningful load before partial fires.
    const partialFloor = Math.max(PARTIAL_HOURS_FLOOR, threshold * 0.2);

    if (hoursPerWeek >= threshold) return 'conflict';
    if (hoursPerWeek >= partialFloor) return 'partial';
    return 'available';
}

async function performMatching(client, careTeam) {
    const shape = activeShape();
    const matches = [];
    const clientCareType = shape.getCareType(client);
    // Leads carry no care-type preference. When unknown, skip the eligibility
    // gate (everyone passes) rather than rejecting everyone.
    const careTypeKnown = clientCareType != null;

    // Geocode the record's location
    const clientCity = shape.getCity(client);
    const clientPostalRaw = shape.getPostal(client);
    const clientCoord = await geocodeLocation(clientPostalRaw, clientCity);
    if (!clientCoord) {
        console.warn('Could not geocode location:', clientPostalRaw, clientCity);
        return matches;
    }

    // Collect eligible members (pass status + care type filters first)
    const eligible = [];
    for (const member of careTeam) {
        const status = member.fields['Status'];
        const memberPostal = member.fields['Postal Code'];
        const memberCareTypes = member.fields['Daytime / Overnight'] || member.fields['Daytime/Overnight'];

        if (status !== 'Active' && status !== 'Ready for Review') continue;
        if (!memberPostal && !member.fields['City']) continue;

        if (careTypeKnown) {
            let careTypeMatch = false;
            if (memberCareTypes) {
                const memberTypes = Array.isArray(memberCareTypes) ? memberCareTypes : [memberCareTypes];
                const clientTypes = Array.isArray(clientCareType) ? clientCareType : [clientCareType];
                careTypeMatch = memberTypes.some(mt => clientTypes.includes(mt));
            }
            if (!careTypeMatch) continue;
        }

        eligible.push(member);
    }

    shiftsLoadFailure = null;
    const bookedByMember = await loadShiftsForWindow(shape.getTimelineDate(client));
    const clientPrefs = shape.kind === 'client' ? getClientPreferences(client) : [];

    // Pre-cache FSAs for all eligible members (rate-limited for uncached)
    const uniqueFSAs = new Set();
    for (const m of eligible) {
        const fsa = extractFSA(m.fields['Postal Code']);
        if (fsa) uniqueFSAs.add(fsa);
        else {
            const city = (m.fields['City'] || '').trim().toLowerCase();
            if (city) uniqueFSAs.add(`city:${city}`);
        }
    }
    let uncachedCount = 0;
    for (const k of uniqueFSAs) {
        const cacheKey = k.startsWith('city:') ? k.slice(5) : `fsa:${k}`;
        if (!geoCache[cacheKey]) uncachedCount++;
    }
    if (uncachedCount > 0) {
        document.getElementById('resultsArea').innerHTML = `<div class="loading"><div class="spinner"></div><p>Geocoding ${uncachedCount} locations (one-time, cached after)...</p></div>`;
    }
    for (const k of uniqueFSAs) {
        if (k.startsWith('city:')) {
            const city = k.slice(5);
            // City lookups go to Nominatim — keep the courtesy delay between
            // requests (1 req/sec is the public-tier limit).
            if (!geoCache[city]) { await geocodeCity(city); await sleep(1100); }
        } else {
            // FSA lookups hit a static server-side table; no rate limit, so
            // skip the sleep that used to add ~1s per uncached FSA.
            if (!geoCache[`fsa:${k}`]) await geocodeFSA(k);
        }
    }

    // Now calculate real distances
    for (const member of eligible) {
        const memberCareTypes = member.fields['Daytime / Overnight'] || member.fields['Daytime/Overnight'];
        const status = member.fields['Status'];

        const memberCoord = await geocodeLocation(member.fields['Postal Code'], member.fields['City']);
        if (!memberCoord) continue;

        const distance = haversineKm(clientCoord, memberCoord);
        if (distance > settings.maxDistance) continue;

        const memberCreds = getMemberCredentials(member);
        const creds = getCredentialsScore(clientPrefs, memberCreds);
        const accreditations = getMemberAccreditations(member);

        const breakdown = [{ label: 'Base', delta: 100 }];
        let score = 100;
        let distancePenalty = 0;
        if (distance > 20 && distance <= 40) distancePenalty = -10;
        else if (distance > 40 && distance <= 60) distancePenalty = -15;
        else if (distance > 60) distancePenalty = -30;
        if (distancePenalty) {
            score += distancePenalty;
            breakdown.push({ label: `Distance ${distance.toFixed(1)}km`, delta: distancePenalty });
        }
        if (status === 'Ready for Review') {
            score -= 5;
            breakdown.push({ label: 'Status: Ready for Review', delta: -5 });
        }
        if (creds.score) {
            score += creds.score;
            breakdown.push({ label: `Credentials match (${creds.hits.length})`, delta: creds.score });
        }

        const availability = checkAvailability(member, client, bookedByMember);
        if (availability === 'available') {
            score += 20;
            breakdown.push({ label: 'Available', delta: 20 });
        }
        // 'partial' and 'unknown' contribute 0; 'conflict' is filtered below.

        matches.push({
            id: member.id,
            name: member.fields['Full Name'] || 'Unknown',
            email: member.fields['Email'] || member.fields['email'],
            postalCode: member.fields['Postal Code'],
            distance: distance,
            credentials: memberCreds,
            accreditations,
            credentialHits: creds.hits,
            availableFor: Array.isArray(memberCareTypes) ? memberCareTypes.join(', ') : memberCareTypes,
            matchScore: score,
            scoreBreakdown: breakdown,
            status: status,
            availability,
        });
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
}

function availabilityBadge(state) {
    switch (state) {
        case 'available': return '<span class="avail avail-ok">✅ Available</span>';
        case 'partial':   return '<span class="avail avail-partial">⚠️ Partially booked</span>';
        case 'conflict':  return '<span class="avail avail-conflict">⛔ Booked / over threshold</span>';
        default:          return '<span class="avail avail-unknown">? Availability unknown</span>';
    }
}

function applyFilters(all) {
    return all.filter(m => {
        if (filters.credential !== 'any' && !(m.credentials || []).includes(filters.credential)) return false;
        if (filters.maxDistance != null && m.distance > filters.maxDistance) return false;
        if (filters.status !== 'any' && m.status !== filters.status) return false;
        if (filters.hasAvailability && (m.availability === 'conflict' || m.availability === 'unknown')) return false;
        return true;
    });
}

function displayMatches(client) {
    const resultsArea = document.getElementById('resultsArea');
    selectedMatches = selectedMatches.filter(id => allMatches.some(m => m.id === id));

    const filtered = applyFilters(allMatches);
    const matches = filtered.slice(0, displayLimit);
    const hiddenCount = filtered.length - matches.length;

    if (allMatches.length === 0) {
        resultsArea.innerHTML = `
            <div class="card">
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <h3>No Matches Found</h3>
                    <p>No care team members match all criteria for this client</p>
                </div>
            </div>
        `;
        return;
    }

    const shape = activeShape();
    const clientName = shape.getName(client);
    const clientLocation = shape.getPostal(client) || shape.getCity(client) || 'Unknown';
    const clientCareType = shape.getCareType(client) || (shape.kind === 'lead' ? 'Lead (no care type on file)' : 'Unknown');
    const startDate = shape.getTimelineDate(client);
    const startDateRaw = shape.getTimelineRaw(client);
    const startDateDisplay = startDateRaw || 'TBD';

    // Source the credential dropdown from the structured Accreditation(s)
    // field only. Free-text certifications and specializations still feed the
    // score, but their prose-y values were polluting the filter.
    const credentials = Array.from(new Set(
        allMatches.flatMap(m => m.accreditations || [])
    )).sort();
    const statuses = Array.from(new Set(allMatches.map(m => m.status).filter(Boolean))).sort();

    resultsArea.innerHTML = `
        <div class="card">
            <div class="client-header">
                <div class="client-name">${clientName}</div>
                <span class="detail-badge">📍 ${clientLocation}</span>
                <span class="detail-badge">${clientCareType}</span>
                <span class="detail-badge">${shape.timelineNoun}: ${startDateDisplay}</span>
            </div>
            <div class="filter-bar">
                <label>Credential
                    <select onchange="updateFilter('credential', this.value)">
                        <option value="any">any</option>
                        ${credentials.map(c => `<option value="${c}" ${filters.credential === c ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </label>
                <label>Max distance
                    <input type="number" min="0" max="${settings.maxDistance}" value="${filters.maxDistance ?? ''}" onchange="updateFilter('maxDistance', this.value === '' ? null : parseInt(this.value))" /> km
                </label>
                <label>Status
                    <select onchange="updateFilter('status', this.value)">
                        <option value="any">any</option>
                        ${statuses.map(s => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </label>
                <label>
                    <input type="checkbox" ${filters.hasAvailability ? 'checked' : ''} onchange="updateFilter('hasAvailability', this.checked)" />
                    Has availability
                </label>
                <span class="filter-count">Showing ${matches.length} of ${filtered.length}${filtered.length !== allMatches.length ? ` (${allMatches.length} total)` : ''}</span>
            </div>
            ${shiftsLoadFailure ? `<div class="filter-note filter-note-error">⚠️ ${shiftsLoadFailure}</div>` : ''}
            ${!startDate ? `<div class="filter-note">ℹ️ ${shape.timelineNoun} Date is ${startDateRaw ? `unparseable ("${startDateRaw}")` : 'missing'} — availability is computed against the next 8 weeks from today.</div>` : ''}
            ${matches.map(match => {
                const breakdownTitle = (match.scoreBreakdown || [])
                    .map(b => `${b.delta >= 0 ? '+' : ''}${b.delta}  ${b.label}`)
                    .join('\n');
                return `
                <div class="match-card ${selectedMatches.includes(match.id) ? 'selected' : ''}" onclick="toggleSelection('${match.id}')">
                    <div class="match-score" data-tooltip="${breakdownTitle.replace(/"/g, '&quot;')}">⭐ ${match.matchScore}</div>
                    <div class="match-name">${match.name}</div>
                    <div class="match-detail score-breakdown">${(match.scoreBreakdown || []).map(b => {
                        const sign = b.delta > 0 ? '+' : '';
                        const cls = b.delta < 0 ? 'score-neg' : (b.delta > 0 ? 'score-pos' : '');
                        return `<span class="score-chip ${cls}">${sign}${b.delta} ${b.label}</span>`;
                    }).join('')}</div>
                    ${(match.credentials && match.credentials.length) ? `<div class="match-detail">🎓 ${match.credentials.map(c => {
                        const display = c.length > 60 ? c.slice(0, 60).replace(/\s+\S*$/, '') + '…' : c;
                        const title = c.length > 60 ? ` title="${c.replace(/"/g, '&quot;')}"` : '';
                        const isHit = (match.credentialHits || []).includes(c);
                        return isHit ? `<span class="pref-match"${title}>${display}</span>` : `<span${title}>${display}</span>`;
                    }).join(', ')}</div>` : ''}
                    <div class="match-detail">📍 ${match.postalCode} (${match.distance.toFixed(1)} km away)</div>
                    <div class="match-detail">💼 ${match.status}</div>
                    <div class="match-detail">${availabilityBadge(match.availability)}</div>
                    ${match.email ? `<div class="match-detail">✉️ ${match.email}</div>` : ''}
                    ${match.availableFor ? `<div class="match-detail">Available for: ${match.availableFor}</div>` : ''}
                </div>
            `;}).join('')}
            ${hiddenCount > 0 ? `<button class="btn-secondary" onclick="showAllMatches()" style="margin-top: 1rem;">Show all ${filtered.length} matches (${hiddenCount} more)</button>` : ''}
            <button onclick="prepareEmails()" style="margin-top: 1rem;">📧 Email Selected Matches</button>
        </div>
    `;
}

function showAllMatches() {
    displayLimit = Infinity;
    displayMatches(currentClient);
}

function updateFilter(key, value) {
    filters[key] = value;
    displayMatches(currentClient);
}

function toggleSelection(matchId) {
    const index = selectedMatches.indexOf(matchId);
    if (index > -1) {
        selectedMatches.splice(index, 1);
    } else {
        selectedMatches.push(matchId);
    }

    // Update UI
    const cards = document.querySelectorAll('.match-card');
    cards.forEach(card => {
        const onclick = card.getAttribute('onclick');
        if (onclick && onclick.includes(matchId)) {
            if (selectedMatches.includes(matchId)) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        }
    });
}

function firstNonEmptyField(record, names) {
    for (const name of names) {
        const v = getField(record, name);
        if (v != null && String(v).trim() !== '') return v;
    }
    return null;
}

function formatFieldValue(v) {
    if (v == null) return '';
    return Array.isArray(v) ? v.join(', ') : String(v);
}

function buildEmailFor(match, record) {
    return activeShape().kind === 'lead'
        ? buildLeadEmail(match, record)
        : buildClientEmail(match, record);
}

function buildClientEmail(match, client) {
    const memberName = match.fields['Full Name'] || 'Team Member';
    const email = match.fields['Email'] || match.fields['email'] || '';

    const city = getField(client, 'City');
    const postal = getField(client, 'Postal Code');
    const addressLong = [city, postal].filter(Boolean).join(', ') || 'TBD';
    const addressShort = city || postal || 'TBD';

    const careType = formatFieldValue(firstNonEmptyField(client, [
        'Daytime/Overnight [Intake]', 'Daytime/Overnight',
    ])) || 'TBD';
    const schedule = formatFieldValue(firstNonEmptyField(client, [
        'Requested Care Schedule [Intake]', 'Requested Care Schedule',
        'Care Schedule [Intake]', 'Schedule [Intake]', 'Weekly Schedule',
    ])) || 'TBD';
    const startDate = getStartDateRaw(client) || 'TBD';
    const duration = formatFieldValue(firstNonEmptyField(client, [
        'Requested Duration [Intake]', 'Requested Duration',
        'Duration of Care [Intake]', 'Duration of Care',
    ])) || 'TBD';
    const dueDate = formatFieldValue(firstNonEmptyField(client, [
        'Due Date [Intake]', 'Due Date', 'Estimated Due Date',
    ])) || 'TBD';
    const numChildren = formatFieldValue(firstNonEmptyField(client, [
        '# of children', '# of Children', '# of Children [Intake]',
        'Number of Children [Intake]', 'Number of Siblings [Intake]',
    ])) || 'TBD';
    const pets = formatFieldValue(firstNonEmptyField(client, [
        'About Pets [Intake]', 'About Pets', 'Pets [Intake]', 'Pets',
    ])) || 'TBD';
    const supportTypes = formatFieldValue(firstNonEmptyField(client, [
        'Type(s) of Support? [Intake]', 'Types of Support [Intake]',
        'Type of Support [Intake]',
    ])) || 'TBD';
    const educationGoals = formatFieldValue(firstNonEmptyField(client, [
        'Education Goals [Intake]', 'Education Goals',
    ])) || 'TBD';

    const subject = `New Alma Opportunity ${addressShort}`;
    const body =
        `Hello ${memberName},\n\n` +
        `We have an Alma Care family located at ${addressLong} seeking ${careType} support with the following details:\n\n` +
        `Support type: ${careType}\n` +
        `Schedule: ${schedule}\n` +
        `Start Date: ${startDate}\n` +
        `Duration of Care: ${duration}\n` +
        `Due Date: ${dueDate}\n` +
        `Number of siblings: ${numChildren}\n` +
        `Pets: ${pets}\n` +
        `Support: ${supportTypes}\n` +
        `Education Goals: ${educationGoals}\n\n` +
        `We think you'd be a great fit for this family and would love to have you support them.\n\n` +
        `Please let me know if you're interested and reply within 24 hours; I'd be happy to send your bio to the family.\n\n` +
        `With best wishes,\nSandra Bahoua`;
    return { email, name: memberName, subject, body };
}

// Leads have far less intake data than clients — no schedule, duration,
// support type, etc. Keep the email short: city, due date, a soft ask.
function buildLeadEmail(match, lead) {
    const memberName = match.fields['Full Name'] || 'Team Member';
    const email = match.fields['Email'] || match.fields['email'] || '';

    const shape = RECORD_SHAPES.lead;
    const city = shape.getCity(lead);
    const postal = shape.getPostal(lead);
    const addressLong = [city, postal].filter(Boolean).join(', ') || 'TBD';
    const addressShort = city || postal || 'TBD';
    const dueDate = shape.getTimelineRaw(lead) || 'TBD';

    const subject = `Potential Alma Care client — ${addressShort}`;
    const body =
        `Hello ${memberName},\n\n` +
        `We're talking with a prospective Alma Care family located at ${addressLong}, with a due date of ${dueDate}.\n\n` +
        `Before we go further with them, I wanted to gauge your interest based on location and timing — would you be open to supporting a family in this area around that timeframe?\n\n` +
        `If yes, please reply within 24 hours and I'll send more details once they're confirmed.\n\n` +
        `With best wishes,\nSandra Bahoua`;
    return { email, name: memberName, subject, body };
}

// Build a Gmail compose URL that opens a prefilled draft in Gmail web.
// Requires the user to be signed into Gmail in the same browser.
function gmailDraftHref(e) {
    const params = new URLSearchParams({
        view: 'cm',
        fs: '1',
        to: e.email,
        su: e.subject,
        body: e.body,
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
}

function prepareEmails() {
    if (selectedMatches.length === 0) {
        showMessage('Please select at least one care team member first', 'error');
        return;
    }

    const drafts = selectedMatches
        .map(id => allCareTeam.find(ct => ct.id === id))
        .filter(Boolean)
        .map(m => ({ id: m.id, ...buildEmailFor(m, currentClient) }));

    const rows = drafts.map(d => `
        <div class="email-draft-row">
            <div class="email-draft-meta">
                <div class="email-draft-name">${d.name}</div>
                <div class="email-draft-addr">${d.email || '<em>no email on file</em>'}</div>
            </div>
            ${d.email
                ? `<a class="btn-secondary email-draft-btn" href="${gmailDraftHref(d)}" target="_blank" rel="noopener">Open Gmail draft</a>`
                : '<span class="email-draft-warn">missing email</span>'}
        </div>
    `).join('');

    const fallbackText = drafts.map(d =>
        `TO: ${d.email || 'NO EMAIL'}\nSUBJECT: ${d.subject}\n\n${d.body}\n\n---\n`
    ).join('\n');

    document.getElementById('emailContent').innerHTML = `
        <p class="email-modal-intro">Opens one Gmail draft per recipient (you'll need to be signed into Gmail). Sending is still a manual click — this tool does not send for you.</p>
        ${rows}
        <div class="email-modal-actions">
            <button class="btn-secondary" onclick="copyAllEmails()">📋 Copy all as text</button>
        </div>
        <textarea id="emailFallbackText" style="display:none;">${fallbackText.replace(/</g, '&lt;')}</textarea>
    `;
    document.getElementById('emailModal').classList.add('active');
}

function copyAllEmails() {
    const ta = document.getElementById('emailFallbackText');
    if (!ta) return;
    const text = ta.value;
    navigator.clipboard.writeText(text).then(
        () => showMessage(`📋 Copied ${selectedMatches.length} email(s) to clipboard.`, 'success'),
        () => showMessage('Clipboard blocked — select the textarea text manually.', 'error'),
    );
}

function closeEmailModal() {
    document.getElementById('emailModal').classList.remove('active');
}
