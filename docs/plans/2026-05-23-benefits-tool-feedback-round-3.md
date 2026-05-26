# BEAT Round-3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship round-3 feedback for the Benefits Eligibility Assessment Tool (BEAT) — adds an insurer-facing Coverage Estimate PDF, address capture, and fixes for the PDN duplicate bug and Chrome "can't click Assessment" bug.

**Architecture:** Pure-function engine (no DOM) + a new pure-function PDF builder (`src/pdf.js`) + minimal preview.html wiring. PDF generated client-side via `pdfmake` (programmatic doc definition, no HTML/canvas — sidesteps the prior html2pdf failure mode). Bundle delivered via existing jsDelivr flow.

**Tech Stack:** Vanilla ES modules, `node --test` for testing, `pdfmake` for PDF generation, Webflow Embed + jsDelivr CDN for delivery.

**Reference design:** `docs/plans/2026-05-23-benefits-tool-feedback-round-3-design.md` (on `main` branch).

**Working dir:** `.worktrees/beat-round-3/` on branch `feature/beat-round-3` (forked from `feature/benefits-tool` HEAD `9fab910`).

**Baseline confirmed:** 33/33 tests passing (`engine.test.js`).

---

## Phase A — Engine fix (PDN duplicate)

### Task A1: Add failing test for PDN-once-postpartum

**Files:**
- Modify: `pages/benefits/test/engine.test.js`

**Why:** Round-3 bug — postpartum users see two `Private Duty Nursing` cards because both the prenatal rule (`weeksUntilDueMax: 4`, priority `medium`) and the postpartum rule (`isPostpartum: true, weeksPostpartumMax: 2`, priority `high`) match. Root cause: `engine.js:182-197` `ruleMatches` uses `break` instead of `return false` when the user's stage doesn't match the rule's stage-implied condition.

**Step 1: Add the failing test at the bottom of `test/engine.test.js`**

```js
// ---------- Round-3 regression: PDN duplicate bug ----------

test('postpartum user does not match prenatal registered_nursing rule', () => {
  const state = {
    isPostpartum: true,
    weeksPostpartum: 1,
    firstTimeParent: false,
    coverage: { registered_nursing: { amount: 2000, reimbursementPercent: 100 } },
    hasHsa: false,
    hsaBalance: 0,
    concerns: ''
  };
  const normalized = normalizeInputs(state);
  const eligible = eligibilityFilter(state.coverage, ALMA_SERVICES);
  const matches = applyRules(normalized, eligible, RULES);
  const pdnMatches = matches.filter((m) => m.service === 'registered_nursing');
  assert.strictEqual(pdnMatches.length, 1, 'should only get one PDN recommendation');
  assert.strictEqual(pdnMatches[0].priority, 'high', 'should be the postpartum (high) rule');
});

test('prenatal user at week 36 matches the prenatal registered_nursing rule once', () => {
  const today = new Date('2026-05-23');
  // due in 2 weeks → weeksUntilDue = 2 (matches weeksUntilDueMax: 4)
  const dueDate = new Date('2026-06-06').toISOString();
  const inputs = {
    dueDate,
    isPostpartum: false,
    firstTimeParent: false,
    coverage: { registered_nursing: { amount: 2000, reimbursementPercent: 100 } },
    hasHsa: false,
    hsaBalance: 0,
    concerns: ''
  };
  const normalized = normalizeInputs(inputs, today);
  const eligible = eligibilityFilter(inputs.coverage, ALMA_SERVICES);
  const matches = applyRules(normalized, eligible, RULES);
  const pdnMatches = matches.filter((m) => m.service === 'registered_nursing');
  assert.strictEqual(pdnMatches.length, 1);
  assert.strictEqual(pdnMatches[0].priority, 'medium');
});
```

**Step 2: Run the new tests and confirm they fail**

Run: `cd pages/benefits && node --test test/engine.test.js 2>&1 | tail -20`
Expected: 33 of 35 pass; the first new test fails with `should only get one PDN recommendation` (pdnMatches.length === 2 not 1). Second new test should pass already (prenatal flow not broken).

**Step 3: Commit failing test**

```bash
git add pages/benefits/test/engine.test.js
git commit -m "test(engine): add failing tests for PDN duplicate bug (round-3)"
```

---

### Task A2: Fix `ruleMatches` stage-gating

**Files:**
- Modify: `pages/benefits/src/engine.js:181-208` (the four week-based cases inside `ruleMatches`)

**Step 1: Replace the four cases**

Find lines 181-197 in `src/engine.js`. Current:

```js
case 'weeksUntilDueMax':
  if (normalized.isPostpartum) break;
  if (!(normalized.weeksUntilDue <= value)) return false;
  break;
case 'weeksUntilDueMin':
  if (normalized.isPostpartum) break;
  if (!(normalized.weeksUntilDue >= value)) return false;
  break;
case 'weeksPostpartumMax':
  if (!normalized.isPostpartum) break;
  if (!(normalized.weeksPostpartum <= value)) return false;
  break;
case 'weeksPostpartumMin':
  if (!normalized.isPostpartum) break;
  if (!(normalized.weeksPostpartum >= value)) return false;
  break;
```

