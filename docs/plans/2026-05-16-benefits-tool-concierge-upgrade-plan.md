# Benefits Tool Concierge Upgrade — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship the concierge UX described in `docs/plans/2026-05-16-benefits-tool-concierge-upgrade-design.md` — new landing screen, recopied steps, updated service taxonomy with dietician removed, restructured results page with ranked recommendations + HSA section, and a cleaner printed PDF.

**Architecture:** Single SPA in `preview.html` (3,337 lines, HTML+CSS+inline IIFE). Engine logic is duplicated: the canonical copy lives in `src/engine.js` + `src/rules.js` (ESM, used by Node tests in `test/engine.test.js`), and a parallel runtime copy lives in `preview.html` inside the inline `<script>` IIFE. The `build-webflow.mjs` script extracts the inline IIFE into `app.js` (served via jsDelivr) and the styles + body markup into `webflow-head.html` / `webflow-body.html` (pasted into Webflow). **Every engine edit must happen in both `src/*.js` and the inline IIFE in `preview.html`** — the build script is downstream of preview.

**Tech Stack:** Vanilla JS (no framework), CSS-only styling, Node test runner (`node --test test/engine.test.js`), jsDelivr CDN for `app.js`, Webflow for the page shell.

**Worktree:** `.worktrees/benefits-tool` on branch `feature/benefits-tool`.

---

## Conventions

- **Source of truth:** `preview.html` for runtime, `src/*.js` for engine tests. Keep them in sync.
- **Don't run `build-webflow.mjs` until the very end** — there's no value regenerating the artifacts on every edit.
- **Run engine tests after every engine change:** `cd pages/benefits && node --test test/engine.test.js`.
- **Don't smoke-test on `preview.html`** — open `pages/benefits/preview.html` directly in a browser (no local server needed; it's fully inline).
- **Commit cadence:** one commit per task. Use conventional commit prefixes (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).

---

## Task 1: Remove dietician from `src/rules.js`

**Files:**
- Modify: `pages/benefits/src/rules.js`

**Step 1: Find every dietician reference**

Run: `grep -n "dietician" pages/benefits/src/rules.js`
Expected: ≥2 matches — one in `ALMA_SERVICES`, and any rule entries with `service: 'dietician'`.

**Step 2: Remove `'dietician'` from `ALMA_SERVICES`**

Edit the array literal so the trailing `'dietician'` (and its comma) is gone.

**Step 3: Remove every rule entry with `service: 'dietician'`**

Delete the full rule object(s) and surrounding comma. Also check `CONCERN_TO_SERVICE_RULE` for any `service: 'dietician'` mappings and delete them.

**Step 4: Verify zero matches**

Run: `grep -n "dietician\|dietitian" pages/benefits/src/rules.js`
Expected: no output.

**Step 5: Run engine tests**

Run: `cd pages/benefits && node --test test/engine.test.js`
Expected: PASS (no test referenced dietician).

**Step 6: Commit**

```bash
git add pages/benefits/src/rules.js
git commit -m "refactor(benefits): remove dietician from rules"
```

---

## Task 2: Remove dietician from `src/engine.js`

**Files:**
- Modify: `pages/benefits/src/engine.js:13` — `SERVICE_NAMES`

**Step 1: Delete the `dietician: 'Dietician'` entry from `SERVICE_NAMES`.** Watch the trailing comma on the previous line.

**Step 2: Verify**

Run: `grep -n "dietician\|dietitian" pages/benefits/src/engine.js`
Expected: no output.

**Step 3: Run engine tests**

Run: `cd pages/benefits && node --test test/engine.test.js`
Expected: PASS.

**Step 4: Commit**

```bash
git add pages/benefits/src/engine.js
git commit -m "refactor(benefits): remove dietician from engine"
```

---

## Task 3: Rename service display labels in `src/engine.js`

**Files:**
- Modify: `pages/benefits/src/engine.js:4–14` — `SERVICE_NAMES`

**Step 1: Replace the `SERVICE_NAMES` map.**

