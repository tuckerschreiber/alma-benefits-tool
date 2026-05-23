# Client Matcher Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the four improvements from `docs/plans/2026-05-23-client-matcher-improvements-design.md` — FSA-level distance, designation priority scoring, availability filter from the shifts table, and shortlist filter chips.

**Architecture:** Pure client-side changes to `Client Matcher files/app.js`, `index.html`, `styles.css`. No new dependencies. One additional Airtable read (Shifts table). Two new settings fields.

**Tech Stack:** Vanilla JS, no build step, no test framework. Verification is manual in browser against a real Airtable base.

**Test methodology:** No automated tests exist; none will be added (out of scope). Each task ends with an explicit **browser verification** step listing what to click, what to look for, and what would mean failure. Commit after each verified task.

**Local serving:** Use `python3 -m http.server 8000` from `Client Matcher files/` and open `http://localhost:8000`. Some browsers cache `app.js` aggressively — hard-reload (Cmd-Shift-R) between tasks.

**Airtable setup notes for the engineer:**
- Matcher reads from a live Airtable base. The user supplies API key + Base ID via the settings panel at runtime.
- The new Shifts table read assumes a table named `Shifts` (configurable) with at least: `Care Team Member` (linked record to Care Team), `Start` (datetime), `End` (datetime).
- If during verification the Airtable schema differs from what's coded, surface that to the user before working around it.

---

## Task 1: FSA-level geocoding for accurate distance

**Why:** Current city-level geocoding returns one coord per city, so candidates in different parts of Toronto show 0 km apart. Geocoding by Forward Sortation Area (first 3 chars of postal code) gives neighborhood-level precision.

**Files:**
- Modify: `Client Matcher files/app.js` (top of file — add `extractFSA` and `geocodeFSA` near line 31; replace city geocoding in `performMatching` near lines 196 and 247; bump default `maxDistance` in `loadSettings` line 57).
- Modify: `Client Matcher files/index.html` (update the `maxDistance` input default value from 60 to 100).

**Step 1: Add FSA helpers**

After the existing `geocodeCity` function (around line 31), add:

```javascript
// Extract Forward Sortation Area (first 3 chars) from a Canadian postal code.
// Returns uppercase FSA like "M5V", or null if input is missing/invalid.
function extractFSA(postalCode) {
    if (!postalCode) return null;
    const cleaned = postalCode.replace(/\s+/g, '').toUpperCase();
    // Canadian FSA pattern: letter-digit-letter
    if (!/^[A-Z]\d[A-Z]/.test(cleaned)) return null;
    return cleaned.slice(0, 3);
}

// Geocode an FSA via Nominatim. Cached in localStorage under key "fsa:M5V".
async function geocodeFSA(postalCode) {
    const fsa = extractFSA(postalCode);
    if (!fsa) return null;
    const key = `fsa:${fsa}`;
    if (geoCache[key]) return geoCache[key];

    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?postalcode=${fsa}&country=Canada&format=json&limit=1`,
            { headers: { 'User-Agent': 'AlmaClientMatcher/1.0' } }
        );
        const data = await res.json();
        if (data.length > 0) {
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
```

**Step 2: Use FSA in client geocoding**

In `performMatching` around line 196, replace:

```javascript
const clientCity = client.fields['City'];
const clientCoord = await geocodeCity(clientCity);
if (!clientCoord) {
    console.warn('Could not geocode client city:', clientCity);
    return matches;
}
```

with:

```javascript
const clientCity = client.fields['City'];
const clientPostalRaw = client.fields['Postal Code'];
const clientCoord = await geocodeLocation(clientPostalRaw, clientCity);
if (!clientCoord) {
    console.warn('Could not geocode client location:', clientPostalRaw, clientCity);
    return matches;
}
```

**Step 3: Use FSA in care team geocoding**

In `performMatching` around line 225, replace the `uniqueCities` precaching loop with an FSA-based one:

```javascript
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
        if (!geoCache[city]) { await geocodeCity(city); await sleep(1100); }
    } else {
        if (!geoCache[`fsa:${k}`]) { await geocodeFSA(k); await sleep(1100); }
    }
}
```

Then in the per-member loop around line 247, replace `await geocodeCity(memberCity)` with `await geocodeLocation(member.fields['Postal Code'], member.fields['City'])`.

**Step 4: Bump default max distance**

In `loadSettings` (line 57):

```javascript
document.getElementById('maxDistance').value = settings.maxDistance || 100;
```

In `saveSettings` (line 67):

```javascript
maxDistance: parseInt(document.getElementById('maxDistance').value) || 100
```

In `index.html`, find the `maxDistance` input and change its `value` attribute to `100`.

**Step 5: Browser verification**

1. Start local server in `Client Matcher files/`: `python3 -m http.server 8000`.
2. Open `http://localhost:8000`, enter Airtable creds, save settings.
3. Click **Load Clients**, pick a client, click **Find Matches**.
4. Open DevTools console. Expected:
   - No "FSA geocoding failed" warnings for the majority of records.
   - `localStorage.getItem('almaGeoCache')` shows keys starting with `fsa:`.
