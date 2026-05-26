# Benefits Tool — Round 4 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring PSW into the predetermination treatment alongside RN, add a "nights of overnight care" sub-line to the in-browser coverage snapshot, update the results-page clarifier, and extend the Coverage Estimate PDF to render one row per eligible pathway.

**Design doc:** `docs/plans/2026-05-26-benefits-tool-round-4-design.md`

**Architecture:** Two layers stay in sync: the pure modules under `pages/benefits/src/` (testable in Node) and the inline IIFE inside `pages/benefits/preview.html` (the browser/Webflow runtime). Round 4 is mostly additive — three new constants, one new pure helper, one signature change on `buildEstimateDocDefinition`, plus copy/snapshot/asterisk edits in the inline IIFE. The `build-webflow.mjs` script splits `preview.html` into the Webflow artifacts at the end.

**Tech Stack:** Plain ES modules + Node's built-in `--test`. No bundler. pdfmake is lazy-loaded from jsDelivr at PDF-click time. Webflow Embed for delivery.

**Repo state at start:** Branch `feature/benefits-tool` at `90ddad3` (design doc committed). 35 engine tests + 17 pdf tests passing.

**Conversion math reference:**
- `hours = floor(eligibleAmount / hourlyRate)`
- `nights = floor(hours / nightHours)`
- Display label: `≈ N nights of overnight care (10 hrs each, before HST)`

---

### Task 1: Add `ALMA_PSW_HOURLY_RATE` + `ALMA_NIGHT_HOURS` constants to `src/rules.js`; set `ALMA_RN_HOURLY_RATE = 50`

**Files:**
- Modify: `pages/benefits/src/rules.js:8-12`

**Step 1: Add a failing test**

Create `pages/benefits/test/rules.test.js` (new file):

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALMA_RN_HOURLY_RATE, ALMA_PSW_HOURLY_RATE, ALMA_NIGHT_HOURS } from '../src/rules.js';

test('ALMA_RN_HOURLY_RATE is the configured numeric rate', () => {
  assert.strictEqual(ALMA_RN_HOURLY_RATE, 50);
});

test('ALMA_PSW_HOURLY_RATE is the configured numeric rate', () => {
  assert.strictEqual(ALMA_PSW_HOURLY_RATE, 50);
});

test('ALMA_NIGHT_HOURS defaults to 10 hours per overnight shift', () => {
  assert.strictEqual(ALMA_NIGHT_HOURS, 10);
});
```

**Step 2: Verify it fails**

Run: `node --test pages/benefits/test/rules.test.js`
Expected: 3 fails — first because `ALMA_RN_HOURLY_RATE` is currently `null`, the other two because the exports don't exist.

**Step 3: Make it pass**

Replace lines 8–12 of `pages/benefits/src/rules.js`:

```javascript
// Alma's published hourly rates for in-home postpartum care.
// Used by src/pdf.js to compute "Estimated Hours" from eligible $ amounts,
// and by engine's formatNightsLine helper to display "≈ N nights of overnight
// care" sub-lines on the results snapshot. ALMA_NIGHT_HOURS defines the
// length of an overnight shift (typical 10pm–8am = 10 hrs).
export const ALMA_RN_HOURLY_RATE = 50;
export const ALMA_PSW_HOURLY_RATE = 50;
export const ALMA_NIGHT_HOURS = 10;
```

**Step 4: Verify it passes**

Run: `node --test pages/benefits/test/rules.test.js`
Expected: 3 passing.

**Step 5: Commit**

```bash
git add pages/benefits/src/rules.js pages/benefits/test/rules.test.js
git commit -m "feat(beat): wire RN/PSW hourly rates + night-shift length constants"
```

---

### Task 2: Add `formatNightsLine` pure helper to `src/engine.js`

**Files:**
- Modify: `pages/benefits/src/engine.js` (append near other exports, e.g. after `computeEligibleAmounts`)
- Modify: `pages/benefits/test/engine.test.js` (append new tests)

**Step 1: Add failing tests**

Append to `pages/benefits/test/engine.test.js`:

```javascript
import { formatNightsLine } from '../src/engine.js';