```js
export const SERVICE_NAMES = {
  massage_therapy: 'Registered Massage Therapy (RMT)',
  acupuncture: 'Acupuncture',
  lactation_consulting: 'Lactation Consultant / IBCLC',
  postpartum_doula_care: 'Certified Postpartum Doula',
  registered_nursing: 'Private Duty Nursing',
  psw: 'Personal Support Worker (PSW)',
  mental_health: 'Psychotherapy / Mental Health Support',
  nutritionist: 'Nutrition Counselling'
};
```

**Step 2: Run engine tests**

Run: `cd pages/benefits && node --test test/engine.test.js`
Expected: PASS. The `SERVICE_NAMES exports human-readable names` test only asserts strings are non-empty, so it stays green.

**Step 3: Commit**

```bash
git add pages/benefits/src/engine.js
git commit -m "refactor(benefits): rename service display labels to insurance-portal terminology"
```

---

## Task 4: Add `covered` + `windowRank` annotations to recommendations (TDD)

**Files:**
- Modify: `pages/benefits/src/engine.js` — wherever `computeResults` builds `recs[]`
- Test: `pages/benefits/test/engine.test.js`

**Step 1: Write the failing test**

Append at the bottom of `engine.test.js`:

```js
test('computeResults: each rec has covered boolean reflecting state.coveredServices', () => {
  const state = {
    isPostpartum: true,
    weeksPostpartum: 2,
    coveredServices: { postpartum_doula_care: { limit: 1000 } },
    hsaBalance: 0,
    firstTimeParent: true,
    concerns: ''
  };
  const results = computeResults(state, RULES, ALMA_SERVICES, new Date());
  const doulaRec = results.recommendations.find(r => r.service === 'postpartum_doula_care');
  const otherRec = results.recommendations.find(r => r.service !== 'postpartum_doula_care');
  assert.equal(doulaRec.covered, true);
  if (otherRec) assert.equal(otherRec.covered, false);
});
```

