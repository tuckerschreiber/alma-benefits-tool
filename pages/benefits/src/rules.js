// DRAFT v1 — Awaiting Alma clinical sign-off (see docs/clinical/benefits-tool-rule-matrix-DRAFT.md)
export const ALMA_SERVICES = [
  'massage_therapy', 'acupuncture', 'lactation_consulting',
  'postpartum_doula_care', 'registered_nursing', 'psw',
  'mental_health', 'nutritionist', 'dietician'
];

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
    rationale: 'A few in-home nursing visits in the first two weeks catch feeding, healing, and newborn questions before they escalate.',
    priority: 'medium'
  }
];
