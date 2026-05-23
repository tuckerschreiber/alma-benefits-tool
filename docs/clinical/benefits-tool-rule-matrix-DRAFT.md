# Benefits Eligibility Tool — Clinical Rule Matrix (DRAFT v1)

> **Status:** Draft — awaiting clinical sign-off
> **For:** Alma's clinical lead
> **Date:** 2026-05-10
> **Owner:** Tucker

## What this document is

This is the clinical logic powering the Benefits Eligibility Tool at almacare.ca/benefits. The tool asks expecting and postpartum families about their benefits and personal context, then recommends a postpartum care plan.

The recommendations are rule-based — not AI. Every line of output traces back to one of the rules below. Your sign-off here means: "If a user matches this scenario, Alma is comfortable recommending this care."

Please redline directly in this doc. Common edits we expect:

- Change recommended dosing (sessions, hours, weeks)
- Adjust trigger conditions (e.g., "lactation support starts at week 1, not week 2")
- Reword the rationale to match Alma's voice
- Add or remove rules

## How matching works

For every user who completes the intake, we run their inputs through this matrix. A rule "fires" when:

- The service is in their insurance coverage (we don't recommend things they can't pay for) AND
- All conditions in the rule's "When this applies" section are met

If multiple rules fire, all are included. They're sorted by clinical priority (high > medium > low). Concern-based rules (Section 2) are appended after.

A few notes on inputs we collect:

- **Due date** or **weeks postpartum** (one or the other — if a due date is in the past, we automatically flip the user to postpartum mode)
- **First-time parent?** (yes/no)
- **Insurance coverage** (per-service dollar amounts and reimbursement %)
- **HSA balance** (optional)
- **Free-text concerns** (the optional "anything we should know?" box — see Section 2)

---

## Section 1 — Service rules

These ten rules cover Alma's nine offered services across prenatal and postpartum windows. Six rules apply during pregnancy, four apply to families who are already postpartum at the time of intake.

### Rule 1 — Lactation consulting (prenatal lead-up, first-time parents)

- **When this applies:**
  - User is prenatal (not yet given birth)
  - Due in 8 weeks or fewer
  - First-time parent
- **Recommended dosing:** 2 sessions, in the first 2 weeks postpartum
- **Estimated cost:** $150/session ($300 total)
- **Priority:** High
- **Rationale (current draft):** First-time parents benefit most from early lactation support — small adjustments in the first 10 days prevent most feeding issues.
- **Clinical reviewer note:** _____

### Rule 2 — Postpartum doula care (prenatal lead-up)

- **When this applies:**
  - User is prenatal
  - Due in 12 weeks or fewer
- **Recommended dosing:** 4 sessions, weeks 1–4 postpartum
- **Estimated cost:** $180/session ($720 total)
- **Priority:** High
- **Rationale (current draft):** Doula care eases the transition home — practical support, recovery guidance, and a calmer first month.
- **Clinical reviewer note:** _____

### Rule 3 — Massage therapy (universal)

- **When this applies:**
  - No specific conditions — fires whenever massage therapy is in the user's coverage
- **Recommended dosing:** 4 sessions, spread across 8 weeks postpartum
- **Estimated cost:** $120/session ($480 total)
- **Priority:** Medium
- **Rationale (current draft):** Postpartum massage helps with muscle recovery, stress reduction, and circulation in the early weeks.
- **Clinical reviewer note:** _____

### Rule 4 — Mental health support (prenatal lead-up, first-time parents)

- **When this applies:**
  - User is prenatal
  - Due in 16 weeks or fewer
  - First-time parent
- **Recommended dosing:** 3 sessions, in the first 12 weeks postpartum
- **Estimated cost:** $200/session ($600 total)
- **Priority:** Medium
- **Rationale (current draft):** Postpartum mood shifts affect 1 in 5 parents. A few sessions of preventative therapy keep small things from becoming bigger ones.
- **Clinical reviewer note:** _____

