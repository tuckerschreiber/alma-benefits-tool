# Benefits tool: calculator labels + PDF floor

**Date:** 2026-06-08
**Trigger:** Melissa's testing feedback (SunLife flow).

## Problem

Three issues from a SunLife test pass on `almacare.ca/benefits`:

1. Entering Certified Doula coverage doesn't generate a PDF estimate, even
   though the on-page recommendation card looks correct.
2. The calculator card labeled "In-Home Postpartum Support" doesn't match
   the wording used on insurance plans — Melissa expected to see RN/nursing
   language.
3. Label inconsistency between calculator and SunLife's actual benefit
   line for doula coverage ("Certified Postpartum Doula" vs SunLife's
   "Certified Doula").

## Design

### Calculator label renames

| Service ID | Old label | New label |
|---|---|---|
| `postpartum_doula_care` | Certified Postpartum Doula | **Certified Doula** |
| `registered_nursing` | In-Home Postpartum Support | **In-Home Nursing** |

Scope: card label, expanded coverage-detail title, `SERVICE_NAMES` map
(which also drives the "Also covered by your plan: …" footer on the
results page).

The PDF section heading ("In-Home Postpartum Support") stays as-is —
it's a billing/service description shown to the insurer, not a label
users pick. Leaving it avoids touching the signed-off PDF layout and
its existing test.

Files touched:
- `pages/benefits/app.js` (`SERVICE_NAMES` map)
- `pages/benefits/src/engine.js` (`SERVICE_NAMES` map)
- `pages/benefits/webflow-body.html` (card label + detail title, both services)
- `pages/benefits/preview.html` (mirror of the above for local dev)

### PDF floor

**Old behavior:** PDF download button only appears when total in-home
coverage (Doula + Nursing + PSW eligible $) ≥ $480 — one full overnight
shift. `buildEstimateDocDefinition` returns `null` for anything below
that.

**New behavior:** PDF appears whenever total in-home coverage ≥ $48
(one hour at Alma's $48/hr rate). For amounts between $48 and $480, the
fee table shows a single "Partial overnight" row with the actual hours
covered.

Soft $48 floor (not zero) because:
- A PDF claiming zero hours of care is useless to insurers and looks
  broken.
- $48 catches typos and $0 plans without hiding real coverage. SunLife's
  Certified Doula benefit ($500+) clears it easily.

#### Fee table behavior

`buildFeeTable(numShifts, hourlyRate)` is called from
`buildEstimateDocDefinition`. Two cases:

**Full shifts** (eligibleAmount ≥ $480):
- `numShifts = floor(eligibleAmount / shiftCost)`
- Existing N-row table — one row per full overnight visit. No change.

**Partial shift** ($48 ≤ eligibleAmount < $480):
- `hours = floor(eligibleAmount / hourlyRate)`
- Single row:
  - Visit: 1
  - Shift Type: "Partial overnight"
  - Total Hours: `hours`
  - Hourly Rate: $48
  - Cost per visit: `hours × $48`
  - Price column: subtotal

Subtotal/tax/total math is unchanged — it still multiplies the computed
hours by the rate.

#### Download gate

`renderDownloadBlock` in `app.js`:
- Before: `eligibleTotal >= oneShift` (where `oneShift = 480`)
- After: `eligibleTotal >= ALMA_RN_HOURLY_RATE` (i.e. ≥ $48)

`buildEstimateDocDefinition`:
- Before: `if (numShifts < 1) return null;`
- After: returns `null` only when `eligibleAmount < hourlyRate`, i.e.
  not enough for even one hour of care.

### Build + deploy

1. Update `app.js`, `src/engine.js`, `webflow-body.html`, `preview.html`.
2. Run `node pages/benefits/build-webflow.mjs` (regenerates
   `webflow-body.html` / `webflow-head.html` artifacts from sources).
3. Commit + push to `main`.
4. Bump the jsDelivr SHA pin in `webflow-head.html` to the new commit
   SHA (cache-bust per the project's pin-to-SHA pattern).
5. Paste updated `webflow-head.html` and `webflow-body.html` into the
   Webflow Embed and re-publish almacare.ca/benefits.

### Out of scope

- Renaming the PDF section heading (would break the existing PDF test
  and Karla's signed-off layout — not requested).
- Changing the hourly rate ($48), shift length (10 hrs), or the
  Doula/RN/PSW summing rule.
- Reworking the rules engine, recommendations, or concern keywords.