test('formatNightsLine: $10,000 at $50/hr, 10hr nights → "≈ 20 nights of overnight care (10 hrs each, before HST)"', () => {
  assert.strictEqual(
    formatNightsLine(10000, 50, 10),
    '≈ 20 nights of overnight care (10 hrs each, before HST)'
  );
});

test('formatNightsLine: floors fractional nights', () => {
  // $1,000 / $50 = 20 hrs; 20 / 10 = 2 nights exactly
  assert.strictEqual(formatNightsLine(1000, 50, 10), '≈ 2 nights of overnight care (10 hrs each, before HST)');
  // $1,099 / $50 = 21.98 hrs → 21 hrs floor → 2.1 nights → 2 nights floor
  assert.strictEqual(formatNightsLine(1099, 50, 10), '≈ 2 nights of overnight care (10 hrs each, before HST)');
});

test('formatNightsLine: returns "" when amount is 0/missing', () => {
  assert.strictEqual(formatNightsLine(0, 50, 10), '');
  assert.strictEqual(formatNightsLine(null, 50, 10), '');
  assert.strictEqual(formatNightsLine(undefined, 50, 10), '');
});

test('formatNightsLine: returns "" when hourlyRate is null/0', () => {
  assert.strictEqual(formatNightsLine(10000, null, 10), '');
  assert.strictEqual(formatNightsLine(10000, 0, 10), '');
});

test('formatNightsLine: returns "" when result would be 0 nights', () => {
  // $100 / $50 = 2 hrs; 2 / 10 = 0 nights → show nothing rather than "≈ 0 nights"
  assert.strictEqual(formatNightsLine(100, 50, 10), '');
});

test('formatNightsLine: singular "1 night" when exactly one', () => {
  // $500 / $50 = 10 hrs; 10 / 10 = 1 night
  assert.strictEqual(formatNightsLine(500, 50, 10), '≈ 1 night of overnight care (10 hrs each, before HST)');
});
```

**Step 2: Verify they fail**

Run: `node --test pages/benefits/test/engine.test.js`
Expected: 6 new tests fail with "formatNightsLine is not defined" or similar import error.

**Step 3: Implement `formatNightsLine`**

Append to `pages/benefits/src/engine.js`:

```javascript
/**
 * Format the "≈ N nights of overnight care" sub-line shown under each RN/PSW
 * row in the Coverage at a Glance snapshot. Returns '' when the line should be
 * hidden — when the eligible amount is missing/zero, the hourly rate is unset,
 * or the math would produce 0 nights.
 *
 * The math is intentionally pre-HST: insurer maximums are pre-tax, and the
 * "(before HST)" qualifier keeps clients from confusing this with a final bill.
 */
