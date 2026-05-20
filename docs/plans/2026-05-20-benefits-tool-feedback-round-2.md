# Benefits Tool — Feedback Round 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply round-2 feedback to the benefits eligibility tool: restructure Step 1 (radio + date + contact fields), simplify coverage math, restructure results page, and move Hubspot lead capture to Step 1.

**Architecture:** Single source of truth is `pages/benefits/preview.html`. Engine is `pages/benefits/src/engine.js` (pure functions, tested via `node --test`). Build splits preview.html into `webflow-head.html` + `webflow-body.html` + `app.js`; `app.js` hosted on jsDelivr from `@main`.

**Tech Stack:** Vanilla HTML/CSS/JS, no framework. Node test runner. Hubspot Forms Submission API. Webflow Embed.

**Working dir:** `/Users/tucker.schreiber/Documents/alma/.worktrees/benefits-tool` (branch `feature/benefits-tool`).

**Reference:** Design doc at `docs/plans/2026-05-20-benefits-tool-feedback-round-2-design.md`.

---

## Task 1: Engine — add `computeEligibleAmounts` (TDD)

**Files:**
- Test: `pages/benefits/test/engine.test.js`
- Modify: `pages/benefits/src/engine.js`

**Step 1: Write the failing test**

Append to `test/engine.test.js`:

```javascript
test('computeEligibleAmounts: amount × reimbursementPercent per service', () => {
  const coverage = {
    massage_therapy: { amount: 500 },
    acupuncture: { amount: 500, reimbursementPercent: 80 },
    postpartum_doula_care: { amount: 1000 }
  };
  const result = computeEligibleAmounts(coverage);
  assert.deepStrictEqual(result, {
    massage_therapy: 500,
    acupuncture: 400,
    postpartum_doula_care: 1000
  });
});

test('computeEligibleAmounts: missing reimbursementPercent defaults to 100', () => {
  const result = computeEligibleAmounts({ massage_therapy: { amount: 300 } });
  assert.strictEqual(result.massage_therapy, 300);
});

test('computeEligibleAmounts: empty / null coverage returns {}', () => {
  assert.deepStrictEqual(computeEligibleAmounts({}), {});
  assert.deepStrictEqual(computeEligibleAmounts(null), {});
});
```

Add to imports at top of test file: `computeEligibleAmounts` from `../src/engine.js`.

**Step 2: Run test to verify it fails**

```bash
cd /Users/tucker.schreiber/Documents/alma/.worktrees/benefits-tool
node --test pages/benefits/test/engine.test.js
```
Expected: 3 new tests FAIL with "computeEligibleAmounts is not a function".

**Step 3: Add the function to engine.js**

Add to `pages/benefits/src/engine.js` (above `allocateFunding`):

```javascript
/**
 * Compute the eligible $ amount per service from the user's coverage inputs.
 * eligible = amount × (reimbursementPercent ?? 100) / 100
 */
export function computeEligibleAmounts(coverage) {
  const out = {};
  if (!coverage) return out;
  for (const [serviceId, c] of Object.entries(coverage)) {
    if (!c || typeof c.amount !== 'number') continue;
    const pct = typeof c.reimbursementPercent === 'number' ? c.reimbursementPercent : 100;
    out[serviceId] = c.amount * (pct / 100);
  }
  return out;
}
```

**Step 4: Run tests, confirm pass**

```bash
node --test pages/benefits/test/engine.test.js
```
Expected: all tests pass (including new 3).

**Step 5: Commit**

```bash
git add pages/benefits/src/engine.js pages/benefits/test/engine.test.js
git commit -m "feat(engine): add computeEligibleAmounts for simplified coverage display"
```

---

## Task 2: Engine — delete allocateFunding, buildFundingStrategy, recommendationCost

**Files:**
- Modify: `pages/benefits/src/engine.js`
- Modify: `pages/benefits/test/engine.test.js`

**Step 1: Delete obsolete tests**

