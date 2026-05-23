# Benefits Eligibility Assessment Tool (BEAT) — Feedback Round 3 Design

**Date:** 2026-05-23
**Scope:** almacare.ca/benefits (Webflow embed; source repo: github.com/tuckerschreiber/alma-benefits-tool)
**Working dir:** `.worktrees/benefits-tool/pages/benefits/`

## Goals

1. **New strategic feature:** generate a one-page **Insurance Coverage Estimate PDF** that families can submit to their insurer for pre-determination or coverage verification. Replaces the existing "Send me my care plan" button.
2. Capture address (city + postal code required, street optional) in Step 1, for the PDF "Prepared for" block and Hubspot.
3. Fix the PDN duplicate bug — `registered_nursing` currently renders twice (medium prenatal rule + high postpartum rule both fire for postpartum users).
4. Fix the "Can't click Assessment in regular Chrome" bug — almost certainly stale localStorage from the round-2 schema change.
5. Drop "original" from the postpartum due-date label.

## Strategic positioning

The PDF becomes a core Alma differentiator. Families don't just leave with an estimate — they leave with a document they can act on. "Alma didn't just help me estimate coverage. Alma helped me take action."

This reverses the round-2 decision to keep estimates manual. Round-2's reasoning was that named-provider estimates require a human in the loop. This round narrows the scope of the tool-generated artifact to **only** in-home nursing support — a category where a programmatic, insurer-credible estimate is genuinely useful for pre-determination. Named-provider proposals remain a post-consultation manual workflow.

## Section 1 — PDF scope (what's on it, what's not)

**Include on the PDF:**

- Daytime + overnight postpartum in-home nursing care, expressed as a single line item: *"Postpartum In-Home Nursing Support."* Day/night is flexible and not split on the PDF — Alma's roster handles either based on family preference at the consultation stage.
- "RN eligible pathway" pathway label.
- Estimated hours and estimated cost, computed from eligible nursing benefit and Alma's published hourly rate.

**Exclude from the PDF (intentional):**

- Lactation, RMT, acupuncture, mental health, gift funding, wellness account opportunities. These remain on the on-screen care plan but are not insurer pre-determination targets.

**PDF is only generated when:**

- `state.coverage.registered_nursing.amount > 0` (insurer covers nursing), OR HSA balance is allocated to nursing such that `results.nursing.eligibleAmount > 0`.

When nursing isn't in coverage, the download button doesn't render. The results page flows through Highest Priority Supports → What Happens Next → Gift Cards → bottom Booking CTA with no gap.

## Section 2 — PDF structure

`pages/benefits/src/pdf.js` (new) exports a pure function:

```js
buildEstimateDocDefinition(state, results) → pdfmake doc definition | null
```

No DOM access. Fully unit-testable. Returns `null` if nursing isn't in coverage (defensive — caller shouldn't invoke it in that case).

