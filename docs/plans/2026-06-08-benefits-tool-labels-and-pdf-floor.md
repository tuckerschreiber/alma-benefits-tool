# Benefits tool: calculator labels + PDF floor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rename two calculator card labels to match insurance-plan wording, and drop the PDF download floor from one full overnight shift ($480) to one hour ($48), with partial-shift PDFs supported for amounts in between.

**Architecture:** `preview.html` is the production source of truth. The build script (`build-webflow.mjs`) reads it and regenerates `app.js`, `webflow-body.html`, `webflow-head.html`, and `webflow-test.html`. Parallel testable modules live in `src/engine.js` and `src/pdf.js` — these mirror the inline IIFE in `preview.html` and are covered by `test/*.test.js`. Every code change has to be applied to **both** the `src/` module **and** `preview.html`'s inline copy to keep them in sync.

**Tech Stack:** Vanilla JS (no build step beyond the webflow split), pdfmake (loaded from jsDelivr at runtime), Node's built-in test runner.

**Worktree:** `.worktrees/labels-pdf-floor` on `feature/labels-pdf-floor`.

---

## Task 1: Rename service labels — tests + `src/engine.js`

**Files:**
- Modify: `pages/benefits/test/engine.test.js:269-273`
- Modify: `pages/benefits/src/engine.js:7-10`

**Step 1: Extend the SERVICE_NAMES test to assert the new labels**

In `test/engine.test.js`, add two lines inside the existing `computeResults: SERVICE_NAMES exports human-readable names` test (the block at line 269):

```js
test('computeResults: SERVICE_NAMES exports human-readable names', () => {
  assert.equal(SERVICE_NAMES.massage_therapy, 'Registered Massage Therapy (RMT)');
  assert.equal(SERVICE_NAMES.lactation_consulting, 'Lactation Consultant / IBCLC');
  assert.equal(SERVICE_NAMES.psw, 'Personal Support Worker (PSW)');
  assert.equal(SERVICE_NAMES.postpartum_doula_care, 'Certified Doula');
  assert.equal(SERVICE_NAMES.registered_nursing, 'In-Home Nursing');
});
```

**Step 2: Run the test to verify it fails**

```bash
cd pages/benefits && node --test test/engine.test.js 2>&1 | grep -E "(SERVICE_NAMES|fail)" | head -20
```

Expected: fails because old strings are still in `src/engine.js`.

**Step 3: Update `src/engine.js` SERVICE_NAMES**

In `src/engine.js`, replace lines 7–10:

```js
export const SERVICE_NAMES = {
  massage_therapy: 'Registered Massage Therapy (RMT)',
  acupuncture: 'Registered Acupuncture',
  lactation_consulting: 'Lactation Consultant / IBCLC',
  postpartum_doula_care: 'Certified Doula',
  registered_nursing: 'In-Home Nursing',
  psw: 'Personal Support Worker (PSW)',
  mental_health: 'Mental Health Therapist',
  nutritionist: 'Registered Dietitian'
};
```

(Only the two values change — keep the rest as-is.)

**Step 4: Run all tests to verify pass**

```bash
cd pages/benefits && node --test test/engine.test.js test/pdf.test.js test/rules.test.js 2>&1 | tail -8
```

Expected: all 73 tests pass.

**Step 5: Commit**

```bash
git add pages/benefits/src/engine.js pages/benefits/test/engine.test.js
git commit -m "feat(engine): rename Doula + Nursing service labels"
```

---

## Task 2: Update labels + production logic in `preview.html`

`preview.html` carries the production copies of (a) the card labels, (b) the inline `SERVICE_NAMES` map, (c) the `renderDownloadBlock` threshold, and (d) the `buildEstimateDocDefinition`/`buildFeeTable` PDF builder. We update everything *except* PDF partial-shift logic here — that lands in Task 5 once `src/pdf.js` is the verified reference implementation.

**Files:**
- Modify: `pages/benefits/preview.html`

**Step 1: Rename the calculator card labels**

Find each of these strings and replace:

| Find | Replace |
|---|---|
| `Certified Postpartum Doula` (card label, line ~1693) | `Certified Doula` |
| `Certified Postpartum Doula coverage` (detail title, line ~1696) | `Certified Doula coverage` |
| `In-Home Postpartum Support` (card label, line ~1708) | `In-Home Nursing` |
| `In-Home Postpartum Support coverage` (detail title, line ~1711) | `In-Home Nursing coverage` |

(The first two are inside the `data-service="postpartum_doula_care"` card; the second two inside `data-service="registered_nursing"`.)

**Step 2: Update the inline SERVICE_NAMES map**

Around line 1802–1803, change:

```js
postpartum_doula_care: 'Certified Postpartum Doula',
registered_nursing: 'In-Home Postpartum Support',
```

to:

