# Alma Care — Benefits Eligibility Tool

## Overview

A web-based intake tool that helps expecting and postpartum families understand what's covered under their extended health benefits, recommends a postpartum care plan, and produces a branded PDF estimate they can send to insurance for pre-approval.

Lives on `almacare.ca/benefits` (final slug TBD), built into the existing Webflow site via the local-HTML → Embed workflow. Hero CTA is "Book a free consult" — PDF estimate and direct service booking are secondary paths.

## Goals

- Make benefits feel simple and usable
- Connect coverage → actual care
- Drive booked consults
- Reinforce "Alma knows what they're doing"

## Non-goals (v1)

- Real-time eligibility lookups against insurance carriers (user self-reports coverage)
- AI-generated recommendations (rule-based engine — see Recommendation Engine section)
- Stored database of submissions (Hubspot is the system of record)
- Account creation / login

## Stack

- **Frontend:** Single HTML file with scoped CSS (`ap-` prefix) and vanilla JS, embedded in Webflow via the standard `pages/<slug>/{preview.html, webflow-head.html, webflow-body.html, page.json}` pattern
- **PDF:** `html2pdf.js` (client-side, browser download)
- **Lead capture:** Hubspot Forms Submission API (public endpoint, no secret key — just `portalId` + `formId` in a config block)
- **Booking:** Existing Alma booking flow (Calendly/Cal.com), with name + email passed as URL params
- **Analytics:** Whatever almacare.ca already runs (Plausible/GA), with custom events on key steps

**Running costs:** $0 incremental (everything runs in the browser; Hubspot is already paid).

## Architecture

Pure client-side. State lives in a single JS object in memory + `sessionStorage` for partial-intake recovery. No backend, no framework.

```
intake (3 steps) → state object → rule engine → recommendation object →
results render → CTA click → lead capture → PDF gen + Hubspot POST
```

Why no framework: the whole tool is one wizard with branching logic and a results renderer. React would add ~50KB of overhead for ~600 lines of actual logic. Vanilla keeps it fast, embeddable, and matches existing Webflow page patterns.

## User Flow

### Step 1 — Tell us about you

- Due date (date picker) with toggle "Already postpartum" → switches to "How many weeks ago?"
- First-time parent? (yes / no)
- Optional textarea: "Anything we should know about your pregnancy or postpartum?" (placeholder shows examples — PPD, advanced maternal age, twins, C-section recovery)

### Step 2 — Your insurance coverage

- Insurance provider — dropdown of common Canadian insurers (Sun Life, Manulife, Canada Life, GreenShield, Equitable, Desjardins, Other). Metadata only — does not drive logic.
- HSA/LSA — yes / no / not sure (with tooltip)
- HSA/LSA balance ($) if yes

### Step 3 — What's covered

Grid of 9 service cards (massage, acupuncture, lactation, doula, RN, PSW, mental health, nutritionist, dietician). Checking a card expands it inline to reveal:
- Annual amount ($)
- Per-visit cap (optional)
- Reimbursement % (optional, default 100%)

"I'm not sure what's covered" link → modal explaining how to find this in their benefits booklet.

### Step 4 — Results (no email gate)

Three stacked panels:

**A. Coverage snapshot**
- Two columns: "What's covered" (green checks + dollar amounts) vs. "What's not covered" (muted)
- HSA/LSA shown as a flexible-pool callout if present
- Hero stat: total covered value (e.g. *"$2,400 in benefits to use"*)

**B. Recommended care plan**
- One card per recommended service
- Each card: service name + icon, recommended dosing (e.g. *"4 sessions of pelvic floor PT, weeks 6–10"*), one-sentence clinical rationale in Alma's voice, cost breakdown (covered vs. HSA vs. out-of-pocket)
- Cards rank-ordered by clinical priority for that user, not by what's cheapest

**C. Funding strategy**
- Plain-English bullets: *"Use your massage benefits first — they expire annually."* / *"Cover doula care with your $1,200 HSA."* / *"~$340 out-of-pocket — consider adding Alma gift cards to your registry."*

### Step 5 — Lead capture (inline drawer below results)

Two CTAs side-by-side on the results page:
- **Primary (hero):** "Book a free consult" — links to existing booking flow with name/email prefill
- **Secondary:** "Email me my care plan" — opens inline drawer

Drawer fields: name, email, address (for PDF letterhead). Concerns textarea pre-filled from Step 1; user can edit. Single button: "Send me my care plan." Privacy line beneath.