In `pages/benefits/test/engine.test.js`, delete every test whose name starts with `allocateFunding:`. That covers tests at the lines previously reported around L242, L261, L279, L303, L322, L327. Also delete the `computeResults: zero coverage + zero HSA produces empathetic copy` test (it asserts on `fundingStrategy`, which we're removing).

**Step 2: Update `computeResults: end-to-end with realistic input` test**

Find the test at `test/engine.test.js` near L343. Replace its assertions on the result shape:

- Remove any `recommendations[i].totalCost`, `.covered`, `.fromHsa`, `.outOfPocket` assertions.
- Remove `result.fundingStrategy` assertion.
- Remove `result.totalCovered` and `result.totalRecommendedCost` assertions.
- Add: `assert.ok(typeof result.eligibleAmounts === 'object', 'has eligibleAmounts map')`.
- Keep `result.recommendations` (still exists, just without funding fields) and `result.detectedConcerns`.

**Step 3: Modify `computeResults` in engine.js**

In `pages/benefits/src/engine.js`:

1. Delete `function recommendationCost(rec)` (L246–L260).
2. Delete `export function allocateFunding(...)` (L266–L290).
3. Delete `function buildFundingStrategy(...)` (L374–L407).
4. Delete `function formatMoney(n)` (L370–L372) — no longer used in engine.
5. In `computeResults`, replace the body from `const recommendations = allocateFunding(...)` onward:

```javascript
  // No more per-rec funding allocation — keep the matched recs as-is.
  const recommendations = matched;

  const coverageMap = normalized.coverage || {};
  for (const rec of recommendations) {
    rec.isCovered = !!coverageMap[rec.service];
    const dosingWindow = rec.dosing && rec.dosing.window;
    rec.windowRank = isInWindow(normalized.weeksPostpartum, dosingWindow) ? 0 : 1;
  }

  recommendations.sort((a, b) => {
    if (a.isCovered !== b.isCovered) return a.isCovered ? -1 : 1;
    const pa = PRIORITY_RANK[a.priority] ?? 99;
    const pb = PRIORITY_RANK[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.windowRank ?? 99) - (b.windowRank ?? 99);
  });

  const eligibleAmounts = computeEligibleAmounts(normalized.coverage);

  return {
    normalized,
    eligibleServiceIds,
    recommendations,
    eligibleAmounts,
    detectedConcerns
  };
```

**Step 4: Run tests**

```bash
node --test pages/benefits/test/engine.test.js
```
Expected: all tests pass.

**Step 5: Commit**

```bash
git add pages/benefits/src/engine.js pages/benefits/test/engine.test.js
git commit -m "refactor(engine): remove dosing-based funding allocation in favor of eligibleAmounts"
```

---

## Task 3: Mirror engine changes inside preview.html's inlined engine

**Context:** The `// === END ENGINE ===` block in `preview.html` (starts ~L1770, ends L2235) is a hand-copied version of `src/engine.js` that runs in the browser. It must stay in sync.

**Files:** Modify `pages/benefits/preview.html`

**Step 1: Inside `preview.html`, find the inlined engine block.** Grep for `// === END ENGINE ===` to locate the end.

**Step 2: Apply the same changes from Task 2 to the inlined engine:**

- Delete the inlined `recommendationCost`, `allocateFunding`, `buildFundingStrategy`, `formatMoney` functions.
- Replace `computeResults`'s body to compute `eligibleAmounts` and return the new shape (mirror Task 2's Step 3 exactly).

**Step 3: Add the inlined `computeEligibleAmounts` function** (mirror Task 1's Step 3 code).

**Step 4: Run a quick syntax check by booting the preview**

```bash
cd /Users/tucker.schreiber/Documents/alma/.worktrees/benefits-tool/pages/benefits
python3 -m http.server 8765 &
sleep 1
curl -s http://localhost:8765/preview.html | head -5
kill %1 2>/dev/null
```
Expected: valid HTML, no missing-script noise. (You can also open `preview.html` in a browser to manually confirm the page renders without console errors.)

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "refactor(preview): mirror engine simplification in inlined runtime"
```

---

## Task 4: Step 1 — pregnant/postpartum radio + adaptive date label

**Files:**
- Modify: `pages/benefits/preview.html` (markup ~L1456–L1469, JS state binding around the existing `postpartumToggle` listener)

**Step 1: Replace the date-field + postpartum-toggle markup**

Locate `<div id="ap-due-date-field" class="ap-field">` (~L1456) through `<div id="ap-weeks-postpartum-field" ...>` block (~L1469). Replace both blocks with:

```html
<div class="ap-field">
  <label class="ap-label">Are you currently pregnant or postpartum?</label>
  <div class="ap-toggle-group" role="group" aria-label="Stage">
    <button type="button" class="ap-toggle" data-toggle="stage" data-value="pregnant" aria-pressed="false">Currently pregnant</button>
    <button type="button" class="ap-toggle" data-toggle="stage" data-value="postpartum" aria-pressed="false">Postpartum (baby already born)</button>
  </div>
</div>

<div id="ap-due-date-field" class="ap-field ap-hidden">
  <label class="ap-label" for="ap-due-date" id="ap-due-date-label">When are you due?</label>
  <input type="date" id="ap-due-date" name="dueDate" class="ap-input">
</div>
```

**Step 2: Wire the stage toggle in JS**

Find the existing `postpartumToggle.addEventListener('click', ...)` block (~L2662). Replace it with a stage-toggle handler:

```javascript
document.querySelectorAll('[data-toggle="stage"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const value = btn.dataset.value;
    state.isPostpartum = (value === 'postpartum');
    document.querySelectorAll('[data-toggle="stage"]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.value === value));
    });
    document.getElementById('ap-due-date-field').classList.remove('ap-hidden');
    document.getElementById('ap-due-date-label').textContent =
      state.isPostpartum ? "What was baby's original due date?" : 'When are you due?';
    // Recompute date constraints
    const dateInput = document.getElementById('ap-due-date');
    if (state.isPostpartum) { dateInput.removeAttribute('max'); dateInput.removeAttribute('min'); }
    else {
      const today = new Date();
      const oneYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
      dateInput.setAttribute('min', today.toISOString().slice(0, 10));
      dateInput.setAttribute('max', oneYear.toISOString().slice(0, 10));
    }
    persist();
    updateContinueButton();
  });
});
```

**Step 3: Remove obsolete state references**

In `preview.html`:
- Remove `state.weeksPostpartum` references (line containing `weeksPostpartum: null,` in state init around L2269).
- Remove the `ap-weeks-postpartum` element refs and `ap-weeks-postpartum-field` show/hide logic.
- Remove the existing `postpartumToggle` reference, listener, and label-swap code (around L2304, L2378-L2394, L2662-L2670).

The engine's `normalizeInputs` already handles deriving `weeksPostpartum` from a past `dueDate`, so `state.isPostpartum` + `state.dueDate` is sufficient.

**Step 4: Smoke test in browser**

Open `preview.html` directly in a browser (or via `python3 -m http.server`). Verify: clicking each stage toggle shows the date input with the right label; postpartum allows past dates, pregnant disallows them; refresh restores state.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(step1): replace postpartum toggle with explicit stage radio + adaptive date label"
```

