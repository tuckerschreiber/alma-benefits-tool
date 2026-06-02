# Benefits Tool — Round 4 Feedback Design

**Date:** 2026-06-02
**Source:** live call with Melissa + Karla; notes captured by Tucker
**Status:** approved by Tucker (full autonomy mode — design choices in this doc are committed)

## Goal

Get the benefits tool ready to ship publicly. Tucker's framing from the call: *"the goal is to just get the link up and running."* This round closes the remaining UX rough edges and reshapes the Coverage Estimate PDF so it looks/reads like the real estimate Karla generates today.

## Items addressed this round

1. **"Highest priority postpartum supports" only lists 2 of 5 eligible services.**
   Solved by the "Also covered by your plan" footer (already implemented on disk, not yet committed). Lists eligible services that did not match a rule, so the user sees the full picture of what their insurance covers without us pretending they're high-priority recommendations.

2. **Private Duty Nursing appears twice (high + medium).**
   Engine code looks deduped (round-3 fix at `engine.js:178–209`). Need to reproduce before fixing. Most likely cause: a UI render path that prints the same service in two places, or a concern-injection dedup miss. Diagnose with a real input scenario, fix the actual culprit.

3. **Pre-approval footnote wording** at the bottom of the results page — minor copy revisit.

4. **Replace "Book a consultation" CTA → "Email concierge@almacare.ca for a tailored estimate."**
   Karla's team handles estimates by email today, not by booking a call. The tool should reflect that workflow.

5. **Coverage Estimate PDF — rebuild to match Karla's real estimate format.** Biggest item. Details below.

6. **Remove "Continue Assessment" button** on results page — no further steps exist.

7. **Remove "Book a consultation" button** on results page — replaced by the concierge email line.

## Decisions (committed, not open questions)

- **Service rename.** `registered_nursing` displays as **"In-Home Postpartum Support"** going forward (was "Private Duty Nursing"). Service ID stays as `registered_nursing` internally — renaming the ID would touch every test fixture, Hubspot field, and rule for no user-facing benefit.
- **No medical/clinical language anywhere user-facing.** No "RN", "Registered Nurse", "RNAO", "nursing", "clinical oversight", "vital signs", "complications". Tone is supportive/practical: sleep, settling baby, parent rest, recovery support, light household tasks during shifts.
- **Hourly rate.** Karla's real estimate uses **$48/hr overnight, $43/hr daytime**. We adopt those exact figures (Tucker's notes said $50/$45 but rounded — match Karla's actuals so the numbers line up if anyone cross-references).
- **PDF scope: overnight-only for now.** The Description and the fee table only mention overnight care. Daytime support deferred — clients can email concierge to customize. Keeps the math simple.
- **PDF audience: client-facing.** No specific provider name. Provider line reads as a generic care role, not a named RN.
- **HST:** 13% (Ontario) baked into the PDF subtotal/tax/total block, matching Karla's.
- **Constant rename.** `ALMA_RN_HOURLY_RATE` → `ALMA_OVERNIGHT_HOURLY_RATE`. Set to `48`. This unhides the Download button on results.

## The PDF — what it looks like

Mirrors Karla's `[Estimate] Alma Care - Radhika Kapoor.pdf` structure, with content rewritten to non-medical language.

1. Alma logo, top center.
2. Today's date.
3. Bold **"ESTIMATE"** label.
4. **Two-column header.** Left: "Alma Care Postnatal" / 280 Bloor St W, Toronto, ON / 647-947-2792 / contact@almacare.ca. Right: client name + street + city + postal code + email + phone (all pulled from Step 1 of the wizard).
5. **Description of Services** — short narrative paragraph. Branches on prenatal vs. postpartum:
   - Postpartum: "The client gave birth on {date} and is currently in the postpartum recovery period. In-home overnight postpartum support is recommended to help with rest, sleep, and a smoother transition through the early weeks."
   - Prenatal: "The client is currently expecting on {date}. In-home overnight postpartum support is recommended in the early weeks after birth to help with rest, sleep, and a smoother transition home."
6. **Anticipated overnight support includes:** — 5 bullets, all practical, no clinical language. Examples:
   - Settling and soothing baby through the night so the parent can rest
   - Diaper changes, feeding support, and burping during overnight hours
   - Light household tasks tied to baby care (bottle washing, laundry, tidying the feeding station)
   - Reassurance and check-ins during night feedings
   - A consistent overnight presence so the parent can recover and reset
7. **Closing sentence.** "In-home overnight support is focused on helping the parent rest, recover, and feel supported through the early weeks at home."
8. **Provider line.** Generic: "In-home Postpartum Support — provider assigned at booking through Alma Care concierge."
9. **Preliminary Care Plan & Fee Structure** — table with columns: Visit | Shift Type | Total Hours | Hourly Rate | Cost per visit | Price.
   - All rows: Overnight, 10 hours, $48/hr, $480/visit.
   - Number of rows = `floor(eligibleRN / 480)` where `eligibleRN = computeEligibleAmounts.registered_nursing`.
   - Single "Price" cell on the right shows the running subtotal (matches Karla's layout).
10. **Subtotal / Tax (13%) / Total Cost of Care Visits** at table footer.
11. **Footer note.** "This is a preliminary estimate. To customize hours, mix overnight and daytime support, or confirm provider assignment, email concierge@almacare.ca."

## Build/deploy plan

Commit by tier so the history is reviewable:

- **C1:** `feat(results): "also covered by your plan" footer below recommendations` (already on disk).
- **C2:** `docs: round-4 design`.
- **C3:** `fix(engine|results): PDN-twice` (after reproducing).
- **C4:** `feat(results): remove orphaned CTAs + tighten copy` (Tier 1).
- **C5:** `refactor(naming): rename "Private Duty Nursing" → "In-Home Postpartum Support"`.
- **C6:** `feat(pdf): rebuild estimate to match Karla's format` (largest commit).
- **C7:** `feat(rate): set ALMA_OVERNIGHT_HOURLY_RATE = 48`.
- **C8:** `build: rebuild webflow artifacts; bump cache-bust`.

Then: `git push origin main` → `curl https://purge.jsdelivr.net/...` → Webflow re-paste (head + body) once Tucker is ready.
