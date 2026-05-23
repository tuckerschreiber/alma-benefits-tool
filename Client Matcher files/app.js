// State
let settings = {};
let allClients = [];
let allCareTeam = [];
let selectedMatches = [];
let currentClient = null;
let geoCache = JSON.parse(localStorage.getItem('almaGeoCache') || '{}');

// Geocode a city in Ontario via Nominatim (cached in localStorage)
async function geocodeCity(city) {
    if (!city) return null;
    const key = city.trim().toLowerCase();
    if (geoCache[key]) return geoCache[key];

    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city.trim())}&state=Ontario&country=Canada&format=json&limit=1`,
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

// Initialize
loadSettings();

function loadSettings() {
    const saved = localStorage.getItem('almaSettings');
    if (saved) {
        settings = JSON.parse(saved);
        document.getElementById('apiKey').value = settings.apiKey || '';
        document.getElementById('baseId').value = settings.baseId || '';
        document.getElementById('clientsTable').value = settings.clientsTable || 'Clients';
        document.getElementById('careTeamTable').value = settings.careTeamTable || 'Care Team';
        document.getElementById('maxDistance').value = settings.maxDistance || 100;
    }
}

function saveSettings() {
    settings = {
        apiKey: document.getElementById('apiKey').value.trim(),
        baseId: document.getElementById('baseId').value.trim(),
        clientsTable: document.getElementById('clientsTable').value.trim(),
        careTeamTable: document.getElementById('careTeamTable').value.trim(),
        maxDistance: parseInt(document.getElementById('maxDistance').value) || 100
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

async function loadClients() {
    if (!settings.apiKey || !settings.baseId) {
        showMessage('Please configure and save your settings first', 'error');
        return;
    }

    try {
        document.getElementById('resultsArea').innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading clients and care team...</p></div>';

        // Fetch clients with filters
        const formula = 'AND({Matching Stage}="Unmatched",{Deposit Received Date}!="",{Status}!="Cancelled")';
        const clientsUrl = `https://api.airtable.com/v0/${settings.baseId}/${encodeURIComponent(settings.clientsTable)}?filterByFormula=${encodeURIComponent(formula)}`;
        
        const clientsRes = await fetch(clientsUrl, {
            headers: { 
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!clientsRes.ok) {
            throw new Error(`Failed to fetch clients: ${clientsRes.status}`);
        }

        const clientsData = await clientsRes.json();
        let clients = clientsData.records;

        // Apply date filter if set
        const dateFilter = document.getElementById('startDateFilter').value;
        if (dateFilter) {
            const filterDate = new Date(dateFilter);
            clients = clients.filter(client => {
                const startDate = client.fields['Start Date'] || client.fields['start date'];
                if (!startDate) return false;
                return new Date(startDate) >= filterDate;
            });
        }

        allClients = clients;

        // Fetch care team
        const careTeamUrl = `https://api.airtable.com/v0/${settings.baseId}/${encodeURIComponent(settings.careTeamTable)}`;
        const careTeamRes = await fetch(careTeamUrl, {
            headers: { 
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!careTeamRes.ok) {
            throw new Error(`Failed to fetch care team: ${careTeamRes.status}`);
        }

        const careTeamData = await careTeamRes.json();
        allCareTeam = careTeamData.records;

        // Populate dropdown
        const select = document.getElementById('clientSelect');
        select.innerHTML = '<option value="">-- Select a client --</option>';
        
        allClients.forEach((client, index) => {
            const option = document.createElement('option');
            option.value = index;
            const name = client.fields["Mama's Full Name"] || client.fields.Name || 'Client ' + client.id;
            const startDate = client.fields['Start Date'] || client.fields['start date'] || '';
            option.textContent = name + (startDate ? ' (Start: ' + startDate + ')' : '');
            select.appendChild(option);
        });

        select.disabled = false;
        document.getElementById('matchBtn').disabled = false;
        document.getElementById('resultsArea').innerHTML = '';
        
        const filterMsg = dateFilter ? ` starting on or after ${dateFilter}` : '';
        showMessage(`Loaded ${allClients.length} clients${filterMsg} and ${allCareTeam.length} care team members`, 'success');

    } catch (error) {
        console.error('Load error:', error);
        document.getElementById('resultsArea').innerHTML = '';
        showMessage('Error: ' + error.message, 'error');
    }
}

async function findMatches() {
    const clientIndex = document.getElementById('clientSelect').value;
    if (!clientIndex) {
        showMessage('Please select a client first', 'error');
        return;
    }

    currentClient = allClients[clientIndex];
    const resultsArea = document.getElementById('resultsArea');
    resultsArea.innerHTML = '<div class="loading"><div class="spinner"></div><p>Analyzing matches... This may take a moment...</p></div>';

    try {
        const matches = await performMatching(currentClient, allCareTeam);

        displayMatches(currentClient, matches);
        showMessage(`Found ${matches.length} potential matches!`, 'success');

    } catch (error) {
        console.error('Match error:', error);
        resultsArea.innerHTML = '';
        showMessage('Error: ' + error.message, 'error');
    }
}

async function performMatching(client, careTeam) {
    const matches = [];
    const clientCareType = client.fields['Daytime/Overnight [Intake]'] || client.fields['Daytime/Overnight'];

    // Geocode client city
    const clientCity = client.fields['City'];
    const clientPostalRaw = client.fields['Postal Code'];
    const clientCoord = await geocodeLocation(clientPostalRaw, clientCity);
    if (!clientCoord) {
        console.warn('Could not geocode client location:', clientPostalRaw, clientCity);
        return matches;
    }

    // Collect eligible members (pass status + care type filters first)
    const eligible = [];
    for (const member of careTeam) {
        const status = member.fields['Status'];
        const memberPostal = member.fields['Postal Code'];
        const memberCareTypes = member.fields['Daytime / Overnight'] || member.fields['Daytime/Overnight'];
        const name = member.fields['Full Name'] || 'Unknown';

        if (status !== 'Active' && status !== 'Ready for Review') continue;
        if (!memberPostal && !member.fields['City']) continue;

        let careTypeMatch = false;
        if (memberCareTypes && clientCareType) {
            const memberTypes = Array.isArray(memberCareTypes) ? memberCareTypes : [memberCareTypes];
            const clientTypes = Array.isArray(clientCareType) ? clientCareType : [clientCareType];
            careTypeMatch = memberTypes.some(mt => clientTypes.includes(mt));
        }
        if (!careTypeMatch) continue;

        eligible.push(member);
    }

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

    // Now calculate real distances
    for (const member of eligible) {
        const memberCareTypes = member.fields['Daytime / Overnight'] || member.fields['Daytime/Overnight'];
        const status = member.fields['Status'];

        const memberCoord = await geocodeLocation(member.fields['Postal Code'], member.fields['City']);
        if (!memberCoord) continue;

        const distance = haversineKm(clientCoord, memberCoord);
        if (distance > settings.maxDistance) continue;

        let score = 100;
        if (distance > 30) score -= 10;
        if (distance > 45) score -= 10;
        if (status === 'Ready for Review') score -= 5;

        matches.push({
            id: member.id,
            name: member.fields['Full Name'] || 'Unknown',
            email: member.fields['Email'] || member.fields['email'],
            postalCode: member.fields['Postal Code'],
            distance: distance,
            designation: member.fields['Designation'] || '',
            availableFor: Array.isArray(memberCareTypes) ? memberCareTypes.join(', ') : memberCareTypes,
            matchScore: score,
            status: status
        });
    }

    return matches.sort((a, b) => b.matchScore - a.matchScore);
}

function displayMatches(client, matches) {
    const resultsArea = document.getElementById('resultsArea');
    selectedMatches = [];

    if (matches.length === 0) {
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

    let html = `
        <div class="card">
            <div class="client-header">
                <div class="client-name">${clientName}</div>
                <span class="detail-badge">📍 ${clientLocation}</span>
                <span class="detail-badge">${clientCareType}</span>
                <span class="detail-badge">Start: ${clientStartDate}</span>
            </div>
            
            ${matches.map(match => `
                <div class="match-card" onclick="toggleSelection('${match.id}')">
                    <div class="match-score">⭐ ${match.matchScore}</div>
                    <div class="match-name">${match.name}</div>
                    ${match.designation ? `<div class="match-detail">🎓 ${match.designation}</div>` : ''}
                    <div class="match-detail">📍 ${match.postalCode} (${match.distance.toFixed(1)} km away)</div>
                    <div class="match-detail">💼 ${match.status}</div>
                    ${match.email ? `<div class="match-detail">✉️ ${match.email}</div>` : ''}
                    ${match.availableFor ? `<div class="match-detail">Available for: ${match.availableFor}</div>` : ''}
                </div>
            `).join('')}
            
            <button onclick="prepareEmails()" style="margin-top: 1rem;">📧 Email Selected Matches</button>
        </div>
    `;

    resultsArea.innerHTML = html;
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

function prepareEmails() {
    if (selectedMatches.length === 0) {
        showMessage('Please select at least one care team member first', 'error');
        return;
    }

    const clientName = currentClient.fields["Mama's Full Name"] || currentClient.fields.Name || 'Client';
    const location = currentClient.fields['Postal Code'] || 'TBD';
    const careType = currentClient.fields['Daytime/Overnight [Intake]'] || currentClient.fields['Daytime/Overnight'] || 'TBD';
    const startDate = currentClient.fields['Start Date'] || 'TBD';

    let emailText = '';
    
    selectedMatches.forEach(matchId => {
        const match = allCareTeam.find(ct => ct.id === matchId);
        if (!match) return;

        const email = match.fields['Email'] || match.fields['email'] || 'NO EMAIL';
        const name = match.fields['Full Name'] || 'Team Member';

        emailText += `TO: ${email}\n`;
        emailText += `SUBJECT: New Client Opportunity - ${clientName}\n\n`;
        emailText += `Hi ${name},\n\n`;
        emailText += `We have a new client opportunity that matches your profile:\n\n`;
        emailText += `Client Location: ${location}\n`;
        emailText += `Care Type: ${careType}\n`;
        emailText += `Start Date: ${startDate}\n\n`;
        emailText += `Are you available for this placement?\n\n`;
        emailText += `Best,\nAlma Care Team\n\n`;
        emailText += `---\n\n`;
    });

    navigator.clipboard.writeText(emailText).then(() => {
        showMessage(`📋 Copied ${selectedMatches.length} email(s) to clipboard! Paste into your email client.`, 'success');
    }).catch(() => {
        // Show in modal if clipboard fails
        document.getElementById('emailContent').innerHTML = `<pre style="white-space: pre-wrap; font-size: 0.9rem;">${emailText}</pre>`;
        document.getElementById('emailModal').classList.add('active');
    });
}

function closeEmailModal() {
    document.getElementById('emailModal').classList.remove('active');
}