---

## Task 5: Step 1 — add contact details fields

**Files:** Modify `pages/benefits/preview.html`

**Step 1: Append contact-details block to Step 1**

Insert just before the closing `</section>` of `#ap-step-1` (~L1483):

```html
<div class="ap-step__header" style="margin-top: 32px;">
  <h3 style="font-size:18px; margin:0 0 6px;">Your contact details</h3>
  <p class="ap-step__subhead" style="margin:0;">We'll email your personalized care plan and a friendly follow-up from our team.</p>
</div>

<div class="ap-field">
  <label class="ap-label" for="ap-first-name">First name</label>
  <input type="text" id="ap-first-name" name="firstName" autocomplete="given-name" class="ap-input" required>
</div>
<div class="ap-field">
  <label class="ap-label" for="ap-last-name">Last name</label>
  <input type="text" id="ap-last-name" name="lastName" autocomplete="family-name" class="ap-input" required>
</div>
<div class="ap-field">
  <label class="ap-label" for="ap-email">Email</label>
  <input type="email" id="ap-email" name="email" autocomplete="email" inputmode="email" class="ap-input" required>
</div>
<div class="ap-field">
  <label class="ap-label" for="ap-phone">Phone</label>
  <input type="tel" id="ap-phone" name="phone" autocomplete="tel" inputmode="tel" class="ap-input" required placeholder="(416) 555-1234">
</div>
```

**Step 2: Extend state.lead shape**

In `preview.html` (state init around L2277), change:

```javascript
lead: { name: '', email: '', address: '', leadConcerns: '' }
```

to:

```javascript
lead: { firstName: '', lastName: '', email: '', phone: '' }
```

**Step 3: Wire input listeners**

Add near the other Step 1 event wiring:

```javascript
const LEAD_FIELDS = [
  { id: 'ap-first-name', key: 'firstName' },
  { id: 'ap-last-name', key: 'lastName' },
  { id: 'ap-email', key: 'email' },
  { id: 'ap-phone', key: 'phone' }
];
LEAD_FIELDS.forEach((f) => {
  const el = document.getElementById(f.id);
  if (!el) return;
  el.addEventListener('input', (e) => {
    state.lead[f.key] = e.target.value;
    persist();
    updateContinueButton();
  });
});
```

Also: on `restoreState()` (or wherever state is rehydrated from localStorage), populate these inputs with `state.lead.*` values.

**Step 4: Smoke test**