(If `RULES` isn't already imported, copy the import style from existing tests.)

**Step 2: Run the test and confirm it fails**

Run: `cd pages/benefits && node --test test/engine.test.js`
Expected: FAIL — `covered` is `undefined`.

**Step 3: Add the `covered` annotation in `computeResults`**

In `src/engine.js`, find the spot where each `rec` is built before being pushed to the results. Add:

```js
rec.covered = !!(state.coveredServices && state.coveredServices[rec.service]);
```

Also add `windowRank` (used by Task 5):

```js
const dosingWindow = rec.dosing && rec.dosing.window;
rec.windowRank = isInWindow(state.weeksPostpartum, dosingWindow) ? 0 : 1;
```

Add this helper near the top of the file:

```js
function isInWindow(weeksPostpartum, window) {
  if (typeof weeksPostpartum !== 'number' || !window) return false;
  // window strings look like "first 3 weeks postpartum" or "first 12 weeks postpartum"
  const m = /first\s+(\d+)\s+weeks?/i.exec(window);
  if (!m) return false;
  return weeksPostpartum <= parseInt(m[1], 10);
}
```

**Step 4: Run the test and confirm it passes**

Run: `cd pages/benefits && node --test test/engine.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add pages/benefits/src/engine.js pages/benefits/test/engine.test.js
git commit -m "feat(benefits): annotate recs with covered + windowRank"
```

---

## Task 5: Apply hybrid covered→priority→window sort (TDD)

**Files:**
- Modify: `pages/benefits/src/engine.js` — final sort in `computeResults`
- Test: `pages/benefits/test/engine.test.js`

**Step 1: Write three failing tests**

Append to `engine.test.js`:

```js
test('computeResults: covered services rank above uncovered at the same priority', () => {
  const state = {
    isPostpartum: true,
    weeksPostpartum: 4,
    coveredServices: { massage_therapy: { limit: 500 } },
    hsaBalance: 0,
    firstTimeParent: true,
    concerns: ''
  };
  const results = computeResults(state, RULES, ALMA_SERVICES, new Date());
  const firstCoveredIdx = results.recommendations.findIndex(r => r.covered);
  const firstUncoveredIdx = results.recommendations.findIndex(r => !r.covered);
  if (firstCoveredIdx !== -1 && firstUncoveredIdx !== -1) {
    assert.ok(firstCoveredIdx < firstUncoveredIdx, 'covered must precede uncovered');
  }
});

test('computeResults: within covered group, higher priority ranks first', () => {
  // synthesize a state where two covered services have different priorities
  // and assert ordering by priority within the covered group
  // (specific state depends on existing RULES — pick services whose rules differ in priority)
});

test('computeResults: within same priority + covered, in-window ranks before out-of-window', () => {
  // pick a service rule with a defined dosing.window; assert two states differing only
  // in weeksPostpartum produce different orderings
});
```

(Flesh out the second and third tests using RULES from `src/rules.js` — the engineer should grep for high/medium/low priority services already mapped and pick a pair.)

**Step 2: Run the tests and confirm they fail**

Run: `cd pages/benefits && node --test test/engine.test.js`
Expected: at least the first new test FAILS.

**Step 3: Apply the hybrid sort**

In `computeResults`, after recs are built and before they're returned, replace the existing priority sort with:

```js
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
recs.sort((a, b) => {
  if (a.covered !== b.covered) return a.covered ? -1 : 1;
  const pa = PRIORITY_RANK[a.priority] ?? 9;
  const pb = PRIORITY_RANK[b.priority] ?? 9;
  if (pa !== pb) return pa - pb;
  return (a.windowRank ?? 9) - (b.windowRank ?? 9);
});
```

Note: `PRIORITY_RANK` already exists at line 16 — reuse the existing constant rather than redeclaring.

**Step 4: Run the tests and confirm they pass**

Run: `cd pages/benefits && node --test test/engine.test.js`
Expected: PASS (all).

**Step 5: Commit**

```bash
git add pages/benefits/src/engine.js pages/benefits/test/engine.test.js
git commit -m "feat(benefits): rank recs by covered→priority→window"
```

---

## Task 6: Mirror engine changes into the inline IIFE in `preview.html`

**Files:**
- Modify: `pages/benefits/preview.html:1681–1697` (SERVICE_NAMES, ALMA_SERVICES) + wherever `computeResults` and `applyRules` are defined inside the IIFE.

**Step 1: Update `SERVICE_NAMES` (line ~1681)** to match Task 3's new labels and remove `dietician`.

**Step 2: Update `ALMA_SERVICES` (line ~1697)** — remove `'dietician'`.

**Step 3: Search the IIFE for `dietician` and remove all rule entries.**

Run: `grep -n "dietician" pages/benefits/preview.html`
Expected after edits: no output.

**Step 4: Add the `covered` and `windowRank` annotations + `isInWindow` helper** inside the IIFE, mirroring Task 4.

**Step 5: Add the hybrid sort** inside the IIFE's `computeResults`, mirroring Task 5.

**Step 6: Smoke test**

Open `pages/benefits/preview.html` in a browser. Walk through Steps 1→2→3 with mixed coverage and reach the results screen. Verify:
- No "Dietician" appears anywhere.
- Updated service labels appear on Step 3.
- Recommendations on the results page are ordered with covered services first.

**Step 7: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "refactor(benefits): sync engine changes from src/ into preview.html IIFE"
```

---

## Task 7: Update Step 1/2/3 headlines and subheads in `preview.html`

**Files:**
- Modify: `pages/benefits/preview.html:1333, 1368, 1410` (and the subhead `<p>` adjacent to each `<h1>`)

**Step 1: Step 1** — replace `<h1>Tell us about you</h1>` with `<h1>Let's personalize your care recommendations</h1>` and replace the subhead with: *A few thoughtful details help us identify the most relevant coverage pathways and postpartum support options for your family.*

**Step 2: Step 2** — replace `<h1>Your insurance</h1>` with `<h1>Let's explore your coverage options</h1>` and replace the subhead with: *We'll help identify which services may be eligible through your extended health benefits or HSA.*

**Step 3: Step 3** — replace `<h1>What's covered under your benefits?</h1>` with `<h1>Which services are included in your extended health benefits?</h1>` and replace the subhead with: *Select the practitioner categories included in your plan. If you're unsure, we'll help guide you.*

**Step 4: Smoke test** — reload preview.html, confirm all three headlines and subheads are updated.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): recopy step headlines and subheads for concierge tone"
```

---

## Task 8: Update microcopy throughout `preview.html`

**Files:**
- Modify: `pages/benefits/preview.html:1651, 1670` and the tool intro line (grep for "few quick questions").

**Step 1:** Replace the `Continue` button label with `Continue assessment` (line 1670 + the label-swap logic around 2490).

**Step 2:** Replace `I'm not sure what's covered` with `Help me understand my coverage` (line 1651).

**Step 3:** Replace the tool intro `A few quick questions so we can build your care plan.` with `We'll guide you through a few thoughtful questions to help identify your most relevant coverage and care options.` (grep `few quick questions` to find it).

