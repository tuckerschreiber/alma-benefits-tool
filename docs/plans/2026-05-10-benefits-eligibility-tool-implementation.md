# Benefits Eligibility Tool — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the client-side Benefits Eligibility Tool described in `docs/plans/2026-05-10-benefits-eligibility-tool-design.md` and ship it as a Webflow Embed at `almacare.ca/benefits`.

**Architecture:** Single-page wizard (3 intake steps + results + lead capture drawer), pure client-side, vanilla JS, scoped CSS (`ap-` prefix), embedded into Webflow via the existing `pages/<slug>/{preview.html, webflow-head.html, webflow-body.html, page.json}` workflow. Rule-based recommendation engine in pure JS (testable via `node --test`). PDF via `html2pdf.js` (CDN). Submission via Hubspot Forms public API.

**Tech Stack:** HTML/CSS/JS only. `html2pdf.js` from CDN. Node's built-in test runner for the rule engine. No build step, no framework, no dependencies installed locally.

---

## File Layout (within the worktree)

```
pages/benefits/
  preview.html         — full local-preview (single file, all JS/CSS inlined for Webflow paste)
  src/
    engine.js          — rule engine (extracted so node can import for tests)
    rules.js           — rule matrix (DRAFT — separate sign-off doc tracks the canonical version)
  test/
    engine.test.js     — pure-function tests for engine.js
  webflow-head.html    — generated split: CSS + JSON-LD (Tucker pastes into Webflow head)
  webflow-body.html    — generated split: body HTML + script (Tucker pastes into Webflow Embed)
  page.json            — SEO metadata
docs/clinical/
  benefits-tool-rule-matrix-DRAFT.md — separate doc Alma's clinical lead reviews
```

**Build flow:** During development, `preview.html` is the source of truth and includes the engine inlined in a `<script>` tag. `src/engine.js` and `src/rules.js` are kept in sync so node tests can run. When ready to ship, `webflow-head.html` + `webflow-body.html` are split out from `preview.html` and copy-pasted into Webflow.

---

## Task 1: Scaffold the page shell

**Files:**
- Create: `pages/benefits/preview.html`

**Step 1: Create `preview.html` with brand-styled empty wizard shell**

Single HTML file. Include in `<head>`:
- `<meta charset="utf-8">`, viewport meta
- `<title>Benefits eligibility tool — Alma Care</title>`
- A `<style>` block with all CSS (Futura font, brand colors `#FFFAF4`, `#032215`, `#156146`, `#F4E9DD`; all classes prefixed `ap-`)
- Reset/base: `* { box-sizing: border-box; margin: 0; }`, html/body bg cream, dark green text

Include in `<body>`:
- `<main class="ap-app">`
  - `<header class="ap-progress">` — progress bar (3 segments, segment 1 active)
  - `<section id="ap-step-1" class="ap-step ap-step--active">` — placeholder "Step 1 coming"
  - `<section id="ap-step-2" class="ap-step">` — empty
  - `<section id="ap-step-3" class="ap-step">` — empty
  - `<section id="ap-results" class="ap-step">` — empty
  - `<nav class="ap-nav">` — Back / Continue buttons
- `<script>` block at the bottom with an empty `(function(){ ... })();` IIFE

CSS: only show `.ap-step--active`. Hide others with `display: none`.

**Step 2: Open in browser to verify shell renders**

Open `pages/benefits/preview.html` in a browser. Expected: cream background, dark green progress bar showing "1 of 3," placeholder "Step 1 coming" text, "Back" disabled, "Continue" visible. No console errors.

**Step 3: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): scaffold page shell with brand styling"
```

---

## Task 2: Rule engine — pure functions with tests

**Files:**
- Create: `pages/benefits/src/engine.js`
- Create: `pages/benefits/src/rules.js`
- Create: `pages/benefits/test/engine.test.js`

**Step 1: Write failing tests for `normalizeInputs`**

```js
// test/engine.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInputs } from '../src/engine.js';

