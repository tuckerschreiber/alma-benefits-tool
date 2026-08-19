# Availability Dashboard — design

**Date:** 2026-08-19
**Builds on:** `2026-08-06-availability-agent-design.md` (POC, live) and
`2026-08-15-availability-agent-round-2-design.md` (agreed, not yet implemented)

## Problem

The availability agent is headless. Confirming it works means reading GitHub
Actions runs or digging through Sync Log rows in Airtable — developer work,
not something the care ops team will do. The team needs to see that the
weekly cycle ran, work the Needs Review queue, and control who gets emails,
without touching Airtable or GitHub.

## Decision

A standalone Next.js app on Vercel — its own repo
(`alma-availability-dashboard`), its own shared-password gate (same pattern
as the Client Matcher). Rejected alternatives: folding it into the Client
Matcher (matcher reads the real base while the agent runs on the test base;
coupling their deploys buys nothing) and serving it from the agent repo
(keeps the matcher untouched but ties UI deploys to agent releases).

Three screens: **Status**, **Review queue**, **Members**.

## Architecture

- All data comes from the two tables the agent already uses: **Care Team**
  and **Sync Log**. Reads and writes go through Next.js API routes; the
  Airtable PAT and GitHub token stay server-side.
- Base selection (`app…` ID + PAT) is pure env config: test base today,
  real base at cutover via a Vercel env change only.
- The dashboard never talks to Gmail and never calls an LLM. The agent repo
  remains the only sender and parser. Dashboard writes are limited to:
  - Care Team availability fields (review-queue Apply)
  - Care Team `Status` (pause/resume)
  - Sync Log row status (resolve/dismiss)
  - one GitHub `workflow_dispatch` call (trigger send)
- Deploys via `vercel --prod` CLI, same as the matcher. No new paid
  services: Vercel free tier, existing Airtable, one GitHub fine-grained
  token (Actions read/write, agent repo only).

**Agent-repo prerequisite:** the review queue needs the raw reply text and
the parsed-fields JSON stored on every Needs Review Sync Log row. Verify
against the live schema; if missing, that agent change ships before the
dashboard's queue is useful.

## Status screen

Answers "is it working?" in five seconds.

- **Last send:** date/time and recipient count from `Type=Send` Sync Log
  rows. If the most recent Sunday passed with no Send row, show a red
  "send did not fire" state — the failure nobody can currently see.
- **Next send:** computed from the Sunday 16:05 UTC cron *minus* the 6-day
  `hasRecentSend` suppression. If a forced send re-armed suppression, show
  "suppressed until <date>" rather than claiming Sunday.
- **Replies this cycle:** received / applied / in Needs Review, from Sync
  Log rows since the last send.
- **Reply roster:** per-member table for the current cycle — sent, replied,
  what changed (the old→new detail the agent logs), or "no changes" once
  round 2's flag exists. The core ops view: who hasn't answered yet.
- **Activity feed:** Sync Log newest-first, translated to sentences
  ("Kavya's reply applied — bandwidth changed to Limited…"), filterable by
  type, last ~50 rows.

Fetch on load plus a refresh button. No live updates — the poll runs every
15 minutes anyway.

## Review queue

Unresolved Needs Review rows, oldest first, badge count in the nav.

Each item is a two-pane view: raw reply (sender, subject, timestamp, body)
on the left; the parse result as an editable form on the right. For unknown
senders the member picker comes first (searchable Care Team dropdown, plus
the agent's guess if any). Every availability field is pre-filled from the
parse and shown next to the member's current Airtable value, so the
reviewer sees exactly what would change. Select fields render as dropdowns
wired to live Airtable option lists — the bandwidth-casing bug class is
structurally impossible from this path.

Actions:

- **Apply** — writes the edited fields to the member's record, stamps
  `Availability Last Updated`, marks the Sync Log row resolved with a
  "resolved by dashboard" note plus free-text initials (no per-user auth
  behind a shared password; initials are the honest audit trail). Writes
  only fields the reviewer touched or the parser filled — never blanks
  untouched ones. Same later-reply-wins semantics as the agent.
- **Dismiss** — resolve as junk, write nothing.
- **Leave it** — close; the item stays queued.

Resolved items leave the queue but remain in the activity feed.

## Members screen

Care Team roster: name, email, status, availability summary,
`Availability Last Updated`, and (post round 2) `Availability Valid Until`
with an expired highlight. One control per row: a **Pause/Resume** toggle
writing `Status`. Paused members grey out instead of vanishing — fixing the
Airtable trap where the Active-filtered view makes paused rows look
deleted. Pausing confirms with the consequence stated plainly ("Sandra will
be skipped in every send until resumed").

## Trigger send

A button on the Status screen dispatches the send workflow via
`workflow_dispatch`. Send logic stays in one place — the agent repo — so
the button and the Sunday cron cannot drift (the drift risk is real: see
the bandwidth-casing bug). Guardrails:

1. **Surface the suppression footgun.** Before dispatching, check Sync Log
   for Send rows in the last 6 days and warn: "A send went out Tuesday —
   sending now pushes the next automatic Sunday send to <date>. Continue?"
2. **Feedback loop.** After dispatch the button shows "Send queued…" and
   the app polls the Sync Log until the Send row appears, timing out after
   ~5 minutes with check-with-Tucker messaging (a workflow failure is a
   developer problem, not an ops one).

Sends go to all Active members — no per-send picker in v1. Targeted sends
work by pausing the others first, the mechanism the agent already respects.

## Error handling

- Every API route returns a human-readable error shown inline ("Airtable
  rejected the write: unknown option 'X' for Current Bandwidth"). No silent
  failures, no hanging spinners.
- Apply is read-check-write: re-read the member record first and warn if
  `Availability Last Updated` moved since the reviewer opened the item —
  a fresher reply already landed, and later-reply-wins is preserved.
- Airtable and GitHub calls retry once on 5xx, then surface the error.
- The password gate rate-limits attempts.

## Testing

- Unit tests on the two real-logic pieces: the suppression-window /
  next-send date math, and the apply-diff builder (only touched or parsed
  fields written).
- API-route integration tests run against the test base. Port the
  hard-refuse-any-other-base guard from the agent's `scripts/airtable.mjs`
  so a misconfigured env can never write to the real base during dev.
- UI is thin; a manual walkthrough against the test base covers it.

## Rollout

1. Agent change first, if needed: store raw reply + parsed JSON on Needs
   Review rows.
2. Build and exercise against the test base, including the Apply path on a
   real forced send.
3. Hand the team the URL and password.
4. At agent prod-cutover, flip the Vercel env vars to the real base.