**Step 4: Smoke test** — reload, verify all three pieces of microcopy.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): update microcopy for concierge tone"
```

---

## Task 9: Update Step 3 service card labels in `preview.html` and remove dietician card

**Files:**
- Modify: `pages/benefits/preview.html` — Step 3 service cards (around line 1410+) and any "I'm not sure" helper coverage detail panels that list dietician.

**Step 1: Find every Step 3 service card label and rename to match Task 3.**

Grep for `Massage therapy`, `Lactation consulting`, `Postpartum doula care`, `Registered nursing`, `Personal support worker`, `Mental health support`, `Nutritionist` and replace with the new labels.

**Step 2: Remove the entire `Dietician` service card markup.** Search for `Dietician` and remove the surrounding `<label>` / `<div class="ap-service-card">` block.

**Step 3: Remove any coverage-detail helper section that references dietician** (the "I'm not sure what's covered" panel may list services).

**Step 4: Verify no orphan refs**

Run: `grep -in "dietician\|dietitian" pages/benefits/preview.html`
Expected: no output.

**Step 5: Smoke test** — reload, walk to Step 3, confirm new labels are visible and no dietician card appears.

**Step 6: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): update Step 3 service labels and remove dietician card"
```

---

## Task 10: Add landing screen markup + CSS

**Files:**
- Modify: `pages/benefits/preview.html` — add new `<section class="ap-landing">` before the existing `<section class="ap-step" id="ap-step-1">`; add corresponding CSS in the `<style>` block.

**Step 1: Add the landing section markup** inside `<main class="ap-app">`, before the progress bar and step sections:

```html
<section class="ap-landing" id="ap-landing">
  <header class="ap-landing__hero">
    <h1>Understand what care may already be available to you</h1>
    <p>Many families are surprised to learn that their extended health benefits, HSA, or employer-sponsored coverage can help offset the cost of postpartum and newborn support. This guided tool helps you explore potential eligibility for services like:</p>
    <ul class="ap-landing__chips" aria-label="Example services">
      <li>Certified postpartum doula care</li>
      <li>Private duty nursing</li>
      <li>Registered massage therapy</li>
      <li>Lactation support</li>
      <li>Mental health support</li>
    </ul>
    <p class="ap-landing__registry">And if benefits coverage isn't available, many families choose to add Alma Care gift cards to their baby registry — making meaningful postpartum support part of the care ecosystem from day one.</p>
  </header>

  <section class="ap-landing__panel">
    <h2>Personalized postpartum support, thoughtfully coordinated</h2>
    <p>Alma Care connects families with trusted postpartum professionals — including certified doulas, nurses, lactation consultants, and recovery specialists — to support recovery, newborn care, feeding, sleep, and the transition into early parenthood. Care is personalized to your family's needs and can often be coordinated alongside eligible insurance or HSA coverage pathways.</p>
  </section>

  <p class="ap-landing__disclaimer">This tool is intended for educational and planning purposes only and is not a pre-determination of insurance coverage or eligibility. Coverage varies by provider and individual plan. We recommend confirming all details directly with your insurance provider or benefits administrator.</p>

  <button type="button" class="ap-btn ap-btn--continue" id="ap-landing-begin">Begin assessment</button>
</section>
```

**Step 2: Add CSS in the `<style>` block** (near the other `.ap-` rules):

```css
.ap-landing { display: flex; flex-direction: column; gap: 28px; }
.ap-landing--hidden { display: none; }
.ap-landing__hero h1 { font-size: 32px; line-height: 1.2; margin-bottom: 16px; }
.ap-landing__hero p { color: #2a3a32; margin-bottom: 16px; }
.ap-landing__chips { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 0 0 16px 0; }
.ap-landing__chips li { background: rgb(235, 225, 213); color: #032215; padding: 6px 14px; border-radius: 999px; font-size: 14px; }
.ap-landing__registry { font-style: italic; color: #4a5a52; }
.ap-landing__panel { background: rgba(21, 97, 70, 0.04); border: 1px solid rgb(235, 225, 213); border-radius: 12px; padding: 24px; }
.ap-landing__panel h2 { font-size: 20px; margin-bottom: 10px; }
.ap-landing__disclaimer { font-size: 12px; color: #777; line-height: 1.5; }
```

