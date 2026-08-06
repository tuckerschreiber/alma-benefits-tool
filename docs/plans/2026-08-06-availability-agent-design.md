# Care Team Availability Agent — POC Design

**Date:** 2026-08-06
**Source spec:** "Scoping Document: Care Team Availability Agent" (client PDF, Aug 5 2026)
**Decision:** Build the email-reply version as specced (client's call), as a proof of concept on dummy accounts first.

## Decisions locked

| Question | Answer |
|---|---|
| Approach | Email replies parsed by LLM, per the scoping doc (form-link alternative declined by client) |
| Environment | POC on dummy accounts first; `operations@almacare.ca` confirmed to be a real Workspace mailbox for production |
| Runtime | New standalone repo, plain Node.js, GitHub Actions scheduled workflows (free cron down to 15-min intervals; no Vercel plan dependency) |
| LLM parser | Claude Haiku via Anthropic API, Tucker's key, in GitHub secrets |
| Consult-locations summary | Stubbed for the POC behind `getConsultSummary()`; real HubSpot query swaps in at production |
| Airtable | Duplicate of the real base for the POC; production swap is a base-ID env var change |

## Architecture

Two batch jobs, each a GitHub Actions scheduled workflow. No web app, no server.

### `send.js` — Sundays 12:00 PM Eastern
1. Query Care Team table for members with status Active or Ready for Review.
2. Build a personalized email per person: name, consult-locations block (stub), and the 8-field reply template from spec Section 8.
3. Send individually via Gmail API from the ops mailbox (dummy Gmail account in POC).
4. Record each send in the Sync Log table (recipient, Gmail thread ID, timestamp).

Cron caveats handled in code: GitHub cron is UTC and can drift 5–15 min, so the workflow fires early and the job waits until exactly 12:00 Eastern, computing EST/EDT correctly year-round.

### `poll.js` — every 15 minutes
1. **Fetch** new inbox messages since the last processed point, excluding the agent's own sends. Processed message IDs live in the Sync Log — the log is the source of truth, so a crashed run can't double-process or skip.
2. **Filter noise** before spending tokens: OOO auto-replies (via `Auto-Submitted`, `X-Autoreply`, `Precedence` headers + subject heuristics), bounces, delivery notifications.
3. **Isolate new content**: strip quoted thread history (`On ... wrote:` blocks, `>`-prefixed lines).
4. **LLM extraction**: one Haiku call per reply, strict JSON schema for the 8 fields. Prompt embeds the allowed single-select and multi-select values; instructs `null` for anything not clearly stated — never guess. Unusable or validation-failing output → exception queue, not written.
5. **Match** sender to Care Team record by case-insensitive email. No match → exception queue; never auto-create a record.
6. **Dedup**: multiple replies in a week — the later reply overwrites; the log keeps both.

## Airtable writes

- **Full overwrite** of the 8 fields per spec — blanks clear old values. (Flag to client: if blanks should preserve old values instead, it's a one-line change.)
- **Conditional rule**: `Unavailable Until When` written only when `Current Bandwidth` = "Not taking on families"; otherwise cleared.
- **`Availability Last Updated`** stamped by an Airtable automation watching the 8 fields (works for manual ops edits too).

## Sync Log, exceptions, alerting

- **Sync Log table** (same base), one row per event: sends, applied replies (raw reply text + parsed JSON stored side by side for auditability, per spec Section 12, with old→new values), and exceptions.
- **Exception queue** = Sync Log rows with `Status = Needs Review`; an Airtable view filtered to that status is the ops review queue. No UI to build.
- **Alerting (POC)**: failed workflow runs email the repo owner via GitHub for free. Ops-facing exception-rate alerting is Phase 2.
- **Retries**: Gmail/Airtable calls retry with backoff; still-failing replies land in exceptions rather than vanishing.

## POC environment

- Free Gmail account as stand-in ops mailbox + Google Cloud project with Gmail API enabled + OAuth refresh token (scripted token dance).
- 2–3 dummy accounts as fake care team members.
- Duplicated Airtable base with dummy Care Team rows + new Sync Log table.
- All environment-specific values (Gmail creds, inbox address, base ID, table names, Anthropic key, status filter) are GitHub secrets/variables — production cutover changes secrets, not code.

## Testing

- **Parse layer**: fixture suite of ~15 reply variants (clean template, reordered, chit-chat, ambiguous values, quoted-thread junk, OOO, empty), each asserting extracted JSON or exception routing.
- **Integration**: manual `workflow_dispatch` dry-run — send, reply from dummy accounts in varied styles, watch rows update.
- **POC exit criteria**: one full simulated week — send fires on schedule, replies land in Airtable within 15 min, garbage routes to review view, nothing double-processes.

## Estimate

| Chunk | Hours |
|---|---|
| Repo + workflows + config | 2 |
| Gmail auth + send | 4 |
| Poll + filtering + thread isolation | 5 |
| LLM parse + fixtures | 4 |
| Airtable upsert + log + exceptions | 4 |
| Dummy env setup + live dry-run | 3 |
| **POC total** | **~22h (~$1,650 @ $75/hr)** |

Production cutover (real mailbox OAuth, real base IDs, HubSpot consult query): remaining ~6–10h of the original 26–32h estimate.

## Out of scope (per spec)

Mid-week updates, SMS, matcher changes, calendar sync. Phase 2: non-responder reminders (2-day follow-up), confirmation replies, staleness indicators.
