// Alma Care Benefits Eligibility Tool — rule engine
// Pure functions only: no DOM, no globals, no I/O. Runs identically in Node and browser.

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

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;

/**
 * Returns true iff `weeksPostpartum` falls inside a dosing.window phrased like
 * "first 3 weeks postpartum" or "first 12 weeks postpartum". Returns false for
 * any other window shape or missing inputs (so unparseable windows rank lower).
 */
function isInWindow(weeksPostpartum, window) {
  if (typeof weeksPostpartum !== 'number' || !window) return false;
  const m = /first\s+(\d+)\s+weeks?/i.exec(window);
  if (!m) return false;
  return weeksPostpartum <= parseInt(m[1], 10);
}

export const CONCERN_KEYWORDS = {
  ppd: ['ppd', 'depression', 'postpartum depression', 'mood', 'anxious', 'anxiety'],
  hbp: ['blood pressure', 'preeclampsia', 'hypertension'],
  csection: ['c-section', 'csection', 'cesarean', 'caesarean'],
  twins: ['twins', 'twin pregnancy', 'twin babies', 'multiples'],
  nicu: ['nicu', 'preemie', 'premature'],
  ama: ['advanced maternal age', 'ama ', 'over 35', '35+'],
  loss: ['miscarriage', 'stillbirth', 'previous loss', 'pregnancy loss']
};

export const CONCERN_TO_SERVICE_RULE = {
  ppd: {
    service: 'mental_health',
    rationale: 'Based on what you shared, we\'d especially encourage early mental health support — addressing mood shifts proactively makes a real difference.',
    dosing: { sessions: 4, estimatedSessionCost: 200, window: 'first 12 weeks postpartum' },
    priority: 'high',
    concernCallout: true
  },
  hbp: {
    service: 'registered_nursing',
    rationale: 'With elevated blood pressure history, in-home nursing checks add an extra layer of monitoring during recovery.',
    dosing: { sessions: 3, estimatedSessionCost: 220, window: 'first 3 weeks postpartum' },
    priority: 'high',
    concernCallout: true
  },
  csection: {
    service: 'massage_therapy',
    rationale: 'C-section recovery benefits from gentle massage starting around week 6 — once your incision has healed.',
    dosing: { sessions: 4, estimatedSessionCost: 120, window: 'weeks 6–10 postpartum' },
    priority: 'high',
    concernCallout: true
  },
  twins: {
    service: 'postpartum_doula_care',
    rationale: 'Twins double the workload. Extra doula hours in the early weeks make all the difference.',
    dosing: { sessions: 6, estimatedSessionCost: 180, window: 'weeks 1–8 postpartum' },
    priority: 'high',
    concernCallout: true
  },
  nicu: {
    service: 'lactation_consulting',
    rationale: 'NICU stays often complicate feeding — focused lactation support helps re-establish or transition to direct feeding.',
    dosing: { sessions: 3, estimatedSessionCost: 150, window: 'first 4 weeks home' },
    priority: 'high',
    concernCallout: true
  },
  ama: {
    service: 'registered_nursing',
    rationale: 'Postpartum recovery for parents over 35 benefits from extra clinical follow-up in the first weeks.',
    dosing: { sessions: 2, estimatedSessionCost: 220, window: 'first 2 weeks postpartum' },
    priority: 'high',
    concernCallout: true
  },
  loss: {
    service: 'mental_health',
    rationale: 'Pregnancy after loss carries unique emotional weight. Mental health support is a powerful protective tool.',
    dosing: { sessions: 4, estimatedSessionCost: 200, window: 'spread across pregnancy and first 12 weeks postpartum' },
    priority: 'high',
    concernCallout: true
  }
};

/**
 * Scan free-text concerns for known keywords. Returns the list of detected tags.
 * Empty / non-string inputs return [].
 */