5. In the match list, two care team members in the same city but different FSAs should now show **different** distances (e.g. one at 4 km, another at 12 km). Previously both would have read identically.
6. **Failure mode to watch for:** distances all show as 0.0 km within a city → FSA extraction is failing; check `extractFSA` against the actual postal code format in your data (sometimes data has lowercase or missing space).

**Step 6: Commit**

```bash
git add "Client Matcher files/app.js" "Client Matcher files/index.html"
git commit -m "feat(matcher): geocode by FSA for accurate distance

Switches from city-level to postal-code-FSA geocoding via Nominatim.
Falls back to city when postal code is missing or unparseable.
Bumps default max distance 60→100km."
```

---

## Task 2: Designation priority scoring

**Why:** Designation is displayed but doesn't influence ranking. Notes call out that designation preferences should be a priority signal.

**Files:**
- Modify: `Client Matcher files/app.js` (add `getDesignationScore` helper; call it in `performMatching` around line 253).

**Step 1: Add the scoring helper**

Add this function above `performMatching` (around line 188):

```javascript
// Look up a field on a record with case/whitespace tolerance.
function getField(record, name) {
    if (record.fields[name] !== undefined) return record.fields[name];
    const target = name.toLowerCase().replace(/\s+/g, '');
    for (const k of Object.keys(record.fields)) {
        if (k.toLowerCase().replace(/\s+/g, '') === target) return record.fields[k];
    }
    return undefined;
}

// Score designation match (0..30). Tries ranked, multi-select, then single field.
// Returns { score, matched } — `matched` is true when any rule fired.
function getDesignationScore(client, memberDesignation) {
    if (!memberDesignation) return { score: 0, matched: false };

    const rank1 = getField(client, 'Designation Preference 1');
    const rank2 = getField(client, 'Designation Preference 2');
    const rank3 = getField(client, 'Designation Preference 3');
    if (rank1 || rank2 || rank3) {
        if (rank1 && rank1 === memberDesignation) return { score: 30, matched: true };
        if (rank2 && rank2 === memberDesignation) return { score: 20, matched: true };
        if (rank3 && rank3 === memberDesignation) return { score: 10, matched: true };
        return { score: 0, matched: false };
    }

    const multi = getField(client, 'Preferred Designations');
    if (Array.isArray(multi) && multi.length > 0) {
        return multi.includes(memberDesignation)
            ? { score: 10, matched: true }
            : { score: 0, matched: false };
    }

    const single = getField(client, 'Preferred Designation');
    if (single) {
        return single === memberDesignation
            ? { score: 20, matched: true }
            : { score: 0, matched: false };
    }

    return { score: 0, matched: false };
}
```

**Step 2: Integrate into scoring**

In `performMatching`, replace the scoring block around line 253–257:

```javascript
let score = 100;
if (distance > 30) score -= 10;
if (distance > 45) score -= 10;
if (status === 'Ready for Review') score -= 5;
```

with:

```javascript
const memberDesignation = member.fields['Designation'] || '';
const designation = getDesignationScore(client, memberDesignation);

let score = 100;
if (distance > 20 && distance <= 40) score -= 10;
else if (distance > 40 && distance <= 60) score -= 15;
else if (distance > 60) score -= 30;
if (status === 'Ready for Review') score -= 5;
score += designation.score;
```

And in the `matches.push({ ... })` object below, add `designationMatched: designation.matched,`.

**Step 3: Show match indicator on card**

In `displayMatches` around line 309, replace:

```javascript
${match.designation ? `<div class="match-detail">🎓 ${match.designation}</div>` : ''}
```

with:

```javascript
${match.designation ? `<div class="match-detail">🎓 ${match.designation}${match.designationMatched ? ' <span class="pref-match">✓ matches preference</span>' : ''}</div>` : ''}
```

**Step 4: Add CSS for the pref-match badge**

In `Client Matcher files/styles.css`, append:

```css
.pref-match {
    color: #2a7a2a;
    font-weight: 600;
    margin-left: 0.4rem;
}
```

**Step 5: Browser verification**

1. Hard reload the matcher.
2. Pick a client and run matching.
3. Expected:
   - If your test client has any of `Designation Preference 1/2/3`, `Preferred Designations`, or `Preferred Designation` populated and matching some care team member's designation, that member's card shows the ✓ badge and a higher score than they had before.
   - If none of those fields exist, behavior is identical to before — no errors in console.
4. **Failure mode:** console error about `client.fields['…']` undefined → check that `getField` is being called via the helper, not direct field access.

**Step 6: Commit**

```bash
git add "Client Matcher files/app.js" "Client Matcher files/styles.css"
git commit -m "feat(matcher): score designation preference into ranking

Reads ranked, multi-select, or single-field designation preference
on the client record (whichever exists). Adds 0..30 to score and
marks the match card when the candidate matches preference."
```

---

## Task 3: Read shifts table from Airtable

**Why:** Foundational for the availability filter (Task 4). Pulls all bookings in the client's 8-week window into a per-member lookup.

**Files:**
- Modify: `Client Matcher files/app.js` (add settings, add `loadShiftsForWindow` function).
- Modify: `Client Matcher files/index.html` (add two settings inputs).

**Step 1: Add settings inputs to the panel**

In `index.html`, locate the existing settings inputs (Clients table, Care Team table, Max Distance). Add two new inputs next to them:

```html
<label>
    Shifts table name
    <input id="shiftsTable" type="text" value="Shifts" />
</label>
<label>
    Full-load threshold (hrs/week)
    <input id="loadThreshold" type="number" value="30" />
</label>
```

**Step 2: Wire settings load/save**

In `loadSettings` (line 49), add:

```javascript
document.getElementById('shiftsTable').value = settings.shiftsTable || 'Shifts';
document.getElementById('loadThreshold').value = settings.loadThreshold || 30;
```

In `saveSettings` (line 61), add to the settings object:

```javascript
shiftsTable: document.getElementById('shiftsTable').value.trim() || 'Shifts',
loadThreshold: parseInt(document.getElementById('loadThreshold').value) || 30,
```

**Step 3: Add the shifts loader**

Add this function above `performMatching`:

```javascript
// Pull all shifts where Start is within [startDate, startDate + weeks].
// Returns a Map keyed by care-team-member record ID → array of {start, end}.
async function loadShiftsForWindow(startDate, weeks = 8) {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
        console.warn('Invalid client Start Date, skipping shifts load');
        return new Map();
    }
    const end = new Date(start);
    end.setDate(end.getDate() + weeks * 7);

    const startISO = start.toISOString();
    const endISO = end.toISOString();
    const formula = `AND(IS_AFTER({Start}, '${startISO}'), IS_BEFORE({Start}, '${endISO}'))`;
    const url = `https://api.airtable.com/v0/${settings.baseId}/${encodeURIComponent(settings.shiftsTable)}?filterByFormula=${encodeURIComponent(formula)}`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${settings.apiKey}` }
        });
        if (!res.ok) {
            console.warn('Shifts fetch failed:', res.status);
            return new Map();
        }
        const data = await res.json();
        const byMember = new Map();
        for (const shift of data.records) {
            const memberIds = shift.fields['Care Team Member'] || [];
            const ids = Array.isArray(memberIds) ? memberIds : [memberIds];
            const shiftStart = shift.fields['Start'];
            const shiftEnd = shift.fields['End'];
            if (!shiftStart || !shiftEnd) continue;
            for (const id of ids) {
                if (!byMember.has(id)) byMember.set(id, []);
                byMember.get(id).push({ start: new Date(shiftStart), end: new Date(shiftEnd) });
            }
        }
        return byMember;
    } catch (e) {
        console.warn('Shifts load error:', e);
        return new Map();
    }
}
```

**Step 4: Browser verification**

1. Hard reload, fill in settings (note the new fields), save.
2. Run matching. Open DevTools console.
3. Temporarily add a debug log at the end of `loadShiftsForWindow` if not already verifying: `console.log('Shifts loaded for', byMember.size, 'members');` — or test from console: `loadShiftsForWindow('2026-06-01').then(m => console.log(m));`
4. Expected: a Map with non-zero size if there are bookings in the window, OR an empty Map (silently) if no bookings.
5. **Failure mode:** `Shifts fetch failed: 404` → the table name doesn't match. Confirm the table name with the user and try again. Don't hardcode a guess.

**Step 5: Commit**

```bash
git add "Client Matcher files/app.js" "Client Matcher files/index.html"
git commit -m "feat(matcher): read shifts table for availability window

