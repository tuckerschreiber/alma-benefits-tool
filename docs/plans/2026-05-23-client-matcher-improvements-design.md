# Client Matcher Improvements — Design

Date: 2026-05-23
Scope: targeted improvements to the existing client matcher (`Client Matcher files/app.js`). Outreach automation (Part 2 in team notes) is deferred.

## Goals

From team brainstorm notes:

1. Distances are off — same-city candidates show as 0km apart.
2. Designation preferences aren't factored into ranking but should be, by priority.
3. Availability isn't checked — care team booked elsewhere can still surface as matches.
4. Want a bigger shortlist that the matcher can narrow down visually.

## Non-goals (deferred)

- Sending outreach emails / SMS automatically.
- Day-1 / day-2 follow-up cadence.
- `operations@almacare.ca` mailbox integration.
- Interview scheduling automation.

These belong in a Part 2 project once mailbox access is sorted. The likely shape there is an Airtable Automation hanging off a new "Outreach" table — captured here for context only.

## Architecture

No change to the deployment model. Static site on Vercel, pure client-side, reads directly from Airtable, settings cached in localStorage. One new Airtable table is read (shifts). Two new settings fields. No new dependencies.

## Change 1 — Distance via Postal Code

Current behavior (`app.js:189–272`): geocodes by city via Nominatim. Coarse — entire cities collapse to one coord.

New behavior: geocode by **Forward Sortation Area** (first 3 chars of Canadian postal code, e.g. `M5V`).

- New function `geocodeFSA(postalCode)` — extracts first 3 chars, queries Nominatim with `postalcode=<FSA>&country=Canada`, caches in existing `almaGeoCache` keyed by FSA.
- Replace `geocodeCity` for both client and care team coords.
- Fallback chain: postal code → city → skip with warn.
- Retain Nominatim 1.1s rate limit and `User-Agent` header.
- Default `maxDistance` bumps 60 → 100 km (overridable via UI filter chip).

## Change 2 — Designation Priority

Currently displayed but unscored. Promote to ranking signal.

Flexible reader on the client record, in priority order:

1. Ranked fields `Designation Preference 1/2/3`: rank 1 → +30, rank 2 → +20, rank 3 → +10.
2. Multi-select `Preferred Designations`: any match → +10.
3. Single `Preferred Designation`: exact match → +20.
4. None present: no contribution.

Designation never filters — only scores. Match card shows a check next to the designation badge when it matches preference, so the matcher sees the reason for the score.

Field-name lookup tolerates case/whitespace variation, same pattern as the existing care-type read (`app.js:207`).

## Change 3 — Availability Filter

New read of the Home Base shifts table. One row per booked time block, with at minimum `Care Team Member` (linked), `Start datetime`, `End datetime`.

Tolerant filter, since client schedule completeness varies:

- **Specific weekly schedule known** → check shift-by-shift overlap against the client's schedule. Any overlap → `conflict`.
- **Only Start Date + Daytime/Overnight known** → compute weekly booked hours in the client's care type over the 8-week window starting at Start Date. Above threshold (default 30 hrs/wk) → flag `partial`. Never declare `conflict` from a guess.

Single Airtable call per match run, scoped to the window. Group by care team member ID into a `bookedByMember` map for O(1) lookup.

Per-member result is one of:

| State | Score effect | UI |
|---|---|---|
| `available` | +20 | ✅ "Available" |
| `partial` | 0 | ⚠️ "X hrs/wk booked" |
| `conflict` | filtered by default | (hidden) |
| `unknown` | 0 | "?" |

New settings fields: shifts table name (default `Shifts`), full-load threshold (default 30 hrs/wk).

## Change 4 — Shortlist UX

Sticky filter bar above the match list:

```
[Designation: any ▾] [Max distance: 100km ▾] [Status: any ▾] [✓ Has availability]  ·  Showing 12 of 18
```

- Filters operate in-memory on the already-fetched matches — no Airtable re-call.
- Defaults: distance ≤ 100km, status any, availability ON (hides `conflict`).
- Designation chip populates from designations present in the result set.
- Count updates live.
- Sort remains composite-score-desc; filtered rows hide rather than disappear from state.

Match card adds three new signals: designation-match check, availability badge with reason, FSA-level distance.

`filters` object lives alongside `selectedMatches`. `allMatches` holds the full ranked result; re-render filters from there. Selection persists across re-render by `match.id`. "Email Selected Matches" button unchanged.

## Composite Score

Replaces ad-hoc logic at `app.js:253–257`:

```
Base                                  100
Distance penalty
    0–20 km                             0
    20–40 km                          -10
    40–60 km                          -15
    60–100 km                         -30
Status: Ready for Review               -5
Designation match (Change 2)         0..30
Availability (Change 3)              0..20
```

Range ≈ 50–150. Distance still dominates; designation and availability act as tie-breakers strong enough to lift a slightly-farther preferred-designation candidate over a closer one with no preference match.

## Settings panel changes

Two new fields:

- `Shifts table name` (default `Shifts`)
- `Full-load threshold (hrs/week)` (default `30`)

`maxDistance` default changes 60 → 100. Existing saved settings keep their old value; the UI hint shows the new default for fresh installs.
