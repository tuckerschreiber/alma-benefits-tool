# Benefits Eligibility Tool — Feedback Round 2 Design

**Date:** 2026-05-20
**Scope:** almacare.ca/benefits (Webflow embed; source repo: github.com/tuckerschreiber/alma-benefits-tool)
**Working dir:** `.worktrees/benefits-tool/pages/benefits/`

## Goals

1. Move contact capture upfront (Step 1) and trigger auto-email via Hubspot workflow.
2. Restructure the pregnant/postpartum flow into an explicit radio.
3. Add Maven/Carrot/Forma as benefits platforms at the top of the insurer list.
4. Add an Alma Care gift cards section on Step 2 and reuse on results page.
5. Simplify Coverage at a Glance: eligible amount = `coverage.amount × reimbursementPercent`, no dosing ceiling.
6. Stack "What's Eligible" above "What's Not Eligible" with renamed labels.
7. Remove dosing/session math from Highest Priority Supports; add `*` footnote for certified doula and private duty nursing.
8. Replace "What Happens Next" with the new 4-step booking flow.
9. Remove "We help families navigate the details", "Support is not a luxury", "How to fund your care".
10. Clarify Care Plan vs. Estimate via a short paragraph on the results page.

## Section 1 — Step 1 restructure

New Step 1 layout (top to bottom):

1. **Radio** — "Are you currently pregnant or postpartum?" — `Currently pregnant` / `Postpartum (baby already born)`
2. **Date input** — single `<input type="date">`. Label adapts:
   - Pregnant → "When are you due?"
   - Postpartum → "What was baby's original due date?"
3. **First-time parent** — yes/no (unchanged)
4. **Concerns** — open textarea (unchanged)
5. **Contact details** (new block, heading "Your contact details")
   - First name (required)
   - Last name (required)
   - Email (required, validated)
   - Phone (required, formatted)

**Removed from Step 1:** the inline "Already had your baby? Switch to postpartum" toggle below the date input. Replaced by the radio above.

**Engine impact:** the engine derives `isPostpartum` from the date as a safety net but trusts the explicit radio when it disagrees. New contact fields populate `state.lead` — no state-shape restructure.

**Validation:** "Continue" is disabled until all required Step 1 fields pass. Email/phone get inline format validation. No data leaves the browser until Step 1 submit (see Section 6).

## Section 2 — Step 2 insurers + gift cards

**Insurer list reordering** using disabled `<optgroup>` labels:

```
— Benefits platforms —
Maven Clinic
Carrot Fertility
Forma
— Insurance carriers —
Canada Life
Manulife
Sun Life
[...existing list, alphabetized]
— Other —
My plan isn't listed
```

`maven`, `carrot_fertility`, `forma` added as insurer keys. Empty coverage defaults (no pre-population) — variability between employer-specific Maven/Carrot/Forma plans is too high to safely default.

**Alma Care gift cards section** — new module at the bottom of Step 2, before "Continue":

> **No coverage? Or covering the gap?**
> Postpartum care makes one of the most meaningful registry gifts. Add Alma Care gift cards to your baby registry — friends and family can contribute directly to your recovery support.
> [Learn about Alma Care gift cards →]

Soft callout card, visually distinct from form fields. Same module reused on results page when out-of-pocket > 0.

## Section 3 — Coverage at a Glance redesign

**Layout:** stacked vertically (not side-by-side):

```
Your Coverage at a Glance

┌ ✓ What's Eligible for Coverage ─┐
│ • RMT — $500 eligible           │
│ • Acupuncture — $500 eligible   │
│ • Doula — $1,000 eligible       │
│ Total eligible: $2,000          │
└─────────────────────────────────┘

┌ ✗ What's Not Eligible ──────────┐
│ • PSW care                      │
│ • Private duty nursing          │
└─────────────────────────────────┘

┌ HSA available: $X ──────────────┐
│ Can be applied to any service.  │
└─────────────────────────────────┘
```

**Math change:** `eligible = coverage.amount × (reimbursementPercent ?? 100)`. No dosing ceiling. `$500 + $500 + $1,000 = $2,000 eligible`.

**Per-visit cap:** stays as an optional field but display-only ("Up to $X/visit"). Does not truncate the eligible total.

## Section 4 — Highest Priority Supports + pre-assessment footnote

**Per-card content** (no session count, no dollar amounts):

```
┌────────────────────────────────────────────┐
│ Certified Postpartum Doula *  [High]       │
│                                            │
│ Supports overnight recovery, feeding       │
│ guidance, and early bonding during the     │
│ critical first 4–6 weeks postpartum.       │
└────────────────────────────────────────────┘
```

The `*` appears on **Certified Postpartum Doula** and **Private Duty Nursing** only. Single footnote below the list:

> \* Pre-assessment approval may be required and varies by insurer. **[Book a consultation →]** to get a tailored estimate.

