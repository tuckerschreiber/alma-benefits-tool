# Benefits Tool — Round 4 Design

**Date:** 2026-05-26
**Tool:** Alma Care BEAT (almacare.ca/benefits)
**Branches off:** `origin/main` post-round-3 (PDF coverage estimate already shipped, dormant)

## Source of feedback

Team feedback on the round-3 deploy:

1. PSW typically needs pre-determination too — bring it into the same logic as RN (asterisk, footnote, included in PDF).
2. Add an "hours of care" calculation to the in-browser estimate so clients see what their coverage buys in concrete terms (e.g. `$3,000 coverage ≈ N nights of care, before HST`).
3. Updated clarifier copy on the results page: emphasizes the Postnatal Care Concierge and the holistic care plan (goals + total budget + scheduling), drops the "ready to submit to your insurer" line.
4. Phased PDF roadmap: **V1 = simple RN/PSW predetermination form** (close to today's PDF). **V2 = budget/schedule/goals questions → package recommendations** (Signature, "100 hrs overnight + lactation", etc.). V2 is explicitly out of scope this round.

## Scope

### In scope (V1 / round 4)

- PSW joins RN in the predetermination treatment (browser asterisk + footnote, PDF inclusion, download-button trigger).
- New clarifier copy on the results page, verbatim:

  > This estimate outlines potential care pathways based on your benefits shared. After your complimentary consultation, our Postnatal Care Concierge will prepare a holistic care plan that addresses your goals, total budget and scheduling.

- "Nights of care" sub-line on the Coverage at a Glance snapshot, for RN and PSW only.
- Rate constants wired:
  - `ALMA_RN_HOURLY_RATE = 50`
  - `ALMA_PSW_HOURLY_RATE = 50`
  - `ALMA_NIGHT_HOURS = 10` (typical 10pm–8am shift)
- Coverage Estimate PDF restructured to support one row per eligible pathway (RN, PSW, or both).

### Out of scope (deferred to V2)

- Wizard step for total budget / ideal schedule / postpartum goals.
- Package recommender (Signature, Overnight-heavy, Lactation-led, Custom).
- Any PDF structure beyond adding PSW as a second pathway.

## Conversion math

- **Hours of care** = `eligibleAmount / hourlyRate` (floor).
- **Nights of overnight care** = `hoursOfCare / ALMA_NIGHT_HOURS` (floor).
- Math uses **pre-HST** rates; displayed numbers carry a `(before HST)` qualifier.
- $50/hr for RN sits below typical Ontario PDN market rate ($75–100+). Tucker confirmed for now; revisit before launch with the concierge team. Both constants are one-line edits.

## Rendering

### Browser — Coverage at a Glance

For RN and PSW only, append an indented sub-line under the dollar amount:

```
✓ Private Duty Nursing — $10,000 eligible
    ≈ 20 nights of overnight care (10 hrs each, before HST)
```

Helper `formatNightsLine(amount, hourlyRate, nightHours)` returns the sub-line or `''` when rate is unset. Same dormant-launch pattern as the existing download button.

### Browser — Asterisk + footnote

Add `'psw'` to the two `needsAsterisk` checks (`renderRecCard`, `renderPdfPlan`) and the two `hasAsterisk` checks. Footnote copy unchanged.

### Browser — Clarifier paragraph

Replace the existing copy in `renderClarifier()` with the verbatim text above.

### PDF — Coverage Estimate, multi-pathway

Replace today's single-service table with one row per eligible pathway and a Total row.

| Service | Hourly rate | Eligible amount | Estimated hours |
| --- | --- | --- | --- |
| Private Duty Nursing (RN) | $50 | $10,000 | 200 hrs |
| Personal Support Worker (PSW) | $50 | $1,000 | 20 hrs |
| **Total** | | **$11,000** | **220 hrs** |

Purpose paragraph unchanged (already mentions pre-determination). Filename pattern unchanged. Hours are shown in the PDF (not nights) — insurer reviewers read in hours; nights stay browser-only as a client-facing intuitive number.

### Download button trigger

Old: `nursing.eligibleAmount > 0 AND ALMA_RN_HOURLY_RATE configured`.

New: `(nursing.eligibleAmount > 0 OR psw.eligibleAmount > 0) AND both rates configured`.

When only one pathway has eligible $, the PDF table renders just that row (no Total row needed when there's only one row).

## Files touched

1. `pages/benefits/src/rules.js` — add `ALMA_PSW_HOURLY_RATE`, `ALMA_NIGHT_HOURS`; set `ALMA_RN_HOURLY_RATE = 50` (replacing `null`).
2. `pages/benefits/src/pdf.js` — `buildEstimateDocDefinition` accepts `{ nursing: {eligibleAmount}, psw: {eligibleAmount} }`, renders one row per non-zero pathway, returns `null` only when both ≤ 0.
3. `pages/benefits/src/engine.js` — small adapter so `pdf.js` and the snapshot get a per-pathway `{ eligibleAmount }` shape (or compute inline at the two call sites).
4. `pages/benefits/preview.html` — mirror everything in the inline IIFE: config block, `buildEstimateDocDefinition`, `renderSnapshot` (new nights sub-line), asterisk/hasAsterisk checks, clarifier copy.
5. `pages/benefits/test/pdf.test.js` — new tests:
   - PSW-only PDF renders.
   - RN+PSW PDF renders both rows + Total.
   - Both-zero returns `null`.
   - Nights-line formatter math (e.g. `$10,000 / $50 / 10 = 20 nights`).
   - PSW asterisks present on PSW recs.

## Deploy

Standard flow:

1. `node pages/benefits/build-webflow.mjs`
2. Commit on `feature/benefits-tool`, push to `main`.
3. `curl -s "https://purge.jsdelivr.net/gh/tuckerschreiber/alma-benefits-tool@main/pages/benefits/app.js"`
4. Re-paste Webflow head + body. Head needs the new nights sub-line CSS (indent + muted color); body changes because the snapshot markup gains the sub-line.

## V2 backlog (not built this round)

- Wizard Step 4: budget cap, schedule (overnight / daytime / mixed), top postpartum goals (sleep, feeding, mental health).
- Package recommender mapping `(eligible $, goals, schedule)` → one of: Signature, Overnight-heavy, Lactation-led, Custom.
- PDF V2 replaces the Service Estimate table with a "Recommended Care Plan" section showing chosen package, hours mix, total cost.
