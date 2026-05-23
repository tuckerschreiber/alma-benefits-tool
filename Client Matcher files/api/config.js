// Returns the shared Airtable API key from Vercel env so teammates don't
// have to enter it. If the env var isn't set, returns an empty string and
// the matcher falls back to whatever the user has saved in localStorage.

export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
        apiKey: process.env.AIRTABLE_API_KEY || '',
    });
}