```js
postpartum_doula_care: 'Certified Doula',
registered_nursing: 'In-Home Nursing',
```

**Step 3: Do NOT touch the PDF section heading**

There's a line `{ text: 'In-Home Postpartum Support', bold: true, fontSize: 11 }` around line 2382 — leave it. It's the service heading on the generated PDF itself, kept for insurer-facing consistency with the existing PDF test (`test/pdf.test.js:141`).

**Step 4: Verify with a quick grep**

```bash
grep -n "Certified Postpartum Doula\|In-Home Postpartum Support" pages/benefits/preview.html
```

Expected: only the PDF-heading line at ~2382 still matches `In-Home Postpartum Support`. No matches for `Certified Postpartum Doula`.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(ui): rename Doula + Nursing labels in preview.html"
```

---

## Task 3: PDF partial-shift logic — failing tests

The current `src/pdf.js` returns `null` for any eligible amount below one full shift ($480). After this task, it should:
- Return `null` only when amount < `hourlyRate` (i.e. less than one hour).
- For partial shifts (`$48 ≤ amount < $480`): build a doc with a single "Partial overnight" row showing the actual hours covered.
- For full shifts (`amount ≥ $480`): behave exactly as today.

**Files:**
- Modify: `pages/benefits/test/pdf.test.js:53-61`

**Step 1: Update the `<1 shift returns null` test**

Replace the existing test at line 53–61 with:

```js
test('returns null when eligible amount is less than one hour of care', () => {
  // $30 < $48/hr -> not enough for even one hour -> null.
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 30 } },
    { hourlyRate: 48, today: TODAY }
  );
  assert.strictEqual(doc, null);
});

test('returns a partial-shift doc when amount covers some hours but less than one full shift', () => {
  // $200 / $48 = 4 hours; less than 10-hr shift -> partial overnight row.
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 200 } },
    { hourlyRate: 48, today: TODAY }
  );
  assert.notStrictEqual(doc, null);
  const flat = JSON.stringify(doc);
  // Single visit row with "Partial overnight" shift type and 4 hours.
  assert.match(flat, /Partial overnight/);
  assert.match(flat, /"text":"4"/);
  // Cost per visit = 4 × $48 = $192. Subtotal = $192.
  assert.match(flat, /\$192\.00/);
});

