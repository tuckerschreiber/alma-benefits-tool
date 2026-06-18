# Client Matcher — Leads mode

**Date:** 2026-06-18
**Status:** approved, building

## Problem

The matcher pulls from one Airtable table at a time (`Clients`). The Airtable base also has a `Hubspot Leads` table of pre-intake contacts. Care coordinators (Melissa, Karla) take consult calls with these leads and want to look up "who's near them and available around their due date" in real time. Today they have no way to do this — pointing the matcher at `Hubspot Leads` via Settings produces `Client recXXX` dropdown rows because the name resolution chain (`Mama's Full Name → Name → 'Client ' + id`) has no fallback for HubSpot-shaped records.

## What we're building

A Leads workflow alongside the existing Clients workflow. Same scoring engine, same email pipeline, different data shape.

### UI: top-level tabs

`Clients` | `Leads` tabs above the existing search-mode radio.

- **Clients tab** — unchanged. The Unmatched / All radio stays as today.
- **Leads tab** — no inner radio. Pulls from `Hubspot Leads` filtered to `{Lifecycle Stage}="Lead"`.

Tabs (not a third radio) because the inner UI diverges enough that "filter on one dropdown" misleads — different displayed fields, different date filter label, different email template, scoring with fewer dimensions.

### Leads tab specifics

- Dropdown rows: `First Last — City, Due Sep 3`. Sorted by Due date ascending (soonest first — natural ranking during a consult).
- Filter input above dropdown labelled "Search by name".
- Date filter relabelled "Due on or after".
- Match button runs the same scoring engine. Care-type and credential dimensions silently drop to zero (leads have no intake data). Distance and availability carry the ranking.
- Email template is a lead-flavoured variant: city, due date, "potential client looking for care — interested?". No schedule / duration / num-children lines.

### Implementation

`RECORD_SHAPES` object with `client` and `lead` entries. Each declares how to extract name, location, timeline date, etc. from a record. `activeShape()` selects based on the active tab. Downstream code (`loadRecords`, `performMatching`, `displayMatches`, `buildEmailFor`) routes through the shape.

`performMatching` changes:
- If `clientCareType` is null (leads have none), skip the care-type eligibility gate so all members pass through to scoring.
- Use `shape.getTimelineDate(record)` as the availability-window anchor (start date for clients, due date for leads).

Settings panel gains a `Leads Table` text input, default `Hubspot Leads`. Same pattern as the existing Clients Table / Shifts Table inputs.

## YAGNI

- No new scoring algorithm. Existing one degrades when fields are absent.
- No data sync between tables — HubSpot/Airtable's job.
- No edits to `Hubspot Leads` from the matcher. Read-only.
- No unified "search both tables" mode. The two workflows stay separate.
- No new Settings field beyond Leads Table.

## Open questions answered by Tucker

1. **Lead filter** — `{Lifecycle Stage}="Lead"` only (strict). Loosen later if Kavya reports missing people.
2. **Sort** — Due date ascending in the dropdown.