export function detectConcerns(concernsText) {
  if (!concernsText || typeof concernsText !== 'string') return [];
  const lower = concernsText.toLowerCase();
  const tags = [];
  for (const [tag, keywords] of Object.entries(CONCERN_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Normalize raw wizard inputs into a flat shape the rule engine can match against.
 */
export function normalizeInputs(inputs, today = new Date()) {
  const {
    dueDate,
    isPostpartum,
    weeksPostpartum,
    firstTimeParent,
    coverage,
    coveredServices,
    hasHsa,
    hsaBalance,
    concerns
  } = inputs || {};

  // `coveredServices` is an alias for `coverage` accepted by newer callers.
  const resolvedCoverage = coverage || coveredServices || {};

  const base = {
    firstTimeParent,
    coverage: resolvedCoverage,
    hasHsa,
    hsaBalance: typeof hsaBalance === 'number' ? hsaBalance : 0,
    concerns: typeof concerns === 'string' ? concerns : ''
  };

  if (isPostpartum) {
    return {
      isPostpartum: true,
      weeksPostpartum: typeof weeksPostpartum === 'number' ? weeksPostpartum : 0,
      ...base
    };
  }

  let weeksUntilDue = 0;
  if (dueDate) {
    const due = new Date(dueDate);
    weeksUntilDue = Math.floor((due - today) / MS_PER_WEEK);
  }

  // If the due date is in the past, the user is actually postpartum — auto-flip
  // rather than letting a negative weeksUntilDue silently match prenatal rules.
  if (weeksUntilDue < 0) {
    return {
      isPostpartum: true,
      weeksPostpartum: -weeksUntilDue,
      ...base
    };
  }

  return {
    isPostpartum: false,
    weeksUntilDue,
    ...base
  };
}

/**
 * Return service ids present in BOTH the user's covered services map and Alma's offered services.
 */
export function eligibilityFilter(coveredServices, almaServices) {
  if (!coveredServices || !almaServices) return [];
  const covered = Object.keys(coveredServices);
  return almaServices.filter((id) => covered.includes(id));
}

/**
 * True iff every condition in `appliesWhen` is satisfied by `normalized`.
 */
function ruleMatches(normalized, appliesWhen) {
  if (!appliesWhen) return true;
  for (const [key, value] of Object.entries(appliesWhen)) {
    switch (key) {
      case 'weeksUntilDueMax':
        if (normalized.isPostpartum) break;
        if (!(normalized.weeksUntilDue <= value)) return false;
        break;
      case 'weeksUntilDueMin':
        if (normalized.isPostpartum) break;
        if (!(normalized.weeksUntilDue >= value)) return false;
        break;
      case 'weeksPostpartumMax':
        if (!normalized.isPostpartum) break;
        if (!(normalized.weeksPostpartum <= value)) return false;
        break;
      case 'weeksPostpartumMin':
        if (!normalized.isPostpartum) break;
        if (!(normalized.weeksPostpartum >= value)) return false;
        break;
      case 'firstTimeParent':
        if (normalized.firstTimeParent !== value) return false;
        break;
      case 'isPostpartum':
        if (normalized.isPostpartum !== value) return false;
        break;
      default:
        // Unknown condition — ignore (forward-compatible)
        break;
    }
  }
  return true;
}

/**
 * Run rules against the normalized state. Returns recommendation objects, sorted by
 * priority (high > medium > low) then by rule order.
 */
export function applyRules(normalized, eligibleServiceIds, rules) {
  if (!rules || !rules.length) return [];
  const eligibleSet = new Set(eligibleServiceIds || []);
  const matches = [];

  rules.forEach((rule, index) => {
    if (!eligibleSet.has(rule.service)) return;
    if (!ruleMatches(normalized, rule.appliesWhen)) return;
    matches.push({
      service: rule.service,
      dosing: rule.dosing,
      rationale: rule.rationale,
      priority: rule.priority,
      _order: index
    });
  });

  matches.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 99;
    const pb = PRIORITY_RANK[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return a._order - b._order;
  });

  return matches.map(({ _order, ...rest }) => rest);
}

/**
 * Compute the cost of a single recommendation.
 */
function recommendationCost(rec) {
  if (rec.dosing && typeof rec.dosing.totalCost === 'number') {
    return rec.dosing.totalCost;
  }
  const sessions = (rec.dosing && rec.dosing.sessions) || 0;
  if (sessions > 0 && !(rec.dosing && typeof rec.dosing.estimatedSessionCost === 'number')) {
    throw new Error(
      `Rule for "${rec.service}" must specify dosing.estimatedSessionCost or dosing.totalCost`
    );
  }
  const cost = rec.dosing && typeof rec.dosing.estimatedSessionCost === 'number'
    ? rec.dosing.estimatedSessionCost
    : 0;
  return sessions * cost;
}

/**
 * Allocate insurance coverage + HSA against each recommendation in order. Returns a new
 * array; does not mutate.
 */
export function allocateFunding(recommendations, coverage, hsaBalance) {
  let remainingHsa = typeof hsaBalance === 'number' ? hsaBalance : 0;
  const cov = coverage || {};
  return (recommendations || []).map((rec) => {
    const totalCost = recommendationCost(rec);
    const c = cov[rec.service];
    let covered = 0;
    if (c && typeof c.amount === 'number') {
      const reimbPct = typeof c.reimbursementPercent === 'number' ? c.reimbursementPercent : 100;
      const maxCovered = c.amount * (reimbPct / 100);
      covered = Math.min(totalCost, maxCovered);
    }
    const afterCoverage = Math.max(0, totalCost - covered);
    const fromHsa = Math.min(afterCoverage, remainingHsa);
    remainingHsa -= fromHsa;
    const outOfPocket = Math.max(0, afterCoverage - fromHsa);
    return {
      ...rec,
      totalCost,
      covered,
      fromHsa,
      outOfPocket
    };
  });
}

/**
 * Top-level orchestrator. Composes the full pipeline and produces the data shape the
 * results UI consumes.
 */
export function computeResults(rawInputs, rules, almaServices, today = new Date()) {
  const normalized = normalizeInputs(rawInputs, today);
  const eligibleServiceIds = eligibilityFilter(normalized.coverage, almaServices);
  const matched = applyRules(normalized, eligibleServiceIds, rules);

  // ----- Concern keyword detection & injection -----
  const detectedConcerns = detectConcerns(normalized.concerns);
  const eligibleSet = new Set(eligibleServiceIds);
  const existingServices = new Set(matched.map((r) => r.service));
  for (const tag of detectedConcerns) {
    const concernRule = CONCERN_TO_SERVICE_RULE[tag];
    if (!concernRule) continue;
    // Only inject if user is covered for the service AND it's not already recommended.
    if (!eligibleSet.has(concernRule.service)) continue;
    if (existingServices.has(concernRule.service)) continue;
    matched.push({
      service: concernRule.service,
      dosing: concernRule.dosing,
      rationale: concernRule.rationale,
      priority: concernRule.priority,
      concernCallout: true
    });
    existingServices.add(concernRule.service);
  }
  // Re-sort by priority (preserving the order added among ties).
  matched.sort((a, b) => {
    const pa = PRIORITY_RANK[a.priority] ?? 99;
    const pb = PRIORITY_RANK[b.priority] ?? 99;
    return pa - pb;
  });

  const recommendations = allocateFunding(matched, normalized.coverage, normalized.hsaBalance);

  // totalCovered = sum of covered $ across recommendations
  const totalCovered = recommendations.reduce((sum, r) => sum + (r.covered || 0), 0);
  const totalRecommendedCost = recommendations.reduce((sum, r) => sum + (r.totalCost || 0), 0);

  // ----- Annotate recs with isCovered (boolean) + windowRank for the hybrid sort -----
  // `rec.covered` stays as the dollar amount written by allocateFunding; we add a
  // separate `isCovered` boolean so the UI's dollar-amount reads keep working.
  const coverageMap = normalized.coverage || {};
  for (const rec of recommendations) {
    rec.isCovered = !!coverageMap[rec.service];
    const dosingWindow = rec.dosing && rec.dosing.window;
    rec.windowRank = isInWindow(normalized.weeksPostpartum, dosingWindow) ? 0 : 1;
  }

  // ----- Hybrid final sort: isCovered (true first) -> priority asc -> windowRank asc -----
  recommendations.sort((a, b) => {
    if (a.isCovered !== b.isCovered) return a.isCovered ? -1 : 1;
    const pa = PRIORITY_RANK[a.priority] ?? 99;
    const pb = PRIORITY_RANK[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return (a.windowRank ?? 99) - (b.windowRank ?? 99);
  });

  const fundingStrategy = buildFundingStrategy(
    recommendations,
    normalized.coverage,
    normalized.hsaBalance,
    totalCovered
  );

  return {
    normalized,
    eligibleServiceIds,
    recommendations,
    totalCovered,
    totalRecommendedCost,
    fundingStrategy,
    detectedConcerns
  };
}

function formatMoney(n) {
  return `$${Math.round(n)}`;
}

function buildFundingStrategy(recommendations, coverage, hsaBalance, totalCovered) {
  const lines = [];
  const cov = coverage || {};

  // Track which services were actually used in recommendations
  const usedServices = new Set(recommendations.map((r) => r.service));

  for (const serviceId of usedServices) {
    const c = cov[serviceId];
    if (c && typeof c.amount === 'number' && c.amount > 0) {
      const name = SERVICE_NAMES[serviceId] || serviceId;
      lines.push(`Use your ${name} benefits — ${formatMoney(c.amount)} available.`);
    }
  }

  const totalFromHsa = recommendations.reduce((s, r) => s + (r.fromHsa || 0), 0);
  if (totalFromHsa > 0) {
    lines.push(`Cover ${formatMoney(totalFromHsa)} with your ${formatMoney(hsaBalance)} HSA.`);
  }

  const totalOop = recommendations.reduce((s, r) => s + (r.outOfPocket || 0), 0);
  if (totalOop > 0) {
    lines.push(
      `~${formatMoney(totalOop)} out-of-pocket — consider adding Alma gift cards to your registry.`
    );
  }

  if (totalCovered === 0 && (!hsaBalance || hsaBalance === 0)) {
    lines.push(`Most of your care will be out-of-pocket — here's how to plan smartly.`);
    lines.push(`Consider Alma gift cards on your registry to offset costs.`);
  }

  return lines;
}