### Rule 5 — Acupuncture (universal)

- **When this applies:**
  - No specific conditions — fires whenever acupuncture is in the user's coverage
- **Recommended dosing:** 3 sessions, late pregnancy + early postpartum
- **Estimated cost:** $110/session ($330 total)
- **Priority:** Low
- **Rationale (current draft):** Acupuncture supports labor preparation and early postpartum recovery — particularly for sleep and mood.
- **Clinical reviewer note:** _____

### Rule 6 — Registered nursing (prenatal lead-up, near term)

- **When this applies:**
  - User is prenatal
  - Due in 4 weeks or fewer
- **Recommended dosing:** 2 sessions, in the first 2 weeks postpartum
- **Estimated cost:** $220/session ($440 total)
- **Priority:** Medium
- **Rationale (current draft):** A few in-home nursing visits in the first two weeks catch feeding, healing, and newborn questions before they escalate.
- **Clinical reviewer note:** _____

### Rule 7 — Registered nursing (already postpartum, first 2 weeks)

- **When this applies:**
  - User is already postpartum
  - 2 weeks or fewer since birth
- **Recommended dosing:** 2 sessions, in the first 2 weeks postpartum
- **Estimated cost:** $220/session ($440 total)
- **Priority:** High
- **Rationale (current draft):** In-home nursing visits in the first two weeks help with feeding, healing, and newborn questions before they escalate.
- **Clinical reviewer note:** _____

### Rule 8 — Postpartum doula care (already postpartum, first 6 weeks)

- **When this applies:**
  - User is already postpartum
  - 6 weeks or fewer since birth
- **Recommended dosing:** 4 sessions, weeks 1–6 postpartum
- **Estimated cost:** $180/session ($720 total)
- **Priority:** High
- **Rationale (current draft):** Doula support eases the transition home — practical help, recovery guidance, and a calmer first month.
- **Clinical reviewer note:** _____

### Rule 9 — Lactation consulting (already postpartum, first-time parents, first 4 weeks)

- **When this applies:**
  - User is already postpartum
  - 4 weeks or fewer since birth
  - First-time parent
- **Recommended dosing:** 2 sessions, in the first 4 weeks postpartum
- **Estimated cost:** $150/session ($300 total)
- **Priority:** High
- **Rationale (current draft):** Lactation challenges often surface in the first 2 weeks. A couple of focused sessions resolve most issues quickly.
- **Clinical reviewer note:** _____

### Rule 10 — Mental health support (already postpartum, first 12 weeks)

- **When this applies:**
  - User is already postpartum
  - 12 weeks or fewer since birth
- **Recommended dosing:** 4 sessions, in the first 12 weeks postpartum
- **Estimated cost:** $200/session ($800 total)
- **Priority:** Medium
- **Rationale (current draft):** Postpartum mood shifts affect 1 in 5 parents. A few sessions of preventative therapy keep small things from becoming bigger ones.
- **Clinical reviewer note:** _____

> **Note on services not represented in Section 1:** Alma offers nine services in total. Three are not currently triggered by any rule in this section: **personal support worker (PSW)**, **nutritionist**, and **dietician**. They are listed in coverage but never recommended. See Open Clinical Questions for whether this is intentional.

---

## Section 2 — Concern keyword detection

When the user types into the optional "Anything we should know?" textarea, we scan the text (case-insensitive) for keywords. If a known concern is detected AND the user has coverage for the matched service AND that service isn't already in their plan, we add a high-priority recommendation with a soft callout.

If a concern is detected but the user has no coverage for the matched service, the recommendation is **not** added — we don't recommend something they can't access. (The empathetic snapshot copy still appears.)

### Concern 1 — Postpartum depression / mood (PPD)

