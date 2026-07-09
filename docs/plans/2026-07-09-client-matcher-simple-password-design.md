# Client Matcher — Dumb password gate (replaces Clerk)

**Date:** 2026-07-09
**Status:** Approved, implementing
**Supersedes:** [2026-06-24-client-matcher-auth-design.md](./2026-06-24-client-matcher-auth-design.md) (Clerk + email allowlist)
**App:** alma-client-matcher.vercel.app (static HTML/JS + Vercel serverless, code in `Client Matcher files/`)

## Goal

Replace the Clerk-based auth with a single shared password. Coordinators land on the URL, type `bahoua123!`, and they're in. Nothing to install in a Clerk dashboard, no email allowlist to maintain, no verification codes.

## Why this is safe enough

The Clerk design already called the auth "defense-in-depth, not a hard boundary." The matcher calls Airtable directly from the browser using a Personal Access Token that each coordinator pastes in — anyone with that token can bypass the page entirely. The gate exists to keep casual URL-guessers out, not to protect the data. A shared password meets that bar and is far less friction to operate.

## Architecture

- **`api/auth.js`** — new Vercel serverless function. Accepts `POST { password }`, compares against `process.env.MATCHER_PASSWORD` using `crypto.timingSafeEqual`, returns 200 on match or 401. No cookies, no JWT.
- **`index.html`** — Clerk script tag removed. `#authGate` div now contains a small password form (label, `<input type="password">`, submit button, error text). App root stays hidden until unlocked.
- **`app.js`** — top ~40 lines of Clerk code deleted. Replaced with ~25 lines: on load, check `localStorage.matcherAuth`; if set → reveal app; else → show gate. On submit → `fetch('/api/auth', ...)`. On 200 → set flag, reveal app. On 401 → show error, clear input.
- **`styles.css`** — reuses the existing `#authGate` + `.user-chip` rules from the Clerk work. Adds a couple of rules for the password form.
- **Env var** — `MATCHER_PASSWORD` set via `vercel env add MATCHER_PASSWORD production` (paste `bahoua123!`).

## Session model

LocalStorage flag `matcherAuth = "1"`. No expiry — user signs in once per browser, stays in until they clear storage or click "Sign out" (which removes the flag and reloads to the gate). Flag is trivially settable by anyone with devtools, but so was a Clerk session cookie; the threat model doesn't change.

## Files touched

- `Client Matcher files/index.html` (edit)
- `Client Matcher files/app.js` (edit)
- `Client Matcher files/styles.css` (small edit)
- `Client Matcher files/api/auth.js` (new, ~20 lines)

## Deploy

1. `cd "Client Matcher files"`
2. `vercel env add MATCHER_PASSWORD production` → paste `bahoua123!`
3. `vercel --prod`

## Cleanup

- Delete the Clerk app in Tucker's Clerk dashboard (optional — no cost either way, but tidy).
- Old design doc (`2026-06-24-client-matcher-auth-design.md`) is left in place with a "Superseded" note at the top pointing here.
