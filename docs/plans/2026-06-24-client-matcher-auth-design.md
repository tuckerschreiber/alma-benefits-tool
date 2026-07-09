# Client Matcher — Auth gate (Clerk + email allowlist)

**Date:** 2026-06-24
**Status:** Superseded on 2026-07-09 by [2026-07-09-client-matcher-simple-password-design.md](./2026-07-09-client-matcher-simple-password-design.md). Clerk was overkill for a casual-visitor gate; swapped for a shared password + serverless check.
**App:** alma-client-matcher.vercel.app (static HTML/JS on Vercel, code in `Client Matcher files/`)

## Goal

Put the matcher behind a login so only people with `@almacare.ca` email addresses can reach it. Anyone landing on the URL without a session sees a sign-in screen — no Airtable settings panel, no buttons, no matcher UI.

## Approach: Clerk with an email allowlist

Tucker doesn't have an `@almacare.ca` account, so the Google Workspace "Internal" OAuth route is impractical — it'd require client-side GCP work and we couldn't test the flow locally. Clerk sidesteps both problems: setup lives entirely in Tucker's own Clerk account, and the allowlist can include his `@felixforyou.ca` address during development.

Other options considered and dropped:
- **Temporary `@almacare.ca` account from the client** — simplest tech, but depends on client provisioning.
- **Magic-link via Resend** — fewer vendors, but more custom code than this small tool warrants.
- **Vercel Authentication (Pro tier)** — requires inviting client users to our Vercel org.

## Sign-in flow

1. Page load — `Clerk.load()` runs before the rest of `app.js`.
2. No session — `Clerk.mountSignIn(authGate)` renders Clerk's hosted sign-in component inline. User enters an `@almacare.ca` email, gets a verification code, enters it, signed in.
3. Session present — gate hides, matcher UI shows, header gains a "Signed in as `user.email` · Sign out" chip.
4. Sign-out — `Clerk.signOut()` + page reload returns to the gate.

Email outside the allowlist is rejected at sign-up by Clerk; no client-side check needed.

## Clerk dashboard setup (one-time, ~10 min)

1. Create a Clerk app at clerk.com — JavaScript / no framework.
2. **User & Authentication → Email, Phone, Username** — enable email, set to **Email verification code** (no passwords).
3. **User & Authentication → Restrictions → Allowlist** — add `*@almacare.ca` and `tucker.schreiber@felixforyou.ca`. Toggle "Restrict sign-ups to allowlist."
4. Copy the **Publishable Key** from API Keys → paste into `app.js`.

## Code changes

- `index.html`
  - Add one `<script>` tag loading `@clerk/clerk-js` from jsDelivr (matches the existing CDN pattern).
  - Wrap the matcher UI in `<div id="appRoot" hidden>`.
  - Add `<div id="authGate">` above it for Clerk to mount into.
- `app.js`
  - ~15 lines at the top: `await Clerk.load()`, branch on `Clerk.user`, mount sign-in or reveal `appRoot`.
  - Render the user chip + sign-out link in the header.
- No build step, no env vars, no backend change. Publishable key is public — straight into `app.js`.

## Testing + handoff

- During dev, Tucker signs in with `@felixforyou.ca` (on the allowlist).
- Before handing the URL to Alma Care, decide whether to drop the `@felixforyou.ca` entry or keep it for ongoing support access.
- Clerk free tier (10k MAU) covers this well past any plausible team size.

## Security note (defense-in-depth, not a hard boundary)

The auth gate makes the URL casual-visitor-proof. It does *not* fully protect Airtable data, because the matcher still calls Airtable directly from the browser using a token each coordinator pastes in — anyone with that token can bypass our page entirely. The real sensitive credential is the Airtable token, not the URL. Tightening that would mean moving Airtable calls to a Vercel serverless function and verifying the Clerk session server-side. Out of scope for this change.

## Files touched

- `Client Matcher files/index.html`
- `Client Matcher files/app.js`

No new files, no changes to `api/`, `styles.css`, or `vercel.json`.