Reload page. Type into each field, refresh, verify values persist.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(step1): add first name, last name, email, phone fields"
```

---

## Task 6: Step 1 — gate Continue on full validation

**Files:** Modify `pages/benefits/preview.html`

**Step 1: Update `updateContinueButton()` logic**

Find the existing canContinue logic for step 1 (search for `canContinue` near L2550). Replace the step-1 branch with:

```javascript
if (currentStep === 1) {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^[\d\s()+-]{7,}$/;
  canContinue =
    state.isPostpartum !== null &&
    !!state.dueDate &&
    state.firstTimeParent !== null &&
    !!state.lead.firstName.trim() &&
    !!state.lead.lastName.trim() &&
    EMAIL_RE.test(state.lead.email) &&
    PHONE_RE.test(state.lead.phone);
}
```

Note: `state.isPostpartum` is initialized to `false` today; consider initializing it to `null` so the user must explicitly pick a stage before continuing. Make that change in the state init.

**Step 2: Smoke test**

Verify Continue is disabled until all six conditions pass (radio chosen, date set, first-time-parent chosen, all four contact fields valid). Bad-format email/phone should keep button disabled.

**Step 3: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(step1): require all fields including contact details before Continue"
```

---

## Task 7: Step 2 — insurer list reordering + Maven/Carrot/Forma

**Files:** Modify `pages/benefits/preview.html` (~L1493–L1502)

**Step 1: Replace the `<select>` options**

```html
<select id="ap-insurer" name="insurer" class="ap-select">
  <option value="">Select your insurer</option>
  <optgroup label="Benefits platforms">
    <option value="maven">Maven Clinic</option>
    <option value="carrot_fertility">Carrot Fertility</option>
    <option value="forma">Forma</option>
  </optgroup>
  <optgroup label="Insurance carriers">
    <option value="canada_life">Canada Life</option>
    <option value="desjardins">Desjardins</option>
    <option value="equitable">Equitable</option>
    <option value="green_shield">GreenShield</option>
    <option value="manulife">Manulife</option>
    <option value="sun_life">Sun Life</option>
  </optgroup>
  <optgroup label="Other">
    <option value="other">My plan isn't listed</option>
  </optgroup>
</select>
```

**Step 2: Confirm engine doesn't gate on insurer value**

Grep `src/engine.js` and `preview.html` for `insurer` references. The engine uses `coverage[serviceId]`, not insurer identity, so no logic change needed. (If any code branches on the old `other` value being `"other"`, leave it — that value is preserved.)

**Step 3: Smoke test**

Reload page, advance to Step 2, open the dropdown, confirm grouping renders and all three new options are selectable.

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(step2): group insurers + add Maven, Carrot Fertility, Forma"
```

---

## Task 8: Step 2 — Alma Care gift cards callout

**Files:** Modify `pages/benefits/preview.html`

**Step 1: Add callout markup at the bottom of `#ap-step-2`**

Insert just before the closing `</section>` of `#ap-step-2` (~L1525):

```html
<aside class="ap-gift-callout">
  <h3>No coverage? Or covering the gap?</h3>
  <p>Postpartum care makes one of the most meaningful registry gifts. Add Alma Care gift cards to your baby registry — friends and family can contribute directly to your recovery support.</p>
  <a class="ap-gift-callout__cta" href="https://www.almacare.ca/gift-cards" target="_blank" rel="noopener">Learn about Alma Care gift cards →</a>
</aside>
```

**Step 2: Add styles**

Add to the `<style>` block (near other panel styles, ~L666):

```css
.ap-gift-callout {
  margin-top: 32px;
  padding: 20px 24px;
  background: #f5f1ea;
  border-left: 4px solid #032215;
  border-radius: 8px;
}
.ap-gift-callout h3 { margin: 0 0 8px; font-size: 18px; color: #032215; }
.ap-gift-callout p { margin: 0 0 12px; color: #2a3a32; }
.ap-gift-callout__cta { color: #032215; font-weight: 600; text-decoration: underline; }
```

**Step 3: Smoke test**