test('normalizeInputs: computes weeks until due from due date', () => {
  const today = new Date('2026-05-10');
  const result = normalizeInputs({ dueDate: '2026-07-05', isPostpartum: false }, today);
  assert.equal(result.weeksUntilDue, 8);
  assert.equal(result.isPostpartum, false);
});

test('normalizeInputs: handles already postpartum (negative weeks)', () => {
  const today = new Date('2026-05-10');
  const result = normalizeInputs({ weeksPostpartum: 3, isPostpartum: true }, today);
  assert.equal(result.weeksPostpartum, 3);
  assert.equal(result.isPostpartum, true);
});
```

**Step 2: Run tests to verify they fail**

Run: `node --test pages/benefits/test/engine.test.js`
Expected: FAIL — `normalizeInputs is not defined` or import error.

**Step 3: Implement `normalizeInputs`**

```js
// src/engine.js
export function normalizeInputs(inputs, today = new Date()) {
  if (inputs.isPostpartum) {
    return { isPostpartum: true, weeksPostpartum: inputs.weeksPostpartum ?? 0 };
  }
  const due = new Date(inputs.dueDate);
  const weeksUntilDue = Math.round((due - today) / (1000 * 60 * 60 * 24 * 7));
  return { isPostpartum: false, weeksUntilDue };
}
```

**Step 4: Run tests to verify they pass**

Run: `node --test pages/benefits/test/engine.test.js`
Expected: 2 tests pass.

**Step 5: Repeat the test→fail→implement→pass cycle for these functions:**

- `eligibilityFilter(coveredServices, almaServices)` — returns intersection
- `applyRules(normalized, eligibility, rules)` — returns array of `{service, dosing, rationale, priority}`
- `allocateFunding(recommendations, coverage, hsaBalance)` — returns array with `{covered, fromHsa, outOfPocket}` per service
- `computeResults(inputs, rules, today)` — top-level orchestrator that pipes the above

Each function gets at least 2 tests (happy path + edge case). Keep functions pure (no globals, no DOM).

**Step 6: Create `rules.js` with placeholder rules**

```js
// src/rules.js — DRAFT v1, awaiting Alma clinical sign-off
export const ALMA_SERVICES = [
  'massage_therapy', 'acupuncture', 'lactation_consulting',
  'postpartum_doula_care', 'registered_nursing', 'psw',
  'mental_health', 'nutritionist', 'dietician'
];

export const RULES = [
  {
    service: 'lactation_consulting',
    appliesWhen: { weeksUntilDueMax: 6, firstTimeParent: true },
    dosing: { sessions: 2, window: 'first 2 weeks postpartum' },
    rationale: 'First-time parents benefit most from early lactation support — small adjustments in the first 10 days prevent most feeding issues.',
    priority: 'high'
  },
  // ~5 placeholder rules covering the main services
];
```

**Step 7: Commit**

```bash
git add pages/benefits/src pages/benefits/test
git commit -m "feat(benefits): rule engine with pure-function tests"
```

---

## Task 3: Step 1 — Tell us about you

**Files:**
- Modify: `pages/benefits/preview.html` (replace step-1 placeholder)

**Step 1: Add intake fields to step 1**

Replace the step-1 placeholder with:
- `<h1>Tell us about you</h1>`
- Sub-heading: "A few quick questions so we can build your care plan."
- Date input `name="dueDate"` with label "When are you due?"
- Toggle "Already postpartum?" — when on, hides date input, shows numeric input "How many weeks ago did you give birth?"
- Two-button toggle: "Is this your first baby?" → Yes / No (clickable cards, one selected)
- Textarea `name="concerns"` with label "Anything we should know? (optional)" + placeholder *"e.g. diagnosed with PPD, advanced maternal age, twin pregnancy, recovering from C-section…"*

**Step 2: Wire JS state**

In the IIFE at the bottom:
- Define `state = { dueDate: null, isPostpartum: false, weeksPostpartum: null, firstTimeParent: null, concerns: '' }`
- On any input change, update state
- Persist `state` to `sessionStorage` on every change under key `ap_benefits_state`
- On page load, hydrate from `sessionStorage` if present

**Step 3: Wire navigation**

- Continue button enables only when minimum required fields are filled (due date OR weeks postpartum, AND firstTimeParent set)
- On click, hide step 1, show step 2, update progress bar to "2 of 3"
- Back button disabled on step 1

**Step 4: Manual verification in browser**

Open in browser. Fill in due date, select "First baby? Yes," continue. Step 2 placeholder appears. Refresh page — values persist. Toggle "Already postpartum" — date picker hides, weeks-postpartum input appears.

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): step 1 intake (about you) with state persistence"
```