**Step 3: Hide the progress bar and step shell while the landing is active.** Wrap the existing `<section class="ap-progress">` and step sections in a parent `<div class="ap-assessment ap-assessment--hidden" id="ap-assessment">…</div>`. Add CSS: `.ap-assessment--hidden { display: none; }`.

**Step 4: Smoke test** — reload, confirm only the landing screen renders and the Begin button is visible.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): add landing screen markup and styles"
```

---

## Task 11: Wire the Begin Assessment button

**Files:**
- Modify: `pages/benefits/preview.html` — inside the IIFE, near the existing nav handlers.

**Step 1: Add a click handler** inside the IIFE (near the bottom, where other DOM event listeners attach):

```js
const beginBtn = document.getElementById('ap-landing-begin');
const landingEl = document.getElementById('ap-landing');
const assessmentEl = document.getElementById('ap-assessment');
if (beginBtn && landingEl && assessmentEl) {
  beginBtn.addEventListener('click', function () {
    landingEl.classList.add('ap-landing--hidden');
    assessmentEl.classList.remove('ap-assessment--hidden');
    track('assessment_started');
    // focus first input on Step 1 for accessibility
    const firstFocusable = document.querySelector('#ap-step-1 input, #ap-step-1 button, #ap-step-1 select');
    if (firstFocusable) firstFocusable.focus();
  });
}
```

(If `track()` isn't defined in scope, drop that line.)

**Step 2: Smoke test** — reload, click Begin assessment, confirm landing hides and Step 1 is visible with focus on the first input.

**Step 3: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): wire Begin assessment button to reveal Step 1"
```

---

## Task 12: Add results-page intro band

**Files:**
- Modify: `pages/benefits/preview.html` — results section (search for the `id="ap-step-results"` or `ap-results` block).

**Step 1: Insert a new `<header class="ap-results__intro">` at the top of the results section** with this copy:

```html
<header class="ap-results__intro">
  <h2>You may have more support available to you than you think.</h2>
  <p>Based on your responses, there appear to be several potential pathways to offset postpartum care through extended health benefits and/or HSA funding. We've outlined the options most relevant to your stage of recovery and care goals below.</p>
</header>
```

**Step 2: Add CSS:**

```css
.ap-results__intro { margin-bottom: 24px; }
.ap-results__intro h2 { font-size: 22px; line-height: 1.3; margin-bottom: 8px; }
.ap-results__intro p { color: #2a3a32; }
```