Open preview, advance to Step 2, confirm callout renders with the brand olive sidebar and the link opens in a new tab.

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(step2): add Alma Care gift cards registry callout"
```

---

## Task 9: Hubspot — Step 1 submission + results-page enrichment

**Files:** Modify `pages/benefits/preview.html`

**Step 1: Add a Step-1 submit function**

Add near the existing `submitToHubspot` (~L3224):

```javascript
async function submitStep1ToHubspot(state) {
  if (!HUBSPOT.portalId || HUBSPOT.portalId === 'TODO_FILL_IN' || !HUBSPOT.formId || HUBSPOT.formId === 'TODO_FILL_IN') {
    console.warn('Hubspot config not set — skipping Step 1 submission');
    return { ok: false, reason: 'not_configured' };
  }
  const fields = [
    { name: 'firstname', value: state.lead.firstName },
    { name: 'lastname', value: state.lead.lastName },
    { name: 'email', value: state.lead.email },
    { name: 'phone', value: state.lead.phone },
    { name: 'ap_due_date', value: state.dueDate || '' },
    { name: 'ap_is_postpartum', value: state.isPostpartum ? 'true' : 'false' },
    { name: 'ap_first_time_parent', value: state.firstTimeParent === null ? '' : String(state.firstTimeParent) },
    { name: 'ap_concerns', value: state.concerns || '' }
  ];
  const url = 'https://api.hsforms.com/submissions/v3/integrations/submit/' + HUBSPOT.portalId + '/' + HUBSPOT.formId;
  const payload = { fields, context: { pageUri: window.location.href, pageName: 'Benefits Eligibility Tool — Step 1' } };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) return { ok: false, reason: 'http_error', status: res.status };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'network_error' };
  }
}
```

**Step 2: Fire Step-1 submission on Continue**

Find the Step-1 Continue click handler (search for `currentStep === 1` near the Continue button wiring). Add, after validation passes and before navigating to Step 2:

```javascript
submitStep1ToHubspot(state).then((r) => {
  track('step1_submitted', { hubspot_ok: !!r.ok });
});
```

Note: fire-and-forget. We do not block navigation on the Hubspot response.

**Step 3: Repurpose `submitToHubspot` as enrichment**

The existing `submitToHubspot` already serializes coverage data via `buildHubspotFields`. Leave it intact but call it once when the user lands on the results screen (in the `renderResults` flow, after the DOM is composed). This sends the second, enriched submission.

Add inside `renderResults` (~L3547, after `el.innerHTML = ...`):

```javascript
submitToHubspot(state).then((r) => {
  track('plan_viewed', { hubspot_ok: !!r.ok });
});
```

**Step 4: Remove the old lead-form-submit path**

The lead-drawer form submission path (`wireLeadForm`, the `<form id="ap-lead-form">` and its submit handler) will be removed in Task 14. No change here.

**Step 5: Smoke test**

With `HUBSPOT.portalId` still `TODO_FILL_IN`, you should see console warnings (one on Step-1 Continue, one on results render) and `step1_submitted` / `plan_viewed` tracked events in the console. No errors.

**Step 6: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(hubspot): submit lead on Step 1 + enrich on results-page view"
```

---

## Task 10: Results — simplify renderRecCard + add asterisk footnote

**Files:** Modify `pages/benefits/preview.html` (~L2923–L2945, ~L2947–L2969)

**Step 1: Replace `renderRecCard`**

```javascript
function renderRecCard(rec, rank) {
  const name = SERVICE_NAMES[rec.service] || rec.service;
  const needsAsterisk = rec.service === 'postpartum_doula_care' || rec.service === 'registered_nursing';
  const priorityLabel = rec.priority ? rec.priority.charAt(0).toUpperCase() + rec.priority.slice(1) : '';
  const initial = (name || '').trim().charAt(0).toUpperCase();
  const badgeHtml = (typeof rank === 'number')
    ? '<div class="ap-rec-card__rank" aria-hidden="true">' + rank + '</div>'
    : '<div class="ap-rec-card__icon" aria-hidden="true">' + escapeHtml(initial) + '</div>';
  return (
    '<div class="ap-rec-card">'
    + badgeHtml
    + '<div class="ap-rec-card__body">'
    + '<div class="ap-rec-card__title">' + escapeHtml(name) + (needsAsterisk ? ' <span class="ap-rec-card__asterisk" aria-label="Pre-assessment approval required">*</span>' : '')
    + (priorityLabel ? ' <span class="ap-rec-card__priority ap-rec-card__priority--' + escapeHtml(rec.priority) + '">' + escapeHtml(priorityLabel) + '</span>' : '')
    + '</div>'
    + (rec.concernCallout
        ? '<p class="ap-rec-card__callout">Based on what you shared, we’d especially encourage this.</p>'
        : '')
    + '<div class="ap-rec-card__rationale">' + escapeHtml(rec.rationale || '') + '</div>'
    + '</div>'
    + '</div>'
  );
}
```

**Step 2: Update `renderPlan` to append the footnote**

In `renderPlan` (~L2947), after the cards body (and before the closing `</section>`), conditionally append the footnote when any recommendation has the asterisk:

```javascript
const hasAsterisk = recs.some((r) => r.service === 'postpartum_doula_care' || r.service === 'registered_nursing');
const footnote = hasAsterisk
  ? '<p class="ap-rec__footnote">* Pre-assessment approval may be required and varies by insurer. <a href="' + CONSULT_URL + '" target="_blank" rel="noopener">Book a consultation</a> to get a tailored estimate.</p>'
  : '';
return (
  '<section class="ap-panel ap-panel--plan">'
  + '<h2>Your highest-priority postpartum supports</h2>'
  + body
  + footnote
  + '</section>'
);
```