test('partial-shift doc has exactly one visit row', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 384 } }, // 8 hours
    { hourlyRate: 48, today: TODAY }
  );
  const flat = JSON.stringify(doc);
  // Visit "1" appears, but "2" does not.
  assert.match(flat, /"text":"1"/);
  assert.doesNotMatch(flat, /"text":"2"/);
});
```

**Step 2: Run the tests to verify they fail**

```bash
cd pages/benefits && node --test test/pdf.test.js 2>&1 | grep -E "(partial|hour|fail)" | head -20
```

Expected: the three new tests fail. The first one (`< one hour returns null`) might already pass coincidentally (since $30 < $480 still returns null today) — that's fine, it'll keep passing later.

**Step 3: Don't commit yet — implementation lands in Task 4.**

---

## Task 4: PDF partial-shift logic — implement in `src/pdf.js`

**Files:**
- Modify: `pages/benefits/src/pdf.js:106-157`

**Step 1: Update `buildFeeTable` to accept hours, not just full shifts**

Replace the existing `buildFeeTable` (lines 106–136) with a version that takes a list of visit rows:

```js
// `visits` is an array of { hours, shiftType } describing each row.
// All rows are billed at `hourlyRate`. Subtotal sits in the middle of the
// Price column to mirror Karla's layout.
function buildFeeTable(visits, hourlyRate) {
  const header = [
    { text: 'Visit', bold: true, alignment: 'center' },
    { text: 'Shift Type', bold: true, alignment: 'center' },
    { text: 'Total Hours', bold: true, alignment: 'center' },
    { text: 'Hourly Rate', bold: true, alignment: 'center' },
    { text: 'Cost per visit', bold: true, alignment: 'center' },
    { text: 'Price', bold: true, alignment: 'center' }
  ];
  let subtotal = 0;
  for (const v of visits) subtotal += v.hours * hourlyRate;
  const subtotalText = formatCurrency(subtotal);
  const middleRow = Math.floor((visits.length - 1) / 2);

  const rows = [header];
  visits.forEach((v, idx) => {
    rows.push([
      { text: String(idx + 1), alignment: 'center' },
      { text: v.shiftType, alignment: 'center' },
      { text: String(v.hours), alignment: 'center' },
      { text: formatCurrency(hourlyRate), alignment: 'center' },
      { text: formatCurrency(v.hours * hourlyRate), alignment: 'center' },
      idx === middleRow
        ? { text: subtotalText, alignment: 'right' }
        : { text: '' }
    ]);
  });
  return { rows, subtotal };
}
```

**Step 2: Update `buildEstimateDocDefinition` to build the visits array**

Replace lines 149–165 with:

```js
export function buildEstimateDocDefinition(state, results, opts) {
  const eligibleAmount = results && results.nursing && results.nursing.eligibleAmount;
  const hourlyRate = opts && opts.hourlyRate;
  if (!eligibleAmount || eligibleAmount <= 0) return null;
  if (!hourlyRate || hourlyRate <= 0) return null;

  // Build the visit list. If the user can afford at least one full overnight,
  // bill only full overnights — leftover dollars under one shift are deferred
  // to a daytime/concierge follow-up rather than shown as a partial row.
  // Otherwise (amount < one shift but ≥ one hour), bill a single partial
  // overnight row covering the available whole hours. If the amount can't
  // cover even one hour, return null.
  const shiftCost = SHIFT_HOURS * hourlyRate;
  const numFullShifts = Math.floor(eligibleAmount / shiftCost);
  const remainingAmount = eligibleAmount - numFullShifts * shiftCost;
  const partialHours = Math.floor(remainingAmount / hourlyRate);

  const visits = [];
  if (numFullShifts > 0) {
    for (let i = 0; i < numFullShifts; i++) {
      visits.push({ hours: SHIFT_HOURS, shiftType: 'Overnight' });
    }
  } else if (partialHours > 0) {
    visits.push({ hours: partialHours, shiftType: 'Partial overnight' });
  }
  if (visits.length === 0) return null;

  const today = (opts && opts.today) || new Date();
  const lead = state.lead || {};
  const { rows: feeRows, subtotal } = buildFeeTable(visits, hourlyRate);
  const tax = Math.round(subtotal * HST_RATE * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
```

(Leave the rest of the function — `totalsRows`, the return object, the bullets, etc. — exactly as-is. The only other thing that changes is that `feeRows` now comes from a destructured `buildFeeTable` return value.)

**Step 3: Update the JSDoc above `buildEstimateDocDefinition`**

Lines 138–148 — replace with:

```js
/**
 * Build a pdfmake doc-definition for the coverage estimate.
 * Returns null when the eligible amount can't cover at least one hour of
 * care at the configured hourly rate, or when the hourly rate isn't set.
 *
 * @param {{lead: object}} state
 * @param {{nursing?: {eligibleAmount: number}}} results
 *   The caller sums Doula + RN + PSW eligible amounts upstream and passes
 *   the total here. We treat them as one "in-home postpartum support"
 *   pathway in the PDF.
 * @param {{hourlyRate: number|null, today: Date}} opts
 */
```

**Step 4: Run all PDF tests to verify pass**

```bash
cd pages/benefits && node --test test/pdf.test.js 2>&1 | tail -10
```

Expected: all PDF tests pass — including the existing $10,000 / 20-shift and $5,000 / 10-shift math (since the full-shift branch is unchanged), and the new partial-shift tests.

**Step 5: Run the full suite to confirm no regressions**

```bash
cd pages/benefits && node --test test/engine.test.js test/pdf.test.js test/rules.test.js 2>&1 | tail -8
```

Expected: 75+ tests pass (was 73, plus the 3 new ones in `pdf.test.js`).

**Step 6: Commit**

```bash
git add pages/benefits/src/pdf.js pages/benefits/test/pdf.test.js
git commit -m "feat(pdf): support partial-shift estimates down to one hour"
```

---

## Task 5: Mirror partial-shift logic + lower the gate in `preview.html`

Now we replicate Task 4's changes into the inline IIFE inside `preview.html`, and update `renderDownloadBlock` to use `hourlyRate` ($48) as the floor instead of one full shift ($480).

**Files:**
- Modify: `pages/benefits/preview.html`

**Step 1: Replicate `buildFeeTable` changes**

Find the existing `buildFeeTable` inside the inline IIFE (search for `function buildFeeTable(numShifts, hourlyRate)`). Replace it with the new signature from Task 4, Step 1.

**Step 2: Replicate `buildEstimateDocDefinition` changes**

Find `function buildEstimateDocDefinition(state, results, opts)`. Replace the body up through the `feeRows` assignment with the new version from Task 4, Step 2. Leave the rest untouched.

**Step 3: Lower the download-button gate**

Find `renderDownloadBlock` (search for `function renderDownloadBlock(results)`). Replace:

```js
const rateConfigured = typeof ALMA_RN_HOURLY_RATE === 'number' && ALMA_RN_HOURLY_RATE > 0;
const oneShift = ALMA_RN_HOURLY_RATE * ALMA_NIGHT_HOURS;
const showDownload = rateConfigured && eligibleTotal >= oneShift;
```

with:

```js
const rateConfigured = typeof ALMA_RN_HOURLY_RATE === 'number' && ALMA_RN_HOURLY_RATE > 0;
// Show the download once the user has at least one hour of in-home coverage.
// The PDF builder itself handles partial shifts.
const showDownload = rateConfigured && eligibleTotal >= ALMA_RN_HOURLY_RATE;
```

**Step 4: Update the stale code comments**

Search for the comment `// PDF is single-pathway "In-Home Postpartum Support" — sum every in-home` (~line 3330) inside `handleDownloadEstimate`. Leave it — it's still accurate; we're still summing every in-home benefit line.

The comment near line 1484 inside `renderDownloadBlock` ("The PDF describes in-home overnight care, but the eligible dollars can come from any of the in-home-care benefit lines: doula, RN, or PSW. Sum them — if the total covers at least one full shift, show the download.") needs the last sentence updated:

Replace `if the total covers at least one full shift, show the download.` with `if the total covers at least one hour, show the download.`

**Step 5: Manually verify the partial-shift path in `webflow-test.html`**

We don't have an automated test for the inline IIFE, but we can sanity-check that the file at least parses. Quick way:

```bash
cd pages/benefits && node --check <(awk '/<script>$/,/<\/script>/' preview.html | sed -e 's|<script>||' -e 's|</script>||' | tail -n +2) 2>&1 | head
```

(Alternatively, just open `webflow-test.html` in a browser after the build step in Task 6 and verify entering, say, $200 of Certified Doula coverage shows the download button.)

Expected: no syntax errors.

**Step 6: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(ui): mirror partial-shift PDF + lower download gate to one hour"
```

---

## Task 6: Regenerate webflow artifacts

**Files:**
- Modify (generated): `pages/benefits/app.js`, `pages/benefits/webflow-body.html`, `pages/benefits/webflow-head.html`, `pages/benefits/webflow-test.html`

**Step 1: Run the build**

```bash
cd pages/benefits && node build-webflow.mjs
```

Expected output: four "build-webflow: wrote" lines with byte counts.

**Step 2: Quick sanity-check the generated artifacts**

```bash
grep -n "Certified Doula\|In-Home Nursing\|Partial overnight\|ALMA_RN_HOURLY_RATE" pages/benefits/webflow-body.html pages/benefits/app.js | head -20
```

Expected:
- `Certified Doula` and `In-Home Nursing` appear in both `webflow-body.html` and `app.js`.
- `Partial overnight` appears in `app.js`.
- `ALMA_RN_HOURLY_RATE` references in `app.js` look unchanged outside of the `renderDownloadBlock` gate.

**Step 3: Confirm `webflow-head.html` points at a sensible SHA**

```bash
grep cdn.jsdelivr pages/benefits/webflow-head.html
```

The SHA in the URL will be the SHA of the prior commit (Task 5's commit) at this point — that's fine; we'll bump it in Task 7 to point at this regen commit.

**Step 4: Commit the regenerated artifacts**

```bash
git add pages/benefits/app.js pages/benefits/webflow-body.html pages/benefits/webflow-head.html pages/benefits/webflow-test.html
git commit -m "build: regenerate webflow artifacts for label + PDF-floor change"
```

---

## Task 7: Bump head URL SHA to point at the regen commit

The `webflow-head.html` produced in Task 6 references the SHA of Task 5's commit, but the regenerated `app.js` is in Task 6's commit. We need a final commit that updates the SHA to point at Task 6.

**Files:**
- Modify: `pages/benefits/webflow-head.html`

**Step 1: Get the current HEAD SHA**

```bash
git rev-parse --short=7 HEAD
```

Note the value (e.g. `abc1234`).

**Step 2: Update the SHA in `webflow-head.html`**

Open `pages/benefits/webflow-head.html` and replace the SHA in the jsDelivr URL with the value from Step 1.

The URL pattern is:
```
https://cdn.jsdelivr.net/gh/tuckerschreiber/alma-benefits-tool@<SHA>/pages/benefits/app.js
```

**Step 3: Commit**

```bash
git add pages/benefits/webflow-head.html
git commit -m "build: bump head URL SHA to point at the regen commit"
```

---

## Done — Manual deploy

After all tasks land, the actual rollout to almacare.ca/benefits is a manual Webflow paste (per existing project workflow):

1. Push `feature/labels-pdf-floor` and merge to `main` (or merge directly per the project's deploy convention — see memory: "Deploy push-to-main after GitHub merge").
2. Copy the contents of `pages/benefits/webflow-head.html` into the Webflow Page Settings → Custom Code → Inside `<head>`.
3. Copy the contents of `pages/benefits/webflow-body.html` into the Embed element on the page.
4. Re-publish the page.

Verify on the live site:
- Calculator cards now say "Certified Doula" and "In-Home Nursing".
- Entering $200 of Certified Doula coverage triggers the PDF download button.
- The generated PDF shows a single "Partial overnight" row with 4 hours at $48.