On submit:
1. Generate PDF client-side via `html2pdf.js` from the styled results section, with letterhead (Alma logo, recipient name, date) and footer (disclaimer + booking link)
2. Trigger browser download immediately
3. POST to Hubspot Forms API with all fields as custom properties
4. Hubspot workflow handles Slack/email to Alma's care team and nurture sequence

## Recommendation Engine

Rule-based, deterministic. Each rule is a JSON entry. ~30–50 rules covering combinations of weeks-out, first-time parent, and listed concerns.

**Pipeline:**

```
inputs → normalize → eligibility filter (services Alma offers ∩ services user covers)
       → apply clinical rule set (per service: when, how many, why)
       → allocate funding (covered $ first, then HSA, then out-of-pocket)
       → render output
```

**Rule shape (example):**

```json
{
  "service": "lactation_consulting",
  "applies_when": { "weeks_until_due_max": 6, "first_time_parent": true },
  "dosing": { "sessions": 2, "window": "first 2 weeks postpartum" },
  "rationale": "First-time parents benefit most from early lactation support — small adjustments in the first 10 days prevent most feeding issues.",
  "priority": "high"
}
```

**Concerns flagging:** keyword watchlist (PPD, depression, blood pressure, C-section, twins, NICU, advanced maternal age, loss). Match injects a relevant service (mental health, RN visits, lactation extra) and adds a soft callout: *"Based on what you shared, we'd especially encourage…"* Concerns text always passes verbatim to Hubspot for the care team.

**Authoring:** Tucker drafts the rule matrix + microcopy based on postpartum care norms. **Alma's clinical lead must redline and sign off before launch** — recommendations are the brand promise. Non-negotiable.

## Hubspot Integration

Public Forms Submission API — no secret key required:

```
POST https://api.hsforms.com/submissions/v3/integrations/submit/{portalId}/{formId}
```

**Custom contact properties to create in Hubspot:**

- `due_date` (date)
- `weeks_until_due` (number)
- `is_postpartum` (bool)
- `first_time_parent` (bool)
- `insurer` (dropdown)
- `has_hsa` (bool)
- `hsa_balance` (number)
- `services_covered` (multi-select — one per service)
- `total_coverage_value` (number)
- `concerns_text` (multi-line text)
- `recommended_services` (multi-line text — for care team prep)
- `recommended_total_cost` (number)

Hubspot workflow (configured by Tucker on Hubspot side) handles notification + nurture.

## Edge Cases

- **Zero coverage** — user has no benefits or HSA. Output snapshot stays empathetic ("Most of your care will be out-of-pocket — here's how to plan smartly"), funding strategy leans on registry/gift cards/sliding scale.
- **Already postpartum** — flow rewinds: "weeks since birth" instead of due date. Recommendations shift (no antenatal services, more recovery-focused).
- **Partial intake** — state persists in `sessionStorage` so reload restores. Cleared on browser close (no PII risk).

## Error States

- Hubspot submission fails → inline error, "Couldn't submit — please try again or email care@almacare.ca." PDF still downloads.
- PDF generation fails (rare) → fall back to "We'll email it to you" via Hubspot workflow.

## Analytics

Custom events on: `intake_step_completed` (1, 2, 3), `results_viewed`, `pdf_downloaded`, `consult_cta_clicked`, `submission_succeeded`, `submission_failed`. Used to find drop-off points and tune copy.

## Brand & UX

- Cream `#FFFAF4` background, dark green `#032215` text, accent green `#156146` for buttons/checks, warm tan `#F4E9DD` for secondary cards
- Futura font (500 headings, 400 body)
- Generous whitespace, no decorative elements, clinical calm
- Mobile-first single column, big tap targets, native date pickers
- All CSS classes prefixed `ap-` to avoid Webflow conflicts

## Success Criteria

- [ ] Intake completable in <3 min on mobile
- [ ] Results render in <500ms (no spinner)
- [ ] Recommendations sound like Alma, not an algorithm
- [ ] Hero CTA is consult booking; PDF + direct service booking are secondary
- [ ] Hubspot contact created with all custom properties on submit
- [ ] Alma's clinical lead has signed off on the rule matrix before launch

## Deliverables

1. Design (this doc) — committed
2. Rule matrix (separate doc, drafted by Tucker, reviewed by Alma clinical lead)
3. Working tool — `pages/benefits/{preview.html, webflow-head.html, webflow-body.html, page.json}`
4. Hubspot custom properties + form configured
5. Mobile + desktop tested across browsers

## Out of scope (future)

- Real-time eligibility API integrations with carriers
- AI-generated rationale paragraphs (surgical add-on once we see what users actually write)
- Saved sessions across devices (would require auth + DB)
- Multi-language (English-only v1)
