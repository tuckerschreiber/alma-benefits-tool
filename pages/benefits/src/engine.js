// Alma Care Benefits Eligibility Tool — rule engine
// Pure functions only: no DOM, no globals, no I/O. Runs identically in Node and browser.

export const SERVICE_NAMES = {
  massage_therapy: 'Massage therapy',
  acupuncture: 'Acupuncture',
  lactation_consulting: 'Lactation consulting',
  postpartum_doula_care: 'Postpartum doula care',
  registered_nursing: 'Registered nursing',
  psw: 'Personal support worker',
  mental_health: 'Mental health support',
  nutritionist: 'Nutritionist',
  dietician: 'Dietician'
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_SESSION_COST = 120;

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
    hasHsa,
    hsaBalance,
    concerns
  } = inputs || {};

  const base = {
    firstTimeParent,
    coverage: coverage || {},
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
    weeksUntilDue = Math.round((due - today) / MS_PER_WEEK);
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
  const cost =
    rec.dosing && typeof rec.dosing.estimatedSessionCost === 'number'
      ? rec.dosing.estimatedSessionCost
      : DEFAULT_SESSION_COST;
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
  const recommendations = allocateFunding(matched, normalized.coverage, normalized.hsaBalance);

  // totalCovered = sum of covered $ across recommendations
  const totalCovered = recommendations.reduce((sum, r) => sum + (r.covered || 0), 0);
  const totalRecommendedCost = recommendations.reduce((sum, r) => sum + (r.totalCost || 0), 0);

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
    fundingStrategy
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