**Step 3: Add styles for the asterisk, priority badge, and footnote**

Append to `<style>` near other rec-card styles:

```css
.ap-rec-card__asterisk { color: #b8860b; font-weight: 700; }
.ap-rec-card__priority {
  display: inline-block; margin-left: 6px; font-size: 12px; padding: 2px 8px;
  border-radius: 999px; background: #e6efe9; color: #032215; vertical-align: middle;
}
.ap-rec-card__priority--high { background: #e6efe9; }
.ap-rec-card__priority--medium { background: #f4ecdc; }
.ap-rec-card__priority--low { background: #f0f0f0; }
.ap-rec__footnote {
  margin-top: 16px; padding: 12px 16px;
  background: #fafaf6; border-left: 3px solid #b8860b;
  font-size: 14px; color: #2a3a32; line-height: 1.5;
}
.ap-rec__footnote a { color: #032215; font-weight: 600; }
```

**Step 4: Delete `renderCostBreakdown`**

It's no longer called. Delete its definition (~L2887).

**Step 5: Smoke test**

Complete the wizard end-to-end. Confirm rec cards show name + priority badge + rationale only (no dosing line, no cost breakdown). Confirm `*` appears on Certified Postpartum Doula / Private Duty Nursing cards. Confirm the footnote renders only when at least one of those is in the list and links to the consult URL.