Adds shifts table name and load threshold to settings. Pulls all
shifts overlapping the client's 8-week window from Start Date and
groups them by care team member. Foundation for availability filter."
```

---

## Task 4: Availability filter per member

**Why:** Excludes care team booked elsewhere from the default view, and signals partial-load candidates without hiding them.

**Files:**
- Modify: `Client Matcher files/app.js` (add `checkAvailability` helper; wire into `performMatching`; update match card display).
- Modify: `Client Matcher files/styles.css` (badges for availability states).

**Step 1: Add the availability checker**

Add above `performMatching`:

```javascript
// Determine availability state for a member given their bookings and the client.
// Returns 'available' | 'partial' | 'conflict' | 'unknown'.
function checkAvailability(member, client, bookedByMember) {
    const memberShifts = bookedByMember.get(member.id);
    if (memberShifts === undefined) return 'unknown';
    if (memberShifts.length === 0) return 'available';

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
    const start = new Date(client.fields['Start Date']);
    if (isNaN(start.getTime())) return 'unknown';
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

    if (hoursPerWeek >= threshold) return 'conflict';
    if (hoursPerWeek > 0) return 'partial';
    return 'available';
}
```

Note the schedule-mode block deliberately falls through — we don't yet know the actual schedule field shape on the client record. Verify with the user during this task. If they confirm a structured schedule field exists, extend the helper before committing.

**Step 2: Load shifts and apply per-member**

In `performMatching`, after the eligible list is built and before the geocoding precache (around line 222), add:

```javascript
const bookedByMember = await loadShiftsForWindow(client.fields['Start Date']);
```

In the per-member scoring loop (around line 253), add availability scoring:

```javascript
const availability = checkAvailability(member, client, bookedByMember);
if (availability === 'available') score += 20;
// 'partial' and 'unknown' contribute 0; 'conflict' is filtered below.
```

And push `availability` onto the match object:

```javascript
matches.push({
    // ...existing fields...
    availability,
});
```

**Important:** Do NOT filter `conflict` rows out of `matches` here. Push them with state `conflict`. The default filter chip (Task 5) hides them from view, but they need to be in the array so the matcher can toggle them back on.

**Step 3: Show availability badge on card**

In `displayMatches`, in the per-match template, add after the `match-detail` for status:

```javascript
<div class="match-detail">${availabilityBadge(match.availability)}</div>
```

And add the helper above `displayMatches`:

```javascript
function availabilityBadge(state) {
    switch (state) {
        case 'available': return '<span class="avail avail-ok">✅ Available</span>';
        case 'partial':   return '<span class="avail avail-partial">⚠️ Partially booked</span>';
        case 'conflict':  return '<span class="avail avail-conflict">⛔ Booked / over threshold</span>';
        default:          return '<span class="avail avail-unknown">? Availability unknown</span>';
    }
}
```

**Step 4: Add CSS for availability badges**

Append to `styles.css`:

```css
.avail { font-weight: 600; }
.avail-ok       { color: #2a7a2a; }
.avail-partial  { color: #b87a00; }
.avail-conflict { color: #a13; }
.avail-unknown  { color: #777; }
```

**Step 5: Browser verification**

1. Hard reload, run matching.
2. Confirm with the user what the client schedule field is actually called (if any). If it's structured, extend `checkAvailability` to parse it before committing.
3. Expected for the default 30 hrs/week threshold:
   - Care team with no shifts in window → ✅ Available, +20 score boost.
   - Care team with a few shifts but well under 30 hrs/wk → ⚠️ Partially booked.
   - Care team booked solid for the window → ⛔ Booked.
   - If Shifts fetch failed or member has no shift record → ? Unknown.
4. **Failure mode:** all members show ? Unknown → `bookedByMember` is empty because the shifts table read failed; see Task 3 verification.
5. **Failure mode:** all members show ✅ Available even though you know some are booked → `Care Team Member` field on shifts isn't a linked record array; ask the user about its actual shape.

**Step 6: Commit**

```bash
git add "Client Matcher files/app.js" "Client Matcher files/styles.css"
git commit -m "feat(matcher): availability filter from shifts table

Per-member availability state (available/partial/conflict/unknown)
based on booked hours within the client's 8-week care window.
Available members get a score boost; conflicts stay in the array
for Task 5's filter chip to hide by default."
```

---

## Task 5: Filter chips and shortlist UX

**Why:** Lets the matcher narrow visually without re-running. Default state hides conflicts; matcher can toggle to see everyone.

**Files:**
- Modify: `Client Matcher files/app.js` (introduce `allMatches` and `filters` state; refactor `displayMatches` to render from filters).
- Modify: `Client Matcher files/styles.css` (filter bar styles).

**Step 1: Add module state**

Near the top of `app.js` with the other `let` declarations (line 1):

```javascript
let allMatches = [];
let filters = {
    designation: 'any',
    maxDistance: null,    // null means use settings.maxDistance
    status: 'any',
    hasAvailability: true, // default ON — hides 'conflict'
};
```

**Step 2: Store full ranked list**

In `findMatches` (line 165), after `const matches = await performMatching(...)`, set:

```javascript
allMatches = matches;
filters.maxDistance = settings.maxDistance;
```

**Step 3: Apply filters helper**

Add above `displayMatches`:

```javascript
function applyFilters(all) {
    return all.filter(m => {
        if (filters.designation !== 'any' && m.designation !== filters.designation) return false;
        if (filters.maxDistance != null && m.distance > filters.maxDistance) return false;
        if (filters.status !== 'any' && m.status !== filters.status) return false;
        if (filters.hasAvailability && m.availability === 'conflict') return false;
        return true;
    });
}
```

**Step 4: Refactor displayMatches**

Replace the body of `displayMatches` so it accepts the client only and always renders from `allMatches` and `filters`:

```javascript
function displayMatches(client) {
    const resultsArea = document.getElementById('resultsArea');
    selectedMatches = selectedMatches.filter(id => allMatches.some(m => m.id === id));

    const matches = applyFilters(allMatches);

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

    const clientName = client.fields["Mama's Full Name"] || client.fields.Name || 'Client';
    const clientLocation = client.fields['Postal Code'] || 'Unknown';
    const clientCareType = client.fields['Daytime/Overnight [Intake]'] || client.fields['Daytime/Overnight'] || 'Unknown';
    const clientStartDate = client.fields['Start Date'] || 'TBD';

    const designations = Array.from(new Set(allMatches.map(m => m.designation).filter(Boolean))).sort();
    const statuses = Array.from(new Set(allMatches.map(m => m.status).filter(Boolean))).sort();

    resultsArea.innerHTML = `
        <div class="card">
            <div class="client-header">
                <div class="client-name">${clientName}</div>
                <span class="detail-badge">📍 ${clientLocation}</span>
                <span class="detail-badge">${clientCareType}</span>
                <span class="detail-badge">Start: ${clientStartDate}</span>
            </div>
            <div class="filter-bar">
                <label>Designation
                    <select onchange="updateFilter('designation', this.value)">
                        <option value="any">any</option>
                        ${designations.map(d => `<option value="${d}" ${filters.designation === d ? 'selected' : ''}>${d}</option>`).join('')}
                    </select>
                </label>
                <label>Max distance
                    <input type="number" value="${filters.maxDistance}" onchange="updateFilter('maxDistance', parseInt(this.value))" /> km
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
                <span class="filter-count">Showing ${matches.length} of ${allMatches.length}</span>
            </div>
            ${matches.map(match => `
                <div class="match-card ${selectedMatches.includes(match.id) ? 'selected' : ''}" onclick="toggleSelection('${match.id}')">
                    <div class="match-score">⭐ ${match.matchScore}</div>
                    <div class="match-name">${match.name}</div>
                    ${match.designation ? `<div class="match-detail">🎓 ${match.designation}${match.designationMatched ? ' <span class="pref-match">✓ matches preference</span>' : ''}</div>` : ''}
                    <div class="match-detail">📍 ${match.postalCode} (${match.distance.toFixed(1)} km away)</div>
                    <div class="match-detail">💼 ${match.status}</div>
                    <div class="match-detail">${availabilityBadge(match.availability)}</div>
                    ${match.email ? `<div class="match-detail">✉️ ${match.email}</div>` : ''}
                    ${match.availableFor ? `<div class="match-detail">Available for: ${match.availableFor}</div>` : ''}
                </div>
            `).join('')}
            <button onclick="prepareEmails()" style="margin-top: 1rem;">📧 Email Selected Matches</button>
        </div>
    `;
}

function updateFilter(key, value) {
    filters[key] = value;
    displayMatches(currentClient);
}
```

And update the call site in `findMatches` (line 179): replace `displayMatches(currentClient, matches);` with `displayMatches(currentClient);`.

**Step 5: Add filter bar CSS**

Append to `styles.css`:

```css
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem;
    margin: 1rem 0;
    background: #f5f5f7;
    border-radius: 8px;
    font-size: 0.9rem;
}
.filter-bar label { display: inline-flex; align-items: center; gap: 0.4rem; }
.filter-bar input[type="number"] { width: 5rem; padding: 0.2rem 0.4rem; }
.filter-bar select { padding: 0.2rem 0.4rem; }
.filter-count { margin-left: auto; color: #555; font-weight: 600; }
```

**Step 6: Browser verification**

1. Hard reload, run matching.
2. Expected: filter bar appears above the match cards with four controls and a "Showing X of Y" count.
3. Toggle each filter and confirm:
   - Changing the **Designation** select narrows the list to that designation; count updates live.
   - Editing **Max distance** to a smaller number hides farther matches.
   - **Status** select narrows similarly.
   - **Has availability** unchecked reveals previously-hidden `conflict` rows.
4. Click a match card to select it (border highlights). Change a filter — selection should still highlight when the row reappears.
5. **Failure mode:** clicking a filter wipes selection state → `selectedMatches` is being reset somewhere; check that the only place it's cleared is between match runs, not on re-render.

**Step 7: Commit**

```bash
git add "Client Matcher files/app.js" "Client Matcher files/styles.css"
git commit -m "feat(matcher): filter chips for in-memory shortlist narrowing

Renders full ranked list with sticky filter bar (designation, max
distance, status, has availability). Filters apply in-memory with
live count. Selection persists across re-renders. Default hides
'conflict' availability rows."
```

---

## Task 6: End-to-end validation

**Why:** Confirm the four changes compose correctly and the composite score behaves as designed.

**Files:** None modified — verification only.

**Step 1: Composite score sanity check**

In the browser, pick one client and one care team member you can reason about manually. Compute the expected score:

```
Base                                      100
- Distance penalty (use the brackets)    0..-30
- Status Ready for Review                  -5 (if applicable)
+ Designation score                       0..30
+ Availability                            0..20 (only 'available' contributes)
```

Compare to the actual displayed score. They should match within ±0 — there's no randomness.

**Step 2: Edge case sweep**

Verify each edge case in the browser:
- Client with no postal code, no city → no matches returned, console warns.
- Client with postal code but unparseable → falls back to city geocoding.
- Care team member with no Designation field → no designation contribution, no error.
- Shifts table missing or wrong name → all members show `? Availability unknown`, scoring continues, no crash.
- Toggling "Has availability" off reveals conflict rows.

**Step 3: Cross-check against the design doc**

Re-read `docs/plans/2026-05-23-client-matcher-improvements-design.md`. Each of the four changes should be observable in the running app. Note any drift in a final commit.

**Step 4: Final commit (if any cleanup or notes)**

```bash
git commit --allow-empty -m "chore(matcher): verified end-to-end against design"
```

---

## Out of scope (do not implement here)

- Sending outreach email/SMS automatically.
- Day-1 / day-2 follow-up cadence.
- `operations@almacare.ca` mailbox integration.
- Interview scheduling automation.
- Automated tests / test framework setup.

If during implementation you spot the right shape for any of these, leave it as a TODO comment with `// TODO(outreach):` so it's grep-able later. Don't build it.