export function formatNightsLine(eligibleAmount, hourlyRate, nightHours) {
  if (!eligibleAmount || eligibleAmount <= 0) return '';
  if (!hourlyRate || hourlyRate <= 0) return '';
  if (!nightHours || nightHours <= 0) return '';
  const hours = Math.floor(eligibleAmount / hourlyRate);
  const nights = Math.floor(hours / nightHours);
  if (nights <= 0) return '';
  const noun = nights === 1 ? 'night' : 'nights';
  return `≈ ${nights} ${noun} of overnight care (${nightHours} hrs each, before HST)`;
}
```

**Step 4: Verify they pass**

Run: `node --test pages/benefits/test/engine.test.js`
Expected: 35 (existing) + 6 (new) = 41 passing.

**Step 5: Commit**

```bash
git add pages/benefits/src/engine.js pages/benefits/test/engine.test.js
git commit -m "feat(beat): add formatNightsLine helper for snapshot sub-line"
```

---

### Task 3: Extend `buildEstimateDocDefinition` to render both RN and PSW pathways

**Files:**
- Modify: `pages/benefits/src/pdf.js`
- Modify: `pages/benefits/test/pdf.test.js`

The new signature accepts both pathway amounts and both rates. Behaviour: render one table row per pathway with `eligibleAmount > 0`, add a Total row only when both rows are present, return `null` when both amounts are zero/missing or when *neither* corresponding rate is configured.

**Step 1: Update existing tests to the new signature + add new failing tests**

Open `pages/benefits/test/pdf.test.js`. Update all references to `{ hourlyRate: 90 }` → `{ rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY }`. Update `baseResults` from `{ nursing: { eligibleAmount: 2000 } }` to keep the `nursing` shape but also support a `psw` key.

Then append these new tests at the bottom:

```javascript
test('RN-only: PSW absent → single RN row, no Total row', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 10000 } },
    { rnHourlyRate: 50, pswHourlyRate: 50, today: TODAY }
  );
  assert.notStrictEqual(doc, null);
  const flat = JSON.stringify(doc);
  assert.match(flat, /Private Duty Nursing/);
  assert.match(flat, /200 hours/);            // 10000/50
  assert.doesNotMatch(flat, /Personal Support Worker/);
  assert.doesNotMatch(flat, /Total/);         // no total row when single pathway
});

test('PSW-only: nursing zero, PSW eligible → single PSW row', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 0 }, psw: { eligibleAmount: 1000 } },
    { rnHourlyRate: 50, pswHourlyRate: 50, today: TODAY }
  );
  assert.notStrictEqual(doc, null);
  const flat = JSON.stringify(doc);
  assert.match(flat, /Personal Support Worker/);
  assert.match(flat, /20 hours/);             // 1000/50
  assert.doesNotMatch(flat, /Private Duty Nursing/);
  assert.doesNotMatch(flat, /Total/);
});

test('RN + PSW: both eligible → both rows + Total row', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 10000 }, psw: { eligibleAmount: 1000 } },
    { rnHourlyRate: 50, pswHourlyRate: 50, today: TODAY }
  );
  const flat = JSON.stringify(doc);
  assert.match(flat, /Private Duty Nursing/);
  assert.match(flat, /Personal Support Worker/);
  assert.match(flat, /200 hours/);
  assert.match(flat, /20 hours/);
  assert.match(flat, /Total/);
  assert.match(flat, /\$11,000/);             // total eligible
  assert.match(flat, /220 hours/);            // total hours
});

test('both pathways zero → null', () => {
  assert.strictEqual(
    buildEstimateDocDefinition(
      baseState,
      { nursing: { eligibleAmount: 0 }, psw: { eligibleAmount: 0 } },
      { rnHourlyRate: 50, pswHourlyRate: 50, today: TODAY }
    ),
    null
  );
});

test('RN eligible but rnHourlyRate unset → that row hidden; if no PSW, null', () => {
  assert.strictEqual(
    buildEstimateDocDefinition(
      baseState,
      { nursing: { eligibleAmount: 10000 } },
      { rnHourlyRate: null, pswHourlyRate: 50, today: TODAY }
    ),
    null
  );
});

test('RN+PSW eligible but only RN rate configured → renders RN only, no Total', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 10000 }, psw: { eligibleAmount: 1000 } },
    { rnHourlyRate: 50, pswHourlyRate: null, today: TODAY }
  );
  assert.notStrictEqual(doc, null);
  const flat = JSON.stringify(doc);
  assert.match(flat, /Private Duty Nursing/);
  assert.doesNotMatch(flat, /Personal Support Worker/);
  assert.doesNotMatch(flat, /Total/);
});
```

Existing test "$2000 nursing at $90/hr → 22 hours, $1,980 cost" needs its `opts` updated to `{ rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY }`. Same for the other existing tests using `hourlyRate`.

**Step 2: Verify failures**

Run: `node --test pages/benefits/test/pdf.test.js`
Expected: the 6 new tests fail; the existing tests fail because the function now requires the new opts shape.

**Step 3: Rewrite `buildEstimateDocDefinition` in `src/pdf.js`**

Replace the body of `buildEstimateDocDefinition` (lines ~49–121). New shape:

```javascript
/**
 * Build a pdfmake doc-definition object for the insurer coverage estimate.
 * Renders one row per eligible pathway (RN, PSW) with a Total row when both
 * are present. Returns null when no rows would render.
 *
 * @param {{lead: object}} state
 * @param {{nursing?: {eligibleAmount: number}, psw?: {eligibleAmount: number}}} results
 * @param {{rnHourlyRate: number|null, pswHourlyRate: number|null, today: Date}} opts
 */