Replace `break` with `return false` in the stage-gating branches:

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

**Step 2: Run all tests, confirm 35/35 pass**

Run: `node --test test/engine.test.js 2>&1 | tail -10`
Expected: `# pass 35` `# fail 0`.

**Step 3: Commit fix**

```bash
git add pages/benefits/src/engine.js
git commit -m "fix(engine): require explicit stage match in week-based rule gating"
```

---

## Phase B — Hourly rate constant

### Task B1: Add `ALMA_RN_HOURLY_RATE` to `rules.js`

**Files:**
- Modify: `pages/benefits/src/rules.js:1-5` (top of file, just below the `ALMA_SERVICES` export)

**Why:** The PDF needs an hourly rate to compute hours from eligible $. Single config constant; null placeholder until Tucker provides the actual rate. Download button is hidden when this is null (Phase D enforces this).

**Step 1: Add the constant export**

After the `ALMA_SERVICES` export at the top of `src/rules.js`, insert:

```js
// Alma's published hourly rate for in-home postpartum nursing support.
// Used by src/pdf.js to compute "Estimated Hours" from the eligible $ amount.
// Leave null pre-launch — the Download Coverage Estimate button is hidden
// until this is a numeric value.
export const ALMA_RN_HOURLY_RATE = null;
```

**Step 2: Commit**

```bash
git add pages/benefits/src/rules.js
git commit -m "feat(rules): add ALMA_RN_HOURLY_RATE constant (null placeholder)"
```

---

## Phase C — PDF builder (`src/pdf.js`)

### Task C1: Add `pdfmake` to dependencies

**Files:**
- Modify: `pages/benefits/package.json`

**Step 1: Add the dependency**

Current `package.json`:
```json
{
  "type": "module"
}
```

Replace with:
```json
{
  "type": "module",
  "dependencies": {
    "pdfmake": "^0.2.10"
  }
}
```

**Step 2: Install**

Run: `cd pages/benefits && npm install`
Expected: `pdfmake` installed in `node_modules/`. A `package-lock.json` is generated.

**Step 3: Add `node_modules` to `.gitignore` (if not already)**

