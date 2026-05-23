// Vercel serverless proxy for Nominatim (OpenStreetMap geocoding).
// Why: browsers can't set User-Agent, and Nominatim rate-limits anonymous
// browser traffic aggressively. Server-side we set a proper UA and Vercel's
// edge cache holds each result for 24h.

export default async function handler(req, res) {
    const { postalcode, city } = req.query;

    if (!postalcode && !city) {
        return res.status(400).json({ error: 'postalcode or city required' });
    }

    const params = new URLSearchParams({
        country: 'Canada',
        format: 'json',
        limit: '1',
    });
    if (postalcode) params.set('postalcode', postalcode);
    if (city) {
        params.set('city', city);
        params.set('state', 'Ontario');
    }

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
