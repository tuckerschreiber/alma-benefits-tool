// DRAFT v1 — Awaiting Alma clinical sign-off (see docs/clinical/benefits-tool-rule-matrix-DRAFT.md)
export const ALMA_SERVICES = [
  'massage_therapy', 'acupuncture', 'lactation_consulting',
  'postpartum_doula_care', 'registered_nursing', 'psw',
  'mental_health', 'nutritionist'
];

// Alma's hourly rate for in-home overnight postpartum support.
// Used by src/pdf.js to compute the visit table from the eligible $ amount.
export const ALMA_OVERNIGHT_HOURLY_RATE = 48;

export const RULES = [
  {
    service: 'lactation_consulting',
    appliesWhen: { weeksUntilDueMax: 8, firstTimeParent: true },
    dosing: { sessions: 2, estimatedSessionCost: 150, window: 'first 2 weeks postpartum' },
    rationale: 'First-time parents benefit most from early lactation support — small adjustments in the first 10 days prevent most feeding issues.',
    priority: 'high'
  },
  {
    service: 'postpartum_doula_care',
    appliesWhen: { weeksUntilDueMax: 12 },
    dosing: { sessions: 4, estimatedSessionCost: 180, window: 'weeks 1–4 postpartum' },
    rationale: 'Doula care eases the transition home — practical support, recovery guidance, and a calmer first month.',
    priority: 'high'
  },
  {
    service: 'massage_therapy',
    appliesWhen: {},
    dosing: { sessions: 4, estimatedSessionCost: 120, window: 'spread across 8 weeks postpartum' },
    rationale: 'Postpartum massage helps with muscle recovery, stress reduction, and circulation in the early weeks.',
    priority: 'medium'
  },
  {
    service: 'mental_health',
    appliesWhen: { firstTimeParent: true, weeksUntilDueMax: 16 },
    dosing: { sessions: 3, estimatedSessionCost: 200, window: 'first 12 weeks postpartum' },
    rationale: 'Postpartum mood shifts affect 1 in 5 parents. A few sessions of preventative therapy keep small things from becoming bigger ones.',
    priority: 'medium'
  },
  {
    service: 'acupuncture',
    appliesWhen: {},
    dosing: { sessions: 3, estimatedSessionCost: 110, window: 'late pregnancy + early postpartum' },
    rationale: 'Acupuncture supports labor preparation and early postpartum recovery — particularly for sleep and mood.',
    priority: 'low'
  },
  {
    service: 'registered_nursing',
    appliesWhen: { weeksUntilDueMax: 4 },
    dosing: { sessions: 2, estimatedSessionCost: 220, window: 'first 2 weeks postpartum' },
    rationale: 'Overnight in-home support in the first two weeks helps with sleep, feeding routines, and a smoother transition home.',
    priority: 'medium'
  },
  // ----- Postpartum-specific rules (apply when user is already postpartum) -----
  {
    service: 'registered_nursing',
    appliesWhen: { isPostpartum: true, weeksPostpartumMax: 2 },
    dosing: { sessions: 2, estimatedSessionCost: 220, window: 'first 2 weeks postpartum' },
    rationale: 'Overnight in-home support in the first two weeks helps with sleep, feeding routines, and a smoother transition home.',
    priority: 'high'
  },
  {
    service: 'postpartum_doula_care',
    appliesWhen: { isPostpartum: true, weeksPostpartumMax: 6 },
    dosing: { sessions: 4, estimatedSessionCost: 180, window: 'weeks 1–6 postpartum' },
    rationale: 'Doula support eases the transition home — practical help, recovery guidance, and a calmer first month.',
    priority: 'high'
  },
  {
    service: 'lactation_consulting',
    appliesWhen: { isPostpartum: true, weeksPostpartumMax: 4, firstTimeParent: true },
    dosing: { sessions: 2, estimatedSessionCost: 150, window: 'first 4 weeks postpartum' },
    rationale: 'Lactation challenges often surface in the first 2 weeks. A couple of focused sessions resolve most issues quickly.',
    priority: 'high'
  },
  {
    service: 'mental_health',
    appliesWhen: { isPostpartum: true, weeksPostpartumMax: 12 },
    dosing: { sessions: 4, estimatedSessionCost: 200, window: 'first 12 weeks postpartum' },
    rationale: 'Postpartum mood shifts affect 1 in 5 parents. A few sessions of preventative therapy keep small things from becoming bigger ones.',
    priority: 'medium'
  }
];