**Step 6: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(results): simplify rec cards + add pre-assessment asterisk footnote"
```

---

## Task 11: Results — stacked Coverage at a Glance

**Files:** Modify `pages/benefits/preview.html`

**Step 1: Replace `renderCoverageSnapshot` (or whichever function emits the "Your coverage at a glance" panel)**

Locate the function rendering `<h2>Your coverage at a glance</h2>` (~L2877). Replace its body with:

```javascript
function renderCoverageSnapshot(results) {
  const eligibleAmounts = results.eligibleAmounts || {};
  const coveredIds = Object.keys(eligibleAmounts);
  const notCoveredIds = ALMA_SERVICES.filter((id) => !coveredIds.includes(id));

  const eligibleItems = coveredIds.map((id) => {
    const name = SERVICE_NAMES[id] || id;
    const amt = '$' + Math.round(eligibleAmounts[id]);
    return '<li><span class="ap-coverage-list__check">✓</span>' + escapeHtml(name) + ' — <strong>' + amt + ' eligible</strong></li>';
  }).join('');

  const notEligibleItems = notCoveredIds.map((id) => {
    const name = SERVICE_NAMES[id] || id;
    return '<li class="ap-coverage-list__item--muted"><span class="ap-coverage-list__dash">—</span>' + escapeHtml(name) + '</li>';
  }).join('');

  const totalEligible = coveredIds.reduce((sum, id) => sum + eligibleAmounts[id], 0);
  const totalLine = coveredIds.length
    ? '<p class="ap-coverage-list__total"><strong>Total eligible: $' + Math.round(totalEligible) + '</strong></p>'
    : '';

  const hsaHtml = (state.hasHsa === 'yes' && state.hsaBalance)
    ? '<div class="ap-coverage-card ap-coverage-card--hsa"><h3>HSA available: $' + Math.round(state.hsaBalance) + '</h3><p>Can be applied to any service above.</p></div>'
    : '';

  return (
    '<section class="ap-panel ap-panel--snapshot">'
    + '<h2>Your Coverage at a Glance</h2>'
    + '<div class="ap-coverage-card ap-coverage-card--eligible">'
    + '<h3>✓ What\'s Eligible for Coverage</h3>'
    + (coveredIds.length ? '<ul>' + eligibleItems + '</ul>' + totalLine : '<p class="ap-coverage-list__item--muted">No services selected.</p>')
    + '</div>'
    + '<div class="ap-coverage-card ap-coverage-card--not-eligible">'
    + '<h3>✗ What\'s Not Eligible</h3>'
    + (notEligibleItems ? '<ul>' + notEligibleItems + '</ul>' : '<p class="ap-coverage-list__item--muted">All services have coverage.</p>')
    + '</div>'
    + hsaHtml
    + '</section>'
  );
}
```

**Step 2: Remove the old `.ap-coverage-list` two-column flexbox styles**

Find `.ap-coverage-list` rules (~L750) — delete the flex-row styles. Replace with stacked styles:

```css
.ap-coverage-card {
  margin-top: 16px;
  padding: 20px 24px;
  background: #f8f6f1;
  border-radius: 8px;
}
.ap-coverage-card h3 {
  margin: 0 0 12px;
  font-size: 18px;
  color: #032215;
}
.ap-coverage-card ul { margin: 0; padding: 0; list-style: none; }
.ap-coverage-card li { padding: 6px 0; color: #2a3a32; }
.ap-coverage-card li.ap-coverage-list__item--muted { color: #6a7a72; }
.ap-coverage-list__check { color: #2a7a47; font-weight: 700; margin-right: 8px; }
.ap-coverage-list__dash { color: #6a7a72; margin-right: 8px; }
.ap-coverage-list__total { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e6e0d3; }
.ap-coverage-card--hsa { border-left: 4px solid #032215; }
```

**Step 3: Smoke test with the example coverage from the user**

Run the wizard with: RMT $500, Acupuncture $500, Doula $1000 (no reimbursement % set on any). Expected display:
- ✓ What's Eligible for Coverage
  - RMT — $500 eligible
  - Acupuncture — $500 eligible
  - Certified Postpartum Doula — $1000 eligible
  - Total eligible: $2000

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(results): stack coverage panels + rename to 'Eligible for Coverage'"
```

---

## Task 12: Results — new What Happens Next

**Files:** Modify `pages/benefits/preview.html` (~L2990–L3003)

**Step 1: Replace `renderWhatHappensNext` body**

```javascript
function renderWhatHappensNext() {
  return (
    '<section class="ap-next">'
    + '<h2>What Happens Next</h2>'
    + '<ol class="ap-next__list">'
    + '<li><strong>Book a complimentary consultation</strong>'
    +   '<a class="ap-btn ap-btn--primary ap-next__cta" href="' + CONSULT_URL + '" target="_blank" rel="noopener">Book a call →</a>'
    + '</li>'
    + '<li>Submit an intake form and refundable deposit</li>'
    + '<li>Receive bios of qualified Postnatal Care Specialists within 2 business days</li>'
    + '<li>Interview your candidates and select your care team</li>'
    + '</ol>'
    + '</section>'
  );
}
```

**Step 2: Add list styles**

```css
.ap-next__list { padding-left: 24px; }
.ap-next__list li { margin: 12px 0; line-height: 1.55; }
.ap-next__cta { display: inline-block; margin-left: 12px; padding: 6px 14px; font-size: 14px; }
```

**Step 3: Smoke test** — verify the four-step list renders with the Book CTA inline on step 1.

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(results): replace What Happens Next with new 4-step booking flow"
```

---

## Task 13: Results — delete removed sections + update composition

**Files:** Modify `pages/benefits/preview.html`

**Step 1: Delete these render functions outright**

- `renderNavigateDetails` (~L3005)
- `renderEmotionalPermission` (~L3021)
- `renderFunding` (~L3030)
- `renderHsaEligible` (~L2971) — its content is now covered by the new Coverage at a Glance "Not Eligible" list and the HSA card.

**Step 2: Update `renderResults`** (~L3547)

Replace the composition order with:

```javascript
el.innerHTML =
    renderIntro(results)
  + renderClarifier()
  + renderCoverageSnapshot(results)
  + renderPlan(results)
  + renderWhatHappensNext()
  + renderGiftCardsCallout(results)
  + renderFinalCta();
```

(Note: `renderTrustStrip` is also removed. If it provides value, leave a TODO and revisit; assume removal per the design.)

**Step 3: Add `renderGiftCardsCallout` and `renderClarifier`**

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

function renderGiftCardsCallout(results) {
  // Show whenever the user has any unmet need: services without coverage, or no coverage at all.
  const eligibleIds = Object.keys(results.eligibleAmounts || {});
  if (eligibleIds.length === ALMA_SERVICES.length) return ''; // fully covered — hide
  return (
    '<aside class="ap-gift-callout">'
    + '<h3>No coverage? Or covering the gap?</h3>'
    + '<p>Postpartum care makes one of the most meaningful registry gifts. Add Alma Care gift cards to your baby registry — friends and family can contribute directly to your recovery support.</p>'
    + '<a class="ap-gift-callout__cta" href="https://www.almacare.ca/gift-cards" target="_blank" rel="noopener">Learn about Alma Care gift cards →</a>'
    + '</aside>'
  );
}
```

Add `.ap-results__clarifier` style: `{ font-size: 16px; color: #2a3a32; margin: 8px 0 24px; line-height: 1.55; }`.

**Step 4: Update `renderIntro`** to drop the existing prose and just emit a clean H1:

```javascript
function renderIntro() {
  return (
    '<header class="ap-results__intro">'
    + '<h2>Your Personalized Care Plan</h2>'
    + '</header>'
  );
}
```

**Step 5: Smoke test** — full wizard run. Verify sections render in this order: H1 → clarifier paragraph → coverage at a glance → highest-priority supports + footnote → what happens next → gift cards callout (if not fully covered) → final CTA. Verify the three removed sections do NOT appear.

**Step 6: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(results): remove three sections + add Care Plan vs Estimate clarifier + gift cards callout"
```

---

## Task 14: Results — replace lead drawer with simple print button

**Files:** Modify `pages/benefits/preview.html`

**Step 1: Replace `renderFinalCta`**

```javascript
function renderFinalCta() {
  return (
    '<section class="ap-final-cta">'
    + '<div class="ap-cta-row">'
    + '<a class="ap-btn ap-btn--primary" id="ap-consult-cta" href="' + CONSULT_URL + '" target="_blank" rel="noopener">Book a complimentary consultation</a>'
    + '<button type="button" class="ap-btn ap-btn--secondary" id="ap-print-plan">Send me my care plan</button>'
    + '</div>'
    + '<p class="ap-print-tip">Tip: in the print dialog, expand "More settings" and uncheck "Headers and footers" for a cleaner PDF.</p>'
    + '</section>'
  );
}
```

**Step 2: Wire the print button**

Find `wireLeadForm` and the lead-drawer-open handler. Replace both with a single click handler attached on results-page render:

```javascript
function wirePrintButton() {
  const btn = document.getElementById('ap-print-plan');
  if (!btn) return;
  btn.addEventListener('click', () => {
    track('care_plan_printed', {});
    window.print();
  });
}
```

Call `wirePrintButton()` at the end of `renderResults`.

**Step 3: Delete obsolete functions**

- `renderLeadDrawer` (~L3075)
- `openLeadDrawer`, `closeLeadDrawer` (if present)
- `wireLeadForm` and the lead-form submit handler (~L3254 onward)
- `buildHubspotFields` if no longer used (check first — Task 9's enrichment call still uses it; KEEP if so).

**Step 4: Smoke test** — click "Send me my care plan" on the results page. Browser print dialog should open. No drawer, no second form.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(results): replace lead drawer with direct print button (lead is captured on Step 1)"
```

---

## Task 15: Build + cache purge + Webflow head/body update if needed

**Files:** `pages/benefits/webflow-head.html`, `pages/benefits/webflow-body.html`, `pages/benefits/app.js`

**Step 1: Run the build**

```bash
cd /Users/tucker.schreiber/Documents/alma/.worktrees/benefits-tool
node pages/benefits/build-webflow.mjs
```
Expected: writes new `webflow-head.html`, `webflow-body.html`, `app.js`.

**Step 2: Verify the new app.js is under 100KB**

```bash
wc -c pages/benefits/app.js
```
The 50KB Webflow Embed cap applies to `webflow-body.html` only (app.js is fetched from jsDelivr). Body must stay under 50000 bytes — also verify:

```bash
wc -c pages/benefits/webflow-body.html pages/benefits/webflow-head.html
```

**Step 3: Open the prod-faithful test**

```bash
open pages/benefits/webflow-test.html
```
Run the wizard end-to-end. Confirm: stage radio, contact fields, insurer optgroups, gift cards callout on Step 2, simplified results page with `*` footnote on doula card, print button opens dialog.

**Step 4: Commit build artifacts**

```bash
git add pages/benefits/webflow-head.html pages/benefits/webflow-body.html pages/benefits/app.js
git commit -m "build: rebuild webflow artifacts for round-2 feedback"
```

**Step 5: Push and purge jsDelivr**

```bash
git push origin feature/benefits-tool:main
curl -s "https://purge.jsdelivr.net/gh/tuckerschreiber/alma-benefits-tool@main/pages/benefits/app.js"
```

**Step 6: If head or body changed, re-paste in Webflow**

Compare the new `webflow-head.html` and `webflow-body.html` against the previously pasted versions. If either changed materially (new `<style>` rules, new markup), open Webflow → almacare.ca/benefits page settings, paste the new head into "Custom Code → Head", and replace the Embed element's content with the new body. Publish.

If only `app.js` changed (the IIFE), the jsDelivr purge alone is sufficient — no Webflow re-paste needed.

**Step 7: Hard-refresh almacare.ca/benefits and verify end-to-end on production**

---

## Out of scope (deferred for now)

- Hubspot workflow + email template — you configure in Hubspot UI separately; this plan only wires the form submission payloads.
- Filling `HUBSPOT.portalId` / `HUBSPOT.formId` in `preview.html` — separate small commit when you have the real IDs.
- almacare.ca/gift-cards page — assumed to exist or be a TODO.
- Estimate-format work — stays as a manual workflow.