**Step 3: Smoke test** — walk through to results, confirm intro appears above recommendations.

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): add personalized intro band to results page"
```

---

## Task 13: Render ranked recommendations — top 3 full + "see more" accordion

**Files:**
- Modify: `pages/benefits/preview.html` — IIFE function that renders recommendation cards (search for `SERVICE_NAMES[rec.service]` around line 2773 and 3191).

**Step 1: Find the rec render function** and modify it to split `recs` into `topThree` and `rest`. Render `topThree` as numbered cards (add `<span class="ap-rec__rank">N</span>` to each). Render `rest` inside a `<details>` element:

```js
const recs = state.results.recommendations;
const topThree = recs.slice(0, 3);
const rest = recs.slice(3);
let html = '<section class="ap-recs"><h2>Your highest-priority postpartum supports</h2>';
html += topThree.map((rec, i) => renderRecCard(rec, i + 1)).join('');
if (rest.length) {
  html += '<details class="ap-recs__more"><summary>See additional recommendations</summary>';
  html += rest.map((rec, i) => renderRecCard(rec, i + 4)).join('');
  html += '</details>';
}
html += '</section>';
```

`renderRecCard` should add the numbered rank visually and use the new `SERVICE_NAMES` labels.

**Step 2: Add CSS:**

```css
.ap-recs { display: flex; flex-direction: column; gap: 16px; }
.ap-recs > h2 { font-size: 20px; margin-bottom: 4px; }
.ap-rec__rank { display: inline-block; background: #156146; color: #fff; width: 28px; height: 28px; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 500; margin-right: 10px; font-size: 14px; }
.ap-recs__more { border-top: 1px solid rgb(235, 225, 213); padding-top: 12px; margin-top: 8px; }
.ap-recs__more > summary { cursor: pointer; color: #156146; font-weight: 500; padding: 8px 0; }
```

**Step 3: Smoke test** — run an assessment that produces 4+ recs and confirm top 3 are visible by default with the accordion below.

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): render top 3 recs + see-more accordion"
```

---

## Task 14: Add HSA-eligible secondary section

**Files:**
- Modify: `pages/benefits/preview.html` — results section, immediately after the ranked recommendations.

**Step 1: Add conditional render logic** inside the IIFE. The section is shown when at least one rec has `covered === false`:

```js
const uncoveredRecs = state.results.recommendations.filter(r => !r.covered);
let hsaHtml = '';
if (uncoveredRecs.length > 0) {
  hsaHtml = `
    <section class="ap-hsa">
      <h2>Additional services that may be eligible through your HSA</h2>
      <p>Even when a practitioner category is not included in your extended health benefits, many families are still able to use Health Spending Account (HSA) funds toward eligible care providers. Depending on your plan, this may include:</p>
      <ul>
        <li>Private duty nursing</li>
        <li>Nursing-led postpartum support</li>
        <li>Lactation support provided by eligible practitioners</li>
        <li>Select wellness and recovery services</li>
      </ul>
      <p class="ap-hsa__footnote">We recommend confirming practitioner eligibility directly with your benefits provider before booking care.</p>
    </section>
  `;
}
```

**Step 2: Add CSS:**

```css
.ap-hsa { background: rgba(21, 97, 70, 0.04); border: 1px solid rgb(235, 225, 213); border-radius: 12px; padding: 24px; }
.ap-hsa h2 { font-size: 18px; margin-bottom: 12px; }
.ap-hsa ul { padding-left: 20px; margin: 12px 0; color: #2a3a32; }
.ap-hsa__footnote { font-size: 13px; color: #4a5a52; margin-top: 12px; }
```

**Step 3: Smoke test** — run an assessment with partial coverage. Verify the HSA section appears. Then run one with full coverage of every recommended service and verify it hides.

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): add HSA-eligible secondary section to results"
```

---

## Task 15: Add "What happens next" section

**Files:**
- Modify: `pages/benefits/preview.html` — results section, after the HSA section.

**Step 1: Insert the markup:**

```html
<section class="ap-next">
  <h2>What happens next</h2>
  <ol>
    <li>Complete your coverage assessment</li>
    <li>Review your personalized care recommendations</li>
    <li>Speak with an Alma Care specialist</li>
    <li>Build a postpartum support plan tailored to your family</li>
    <li>Begin care with trusted practitioners and guidance on eligible reimbursement pathways</li>
  </ol>
</section>
```

**Step 2: Add CSS:**

```css
.ap-next { padding: 24px 0; border-top: 1px solid rgb(235, 225, 213); }
.ap-next h2 { font-size: 20px; margin-bottom: 12px; }
.ap-next ol { padding-left: 24px; color: #2a3a32; }
.ap-next li { padding: 6px 0; }
```

**Step 3: Smoke test + commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): add what-happens-next section to results"
```

---

## Task 16: Add "We help families navigate the details" capability panel

**Files:**
- Modify: `pages/benefits/preview.html` — results, after What Happens Next.

**Step 1: Insert markup:**

```html
<section class="ap-navigate">
  <h2>We help families navigate the details</h2>
  <p>Our team regularly helps families:</p>
  <ul>
    <li>Understand eligible practitioner categories</li>
    <li>Maximize extended health benefits</li>
    <li>Utilize HSA and wellness spending accounts</li>
    <li>Prepare documentation for reimbursement</li>
    <li>Coordinate layered postpartum support plans</li>
  </ul>
</section>
```

**Step 2: Reuse `.ap-hsa`-style panel CSS** or add:

```css
.ap-navigate { background: #ffffff; border: 1px solid rgb(235, 225, 213); border-radius: 12px; padding: 24px; }
.ap-navigate h2 { font-size: 18px; margin-bottom: 8px; }
.ap-navigate ul { padding-left: 20px; color: #2a3a32; }
.ap-navigate li { padding: 4px 0; }
```

**Step 3: Smoke test + commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): add capability panel to results"
```

---

## Task 17: Add "Support is not a luxury" emotional permission section

**Files:**
- Modify: `pages/benefits/preview.html` — results, after capability panel.

**Step 1: Insert markup with intentionally quieter visual treatment** (cream background, no border):

```html
<section class="ap-permission">
  <h2>Support is not a luxury during postpartum recovery</h2>
  <p>Families often prepare extensively for birth — but far less for recovery, healing, feeding support, sleep, and the realities of the first weeks at home. Increasingly, families are choosing to include postpartum care support as part of their baby registry, allowing loved ones to contribute meaningfully to recovery and wellbeing during one of life's most important transitions.</p>
</section>
```

**Step 2: CSS:**

```css
.ap-permission { background: #FFFAF4; padding: 24px 0; }
.ap-permission h2 { font-size: 18px; margin-bottom: 10px; color: #2a3a32; font-weight: 500; }
.ap-permission p { color: #2a3a32; line-height: 1.65; }
```

**Step 3: Smoke test + commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): add emotional permission section to results"
```

---

## Task 18: Update final CTA copy + add trust strip

**Files:**
- Modify: `pages/benefits/preview.html` — final CTA above the existing lead form, and a new trust strip below.

**Step 1: Update the final CTA heading** to *Review your options with an Alma Care specialist* with supporting copy:

```html
<h2>Review your options with an Alma Care specialist</h2>
<p>Our team can help you:</p>
<ul>
  <li>Understand eligible coverage pathways</li>
  <li>Maximize HSA utilization</li>
  <li>Navigate documentation requirements</li>
  <li>Build a personalized postpartum support plan</li>
</ul>
```

**Step 2: Add the trust strip after the lead form:**

```html
<aside class="ap-trust">
  <div class="ap-trust__item"><strong>Trusted postpartum professionals</strong></div>
  <div class="ap-trust__item"><strong>Personalized practitioner matching</strong></div>
  <div class="ap-trust__item"><strong>Guided care coordination across Canada</strong></div>
</aside>
```

**Step 3: CSS:**

```css
.ap-trust { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; padding-top: 24px; border-top: 1px solid rgb(235, 225, 213); }
.ap-trust__item { text-align: center; font-size: 13px; color: #4a5a52; }
.ap-trust__item strong { display: block; color: #032215; font-weight: 500; margin-bottom: 4px; }
@media (max-width: 600px) { .ap-trust { grid-template-columns: 1fr; gap: 8px; text-align: left; } }
```

**Step 4: Smoke test** — verify CTA reads correctly and trust strip is visible.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): update final CTA copy and add trust strip"
```

---

## Task 19: PDF cleanup — Layer 1 (@page margin to zero)

**Files:**
- Modify: `pages/benefits/preview.html:1014–1022` — `@page` block and `#ap-print-root` rule.

**Step 1: Replace the `@page` and `#ap-print-root` print rules:**

```css
@page { size: letter; margin: 0; }
#ap-print-root { padding: 0.6in 0.6in 0.75in 0.6in; }
```

**Step 2: Smoke test** — open preview.html in Chrome, walk to results, click Save as PDF. Verify the URL/date/page-number footer no longer appears.

**Step 3: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "fix(benefits): suppress Chrome PDF headers/footers via @page margin 0"
```

---

## Task 20: PDF cleanup — Layer 2 (inline tip)

**Files:**
- Modify: `pages/benefits/preview.html` — near the print/save button (grep for `Save as PDF`).

**Step 1: Add a muted helper line above the print button:**

```html
<p class="ap-print-tip">Tip: in the print dialog, expand "More settings" and uncheck "Headers and footers" for a cleaner PDF.</p>
```

**Step 2: CSS:**

```css
.ap-print-tip { font-size: 12px; color: #777; font-style: italic; margin-bottom: 8px; }
```

**Step 3: Smoke test + commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): add print-dialog tip near Save as PDF button"
```

---

## Task 21: PDF cleanup — Layer 3 (intentional content)

**Files:**
- Modify: `pages/benefits/preview.html` — `printCarePlan()` function (line 3257+), `renderPdfSource()` (search for it), and the print CSS block.

**Step 1: Set a clean `document.title` before `window.print()`** in `printCarePlan()`:

```js
const originalTitle = document.title;
document.title = 'Alma Care plan' + (state.firstName ? ' — ' + state.firstName : '');
const restoreTitle = function () { document.title = originalTitle; };
window.addEventListener('afterprint', restoreTitle, { once: true });
```

**Step 2: In `renderPdfSource()`** (the function that builds `#ap-print-root` innerHTML), collapse the existing meta panel into the letterhead and add a printed footer line at the end:

```html
<footer class="ap-pdf__footer">Alma Care — care@almacare.ca — almacare.ca/benefits</footer>
```

**Step 3: Update print CSS:**

```css
.ap-pdf__panel { background: #ffffff; border: 1px solid rgb(235, 225, 213); padding: 16px; }
.ap-pdf__footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid rgb(235, 225, 213); font-size: 11px; color: #777; text-align: center; }
@media print {
  .ap-next, .ap-navigate { page-break-inside: avoid; break-inside: avoid; }
}
```

**Step 4: Smoke test** — Save as PDF, verify the printed plan has the new letterhead, no meta-panel duplication, our footer at the bottom, and sections don't split awkwardly across pages.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): polish printed PDF letterhead, footer, and page-break behavior"
```

---

## Task 22: Regenerate Webflow artifacts

**Files:**
- Modify: `pages/benefits/app.js`, `pages/benefits/webflow-body.html`, `pages/benefits/webflow-head.html`, `pages/benefits/webflow-test.html` (all regenerated by the build script).

**Step 1: Run the build:**

Run: `cd pages/benefits && node build-webflow.mjs`
Expected: build prints success messages and writes the four files.

**Step 2: Verify outputs are sensible:**

```
wc -l pages/benefits/app.js pages/benefits/webflow-body.html pages/benefits/webflow-head.html
grep -l "dietician\|dietitian" pages/benefits/*.html pages/benefits/app.js
```

Expected: `grep` finds nothing.

**Step 3: Open `pages/benefits/webflow-test.html`** in a browser — this loads `./app.js` and renders exactly as Webflow will. Walk through the full flow: landing → steps → results → PDF.

**Step 4: Commit the regenerated artifacts**

```bash
git add pages/benefits/app.js pages/benefits/webflow-body.html pages/benefits/webflow-head.html pages/benefits/webflow-test.html
git commit -m "chore(benefits): regenerate Webflow artifacts"
```

---

## Task 23: Final manual smoke + checklist

Run through this list against `pages/benefits/preview.html` (and again on `webflow-test.html`):

- [ ] Landing screen renders by default; Begin assessment is the only CTA.
- [ ] Clicking Begin hides landing and reveals Step 1 with focus on first input.
- [ ] Step 1/2/3 headlines and subheads match the design doc.
- [ ] Continue button reads "Continue assessment".
- [ ] Step 3 service labels match the new taxonomy; no dietician anywhere.
- [ ] "Help me understand my coverage" replaces "I'm not sure what's covered".
- [ ] Results page leads with the personalized intro band.
- [ ] Top 3 ranked recommendation cards are numbered; rest collapsed into "See additional recommendations".
- [ ] With partial coverage, the HSA-eligible section appears; with full coverage, it hides.
- [ ] "What happens next", "We help families navigate the details", and "Support is not a luxury" sections all render.
- [ ] Final CTA reads "Review your options with an Alma Care specialist".
- [ ] Trust strip renders three lightweight markers, responsive on mobile.
- [ ] Save as PDF in Chrome produces a clean document with no browser footer.
- [ ] iOS Safari: landing screen scrolls cleanly, no horizontal scroll, all CTAs tappable.

If anything fails, fix and re-commit before moving to deployment.

---

## Deployment (post-merge)

These steps run after merge to `main`. **Don't include them as tasks** — they're the user's manual deployment ritual, not engineering work.

1. Merge `feature/benefits-tool` → `main`, push to GitHub. jsDelivr picks up `app.js` within ~12h, or instantly with `?v=YYYYMMDD` appended to the script tag in `webflow-head.html`.
2. Paste new `webflow-head.html` and `webflow-body.html` into Webflow and publish.