**Engine cleanup:**
- Delete `allocateFunding()` and per-service `totalCost` / `fromHsa` / `outOfPocket` (no longer shown).
- Delete `buildFundingStrategy()` and the "funding strategy" UI lines.
- Keep `dosing.window` — still used for postpartum-timing sort.
- Card sort order unchanged: `isCovered → priority → windowRank`.
- Concern callouts ("Matches your concerns" tag) unchanged.

## Section 5 — What Happens Next + removals

Replace the existing list with:

```
What Happens Next

  1.  Book a complimentary consultation
      [Book a call →]
  2.  Submit an intake form and refundable deposit
  3.  Receive bios of qualified Postnatal Care
      Specialists within 2 business days
  4.  Interview your candidates and select your
      care team
```

Step 1's CTA is the primary button. Steps 2–4 are read-only.

**Sections removed entirely:**
- `<h2>We help families navigate the details</h2>` (preview.html ~L3008)
- `<h2>Support is not a luxury during postpartum recovery</h2>` (~L3024)
- `<h2>How to fund your care</h2>` (~L3039 and ~L3462 duplicate)

**Final results-page section order:**

1. Header / greeting + Care Plan vs. Estimate clarifier (Section 7)
2. Your Coverage at a Glance (stacked, renamed)
3. Highest Priority Supports (with `*` footnote)
4. What Happens Next (new 4-step list)
5. Alma Care gift cards callout (when out-of-pocket > 0)
6. "Send me my care plan" button (triggers print + plan-viewed event)
7. Booking CTA at bottom

**Print CSS:** small cleanup pass to drop now-unused selectors. Resulting PDF is noticeably shorter.

## Section 6 — Lead capture + Hubspot auto-email

**New flow:**

- **Step 1 → Continue** fires the Hubspot Forms API submission immediately. Lead captured even if user bails on Step 2/3.
- **Results page → "Send me my care plan"** no longer collects fields. Triggers `window.print()` + a second Hubspot event (`benefits_tool_plan_viewed`) for workflow branching.

**Hubspot Step 1 payload:**

```
firstname, lastname, email, phone,
ap_due_date, ap_is_postpartum,
ap_first_time_parent, ap_concerns
```

**Hubspot results-page payload** (enrichment submission on results-page view):

```
ap_insurer, ap_has_hsa, ap_hsa_balance,
ap_coverage_<service>_<field>  (per service)
```

**Hubspot workflow** (configured in Hubspot UI, not in tool):

- **Trigger:** Form submission on the benefits-tool form
- **Action:** Send marketing email "Your Alma Care Benefits Plan"
- **Email body:** Thank-you intro → "Your personalized plan is ready" → primary CTA "Review my plan + book a consultation" → secondary "Reply with questions"

The email is a nudge back to the page + toward booking. The tool does not render the plan into the email.

**Pre-launch:** fill `HUBSPOT.portalId` and `HUBSPOT.formId` in `preview.html`; build the workflow + email template in Hubspot.

## Section 7 — Care Plan vs. Estimate clarifier

Two distinct documents, two distinct moments:

| | **Care Plan** (tool) | **Estimate** (post-consultation) |
|---|---|---|
| When | Immediately after Step 3 | After consultation |
| Who creates it | Tool, automated | You, manually |
| Purpose | Educate + qualify lead | Insurer submission + booking |
| Contents | Coverage at a glance, priority supports, next steps | Named providers, visit schedule, hourly rate, tax, total |
| Specifics | Service categories, eligible $ | Specific providers, dates, hours |

**Tool-side change:** add this paragraph directly under the results-page H1:

> This care plan outlines eligible coverage pathways and recommended postpartum supports. After your complimentary consultation, we'll prepare a tailored estimate with specific care providers, hours, and costs — ready to submit to your insurer.

H1 unchanged: "Your Personalized Care Plan". Button label unchanged: "Send me my care plan". The `*` footnote in Section 4 routes users to the consultation, which is where the real estimate happens.

No estimate-format work in this tool. The estimate (line-item visits × hours × rate, named providers, tax/total) stays a manual workflow.

## Files affected

- `pages/benefits/preview.html` — primary changes (form markup, results-page markup, copy, validation)
- `pages/benefits/src/engine.js` — delete `allocateFunding`, `buildFundingStrategy`; simplify `computeResults` return shape
- `pages/benefits/src/rules.js` — no logical changes; `dosing.window` retained
- `pages/benefits/test/engine.test.js` — update assertions to drop removed fields, add tests for new eligible-amount math
- `pages/benefits/build-webflow.mjs` — no changes; runs as today
- `pages/benefits/page.json` — no changes

## Out of scope

- Estimate generation (stays manual).
- Custom serverless email infrastructure (Hubspot workflow handles the email).
- Insurer-specific coverage defaults (empty defaults for Maven/Carrot/Forma).
- Per-service pre-assessment language differentiation (single unified footnote).
