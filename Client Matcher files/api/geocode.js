// Geocoding proxy. For Canadian FSAs we use a static centroid table
// (~1,650 FSAs, GeoNames data) — no network call, no rate limit. Cities
// fall through to Nominatim with a real User-Agent + Vercel edge cache.

import fsaCoords from './fsa-coords.js';

export default async function handler(req, res) {
    const { postalcode, city } = req.query;

    if (!postalcode && !city) {
        return res.status(400).json({ error: 'postalcode or city required' });
    }

    if (postalcode) {
        const fsa = String(postalcode).replace(/\s+/g, '').toUpperCase().slice(0, 3);
        const hit = fsaCoords[fsa];
        if (hit) {
            res.setHeader('Cache-Control', 'public, s-maxage=31536000, immutable');
            return res.status(200).json([{ lat: String(hit[0]), lon: String(hit[1]) }]);
        }
        // Unknown FSA — return empty rather than thrashing Nominatim, since
        // FSA-level postcode queries to Nominatim usually return [] anyway.
        return res.status(200).json([]);
    }

    // City lookup via Nominatim.
    const params = new URLSearchParams({
        country: 'Canada',
        format: 'json',
        limit: '1',
        city,
        state: 'Ontario',
    });
    const url = `https://nominatim.openstreetmap.org/search?${params}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'AlmaClientMatcher/1.0 (https://alma-client-matcher.vercel.app; ops@almacare.ca)',
                'Accept': 'application/json',
            },
        });
        if (!response.ok) {
            return res.status(response.status).json({ error: `Nominatim ${response.status}` });
        }
        const data = await response.json();
        res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
        return res.status(200).json(data);
    } catch (e) {
        return res.status(502).json({ error: e.message });
    }
}
