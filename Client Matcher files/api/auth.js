import crypto from 'node:crypto';

export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const expected = process.env.MATCHER_PASSWORD;
    if (!expected) {
        return res.status(500).json({ error: 'Server misconfigured' });
    }

    const submitted = (req.body && req.body.password) || '';
    const a = Buffer.from(submitted);
    const b = Buffer.from(expected);

    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) {
        return res.status(401).json({ error: 'Wrong password' });
    }

    return res.status(200).json({ ok: true });
}