Run: `grep -q "^node_modules" .gitignore 2>/dev/null || echo "node_modules/" >> .gitignore`
(Project-level `.gitignore` should be checked first; if `pages/benefits/.gitignore` doesn't exist, create it.)

Run from `pages/benefits/`: `cat .gitignore 2>/dev/null || echo "(no .gitignore)"`. If none exists, create one:

```
node_modules/
```

**Step 4: Commit dependency add**

```bash
git add pages/benefits/package.json pages/benefits/package-lock.json pages/benefits/.gitignore
git commit -m "build(deps): add pdfmake for insurer estimate PDF generation"
```

---

### Task C2: Write failing tests for `buildEstimateDocDefinition`

**Files:**
- Create: `pages/benefits/test/pdf.test.js`

**Why:** TDD the PDF builder before implementing. Tests assert structure of the pdfmake doc-definition object — no PDF rendering needed, just object shape and math.

**Step 1: Create `test/pdf.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimateDocDefinition } from '../src/pdf.js';

const baseState = {
  lead: {
    firstName: 'Jane',
    lastName: 'Doe',
    streetAddress: '123 Main St',
    city: 'Toronto',
    postalCode: 'M5V 2T6'
  }
};

const baseResults = {
  nursing: { eligibleAmount: 2000 }
};

const TODAY = new Date('2026-05-23');

test('returns null when nursing eligibleAmount is 0', () => {
  const doc = buildEstimateDocDefinition(baseState, { nursing: { eligibleAmount: 0 } }, { hourlyRate: 90, today: TODAY });
  assert.strictEqual(doc, null);
});

test('returns null when nursing missing entirely', () => {
  const doc = buildEstimateDocDefinition(baseState, {}, { hourlyRate: 90, today: TODAY });
  assert.strictEqual(doc, null);
});

test('returns null when hourlyRate is null/0/undefined', () => {
  assert.strictEqual(
    buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: null, today: TODAY }),
    null
  );
  assert.strictEqual(
    buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 0, today: TODAY }),
    null
  );
});

test('$2000 nursing at $90/hr → 22 hours, $1,980 cost', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /22 hours/);
  assert.match(flat, /\$1,980/);
  assert.match(flat, /\$90\.00/);
});

test('$1500 nursing at $100/hr → 15 hours, $1,500 cost (clean division)', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 1500 } },
    { hourlyRate: 100, today: TODAY }
  );
  const flat = JSON.stringify(doc);
  assert.match(flat, /15 hours/);
  assert.match(flat, /\$1,500/);
});

test('"Prepared for" includes name, street, city, postal code', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /Jane Doe/);
  assert.match(flat, /123 Main St/);
  assert.match(flat, /Toronto/);
  assert.match(flat, /M5V 2T6/);
});

test('"Prepared for" gracefully omits street when missing', () => {
  const state = { lead: { ...baseState.lead, streetAddress: '' } };
  const doc = buildEstimateDocDefinition(state, baseResults, { hourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /Toronto/);
  assert.doesNotMatch(flat, /123 Main St/);
});

test('generated date uses long form (May 23, 2026)', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /May 23, 2026/);
});

test('includes purpose statement, disclaimer, and concierge footer', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /insurance coverage inquiry or pre-determination/i);
  assert.match(flat, /does not guarantee reimbursement/i);
  assert.match(flat, /Postnatal Care Concierge/i);
  assert.match(flat, /RN eligible pathway/);
  assert.match(flat, /Postpartum In-Home Nursing Support/i);
});
```

**Step 2: Run, confirm all 9 tests fail (module not found)**

Run: `node --test test/pdf.test.js 2>&1 | tail -10`
Expected: failure with `Cannot find module '../src/pdf.js'`.

**Step 3: Commit failing tests**

```bash
git add pages/benefits/test/pdf.test.js
git commit -m "test(pdf): add failing tests for buildEstimateDocDefinition"
```

---

### Task C3: Implement `buildEstimateDocDefinition` in `src/pdf.js`

**Files:**
- Create: `pages/benefits/src/pdf.js`

**Why:** Pure function. No DOM, no pdfmake import (returns a pdfmake-compatible doc definition object; the caller passes it to `pdfmake.createPdf()`). Lets us unit-test the doc shape without bundling pdfmake into the test runner.

**Step 1: Create `src/pdf.js`**

```js
// Alma Care BEAT — insurer coverage estimate PDF builder.
// Pure functions only. Returns a pdfmake-compatible doc definition object
// (or null when no estimate is warranted). Caller passes the object to
// `pdfmake.createPdf(doc)` to render.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

function formatLongDate(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatCurrency(n) {
  return '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildPreparedFor(lead) {
  const name = `${(lead.firstName || '').trim()} ${(lead.lastName || '').trim()}`.trim() || '—';
  const street = (lead.streetAddress || '').trim();
  const city = (lead.city || '').trim();
  const postal = (lead.postalCode || '').trim().toUpperCase();
  const cityLine = [city, postal].filter(Boolean).join(' · ');

  const lines = [{ text: `Prepared for: ${name}`, fontSize: 12, margin: [0, 4, 0, 0] }];
  if (street) lines.push({ text: street, fontSize: 10, color: '#555' });
  if (cityLine) lines.push({ text: cityLine, fontSize: 10, color: '#555' });
  return lines;
}

/**
 * Build a pdfmake doc-definition object for the insurer coverage estimate.
 * Returns null when no estimate should be generated.
 *
 * @param {{lead: object}} state
 * @param {{nursing?: {eligibleAmount: number}}} results
 * @param {{hourlyRate: number|null, today: Date}} opts
 */
export function buildEstimateDocDefinition(state, results, opts) {
  const eligibleAmount = results && results.nursing && results.nursing.eligibleAmount;
  const hourlyRate = opts && opts.hourlyRate;
  if (!eligibleAmount || eligibleAmount <= 0) return null;
  if (!hourlyRate || hourlyRate <= 0) return null;

  const today = (opts && opts.today) || new Date();
  const estimatedHours = Math.floor(eligibleAmount / hourlyRate);
  const estimatedCost = estimatedHours * hourlyRate;

  return {
    pageSize: 'LETTER',
    pageMargins: [72, 72, 72, 72],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#222' },
    content: [
      // Header
      { text: 'POSTPARTUM SUPPORT COVERAGE ESTIMATE', fontSize: 16, bold: true, color: '#032215' },
      { text: 'Alma Care', fontSize: 10, color: '#555', margin: [0, 2, 0, 8] },

      // Prepared for block
      ...buildPreparedFor(state.lead || {}),
      { text: `Generated: ${formatLongDate(today)}`, fontSize: 10, color: '#555', margin: [0, 2, 0, 16] },

      // Divider
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 0.5, lineColor: '#999' }] },

      // Purpose
      { text: 'Purpose', fontSize: 11, bold: true, margin: [0, 14, 0, 4] },
      {
        text: 'This estimate is intended to support insurance coverage inquiry or pre-determination requests. Coverage approval remains subject to insurer policies and eligibility requirements.',
        fontSize: 10, margin: [0, 0, 0, 14]
      },

      // Service estimate
      { text: 'Service Estimate', fontSize: 11, bold: true, margin: [0, 0, 0, 6] },
      {
        table: {
          widths: [120, '*'],
          body: [
            [{ text: 'Service Type', bold: true }, 'Postpartum In-Home Nursing Support'],
            [{ text: 'Pathway', bold: true }, 'RN eligible pathway'],
            [{ text: 'Hourly Rate', bold: true }, formatCurrency(hourlyRate)],
            [{ text: 'Estimated Hours', bold: true }, `${estimatedHours} hours`],
            [{ text: 'Estimated Cost', bold: true }, formatCurrency(estimatedCost)]
          ]
        },
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

      // Divider
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 0.5, lineColor: '#999' }] },

      // Disclaimer
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

**Step 2: Run tests, confirm 9/9 pass**

Run: `node --test test/pdf.test.js 2>&1 | tail -10`
Expected: `# pass 9` `# fail 0`.

**Step 3: Run the full suite, confirm no regression**

Run: `node --test test/engine.test.js test/pdf.test.js 2>&1 | tail -10`
Expected: `# pass 44` `# fail 0`.

**Step 4: Commit**

```bash
git add pages/benefits/src/pdf.js
git commit -m "feat(pdf): add buildEstimateDocDefinition for insurer coverage estimate"
```

---

## Phase D — Step 1 form changes

### Task D1: Add address fields HTML to Step 1

**Files:**
- Modify: `pages/benefits/preview.html` — Step 1 section (around line 1529 onward). Locate the existing "Your contact details" block (firstName/lastName/email/phone). Append the address block beneath it.

**Step 1: Find the contact-details block**

Run: `grep -n 'firstName\|lastName\|email\|phone\|contact details\|Your contact details' preview.html | head -20`

Identify the markup for the existing four-field block (firstName / lastName / email / phone). The address block goes directly below the phone field, *inside* the same fieldset.

**Step 2: Add address fields HTML**

Insert after the phone field's `<label>...</label>` element, still inside the contact-details fieldset:

```html
<div class="ap-field ap-field--full">
  <label for="ap-street-address">Street address (optional)</label>
  <input type="text" id="ap-street-address" name="streetAddress" maxlength="120" autocomplete="street-address" />
</div>
<div class="ap-field-row">
  <div class="ap-field">
    <label for="ap-city">City <span class="ap-required">*</span></label>
    <input type="text" id="ap-city" name="city" maxlength="60" required autocomplete="address-level2" />
  </div>
  <div class="ap-field">
    <label for="ap-postal-code">Postal code <span class="ap-required">*</span></label>
    <input type="text" id="ap-postal-code" name="postalCode" maxlength="7" required autocomplete="postal-code" inputmode="text" placeholder="A1A 1A1" />
    <div class="ap-field__error" data-error-for="postalCode" hidden>Enter a valid Canadian postal code (A1A 1A1).</div>
  </div>
</div>
```

(If existing first/last-name fields use a different `ap-field-row` two-column layout class, match that pattern exactly. Grep for `ap-field-row` to see the existing structure.)

**Step 3: Commit markup**

```bash
git add pages/benefits/preview.html
git commit -m "feat(step1): add address fields markup (street, city, postal code)"
```

---

### Task D2: Wire address fields into state, validation, Continue gate

**Files:**
- Modify: `pages/benefits/preview.html` — IIFE script section (around lines 2378-2603)

**Step 1: Extend the `fresh` lead shape in `loadState()` (~line 2385)**

Find:
```js
const fresh = { firstName: '', lastName: '', email: '', phone: '' };
```
Replace with:
```js
const fresh = { firstName: '', lastName: '', email: '', phone: '', streetAddress: '', city: '', postalCode: '' };
```

And inside the `Object.assign(fresh, { ... })` immediately below, add the three new fields:
```js
state.lead = Object.assign(fresh, {
  firstName: state.lead.firstName || '',
  lastName: state.lead.lastName || '',
  email: state.lead.email || '',
  phone: state.lead.phone || '',
  streetAddress: state.lead.streetAddress || '',
  city: state.lead.city || '',
  postalCode: state.lead.postalCode || ''
});
```

**Step 2: Add a postal code regex constant near the existing `EMAIL_RE`/`PHONE_RE`**

```js
const POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;
```

**Step 3: Add input grabs + event listeners for the three new fields**

Locate where existing contact-detail inputs (`firstNameInput`, `lastNameInput`, etc.) are queried and listeners attached. Add parallels for `streetAddressInput`, `cityInput`, `postalCodeInput`.

Event handlers:
- `streetAddressInput` on `input` → `state.lead.streetAddress = e.target.value; saveState(); updateContinueButton();`
- `cityInput` on `input` → same pattern with `city`
- `postalCodeInput` on `input` → same pattern with `postalCode`
- `postalCodeInput` on `blur` → normalize: uppercase, strip dashes, insert single space:
  ```js
  postalCodeInput.addEventListener('blur', () => {
    const v = (state.lead.postalCode || '').toUpperCase().replace(/[\s-]+/g, '');
    if (v.length === 6) {
      state.lead.postalCode = v.slice(0, 3) + ' ' + v.slice(3);
      postalCodeInput.value = state.lead.postalCode;
    }
    saveState();
    updateContinueButton();
    // Show/hide error
    const errorEl = document.querySelector('[data-error-for="postalCode"]');
    if (errorEl) errorEl.hidden = !state.lead.postalCode || POSTAL_RE.test(state.lead.postalCode);
  });
  ```

**Step 4: Extend the Step 1 Continue gate (around line 2576)**

Find:
```js
canContinue =
  state.isPostpartum != null
  && state.dueDate
  && state.firstTimeParent != null
  && !!state.lead.firstName.trim()
  && !!state.lead.lastName.trim()
  && EMAIL_RE.test(state.lead.email)
  && PHONE_RE.test(state.lead.phone);
```

Append two clauses:
```js
canContinue =
  state.isPostpartum != null
  && state.dueDate
  && state.firstTimeParent != null
  && !!state.lead.firstName.trim()
  && !!state.lead.lastName.trim()
  && EMAIL_RE.test(state.lead.email)
  && PHONE_RE.test(state.lead.phone)
  && !!state.lead.city.trim()
  && POSTAL_RE.test(state.lead.postalCode);
```

**Step 5: Extend `hydrateUI()` (~line 2600) to populate the three new fields from state**

Add:
```js
streetAddressInput.value = state.lead.streetAddress || '';
cityInput.value = state.lead.city || '';
postalCodeInput.value = state.lead.postalCode || '';
```

**Step 6: Manual test (just the static HTML/JS, no build)**

Open `preview.html` directly in a browser. Fill Step 1 entirely except postal code → Continue stays disabled. Enter "M5V 2T6" → Continue enables. Enter "garbage" → Continue stays disabled, error shows on blur.

**Step 7: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(step1): wire address fields into state, validation, Continue gate"
```

---

### Task D3: Copy fix — "original due date" → "your due date"

**Files:**
- Modify: `pages/benefits/preview.html:2418`

**Step 1: Find and replace**

Find:
```js
? "What was baby's original due date?"
```
Replace with:
```js
? "What was your due date?"
```

**Step 2: Visual confirm**

Open preview.html in browser, select "Postpartum" radio, date-input label should now read "What was your due date?".

**Step 3: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "fix(step1): drop \"original\" from postpartum due-date label"
```

---

### Task D4: State schema version + harden state restore

**Files:**
- Modify: `pages/benefits/preview.html:2267` (storage key area) and `:2378-2400` (`loadState()`)

**Why:** The "can't click Assessment in regular Chrome" bug is consistent with stale `sessionStorage` from the round-1 schema. Tabs restored across browser restarts retain `sessionStorage`, so users with an old session of the tool open get state with the old shape. The fix is defensive: version the schema and discard mismatched state.

**Step 1: Add `STATE_SCHEMA_VERSION` constant**

Near `STORAGE_KEY` declaration (~line 2267):

```js
const STORAGE_KEY = 'ap_benefits_state';
const STATE_SCHEMA_VERSION = 3;
```

**Step 2: Update `loadState` to check version and discard on mismatch**

Replace the existing `loadState` body:

```js
function loadState() {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed._schemaVersion === STATE_SCHEMA_VERSION) {
        Object.assign(state, parsed);
      } else {
        // Old or unversioned state — discard and start fresh.
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch (e) {
    // Bad JSON / sessionStorage unavailable — silent fail, start fresh.
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }
  // ... existing fresh-lead reconciliation stays as-is ...
}
```

**Step 3: Stamp the version on every `saveState`**

```js
function saveState() {
  try {
    state._schemaVersion = STATE_SCHEMA_VERSION;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* silent */ }
}
```

**Step 4: Manual smoke test**

1. Open preview.html, fill Step 1 partially, close tab.
2. Reopen — state restores (same session).
3. Edit `STATE_SCHEMA_VERSION` to 4 temporarily, reload — state should be discarded, form blank.
4. Revert constant to 3 before committing.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "fix(state): version schema + discard stale sessionStorage (chrome bug)"
```

---

## Phase E — Results page changes

### Task E1: Replace "Send me my care plan" with conditional Download block

**Files:**
- Modify: `pages/benefits/preview.html` — `renderFinalCta` function (~line 3050)

**Step 1: Refactor `renderFinalCta` to render Download block when nursing is eligible**

Replace the existing `renderFinalCta()` with:

```js
function renderFinalCta() {
  const eligibleNursing = (window.__ap_results && window.__ap_results.nursing && window.__ap_results.nursing.eligibleAmount) || 0;
  const rateConfigured = typeof ALMA_RN_HOURLY_RATE === 'number' && ALMA_RN_HOURLY_RATE > 0;
  const showDownload = eligibleNursing > 0 && rateConfigured;

  return (
    '<section class="ap-final-cta">'
    + (showDownload
        ? '<div class="ap-download-block" id="ap-download-block">'
          +   '<div class="ap-download-block__eyebrow">INSURANCE COVERAGE ESTIMATE</div>'
          +   '<p class="ap-download-block__copy">Download a one-page coverage estimate you can share with your insurer for pre-determination or coverage verification.</p>'
          +   '<button type="button" class="ap-btn ap-btn--primary" id="ap-download-estimate">⬇ Download Coverage Estimate</button>'
          +   '<div class="ap-download-block__meta">PDF · One page · Insurer-ready</div>'
          + '</div>'
        : ''
      )
    + '<div class="ap-cta-row">'
    +   '<a class="ap-btn ap-btn--' + (showDownload ? 'secondary' : 'primary') + '" id="ap-consult-cta" href="' + CONSULT_URL + '" target="_blank" rel="noopener">Book a complimentary consultation</a>'
    + '</div>'
    + '</section>'
  );
}
```

Note: removed the `ap-print-plan` button entirely and its print-tip line.

**Step 2: Persist `results` for the renderer**

In the results-page render path, after `results = computeResults(...)`, add: `window.__ap_results = results;` (a small global to let `renderFinalCta` read without restructuring). Locate the existing call by grepping for `computeResults` then `renderFinalCta`.

Run: `grep -n 'computeResults\|renderFinalCta\|window.__ap_results' preview.html`

If a cleaner ambient reference exists (e.g., `state.results` or a closure variable), use that instead — the global is a fallback only.

**Step 3: Add CSS for the download block (in the `<style>` section)**

Find the `/* ---------- Gift cards callout (Step 2 + results) ---------- */` comment block and add a parallel section nearby:

```css
/* ---------- Insurance Coverage Estimate download block (results) ---------- */
.ap-download-block {
  border: 2px solid #032215;
  background: #f7f5ef;
  border-radius: 8px;
  padding: 24px 28px;
  margin: 24px 0;
  text-align: center;
}
.ap-download-block__eyebrow {
  font-size: 12px;
  letter-spacing: 0.08em;
  color: #032215;
  font-weight: 600;
  margin-bottom: 10px;
}
.ap-download-block__copy {
  font-size: 15px;
  color: #333;
  max-width: 520px;
  margin: 0 auto 18px;
}
.ap-download-block__meta {
  font-size: 12px;
  color: #777;
  margin-top: 12px;
}
.ap-download-block--done {
  background: #eef5ee;
  border-color: #2e6b2e;
}
.ap-download-block__check {
  font-size: 24px;
  color: #2e6b2e;
  margin-bottom: 8px;
}
.ap-download-block__redo {
  display: inline-block;
  margin-top: 12px;
  font-size: 13px;
  color: #555;
  text-decoration: underline;
  background: none;
  border: none;
  cursor: pointer;
}
```

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(results): replace care-plan print button with conditional download block"
```

---

### Task E2: Wire Download Coverage Estimate button → pdfmake + inline state swap

**Files:**
- Modify: `pages/benefits/preview.html` — IIFE area
- Modify: `pages/benefits/build-webflow.mjs` — confirm it bundles pdfmake

**Why:** The button needs to: (1) call `pdfmake.createPdf(...).download(filename)`, (2) swap the block's HTML to the post-download confirmation state, (3) fire a `submitDownloadToHubspot` enrichment.

**Step 1: Import pdfmake + fonts at top of the IIFE**

Locate where other modules are referenced (after `// === END ENGINE ===`). pdfmake in the browser needs a global `pdfMake` with both the main lib and the fonts vfs. The simplest path is to load both via `<script src>` in the head, and reference `window.pdfMake` from the IIFE.

Add to the `<head>` block (or the existing custom CSS/JS section):

```html
<script src="https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js"></script>
```

(Loading from jsDelivr is faster than bundling the ~280KB lib into `app.js` and keeps the bundle small. Pins to `0.2.10` exact version to avoid silent breakage.)

**Step 2: Import `buildEstimateDocDefinition` + `ALMA_RN_HOURLY_RATE` into the IIFE bundle**

Check `build-webflow.mjs` to confirm both `src/pdf.js` and the new constant from `src/rules.js` are bundled into `app.js`. If `build-webflow.mjs` concatenates specific files, add `pdf.js`.

Run: `grep -n 'src/engine\|src/rules\|src/pdf' build-webflow.mjs`

If `pdf.js` isn't listed, add it to the concat list and re-export `buildEstimateDocDefinition` from the IIFE's exposed surface (or include it inline in the bundled portion).

**Step 3: Add Hubspot download enrichment**

Right above `submitStep1ToHubspot`:

```js
function submitDownloadToHubspot(state) {
  const fields = {
    email: hsValue(state.lead.email),
    ap_estimate_downloaded: 'true',
    ap_estimate_downloaded_at: new Date().toISOString()
  };
  return submitHubspotPayload(fields, 'estimate_downloaded');
}
```

**Step 4: Bind the download button + swap UI on click**

After `renderFinalCta()` is inserted into the DOM (search for where the results-page HTML is appended), add a wire-up:

```js
const downloadBtn = document.getElementById('ap-download-estimate');
if (downloadBtn) {
  downloadBtn.addEventListener('click', handleDownloadEstimate);
}

function handleDownloadEstimate() {
  const doc = buildEstimateDocDefinition(state, window.__ap_results, {
    hourlyRate: ALMA_RN_HOURLY_RATE,
    today: new Date()
  });
  if (!doc) {
    console.warn('No doc definition returned — skipping PDF generation');
    return;
  }
  const lastName = (state.lead.lastName || 'family').toLowerCase().replace(/[^a-z0-9]/g, '');
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `alma-coverage-estimate-${lastName}-${dateStr}.pdf`;
  try {
    window.pdfMake.createPdf(doc).download(filename);
  } catch (e) {
    console.error('PDF generation failed', e);
    swapToErrorState();
    return;
  }
  submitDownloadToHubspot(state);
  swapToDoneState();
}

function swapToDoneState() {
  const block = document.getElementById('ap-download-block');
  if (!block) return;
  block.classList.add('ap-download-block--done');
  block.innerHTML = (
    '<div class="ap-download-block__check">✓</div>'
    + '<div class="ap-download-block__eyebrow">Coverage estimate downloaded</div>'
    + '<p class="ap-download-block__copy">We\'ll help customize your recovery plan and navigate potential coverage opportunities.</p>'
    + '<a class="ap-btn ap-btn--primary" href="' + CONSULT_URL + '" target="_blank" rel="noopener">Speak with a Postnatal Care Concierge →</a>'
    + '<button type="button" class="ap-download-block__redo" id="ap-download-redo">Re-download estimate</button>'
  );
  const redoBtn = document.getElementById('ap-download-redo');
  if (redoBtn) redoBtn.addEventListener('click', handleDownloadEstimate);
}

function swapToErrorState() {
  const block = document.getElementById('ap-download-block');
  if (!block) return;
  block.innerHTML = (
    '<p class="ap-download-block__copy">Couldn\'t generate the estimate. Speak with a Postnatal Care Concierge and we\'ll send you one directly.</p>'
    + '<a class="ap-btn ap-btn--primary" href="' + CONSULT_URL + '" target="_blank" rel="noopener">Speak with a Postnatal Care Concierge →</a>'
  );
}
```

**Step 5: Manual browser test**

1. Run `node pages/benefits/build-webflow.mjs` to generate webflow-test.html.
2. Open webflow-test.html, complete the form with `registered_nursing` covered, eligible $2000.
3. Temporarily set `ALMA_RN_HOURLY_RATE = 90` in rules.js, rebuild.
4. Click "Download Coverage Estimate" — file should download with name `alma-coverage-estimate-doe-2026-05-23.pdf`.
5. Confirm block swaps to done state with concierge CTA.
6. Click "Re-download estimate" — second download works.
7. Revert `ALMA_RN_HOURLY_RATE` to `null` before committing.

**Step 6: Commit**

```bash
git add pages/benefits/preview.html pages/benefits/build-webflow.mjs
git commit -m "feat(results): wire pdfmake download + inline post-download state swap"
```

---

### Task E3: Extend Hubspot Step 1 payload with address fields

**Files:**
- Modify: `pages/benefits/preview.html` — `submitStep1ToHubspot` (~line 3147)

**Step 1: Add three fields to the payload**

Inside `submitStep1ToHubspot`, locate the `fields` object construction and append:

```js
ap_street_address: hsValue(state.lead.streetAddress),
ap_city: hsValue(state.lead.city),
ap_postal_code: hsValue(state.lead.postalCode)
```

**Step 2: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(hubspot): include address fields in Step 1 submission"
```

---

## Phase F — Build + smoke test

### Task F1: Rebuild webflow artifacts

**Files:**
- Generated: `pages/benefits/app.js`, `pages/benefits/webflow-head.html`, `pages/benefits/webflow-body.html`, `pages/benefits/webflow-test.html`

**Step 1: Run the build**

Run: `cd pages/benefits && node build-webflow.mjs`
Expected: regenerates the four artifacts. Verify sizes:
- `app.js` should be only slightly larger than today (~75-80KB) since pdfmake is loaded from jsDelivr, not bundled.
- `webflow-body.html` and `webflow-head.html` still under 50KB each (the Webflow Embed cap).

Run: `wc -c webflow-head.html webflow-body.html app.js`

**Step 2: Commit rebuilt artifacts**

```bash
git add pages/benefits/app.js pages/benefits/webflow-head.html pages/benefits/webflow-body.html
git commit -m "build: rebuild webflow artifacts for round-3"
```

---

### Task F2: Manual browser smoke test

**Files:**
- Use: `pages/benefits/webflow-test.html` (gitignored, regenerated by build script)

**Step 1: Open `webflow-test.html` in Chrome (regular, not incognito)**

Walk through both flows:

**Flow A — nursing covered:**
1. Step 1: Postpartum, due date last week, not first-time parent, no concerns.
2. Fill contact details including new address fields. Confirm postal code validates.
3. Step 2: Pick an insurer; toggle `registered_nursing` coverage; enter $2000 / 100%.
4. Step 3: Continue through to results.
5. Confirm results page shows the new Download Coverage Estimate block.
6. **Pre-rate check:** with `ALMA_RN_HOURLY_RATE = null`, the block should NOT appear.
7. Temporarily set `ALMA_RN_HOURLY_RATE = 90` in `src/rules.js`, rebuild, reload.
8. Click Download — `.pdf` saves with sensible filename.
9. Block swaps to confirmation + concierge CTA.
10. **Confirm PDN appears only once** with priority "high".

**Flow B — nursing NOT covered:**
1. Same Step 1 flow.
2. Step 2: Pick insurer, leave `registered_nursing` un-toggled.
3. Step 3: Continue.
4. Confirm results page does NOT show Download block; flows directly to booking CTA. No layout gap.

**Step 2: Pre-revert: set `ALMA_RN_HOURLY_RATE` back to `null` and rebuild**

```bash
# Edit src/rules.js → ALMA_RN_HOURLY_RATE = null
node pages/benefits/build-webflow.mjs
```

**Step 3: Commit any artifact-only rebuild**

If `app.js` shows in `git diff`, commit:
```bash
git add pages/benefits/app.js pages/benefits/webflow-head.html pages/benefits/webflow-body.html
git commit -m "build: rebuild after smoke test"
```

If nothing changed, skip.

---

### Task F3: Push branch + open PR

**Step 1: Push**

```bash
git push -u origin feature/beat-round-3
```

**Step 2: Open PR via gh**

```bash
gh pr create --base feature/benefits-tool --title "Round 3 — Insurance Coverage Estimate PDF + bug fixes" --body "$(cat <<'EOF'
## Summary
- Adds insurer-facing Coverage Estimate PDF (pdfmake, RN-only line item, conditional render).
- Step 1 captures city + postal code (required) and street (optional).
- Fixes PDN duplicate bug — `ruleMatches` `break` → `return false` for stage-implied conditions.
- Fixes Chrome "can't click Assessment" bug via schema-versioned sessionStorage with discard-on-mismatch.
- Drops "original" from postpartum due-date label.

## Test plan
- [x] 35/35 engine tests passing (33 existing + 2 PDN regression).
- [x] 9/9 pdf builder tests passing.
- [ ] Smoke tested in regular Chrome via `webflow-test.html` (both nursing-covered + nursing-not-covered flows).
- [ ] Pre-launch: fill `ALMA_RN_HOURLY_RATE` in `rules.js`.
- [ ] Pre-launch: add Hubspot properties (`ap_street_address`, `ap_city`, `ap_postal_code`, `ap_estimate_downloaded`, `ap_estimate_downloaded_at`).
- [ ] Pre-launch: add Hubspot workflow branch on `ap_estimate_downloaded = true`.

Design doc: `docs/plans/2026-05-23-benefits-tool-feedback-round-3-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

**Step 3: After merge, jsDelivr purge + Webflow re-paste**

(Out of scope for this plan — handled by Tucker post-merge.)

---

## Done criteria

- [ ] 44+ tests passing (35 engine + 9 pdf).
- [ ] PDN renders exactly once for postpartum users.
- [ ] PDF downloads with correct filename when nursing covered + rate configured.
- [ ] PDF download triggers Hubspot enrichment.
- [ ] Download block hidden when nursing not covered OR rate null.
- [ ] Step 1 Continue gates on city + valid postal code.
- [ ] Postpartum date label reads "What was your due date?".
- [ ] sessionStorage schema version stamped + discarded on mismatch.
- [ ] Manual smoke test in regular Chrome passes both flows.
- [ ] PR opened against `feature/benefits-tool` with clear test plan.

## Pre-launch TODOs (not in this plan)

- Set `ALMA_RN_HOURLY_RATE` in `src/rules.js` to actual Alma rate.
- In Hubspot: add properties `ap_street_address`, `ap_city`, `ap_postal_code`, `ap_estimate_downloaded`, `ap_estimate_downloaded_at`.
- In Hubspot: workflow branch on `ap_estimate_downloaded = true` for tailored concierge follow-up.
- Rebuild + push + jsDelivr purge + Webflow re-paste (head changes: new `<script src>` for pdfmake CDN; body changes: address fields, download block).