---

## Task 4: Step 2 — Insurance coverage

**Files:**
- Modify: `pages/benefits/preview.html`

**Step 1: Add insurance fields to step 2**

- `<h1>Your insurance</h1>`
- Insurance provider — `<select>` with options: Sun Life, Manulife, Canada Life, GreenShield, Equitable, Desjardins, Other / not sure
- "Do you have an HSA or LSA?" — three-button toggle: Yes / No / Not sure (with tooltip "ⓘ" → small popover explaining HSA = Health Spending Account)
- HSA balance — numeric input, only visible when HSA = Yes. Label: "How much is in your HSA?"

**Step 2: Wire state and navigation**

- Update `state` shape: `state.insurer`, `state.hasHsa`, `state.hsaBalance`
- Continue enabled when insurer selected (HSA fields optional)
- Back button now functional → returns to step 1 with values intact

**Step 3: Manual verification**

Open browser. Complete step 1, continue. Pick "Manulife," select HSA = Yes, enter $1500, continue. Step 3 placeholder appears. Click Back — step 2 values intact. Click Back again — step 1 values intact.

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): step 2 insurance and HSA capture"
```

---

## Task 5: Step 3 — What's covered

**Files:**
- Modify: `pages/benefits/preview.html`

**Step 1: Add 9 service cards**

- `<h1>What's covered under your benefits?</h1>`
- Sub-heading: "Check the services your plan covers. We'll only ask for details on what's checked."
- Grid of 9 cards: Massage therapy, Acupuncture, Lactation consulting, Postpartum doula care, Registered nursing, Personal support worker (PSW), Mental health support, Nutritionist, Dietician
- Each card: clickable to toggle; when checked, expands inline to reveal:
  - Annual amount $ (required when checked)
  - Per-visit cap $ (optional)
  - Reimbursement % (optional, default 100%)
- Below grid: "I'm not sure what's covered" link → opens modal with copy explaining how to find this in their benefits booklet

**Step 2: Wire state**

- `state.coverage` is a map: `{ massage_therapy: {amount: 500, perVisitCap: 50, reimbursementPercent: 100}, ... }`
- Unchecking a card removes it from the map

**Step 3: Wire submit**

Continue button on step 3 reads "See my care plan →". On click:
- Run `computeResults(state, RULES)` (paste the engine module's logic into the inline IIFE — keep `src/engine.js` as the testable copy of truth)
- Store result on `state.results`
- Show results section, hide step 3, hide progress bar

**Step 4: Manual verification**

Complete steps 1-2. On step 3, check Massage ($500), Acupuncture ($300). Click "See my care plan." Console log shows results object. Results section renders (empty for now — we render in next task).

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): step 3 coverage grid wired to engine"
```

---

## Task 6: Render results

**Files:**
- Modify: `pages/benefits/preview.html`

**Step 1: Render Coverage Snapshot panel**

- Two-column section: "What's covered" (green checks + service name + dollar amount) | "What's not covered" (muted gray + service name)
- HSA pool callout if `state.hasHsa`: "$1,500 flexible HSA spend"
- Hero stat: total covered value (sum of coverage amounts) — *"$2,400 in benefits to use"*

**Step 2: Render Recommended Care Plan panel**

- One card per item in `state.results.recommendations`
- Card content: service name + small icon, dosing line ("4 sessions over weeks 6–10"), rationale paragraph, cost breakdown (covered $XXX, HSA $YY, OOP $ZZ)
- Cards in `state.results.recommendations` order (already sorted by priority)

**Step 3: Render Funding Strategy panel**

- Plain-English bullets generated from `state.results.fundingStrategy`
- Examples: "Use your massage benefits first — they expire annually." / "~$340 out-of-pocket — consider adding Alma gift cards to your registry."

**Step 4: Render two CTAs**

- Primary (large green): "Book a free consult" — links to placeholder `https://calendly.com/almacare/consult` (Tucker swaps real URL later)
- Secondary (outlined): "Email me my care plan" — toggles inline drawer (drawer impl in next task)