export function buildEstimateDocDefinition(state, results, opts) {
  const today = (opts && opts.today) || new Date();
  const rnAmount = results && results.nursing && results.nursing.eligibleAmount;
  const pswAmount = results && results.psw && results.psw.eligibleAmount;
  const rnRate = opts && opts.rnHourlyRate;
  const pswRate = opts && opts.pswHourlyRate;

  const rows = [];
  if (rnAmount > 0 && rnRate > 0) {
    const hours = Math.floor(rnAmount / rnRate);
    rows.push({
      service: 'Private Duty Nursing (RN)',
      rate: rnRate,
      amount: rnAmount,
      hours
    });
  }
  if (pswAmount > 0 && pswRate > 0) {
    const hours = Math.floor(pswAmount / pswRate);
    rows.push({
      service: 'Personal Support Worker (PSW)',
      rate: pswRate,
      amount: pswAmount,
      hours
    });
  }
  if (rows.length === 0) return null;

  const tableBody = [
    [
      { text: 'Service', bold: true },
      { text: 'Hourly rate', bold: true },
      { text: 'Eligible amount', bold: true },
      { text: 'Estimated hours', bold: true }
    ],
    ...rows.map((r) => [
      r.service,
      formatCurrency(r.rate),
      formatCurrency(r.amount),
      `${r.hours} hours`
    ])
  ];

  if (rows.length > 1) {
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    tableBody.push([
      { text: 'Total', bold: true },
      '',
      { text: formatCurrency(totalAmount), bold: true },
      { text: `${totalHours} hours`, bold: true }
    ]);
  }

  return {
    pageSize: 'LETTER',
    pageMargins: [72, 72, 72, 72],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#222' },
    content: [
      { text: 'POSTPARTUM SUPPORT COVERAGE ESTIMATE', fontSize: 16, bold: true, color: '#032215' },
      { text: 'Alma Care', fontSize: 10, color: '#555', margin: [0, 2, 0, 8] },

      ...buildPreparedFor(state.lead || {}),
      { text: `Generated: ${formatLongDate(today)}`, fontSize: 10, color: '#555', margin: [0, 2, 0, 16] },

      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 0.5, lineColor: '#999' }] },

      { text: 'Purpose', fontSize: 11, bold: true, margin: [0, 14, 0, 4] },
      {
        text: 'This estimate is intended to support insurance coverage inquiry or pre-determination requests. Coverage approval remains subject to insurer policies and eligibility requirements.',
        fontSize: 10, margin: [0, 0, 0, 14]
      },

      { text: 'Service Estimate', fontSize: 11, bold: true, margin: [0, 0, 0, 6] },
      {
        table: { widths: [160, 70, '*', 80], body: tableBody },
        layout: {
          hLineColor: () => '#ddd',
          vLineColor: () => '#ddd',
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          paddingLeft: () => 10,
          paddingRight: () => 10
        }
      },
      {
        text: 'Final care plans are customized based on family needs and coverage requirements.',
        fontSize: 9, italics: true, color: '#555', margin: [0, 8, 0, 14]
      },

      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 0.5, lineColor: '#999' }] },

      {
        text: 'This document is an estimate only and does not guarantee reimbursement or insurer approval.',
        fontSize: 8, italics: true, color: '#777', margin: [0, 10, 0, 0]
      }
    ],
    footer: {
      text: 'Questions? Speak with an Alma Postnatal Care Concierge · almacare.ca',
      alignment: 'center',
      fontSize: 8,
      color: '#777',
      margin: [0, 20, 0, 0]
    }
  };
}
```

**Step 4: Verify all pdf tests pass**

Run: `node --test pages/benefits/test/pdf.test.js`
Expected: 17 (updated existing) + 6 (new) = 23 passing.

**Step 5: Commit**

```bash
git add pages/benefits/src/pdf.js pages/benefits/test/pdf.test.js
git commit -m "feat(beat): coverage estimate PDF renders RN + PSW pathways"
```

---

### Task 4: Mirror rate constants + `formatNightsLine` in `preview.html` inline IIFE

**Files:**
- Modify: `pages/benefits/preview.html` (around lines 2060–2068 — the inline PDF mirror block)
- Modify: `pages/benefits/preview.html` (find the inline `engine.js` mirror — the `applyRules`/`computeResults` block — and add the helper there)

**Step 1: Update the inline rate constants**

In `preview.html`, find the block starting at line ~2060 (`// ---------- PDF (mirror of pages/benefits/src/pdf.js + ALMA_RN_HOURLY_RATE from src/rules.js)`). Replace `const ALMA_RN_HOURLY_RATE = null;` with:

```javascript
const ALMA_RN_HOURLY_RATE = 50;
const ALMA_PSW_HOURLY_RATE = 50;
const ALMA_NIGHT_HOURS = 10;
```

Also bump the `Last synced from src/pdf.js @ <SHA>` comment to the SHA of the Task 3 commit (run `git log -1 --format=%h pages/benefits/src/pdf.js` to get it).

**Step 2: Mirror `formatNightsLine` into the inline engine block**

Find the inline engine block in `preview.html` (search for `function computeEligibleAmounts` or `function applyRules`). Append immediately after `computeEligibleAmounts`:

```javascript
function formatNightsLine(eligibleAmount, hourlyRate, nightHours) {
  if (!eligibleAmount || eligibleAmount <= 0) return '';
  if (!hourlyRate || hourlyRate <= 0) return '';
  if (!nightHours || nightHours <= 0) return '';
  const hours = Math.floor(eligibleAmount / hourlyRate);
  const nights = Math.floor(hours / nightHours);
  if (nights <= 0) return '';
  const noun = nights === 1 ? 'night' : 'nights';
  return '≈ ' + nights + ' ' + noun + ' of overnight care (' + nightHours + ' hrs each, before HST)';
}
```

**Step 3: Smoke-check the file still parses**

Run: `node -e "import('./pages/benefits/preview.html').catch(() => process.exit(0))"` won't work for HTML. Instead just verify the file still parses as HTML via the build script's syntax pass:

Run: `node pages/benefits/build-webflow.mjs`
Expected: exits 0, regenerates `webflow-head.html`, `webflow-body.html`, `app.js`. Note new app.js size — should grow by a few hundred bytes.

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(beat): mirror rate constants + formatNightsLine in inline IIFE"
```

(Skip committing the regenerated webflow artifacts — those are rebuilt in a final task.)

---

### Task 5: Wire `formatNightsLine` into the Coverage at a Glance snapshot

**Files:**
- Modify: `pages/benefits/preview.html` (the `renderSnapshot` function, around lines 2900–2955)

**Step 1: Locate the eligible-items map**

Find this block inside `renderSnapshot`:

```javascript
const eligibleItems = coveredIds.map(function (id) {
  const name = SERVICE_NAMES[id] || id;
  const amt = formatMoney(eligibleAmounts[id]);
  return '<li><span class="ap-coverage-list__check">✓</span>'
    + escapeHtml(name) + ' — <strong>' + amt + ' eligible</strong></li>';
}).join('');
```

**Step 2: Append the nights sub-line for RN and PSW only**

Replace with:

```javascript
const eligibleItems = coveredIds.map(function (id) {
  const name = SERVICE_NAMES[id] || id;
  const amt = formatMoney(eligibleAmounts[id]);
  let nightsLine = '';
  if (id === 'registered_nursing') {
    nightsLine = formatNightsLine(eligibleAmounts[id], ALMA_RN_HOURLY_RATE, ALMA_NIGHT_HOURS);
  } else if (id === 'psw') {
    nightsLine = formatNightsLine(eligibleAmounts[id], ALMA_PSW_HOURLY_RATE, ALMA_NIGHT_HOURS);
  }
  const nightsHtml = nightsLine
    ? '<div class="ap-coverage-list__nights">' + escapeHtml(nightsLine) + '</div>'
    : '';
  return '<li><span class="ap-coverage-list__check">✓</span>'
    + escapeHtml(name) + ' — <strong>' + amt + ' eligible</strong>'
    + nightsHtml
    + '</li>';
}).join('');
```

**Step 3: Add CSS for the new sub-line**

Find the existing `.ap-coverage-list__check` rule in the `<style>` block. Add nearby:

```css
.ap-coverage-list__nights {
  margin-left: 1.5rem;
  font-size: 0.875rem;
  color: var(--ap-text-muted, #6b6b6b);
  margin-top: 0.15rem;
}

/* Print: keep the nights sub-line visible in the printed PDF */
@media print {
  .ap-coverage-list__nights { color: #555; }
}
```

**Step 4: Smoke-test in the browser**

Open `pages/benefits/preview.html` directly in a browser (or via a local server if needed). Run through the wizard with: postpartum mode, $10,000 RN coverage, $1,000 PSW coverage. On the results page, confirm:
- Under "✓ Private Duty Nursing — $10,000 eligible" → sub-line `≈ 20 nights of overnight care (10 hrs each, before HST)`
- Under "✓ Personal Support Worker (PSW) — $1,000 eligible" → sub-line `≈ 2 nights of overnight care (10 hrs each, before HST)`
- No sub-line under other services (massage, acupuncture, etc.).

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(beat): show nights-of-care sub-line under RN + PSW snapshot rows"
```

---

### Task 6: Add `'psw'` to asterisk + footnote checks

**Files:**
- Modify: `pages/benefits/preview.html` (four `=== 'postpartum_doula_care' || ...registered_nursing'` checks)

**Step 1: Find every check**

Run: `grep -n "registered_nursing" pages/benefits/preview.html` and identify the four conditions that test for the asterisk:
- `renderRecCard`: `needsAsterisk` const
- `renderPlan`: `hasAsterisk` reduce
- `renderPdfPlan`: `needsAsterisk` const
- `renderPdfPlan`: `hasAsterisk` reduce

Each currently reads:

```javascript
rec.service === 'postpartum_doula_care' || rec.service === 'registered_nursing'
```

(or `r.service` instead of `rec.service` in the reduce-style checks).

**Step 2: Append PSW to each**

Replace each occurrence with:

```javascript
rec.service === 'postpartum_doula_care'
  || rec.service === 'registered_nursing'
  || rec.service === 'psw'
```

**Step 3: Smoke-test**

Reload `preview.html`. Re-run the wizard with PSW coverage. Confirm:
- PSW rec card shows the `*` asterisk next to its title
- Footnote "Pre-assessment approval may be required..." appears when PSW is the only eligible service that needs predetermination

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(beat): treat PSW like RN for predetermination asterisk + footnote"
```

---

### Task 7: Replace the results-page clarifier copy

**Files:**
- Modify: `pages/benefits/preview.html` (the `renderClarifier` function, around line 2890)

**Step 1: Find and replace**

Current copy:

```javascript
function renderClarifier() {
  return (
    '<p class="ap-results__clarifier">'
    + 'This care plan outlines eligible coverage pathways and recommended postpartum supports. '
    + 'After your complimentary consultation, we’ll prepare a tailored estimate with specific care '
    + 'providers, hours, and costs — ready to submit to your insurer.'
    + '</p>'
  );
}
```

Replace the inner string with the team's exact copy:

```javascript
function renderClarifier() {
  return (
    '<p class="ap-results__clarifier">'
    + 'This estimate outlines potential care pathways based on your benefits shared. '
    + 'After your complimentary consultation, our Postnatal Care Concierge will prepare a '
    + 'holistic care plan that addresses your goals, total budget and scheduling.'
    + '</p>'
  );
}
```

**Step 2: Smoke-test**

Reload `preview.html` → finish the wizard → confirm the new paragraph renders on the results page above the snapshot.

**Step 3: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(beat): new results-page clarifier copy — Concierge-led holistic plan"
```

---

### Task 8: Mirror the PDF rewrite + download trigger change in `preview.html`

**Files:**
- Modify: `pages/benefits/preview.html` (the inline `buildEstimateDocDefinition`, around lines 2106–2185)
- Modify: `pages/benefits/preview.html` (`handleDownloadEstimate` call site, around lines 3030–3110)

**Step 1: Mirror the new `buildEstimateDocDefinition`**

Replace the inline `buildEstimateDocDefinition` body with the same structure as Task 3's `src/pdf.js` rewrite, adapted to ES5-ish syntax (`var`/`function`, no arrow funcs in inline IIFE if pattern is `function`-based — match surrounding style). New opts shape: `{ rnHourlyRate, pswHourlyRate, today }`.

The inline version differs from `src/pdf.js` only in `import`/`export` syntax — paste the function body, keep the `formatCurrency`/`formatLongDate`/`buildPreparedFor` helpers already present in the inline block.

Update the sync comment:

```javascript
// Last synced from src/pdf.js @ <Task-3-SHA> (round 4)
```

**Step 2: Update the download adapter**

Find `handleDownloadEstimate` (around line 3085). Locate:

```javascript
const doc = buildEstimateDocDefinition(state, adapterResults, {
  hourlyRate: ALMA_RN_HOURLY_RATE,
  ...
});
```

Update to:

```javascript
const doc = buildEstimateDocDefinition(state, adapterResults, {
  rnHourlyRate: ALMA_RN_HOURLY_RATE,
  pswHourlyRate: ALMA_PSW_HOURLY_RATE,
  today: new Date()
});
```

Also update the `adapterResults` construction nearby — it currently builds `{ nursing: { eligibleAmount: ... } }`. Extend to also include `psw: { eligibleAmount: eligibleAmounts.psw || 0 }`.

**Step 3: Update the download-button visibility trigger**

Find (around line 3030):

```javascript
const rateConfigured = typeof ALMA_RN_HOURLY_RATE === 'number' && ALMA_RN_HOURLY_RATE > 0;
const showDownload = eligibleNursing > 0 && rateConfigured;
```

Replace with:

```javascript
const rnConfigured = typeof ALMA_RN_HOURLY_RATE === 'number' && ALMA_RN_HOURLY_RATE > 0;
const pswConfigured = typeof ALMA_PSW_HOURLY_RATE === 'number' && ALMA_PSW_HOURLY_RATE > 0;
const eligiblePsw = (eligibleAmounts && eligibleAmounts.psw) || 0;
const showDownload =
  (eligibleNursing > 0 && rnConfigured) || (eligiblePsw > 0 && pswConfigured);
```

**Step 4: Smoke-test the PDF download end-to-end**

Reload `preview.html`. Run the wizard with RN + PSW coverage. On results, click **Download Coverage Estimate**. The PDF should:
- Render both rows + Total row
- Show `Private Duty Nursing (RN) | $50.00 | $10,000.00 | 200 hours` and `Personal Support Worker (PSW) | $50.00 | $1,000.00 | 20 hours`
- Show `Total | $11,000.00 | 220 hours`

Repeat with PSW-only coverage (no RN coverage). PDF should render the single PSW row, no Total.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(beat): mirror multi-pathway PDF + download trigger in preview"
```

---

### Task 9: Rebuild Webflow artifacts + verify sizes

**Files:**
- Modify (auto-generated): `pages/benefits/webflow-head.html`, `pages/benefits/webflow-body.html`, `pages/benefits/app.js`

**Step 1: Run the build**

Run: `node pages/benefits/build-webflow.mjs`
Expected: writes three files; prints their sizes.

**Step 2: Verify size budget**

`webflow-body.html` MUST stay under 50,000 bytes (Webflow Embed cap). Run:

```bash
wc -c pages/benefits/webflow-head.html pages/benefits/webflow-body.html pages/benefits/app.js
```

Expected: body under 50,000. Round-3 body was 28KB; round-4 grows it by perhaps 1KB (one new <li> sub-line in snapshot, one PSW asterisk path). Plenty of headroom.

**Step 3: Run the full test suite**

Run: `node --test pages/benefits/test/engine.test.js pages/benefits/test/pdf.test.js pages/benefits/test/rules.test.js`
Expected: all passing — 41 engine + 23 pdf + 3 rules = 67 tests.

**Step 4: Commit**

```bash
git add pages/benefits/webflow-head.html pages/benefits/webflow-body.html pages/benefits/app.js
git commit -m "build(beat): regenerate Webflow artifacts for round 4"
```

---

### Task 10: Open PR + (after merge) deploy

**Step 1: Push branch**

```bash
git push origin feature/benefits-tool
```

**Step 2: Open PR against `main`**

```bash
gh pr create --title "BEAT round 4: PSW predetermination + nights-of-care + new clarifier" --body "$(cat <<'EOF'
## Summary
- PSW joins RN in the predetermination treatment (asterisk + footnote in browser, included in Coverage Estimate PDF, download button now triggers when either pathway is eligible)
- New "≈ N nights of overnight care (10 hrs each, before HST)" sub-line under RN/PSW rows on Coverage at a Glance
- Updated results-page clarifier copy — points at the Postnatal Care Concierge holistic care plan
- Coverage Estimate PDF restructured: one row per eligible pathway + Total row when both present
- Rates wired: `ALMA_RN_HOURLY_RATE = 50`, `ALMA_PSW_HOURLY_RATE = 50`, `ALMA_NIGHT_HOURS = 10`

## Test plan
- [ ] Tests passing locally (67 tests)
- [ ] preview.html smoke test: RN + PSW coverage shows both nights sub-lines + PSW asterisk
- [ ] preview.html smoke test: clarifier shows new copy
- [ ] PDF smoke test: RN-only renders single row no Total
- [ ] PDF smoke test: PSW-only renders single PSW row no Total
- [ ] PDF smoke test: RN+PSW renders both rows + Total row
- [ ] Webflow body size under 50KB

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: After merge — deploy**

```bash
# Push merged main back to origin so jsDelivr serves it
git checkout main && git pull origin main && git push origin main

# Purge jsDelivr cache
curl -s "https://purge.jsdelivr.net/gh/tuckerschreiber/alma-benefits-tool@main/pages/benefits/app.js"

# Re-paste in Webflow:
#   - Head custom code (new CSS for ap-coverage-list__nights)
#   - Body Embed (new <li> sub-line markup)
```

**Step 4: Verify live**

Hard-refresh `almacare.ca/benefits`. Run the wizard with RN + PSW coverage; confirm the nights sub-lines appear on the snapshot, PSW shows the asterisk + footnote, the clarifier reads the new copy, and the Download Coverage Estimate button is now active.

---

## Done criteria

- 67/67 tests passing locally
- `webflow-body.html` < 50,000 bytes
- PSW shows asterisk + footnote in browser results and is included in the Coverage Estimate PDF when eligible
- Snapshot shows nights sub-line under RN and PSW only
- Clarifier renders the new Concierge copy
- PDF renders one row per eligible pathway with Total when both present
- Live on almacare.ca/benefits after merge + purge + Webflow re-paste
