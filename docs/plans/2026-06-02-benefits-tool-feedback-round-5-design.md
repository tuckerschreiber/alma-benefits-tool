# Benefits Tool — Round 5 Feedback Design

**Date:** 2026-06-02
**Source:** live call with Melissa + Karla on 2026-06-01; notes captured by Tucker
**Baseline:** `origin/main` at `bc91103` — multi-pathway RN + PSW PDF, formatNightsLine sub-lines, "Concierge-led holistic plan" clarifier copy already shipped (round 4).

## Why round 5 not round 4

The previous round (2026-05-26) added the PSW pathway, the multi-pathway PDF, the nights-of-care sub-lines, and the new clarifier copy. That was already live when Karla and Melissa gave their feedback on 2026-06-01. So the feedback is reactions to *that* live state, not the pre-round-4 baseline. This pass = round 5.

## Items to land

1. **"Highest priority postpartum supports" feels incomplete.** Only the rule-matched services show up as cards. Other eligible services from the user's coverage are silently dropped. Add an "Also covered by your plan" footer line under the recommendations so the user sees the full picture.

2. **Private Duty Nursing appears twice (high + medium).** The round-3 stage-gating fix is already in place at `engine.js:178–209`. Adding regression tests so a future change can't re-introduce the bug.

3. **Pre-approval footnote wording.** Current: *"Pre-assessment approval may be required and varies by insurer."* Replace with *"Some insurers require pre-determination before approving coverage."* — closer to industry language and matches the PDF's "pre-determination" framing.

4. **Replace "Book a consultation" with "Email concierge@almacare.ca".** Karla's team handles estimates by email, not by booking a call. Apply across:
   - Recommendations-card asterisk footnote
   - Final-CTA section
   - "What Happens Next" first step
   - Post-download success + error states

5. **Coverage Estimate PDF — reshape to match Karla's real estimate.** Today's PDF is a 4-column RN+PSW pathway table. Target structure mirrors `Downloads/[Estimate] Alma Care - Radhika Kapoor.pdf`:
   - Date + bold "ESTIMATE" label
   - Two-column header (Alma contact | Service Recipient)
   - "Description of Services" narrative, branched on prenatal vs. postpartum
   - 5 supportive bullets — practical, no clinical language
   - Service line: "In-Home Postpartum Support"
   - Visit table: one row per overnight shift @ 10 hrs × $48/hr = $480/visit
   - Subtotal / Tax (13% HST) / Total
   - Footer pointing to concierge@almacare.ca

   **Single pathway in the PDF.** Karla's real estimate is single-pathway. We sum `nursing.eligibleAmount + psw.eligibleAmount` upstream and feed it as one "In-Home Postpartum Support" pathway. PSW vs. RN remains a separate concept in the engine and the snapshot, but in the PDF it's one service.

6. **Remove "Continue Assessment" button + "Book a consultation" button on results page.** No further intake steps exist; concierge email replaces the consult CTA. Hide the wizard nav entirely when on results.

7. **Rename "Private Duty Nursing" → "In-Home Postpartum Support".** And rewrite the registered_nursing rule rationales + the `hbp` / `ama` concern rationales in `engine.js` to drop clinical framing (no "nursing visits", "monitoring", "clinical follow-up"). Tucker on the call: *"we don't want it to be a medical service."*

8. **Set $48/hr.** Karla's real estimate uses $48 overnight / $43 daytime. Production rate is $50 (placeholder during round 4). Switch to $48 to match Karla's actuals. Daytime support stays out of scope this round (clients email concierge to customize). PSW rate also goes to $48 since the PDF unifies the pathway label.

## Decisions (committed, not open questions)

- Service rename: `registered_nursing` displays as **"In-Home Postpartum Support"**. Service ID stays `registered_nursing` internally.
- PSW stays a separate engine concept + recommendation card (already shipped behavior). Only the PDF unifies them.
- PSW remains called "Personal Support Worker (PSW)" in the UI — Tucker's "no medical language" feedback was specifically about RN/nursing framing.
- Hourly rate: **$48** (`ALMA_RN_HOURLY_RATE` and `ALMA_PSW_HOURLY_RATE` both set to 48). Daytime rates not configured this round.
- PDF audience: client-facing. No specific provider name (no "Sejal Intwala / RNAO #21427859" placeholder); use a generic care-role line.
- HST 13% (Ontario) on the PDF subtotal.

## Build/deploy plan

Five focused commits:
- `C1` docs: round-5 design
- `C2` feat(engine): alsoCovered + service rename + non-medical rationales + regression tests
- `C3` feat(pdf): reshape estimate to Karla's format (single pathway, overnight-only, HST)
- `C4` feat(ui): hide wizard nav on results, drop consult CTAs, switch to concierge email
- `C5` build: regenerate webflow artifacts; bump cache-bust to 20260602

Then push `origin main`, purge jsDelivr, **Tucker** re-pastes head + body in Webflow.