**Step 5: Manual verification**

Run through the full flow with sample inputs. Results page renders all three panels. Buttons render. Layout looks brand-aligned on desktop.

**Step 6: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): results page renders coverage, plan, funding"
```

---

## Task 7: Lead capture drawer + PDF generation

**Files:**
- Modify: `pages/benefits/preview.html`

**Step 1: Add `html2pdf.js` from CDN**

In `<head>` of `preview.html`:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
```

(For Webflow split, this goes in `webflow-head.html`.)

**Step 2: Build lead capture drawer**

Hidden by default. Opens below results panels when "Email me my care plan" is clicked. Contains:
- Name (text), Email (email), Address (text)
- Concerns textarea pre-filled from `state.concerns`, editable
- Privacy line: "We'll only use this to send your plan and follow up about your care. No spam."
- Single button: "Send me my care plan"

**Step 3: Implement PDF generation**

On submit:
1. Construct a printable view: clone the results section into a hidden `<div id="ap-pdf-source">`, prepend a letterhead block (Alma logo placeholder, recipient name, today's date), append a footer (disclaimer + `https://almacare.ca/book` link)
2. Call `html2pdf().from(document.getElementById('ap-pdf-source')).set({ filename: 'alma-care-plan.pdf', margin: 12 }).save()`
3. Browser downloads file immediately

**Step 4: Manual verification**

Run through full flow. Click "Email me my care plan," fill in name/email/address, click submit. PDF downloads. Open it — letterhead, results panels, footer all render correctly. No Hubspot call yet (next task).

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): lead capture drawer + client-side PDF download"
```

---

## Task 8: Hubspot submission

**Files:**
- Modify: `pages/benefits/preview.html`

**Step 1: Add Hubspot config block**

Near the top of the IIFE:
```js
const HUBSPOT = {
  portalId: 'TODO_FILL_IN',
  formId: 'TODO_FILL_IN'
};
```

(Tucker fills in real values from his Hubspot account before launch.)

**Step 2: Build submission payload**

After the PDF generates, also POST to Hubspot. Payload shape:
```js
{
  fields: [
    { name: 'firstname', value: state.lead.name },
    { name: 'email', value: state.lead.email },
    { name: 'address', value: state.lead.address },
    { name: 'due_date', value: state.dueDate },
    { name: 'weeks_until_due', value: normalized.weeksUntilDue },
    { name: 'is_postpartum', value: state.isPostpartum },
    { name: 'first_time_parent', value: state.firstTimeParent },
    { name: 'insurer', value: state.insurer },
    { name: 'has_hsa', value: state.hasHsa },
    { name: 'hsa_balance', value: state.hsaBalance },
    { name: 'services_covered', value: Object.keys(state.coverage).join(';') },
    { name: 'total_coverage_value', value: totalCoverage },
    { name: 'concerns_text', value: state.concerns },
    { name: 'recommended_services', value: recommendedServicesString },
    { name: 'recommended_total_cost', value: state.results.totalCost }
  ],
  context: { pageUri: window.location.href, pageName: 'Benefits Eligibility Tool' }
}
```

POST to `https://api.hsforms.com/submissions/v3/integrations/submit/${HUBSPOT.portalId}/${HUBSPOT.formId}`.

**Step 3: Handle success and failure**