- **Triggered by keywords:** ppd, depression, postpartum depression, mood, anxious, anxiety
- **Service recommended:** Mental health support
- **Recommended dosing:** 4 sessions, in the first 12 weeks postpartum
- **Estimated cost:** $200/session ($800 total)
- **Priority:** High
- **Rationale (current draft):** Based on what you shared, we'd especially encourage early mental health support — addressing mood shifts proactively makes a real difference.
- **Soft callout shown to user:** "Based on what you shared, we'd especially encourage this."
- **Clinical reviewer note:** _____

### Concern 2 — High blood pressure / preeclampsia history (HBP)

- **Triggered by keywords:** blood pressure, preeclampsia, hypertension
- **Service recommended:** Registered nursing
- **Recommended dosing:** 3 sessions, in the first 3 weeks postpartum
- **Estimated cost:** $220/session ($660 total)
- **Priority:** High
- **Rationale (current draft):** With elevated blood pressure history, in-home nursing checks add an extra layer of monitoring during recovery.
- **Soft callout shown to user:** "Based on what you shared, we'd especially encourage this."
- **Clinical reviewer note:** _____

### Concern 3 — C-section recovery

- **Triggered by keywords:** c-section, csection, cesarean, caesarean
- **Service recommended:** Massage therapy
- **Recommended dosing:** 4 sessions, weeks 6–10 postpartum
- **Estimated cost:** $120/session ($480 total)
- **Priority:** High
- **Rationale (current draft):** C-section recovery benefits from gentle massage starting around week 6 — once your incision has healed.
- **Soft callout shown to user:** "Based on what you shared, we'd especially encourage this."
- **Clinical reviewer note:** _____

### Concern 4 — Twins / multiples

- **Triggered by keywords:** twins, twin pregnancy, twin babies, multiples
- **Service recommended:** Postpartum doula care
- **Recommended dosing:** 6 sessions, weeks 1–8 postpartum
- **Estimated cost:** $180/session ($1,080 total)
- **Priority:** High
- **Rationale (current draft):** Twins double the workload. Extra doula hours in the early weeks make all the difference.
- **Soft callout shown to user:** "Based on what you shared, we'd especially encourage this."
- **Clinical reviewer note:** _____

### Concern 5 — NICU stay / premature birth

- **Triggered by keywords:** nicu, preemie, premature
- **Service recommended:** Lactation consulting
- **Recommended dosing:** 3 sessions, first 4 weeks home
- **Estimated cost:** $150/session ($450 total)
- **Priority:** High
- **Rationale (current draft):** NICU stays often complicate feeding — focused lactation support helps re-establish or transition to direct feeding.
- **Soft callout shown to user:** "Based on what you shared, we'd especially encourage this."
- **Clinical reviewer note:** _____

### Concern 6 — Advanced maternal age (AMA, 35+)

- **Triggered by keywords:** advanced maternal age, "ama " (with trailing space), over 35, 35+
- **Service recommended:** Registered nursing
- **Recommended dosing:** 2 sessions, in the first 2 weeks postpartum
- **Estimated cost:** $220/session ($440 total)
- **Priority:** High
- **Rationale (current draft):** Postpartum recovery for parents over 35 benefits from extra clinical follow-up in the first weeks.
- **Soft callout shown to user:** "Based on what you shared, we'd especially encourage this."
- **Clinical reviewer note:** _____

### Concern 7 — Previous pregnancy loss

- **Triggered by keywords:** miscarriage, stillbirth, previous loss, pregnancy loss
- **Service recommended:** Mental health support
- **Recommended dosing:** 4 sessions, spread across pregnancy and first 12 weeks postpartum
- **Estimated cost:** $200/session ($800 total)
- **Priority:** High
- **Rationale (current draft):** Pregnancy after loss carries unique emotional weight. Mental health support is a powerful protective tool.
- **Soft callout shown to user:** "Based on what you shared, we'd especially encourage this."
- **Clinical reviewer note:** _____

---

## Section 3 — Edge cases

