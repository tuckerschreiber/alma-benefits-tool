# Availability Agent — Round 2 Design

**Date:** 2026-08-15
**Builds on:** `2026-08-06-availability-agent-design.md` (POC, live and passing)
**Code:** `github.com/tuckerschreiber/alma-availability-agent`, HEAD `e79de4f`

The POC proved the loop works. This round changes what the email asks for, how
partial replies are written, and what happens to a reply after it is processed.

## The shift

The POC asked everyone to restate all eight fields every week. This round asks
them to reply **only if something changed**. That single change drives most of
what follows: replies become partial, silence becomes meaningful, and full
overwrite stops being safe.

The email does **not** echo back what we have on file — it stays short.

## Decisions

| Area | Decision |
|---|---|
| Email copy | No profile echo. Weekly, Sundays, unchanged cadence. "Only reply if your availability has changed." |
| Write model | Parser privately receives the member's current Airtable values, returns the new complete state; code writes only fields that differ |
| Unavailable date | Ungated — writes whenever stated, regardless of `Current Bandwidth` |
| Availability windows | New `Availability Valid Until` date field |
| New fields | `Availability Valid Until` (date), time-of-day availability (text) |
| Newly parsed | `How Does Your Schedule Work?` — exists already, agent has never touched it |
| On expiry | That person's weekly email switches to an explicit re-confirm |
| No-change replies | New `no_changes` parser flag; stamps `Availability Last Updated`, writes nothing else |
| Inbox | Processed replies labelled `Availability/Processed` and archived |
| Unmatched senders | Stay in the inbox, plus the existing Needs Review row |
| Airtable views | None |

## Write model

The parse prompt gains the member's current field values as context. The member
never sees them — this is internal, and it exists so relative edits resolve:

> "drop Fridays" · "same as before but no overnights" · "just Thursdays now"

None of these are parseable without knowing the current state. The parser
returns the new complete state; `fields.js` diffs against current and writes
only the fields that actually differ. `Availability Last Updated` therefore
moves only on real change, and the Sync Log's old→new detail stays clean.

## Dates

Two date columns, each with one unambiguous meaning:

- **`Unavailable Until When`** — "back on this date." Written whenever stated.
  The POC gated this to fire only when bandwidth was "Not taking on families",
  which silently discarded Kavya's real date in the 08-13 test. The gate goes.
- **`Availability Valid Until`** (new) — "this profile expires on this date."
  Captures "I'm available for the next 6 weeks" / "through the end of term."

On the first Sunday after a member's `Availability Valid Until` has passed,
`send.js` swaps their email body for a re-confirm variant — the window they gave
us has ended, please confirm or update. Everyone else gets the standard quiet
email. Still one send job, one email per person per week; the date only picks
the wording.

## No-change replies

Under "only reply if changed," *"nothing's changed, all good!"* becomes a common
reply. Today it parses to all-nulls and lands in Needs Review as junk.

The parse schema gains `no_changes: boolean`, set only when the reply explicitly
confirms nothing changed. On that flag: write no availability fields, stamp
`Availability Last Updated`, log a Sync Log row, archive. This keeps
`Availability Last Updated` readable as *freshness* — "confirmed accurate on the
11th" is a different fact from "we haven't heard from them in five weeks."

All-nulls **without** the flag still routes to Needs Review, unchanged.

## Inbox hygiene

`poll.js` currently leaves every message in the ops inbox forever. After
processing, apply an `Availability/Processed` label and remove `INBOX`.

Archiving becomes the de-facto "done" marker alongside Sync Log dedup — belt and
braces, since `listInbox()` uses the inbox as its work queue.

Deliberately **not** archived: unmatched senders. That is the one case a human
must see, and the usual cause is someone replying from a personal address rather
than their work one. Those messages get re-listed on every poll and skipped by
Sync Log dedup, costing one Gmail fetch each — acceptable, and it means an
unresolved case cannot quietly vanish.

## Fields

Verified against the test base (`app9aTJ18nu0QQYSt`) on 2026-08-15.

**Already exists, agent doesn't use it: `How Does Your Schedule Work?`** —
singleSelect of `Fixed — recurring days/times` / `Flexible — changes week to
week` / `Mixed`, alongside an `Example Schedule` text field. This is the existing
answer to "what about people with fixed recurring schedules?" and nothing has
been reading it. Added to the template and parser so replies maintain it. It does
**not** branch the email — everyone gets the same copy.

**New: time-of-day availability** (multilineText) for "mornings only", "after
3pm", "not before 9". Free text because real answers are too varied to enumerate.
`Shift Preference` (Daytime/Overnight/Both) does not cover clock times.

**Not added: shift count.** No preference field exists — `Number of Shifts`,
`# of Shifts Completed` and `Shifts in the Past Month` are all Homebase rollups
of actuals. "1 to 2 shifts per week" therefore lands in `Other Scheduling Notes`
as prose and is not filterable. Revisit if that proves annoying; a singleSelect
of ranges (1-2 / 3-4 / 5+ / Varies) parses better than a number.

**Duplicate columns to resolve before cutover.** The test base has both
`Planned Big Holidays` and `Any Planned Big Holidays Coming Up`, and both
`Upcoming Exams` and `Any Upcoming Exams`. The agent writes the "Any…" pair. If
prod carries the same duplicates, ops may be reading the column the agent never
touches.

## Parser fixes carried over

- **Distance and radius statements count as travel.** "20 km from me", "40 mins
  from my house" both landed in `Other Scheduling Notes` during the 08-13 test
  while `Willingness to Travel` stayed empty. Prompt fix.
- **Shift counts** — "1 to 2 shifts per week" should route to a shift-count
  field. See open questions.

## Development access

`scripts/airtable.mjs` (`schema`, `records`) reads credentials from a local
gitignored `.env` and hard-refuses any base other than the test base, since
duplicated bases share table IDs and the base ID is the only thing telling them
apart. Prod schema still needs confirming by hand before cutover — the two bases
have already drifted (`Availability Last Updated` is lastModifiedTime in test,
a plain date in prod).

## Risk before cutover

Stamping `Availability Last Updated` on a no-change confirmation will fire the
**`Update on Availability`** automation, which is ON in the real base and OFF in
the duplicate. Nobody has read what it does. If it notifies or triggers
downstream work, every "all good!" reply sets it off. Read it first.

Also still open from the POC: `Availability Last Updated` is a plain date field
in prod but a last-modified-time field in the test base, so the write path
differs between environments.

## Files touched

| File | Change |
|---|---|
| `template.js` | Reply-if-changed copy; re-confirm variant; new field lines |
| `parse.js` | Current-values context, `no_changes` flag, `availability_valid_until`, travel/radius rule |
| `fields.js` | Drop the unavailable-date gate; diff against current, return changed fields only |
| `poll.js` | Pass current values to parser; no-change branch; label + archive |
| `gmail.js` | `labelAndArchive()`, idempotent label creation |
| `send.js` | Expiry check picks the email variant |