- On 200: show inline success state ("Sent! Check your email and download in a sec.")
- On error: show inline error ("Couldn't submit — please try again or email care@almacare.ca."). PDF download still happens regardless.

**Step 4: Manual verification (with test creds)**

Tucker provides test Hubspot portalId/formId. Run flow, submit. Verify contact appears in Hubspot with custom properties populated. If properties don't yet exist in Hubspot, document which need to be created (the design doc has the list).

**Step 5: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): hubspot forms submission"
```

---

## Task 9: Edge cases

**Files:**
- Modify: `pages/benefits/preview.html`, `pages/benefits/src/engine.js`, `pages/benefits/src/rules.js`, `pages/benefits/test/engine.test.js`

**Step 1: Add tests for zero-coverage path**

```js
test('computeResults: handles zero coverage gracefully', () => {
  const result = computeResults({ coverage: {}, hsaBalance: 0, ... }, RULES);
  assert.equal(result.totalCovered, 0);
  assert.ok(result.fundingStrategy.some(s => s.includes('out-of-pocket')));
  assert.ok(result.fundingStrategy.some(s => s.includes('registry')));
});
```

**Step 2: Implement zero-coverage branch in engine + UI**

Engine outputs empathetic copy when total coverage is $0. Results page detects zero coverage and shows a slightly different snapshot ("Most of your care will be out-of-pocket — here's how to plan smartly").

**Step 3: Add tests for already-postpartum branch**

Already-postpartum users get different rules: skip antenatal services, weight recovery (PT, mental health, lactation, doula recovery hours).

**Step 4: Implement concerns keyword detection**

Constant `CONCERN_KEYWORDS = { ppd: ['ppd', 'depression', 'postpartum depression', 'mood'], hbp: ['blood pressure', 'preeclampsia'], csection: ['c-section', 'cesarean', 'csection'], twins: ['twin', 'twins'], nicu: ['nicu'], ama: ['advanced maternal age', 'amA', 'over 35'], loss: ['miscarriage', 'loss', 'stillbirth'] }`.

Tokenize concerns text → match → inject relevant service into recommendations + add a soft callout: *"Based on what you shared, we'd especially encourage…"*.

Tests: empty concerns → no injection; "had PPD last time" → mental_health injected with high priority.

**Step 5: Manual verification of all branches**

- Zero coverage flow → empathetic snapshot, registry-leaning funding
- Postpartum flow (4 weeks postpartum) → no antenatal items, includes pelvic floor PT
- Concerns "diagnosed with PPD" → mental health injected, soft callout shows
- Refresh mid-flow → state restored

**Step 6: Commit**

```bash
git add pages/benefits/
git commit -m "feat(benefits): edge cases (zero coverage, postpartum, concerns keywords)"
```

---

## Task 10: Analytics events

**Files:**
- Modify: `pages/benefits/preview.html`

**Step 1: Add event helper**

```js
function track(event, props) {
  if (window.plausible) window.plausible(event, { props });
  if (window.gtag) window.gtag('event', event, props);
}
```

**Step 2: Fire events at key points**

- `intake_step_completed` (with `step: 1|2|3`)
- `results_viewed`
- `pdf_downloaded`
- `consult_cta_clicked`
- `submission_succeeded` / `submission_failed`

**Step 3: Manual verification**

Open dev tools → network tab. Walk the flow. Confirm Plausible/GA requests fire at expected moments (or console-log fallback if neither library is loaded locally).

**Step 4: Commit**

```bash
git add pages/benefits/preview.html
git commit -m "feat(benefits): analytics events on key funnel steps"
```

---

## Task 11: Webflow split + page metadata

**Files:**
- Create: `pages/benefits/webflow-head.html`
- Create: `pages/benefits/webflow-body.html`
- Create: `pages/benefits/page.json`

**Step 1: Generate `webflow-head.html`**

Contains:
- The `<style>` block from `preview.html` (all `ap-` CSS)
- The `html2pdf.js` CDN `<script>` tag
- A JSON-LD `<script type="application/ld+json">` block describing the page (WebApplication schema, Alma Care brand)

**Step 2: Generate `webflow-body.html`**

Contains:
- Everything inside `<body>` of `preview.html` EXCEPT script tags that should stay in head (none in our case)
- The single inline `<script>` IIFE at the bottom (this is the engine + wizard + results + lead capture + Hubspot logic, all in one block)

**Step 3: Generate `page.json`**

```json
{
  "slug": "benefits",
  "title": "Free postpartum benefits eligibility tool — Alma Care",
  "description": "Find out what your extended health benefits cover for postpartum care, get a personalized care plan, and a free PDF estimate for your insurance.",
  "ogImage": "TBD"
}
```

**Step 4: Manual verification**

Open `webflow-body.html` in a browser as a standalone file (paste minimal `<html><head>` wrapper around it temporarily). Confirm it works the same as `preview.html`. This catches anything that depended on `preview.html`-only structure.

**Step 5: Commit**

```bash
git add pages/benefits/webflow-head.html pages/benefits/webflow-body.html pages/benefits/page.json
git commit -m "feat(benefits): webflow split files and page metadata"
```

---

## Task 12: Mobile + cross-browser polish

**Files:**
- Modify: `pages/benefits/preview.html` and re-export the splits

**Step 1: Mobile responsiveness pass**

Open `preview.html` in Chrome dev tools, toggle device to iPhone 14 Pro. Walk through entire flow.
- Service cards collapse to single column ✅
- Touch targets ≥ 44×44 px
- Date picker uses native iOS picker
- Drawer fills viewport gracefully
- Results panels stack vertically, no horizontal scroll
- Font scales appropriately

Fix any layout issues with media queries.

**Step 2: Cross-browser smoke test**

Open in Chrome, Safari, Firefox on macOS. Walk full flow once each. Note any inconsistencies (esp. date picker, html2pdf rendering).

**Step 3: Re-generate webflow split**

Re-export `webflow-head.html` and `webflow-body.html` to reflect changes.

**Step 4: Commit**

```bash
git add pages/benefits/
git commit -m "feat(benefits): mobile responsive polish and browser fixes"
```

---

## Task 13: Clinical rule matrix doc (parallel — for Alma sign-off)

**Files:**
- Create: `docs/clinical/benefits-tool-rule-matrix-DRAFT.md`

**Step 1: Write the rule matrix as a human-readable doc**

For each of the 9 services Alma offers, document:
- When it's recommended (postpartum week range, conditions)
- Recommended dosing (sessions, hours)
- One-paragraph rationale in Alma's voice
- Concerns-keyword triggers that boost or inject this service

Include intro section: "This document is the clinical logic powering the Benefits Eligibility Tool. Alma's clinical lead must review and redline before launch."

**Step 2: Commit**

```bash
git add docs/clinical/
git commit -m "docs(benefits): draft clinical rule matrix for Alma review"
```

**Step 3: Hand-off note to Tucker**

Tucker walks Alma's clinical lead through the doc, captures redlines, updates `pages/benefits/src/rules.js` to match the signed-off matrix.

---

## Definition of done

- [ ] All 12 build tasks committed on `feature/benefits-tool` branch
- [ ] Rule engine tests pass (`node --test pages/benefits/test/`)
- [ ] Manual flow works in Chrome desktop + iOS Safari mobile
- [ ] Hubspot test submission lands with all custom properties populated
- [ ] PDF downloads cleanly, looks branded
- [ ] Webflow split files generated
- [ ] Clinical rule matrix doc drafted and ready for Alma review
- [ ] Tucker has paste-ready Webflow files + a list of Hubspot custom properties to create

---

## Out of scope (do NOT do in this branch)

- Real-time eligibility lookups against insurance carriers
- AI-generated rationale paragraphs
- Persistent storage beyond Hubspot
- Account creation / login
- Multi-language
- A/B testing infra (Plausible events alone suffice for v1)