- **Zero coverage** (user has no extended benefits and no HSA): The tool shows empathetic copy ("Most of your care will be out-of-pocket — here's how to plan smartly") and recommends adding Alma gift cards to the registry. No service-specific recommendations fire because no service is "covered."
- **Already postpartum**: Prenatal-only rules skip; postpartum rules fire based on weeks-since-birth. If the user enters a due date that's already passed, we automatically convert them to postpartum mode using the number of weeks past due.
- **No services covered, but user enters concerns**: Concerns inject **only** if the user has coverage for the relevant service. So a "PPD history" concern with no mental health coverage produces no mental health recommendation — the user only sees the empathetic snapshot copy. (This is a deliberate choice — we never want to recommend care a family can't pay for through their plan.)
- **Concern duplicates an existing recommendation**: If a service is already recommended by a Section 1 rule, the matching concern won't add a duplicate. The existing recommendation stays in place; the concern is logged but doesn't change the plan.
- **Free-text matching is literal substring**: Keywords match anywhere in the text, case-insensitive. So "I'm feeling anxious about the birth" triggers the PPD concern via the "anxious" keyword. There's no semantic understanding — only literal keyword presence.

---

## Section 4 — Open clinical questions

These are areas where Tucker built v1 based on general postpartum care norms but specifically wants your input before launch.

1. **Doula visit cadence (Rules 2 and 8).** v1 recommends 4 sessions across the first 4–6 weeks. Is 4 the right number for first-time parents? Should it scale with first-time vs. experienced? Should "session" map to a specific number of hours (e.g. 4-hour visits)?
2. **Acupuncture as a "universal" recommendation (Rule 5).** Currently fires whenever acupuncture is in coverage, regardless of timing or context. Is that appropriate, or should we narrow to specific windows (e.g., last trimester only) or specific indications (sleep, mood, breech presentation)?
3. **Massage therapy as a "universal" recommendation (Rule 3).** Same question — currently fires whenever massage is covered. Is week 1 too early for general postpartum massage, given that the C-section concern explicitly waits until week 6?
4. **C-section start window (Concern 3).** v1 recommends massage starting week 6. Does this vary by individual recovery, complications, or surgical technique? Should we add a softer caveat ("once cleared by your provider")?
5. **AMA → registered nursing (Concern 6).** Is in-home nursing the right service to recommend for parents over 35, or is this overmedicalizing a normal pregnancy? Would a different service (e.g., extended doula, mental health) be more clinically warranted?
6. **The 12-week ceiling.** No rule fires beyond 12 weeks postpartum. Should we extend recommendations into the 4th trimester for any service (e.g., pelvic floor, ongoing mental health)? Or do you want us to keep a hard 12-week cap for v1?
7. **Services that never fire.** PSW, nutritionist, and dietician are offered services but no rule recommends them. Should we add rules (e.g., dietician for gestational diabetes history, PSW for parents recovering from significant complications)? Or are these intentionally on-request only?
8. **Mental health restricted to first-time parents (Rule 4).** The prenatal mental health rule only fires for first-time parents. Experienced parents can still get a mental health rec via concerns or via the postpartum-specific rule (Rule 10), but the prenatal universal rule excludes them. Intentional, or should we widen?
9. **Concern keyword sensitivity.** The PPD keyword list includes generic words like "mood" and "anxious." Are we comfortable with the false-positive risk (e.g., "I'm anxious about the hospital bag" triggers a mental health rec)? Or should we tighten to clinical phrasing only?
10. **Concern dosing vs. base-rule dosing.** A concern recommendation fires at the concern's dosing level (e.g., PPD = 4 sessions). If the matching base rule would have fired with different dosing (e.g., Rule 4 = 3 sessions), we currently don't combine — the concern wins or the base rule wins, never both. Is the concern dosing always the right "max" to land on?

## Sign-off

- [ ] Clinical lead reviewed and approved (date, name): _____
- [ ] All redlines applied in `pages/benefits/src/rules.js` and `src/engine.js`
- [ ] Tests updated to match