**Document layout** (single page, portrait, 1" margins):

```
[Alma logo, top-left, ~140px wide]

POSTPARTUM SUPPORT COVERAGE ESTIMATE        (16pt bold)
Prepared for: Jane Doe                      (12pt)
123 Main St · Toronto, ON · M5V 2T6
Generated: May 23, 2026                     (10pt grey)

────────────────────────────────────────────

Purpose                                     (11pt bold)
This estimate is intended to support
insurance coverage inquiry or pre-
determination requests. Coverage approval
remains subject to insurer policies and
eligibility requirements.                   (10pt body)

Service Estimate                            (11pt bold)

┌────────────────────────────────────────┐
│ Service Type   Postpartum In-Home      │
│                Nursing Support          │
│ Pathway        RN eligible pathway      │
│ Hourly Rate    $90.00                   │
│ Estimated      22 hours                 │
│ Hours                                   │
│ Estimated      $1,980.00                │
│ Cost                                    │
└────────────────────────────────────────┘

Final care plans are customized based on
family needs and coverage requirements.

────────────────────────────────────────────

Disclaimer (8pt italic): This document is an
estimate only and does not guarantee
reimbursement or insurer approval.

Footer (8pt centered): Questions? Speak
with an Alma Postnatal Care Concierge ·
almacare.ca · contact@almacare.ca
```

**Filename convention:** `alma-coverage-estimate-{lastname-lowercase}-{YYYY-MM-DD}.pdf`
(e.g., `alma-coverage-estimate-doe-2026-05-23.pdf`).

**Address handling:** "Prepared for" address line is built from city + postal code (required) plus street (optional, prepended with " · " if present). Missing street → no street line, no empty gap. Province inferred from postal code first letter at render time (e.g., `M` → ON, `V` → BC) — not persisted as a separate field.

## Section 3 — Hours and cost math

```
eligibleAmount  = coverage.registered_nursing.amount × (reimbursementPercent ?? 100)
hourlyRate      = ALMA_RN_HOURLY_RATE  (constant in rules.js, set pre-deploy)
estimatedHours  = Math.floor(eligibleAmount / hourlyRate)
estimatedCost   = estimatedHours × hourlyRate
```

`Math.floor` ensures `estimatedCost ≤ eligibleAmount` — insurers reject estimates that overshoot the benefit by even a dollar. The leftover few dollars are absorbed (e.g., $2,000 ÷ $90 = 22.22 → 22 hours → $1,980; the $20 gap is noise).

**HSA contribution:** if user has HSA and we've allocated any portion of it to nursing, that amount is added to `eligibleAmount` before the floor.

**Pre-launch TODO:** `ALMA_RN_HOURLY_RATE` lives in `rules.js` as `null` initially. The download button is hidden until the constant has a numeric value. Tucker provides the rate; one-line edit + rebuild + push + jsDelivr purge to ship.

## Section 4 — PDF generation tech

**Library: `pdfmake`** (~280KB minified, bundled into `app.js`).

Chosen over `window.print()` + print stylesheet because the insurer-facing strategic positioning demands a real `.pdf` file with a real filename — not a "Save as PDF" via the browser print dialog. Chosen over `jsPDF` for cleaner tabular layout (the service estimate block is essentially a 2-column table).

Chosen over `html2pdf` (the round-1 burn) because `pdfmake` builds from a programmatic document definition, not from rendered HTML/canvas. The failure mode that broke `html2pdf` on embedded Webflow pages — cross-origin canvas issues — doesn't apply.

**Bundling:** imported via the existing build, not from a CDN. Keeps the page self-contained and avoids a third-party network dependency on the critical "download" click path. `app.js` grows from ~71KB to ~350KB. Acceptable trade-off for the strategic feature.

**Failure handling:** wrap `pdfmake.createPdf(doc).download()` in `try/catch`. On error, surface a small inline message: *"Couldn't generate the estimate. [Speak with a Postnatal Care Concierge →] and we'll send you one directly."* — degrades to the same concierge CTA the success path leads to.

## Section 5 — Step 1 changes

**A. Address block — appended under "Your contact details":**

```
Your contact details
  First name *           Last name *
  Email *
  Phone *
  Street address         (optional)
  City *                 Postal code *
```

- 2-column grid on desktop, stacks on mobile.
- **Postal code:** validated against `/^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/`, auto-uppercased and normalized to `A1A 1A1` format on blur.
- **City:** free text, trimmed, max 60 chars.
- **Province:** not collected as a field. Derived from postal code's first letter at PDF render time. Reduces friction without losing meaningful data.
- **Continue button** stays disabled until all required Step 1 fields including city + valid postal code pass.

**B. Hubspot Step 1 payload — adds:**

```
ap_street_address (may be empty),
ap_city,
ap_postal_code
```

Existing fields unchanged.

**C. Copy fix:** when "Postpartum" radio is selected, the date label currently reads *"What was the original due date?"*. Change to **"What was your due date?"**

**D. State shape:** `state.lead` gains `streetAddress`, `city`, `postalCode`. Strictly lead-capture + PDF metadata; engine never reads them.

## Section 6 — Results-page changes

**Replace the existing "Send me my care plan" button** (lives between Highest Priority Supports and the bottom Booking CTA) with a conditional **Download Coverage Estimate** block.

**Initial state (when nursing is covered):**

```
┌─────────────────────────────────────────────┐
│ INSURANCE COVERAGE ESTIMATE                 │
│                                             │
│ Download a one-page coverage estimate you   │
│ can share with your insurer for             │
│ pre-determination or coverage verification. │
│                                             │
│   [ ⬇  Download Coverage Estimate ]         │
│                                             │
│   PDF · One page · Insurer-ready            │
└─────────────────────────────────────────────┘
```

Visually distinct from surrounding cards — heavier border, subtle Alma sage accent — to communicate "this is the moment."

**On click:**
1. `pdfmake.createPdf(doc).download(filename)` — file saves to user's downloads.
2. Within the same handler, swap the block's inner HTML to the post-download state.
3. Fire `submitDownloadToHubspot({ ap_estimate_downloaded: true, ap_estimate_downloaded_at: <ISO> })`.

**Post-download state — inline swap (no modal):**

```
┌─────────────────────────────────────────────┐
│ ✓  Coverage estimate downloaded             │
│                                             │
│ We'll help customize your recovery plan and │
│ navigate potential coverage opportunities.  │
│                                             │
│   [  Speak with a Postnatal Care Concierge →]│
│                                             │
│   Re-download estimate                      │
└─────────────────────────────────────────────┘
```

- Primary CTA → `https://www.almacare.ca/booking/book-a-call` (same target as "What Happens Next" step 1 and bottom booking CTA — single source of truth).
- "Re-download estimate" is a quiet text link that re-invokes PDF generation. Cheap escape hatch.

**When nursing isn't covered:** the entire block is omitted. No gap; layout flows naturally to "What Happens Next."

## Section 7 — Engine fix: PDN duplicate

**Root cause:** `engine.js:182-197`. The `ruleMatches` helper uses `break` (not `return false`) when a `weeksUntilDueMax`/`weeksUntilDueMin` check is skipped for postpartum users. The prenatal `registered_nursing` rule lacks an explicit `isPostpartum: false` guard, so for a postpartum user the rule's only condition (`weeksUntilDueMax: 4`) is silently skipped — and the rule passes. The postpartum `registered_nursing` rule also fires. Result: two PDN cards (one medium, one high).

**Fix:** treat the four week-based conditions as implicit stage gates. If the user is in the wrong stage for that condition, the rule fails:

```js
case 'weeksUntilDueMax':
  if (normalized.isPostpartum) return false;
  if (!(normalized.weeksUntilDue <= value)) return false;
  break;
case 'weeksUntilDueMin':
  if (normalized.isPostpartum) return false;
  if (!(normalized.weeksUntilDue >= value)) return false;
  break;
case 'weeksPostpartumMax':
  if (!normalized.isPostpartum) return false;
  if (!(normalized.weeksPostpartum <= value)) return false;
  break;
case 'weeksPostpartumMin':
  if (!normalized.isPostpartum) return false;
  if (!(normalized.weeksPostpartum >= value)) return false;
  break;
```

No changes to `rules.js`. Rules remain authored as before.

**New test:** `'postpartum user does not match prenatal registered_nursing rule'` — verifies exactly one PDN recommendation, priority `'high'`.

## Section 8 — Chrome "can't click Assessment" bug

**Signature:** multiple reviewers report failure in regular Chrome, success in incognito. Highly characteristic of stale persisted state in localStorage. Round-2 changed Step 1's schema (added contact fields, removed the inline postpartum toggle); anyone who used the tool before round-2 has localStorage with the old shape. On page load, the restore step tries to populate fields that no longer exist, throws, and the Continue handler — bound after restore — never binds.

**Diagnostic (verify before fixing):**
1. Open regular Chrome, hit `almacare.ca/benefits`, check DevTools console for errors during page load.
2. Inspect `localStorage` for the BEAT state key. If shape mismatches the current schema, confirmed.

**Fix:**
1. Wrap state restoration in `try/catch`. On any failure, warn to console and start fresh.
2. Add `STATE_SCHEMA_VERSION = 3` constant. Persist with version; on load, if persisted version doesn't match, discard and start fresh (no migration logic — the data is regeneratable from a fresh Step 1 fill).
3. **Bind the Continue handler before state restoration**, not after. A restore failure can't leave the button inert.

## Section 9 — Hubspot

**Step 1 payload — adds `ap_street_address`, `ap_city`, `ap_postal_code`** to the existing `submitStep1ToHubspot` call.

**Enrichment payload (results-page view) — unchanged.**

**New submission on PDF download** (`submitDownloadToHubspot`):

```
ap_estimate_downloaded: true,
ap_estimate_downloaded_at: <ISO timestamp>
```

Same Hubspot form, third submission. Hubspot workflow can branch on `ap_estimate_downloaded = true` for a tailored concierge follow-up email ("Your coverage estimate is ready to share with your insurer — want help with the next step?").

**Pre-launch TODOs (Hubspot UI side, no code):**
- Add the new properties to the Hubspot form: `ap_street_address`, `ap_city`, `ap_postal_code`, `ap_estimate_downloaded`, `ap_estimate_downloaded_at`.
- Add a workflow branch on `ap_estimate_downloaded = true` for the personalized concierge follow-up.

## Section 10 — Files affected

| File | Change |
|---|---|
| `pages/benefits/preview.html` | Step 1 address fields, "original" copy fix, results-page download block (initial + post-download states), schema-version + try/catch around localStorage restore, Continue handler bound earlier |
| `pages/benefits/src/engine.js` | `ruleMatches` — 4 cases change `break` → `return false` |
| `pages/benefits/src/rules.js` | Add `ALMA_RN_HOURLY_RATE = null` constant |
| `pages/benefits/src/pdf.js` | **New.** `buildEstimateDocDefinition(state, results)` pure function |
| `pages/benefits/test/engine.test.js` | Add postpartum-doesn't-fire-prenatal-rule test |
| `pages/benefits/test/pdf.test.js` | **New.** ~6 unit tests covering doc structure for representative scenarios |
| `pages/benefits/build-webflow.mjs` | No changes; runs as today |
| `pages/benefits/page.json` | No changes |
| `package.json` | Add `pdfmake` dependency |

## Section 11 — Testing

**Unit tests:**

`engine.test.js` additions:
- Postpartum user with `registered_nursing` covered → exactly one PDN recommendation, priority `'high'`.
- Prenatal user at week 36 with `registered_nursing` covered → one PDN recommendation, priority `'medium'`.

`pdf.test.js` (new):
- $2,000 nursing benefit at $90/hr → 22 hours, $1,980 cost.
- $1,500 nursing benefit at $100/hr → 15 hours, $1,500 cost.
- $0 nursing → `buildEstimateDocDefinition` returns `null`.
- Missing street address → "Prepared for" block renders without the street line, no empty gap.
- Missing first/last name → graceful "Prepared for: —".
- HSA-applied amount is added to `nursing.eligibleAmount` before hours computation.

**Manual regression checks post-deploy:**
- Regular Chrome (not incognito) with pre-existing localStorage from round-2 era → Continue button works on first Step 1 visit.
- Insurer that covers PDN → results page shows download block, click downloads `.pdf`, post-download state appears inline, Hubspot enrichment fires.
- Insurer that doesn't cover PDN → no download block, results page flows naturally.
- Postpartum user → only one PDN card.
- Mobile Safari → file lands in Files app, share-to-Mail works (pdfmake's documented behavior).

## Section 12 — Edge cases

- **Refresh after download** → button block re-renders in initial "Download" state (post-download state is in-memory only, not persisted). Re-download works.
- **Browser pop-up blocker** → `pdfmake` uses an `<a download>` mechanism, not a popup; no blocker interference.
- **User navigates Step 2/3 → back to Step 1** → address fields restore from in-memory state, not just localStorage.
- **`ALMA_RN_HOURLY_RATE` unset** → download block doesn't render. Results page falls back to existing flow.

## Section 13 — Rollout

Same flow as round-2:

1. Edit `preview.html`, `engine.js`, `rules.js`. Add `pdf.js`, `pdf.test.js`. Add postpartum engine test.
2. `npm install pdfmake` — update `package.json`.
3. `node pages/benefits/build-webflow.mjs` — confirm new `app.js` size (~350KB).
4. Push `feature/benefits-tool:main`.
5. `curl -s "https://purge.jsdelivr.net/gh/tuckerschreiber/alma-benefits-tool@main/pages/benefits/app.js"`
6. Re-paste Webflow head (CSS for download block) + body (Step 1 address fields, results-page download block markup).
7. Hard-refresh, regression test in regular Chrome (especially: existing localStorage shouldn't break).

## Out of scope

- Named-provider estimates (still a manual post-consultation workflow).
- Server-side PDF generation (everything stays client-side).
- Day-vs-night split on the PDF (single combined line item; day/night negotiated at consultation).
- Province field as a separate input (derived from postal code prefix at PDF render).
- Migrating round-2 localStorage data (discarded on schema-version mismatch).

## Pre-launch TODOs (carried forward + new)

- **From round-2:** `HUBSPOT.portalId` + `HUBSPOT.formId` still `TODO_FILL_IN`. Clinical sign-off on rule matrix. `page.json` `ogImage` still TBD.
- **New, this round:** `ALMA_RN_HOURLY_RATE` in `rules.js`. Hubspot property additions (`ap_street_address`, `ap_city`, `ap_postal_code`, `ap_estimate_downloaded`, `ap_estimate_downloaded_at`). Hubspot workflow branch on `ap_estimate_downloaded`.
