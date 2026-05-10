import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeInputs,
  eligibilityFilter,
  applyRules,
  allocateFunding,
  computeResults,
  SERVICE_NAMES
} from '../src/engine.js';
import { ALMA_SERVICES, RULES } from '../src/rules.js';

// ----- normalizeInputs -----

test('normalizeInputs: computes weeksUntilDue from future due date', () => {
  const today = new Date('2026-05-10');
  // 8 weeks from today
  const due = new Date('2026-07-05'); // 56 days = 8 weeks
  const result = normalizeInputs(
    { dueDate: due.toISOString().slice(0, 10), firstTimeParent: true },
    today
  );
  assert.equal(result.isPostpartum, false);
  assert.equal(result.weeksUntilDue, 8);
  assert.equal(result.firstTimeParent, true);
});

test('normalizeInputs: returns weeksPostpartum when isPostpartum is true', () => {
  const today = new Date('2026-05-10');
  const result = normalizeInputs(
    { isPostpartum: true, weeksPostpartum: 3, firstTimeParent: false },
    today
  );
  assert.equal(result.isPostpartum, true);
  assert.equal(result.weeksPostpartum, 3);
  assert.equal(result.firstTimeParent, false);
  assert.equal(result.weeksUntilDue, undefined);
});

test('normalizeInputs: defaults missing optional fields', () => {
  const today = new Date('2026-05-10');
  const result = normalizeInputs(
    { dueDate: '2026-07-05' },
    today
  );
  assert.deepEqual(result.coverage, {});
  assert.equal(result.hsaBalance, 0);
  assert.equal(result.concerns, '');
  assert.equal(result.hasHsa, undefined);
});

// ----- eligibilityFilter -----

test('eligibilityFilter: returns intersection of covered services and Alma services', () => {
  const covered = { massage_therapy: {}, acupuncture: {}, chiropractor: {} };
  const alma = ['massage_therapy', 'acupuncture', 'lactation_consulting'];
  const result = eligibilityFilter(covered, alma);
  assert.deepEqual(result.sort(), ['acupuncture', 'massage_therapy']);
});

test('eligibilityFilter: empty coverage returns empty array', () => {
  const result = eligibilityFilter({}, ALMA_SERVICES);
  assert.deepEqual(result, []);
});

test('eligibilityFilter: coverage with non-Alma services returns only intersection', () => {
  const covered = { chiropractor: {}, physiotherapy: {} };
  const alma = ['massage_therapy', 'acupuncture'];
  const result = eligibilityFilter(covered, alma);
  assert.deepEqual(result, []);
});

// ----- applyRules -----

test('applyRules: empty rules returns empty array', () => {
  const normalized = { isPostpartum: false, weeksUntilDue: 8 };
  const result = applyRules(normalized, ['massage_therapy'], []);
  assert.deepEqual(result, []);
});

test('applyRules: rule whose service is not in eligible set is excluded', () => {
  const normalized = { isPostpartum: false, weeksUntilDue: 8, firstTimeParent: true };
  const rules = [
    {
      service: 'lactation_consulting',
      appliesWhen: {},
      dosing: { sessions: 2 },
      rationale: 'x',
      priority: 'high'
    }
  ];
  const result = applyRules(normalized, ['massage_therapy'], rules);
  assert.equal(result.length, 0);
});

test('applyRules: weeksUntilDueMax 8 matches weeksUntilDue 4, not 12', () => {
  const rule = {
    service: 'massage_therapy',
    appliesWhen: { weeksUntilDueMax: 8 },
    dosing: { sessions: 4 },
    rationale: 'x',
    priority: 'medium'
  };
  const matching = applyRules(
    { isPostpartum: false, weeksUntilDue: 4 },
    ['massage_therapy'],
    [rule]
  );
  const nonMatching = applyRules(
    { isPostpartum: false, weeksUntilDue: 12 },
    ['massage_therapy'],
    [rule]
  );
  assert.equal(matching.length, 1);
  assert.equal(nonMatching.length, 0);
});

test('applyRules: firstTimeParent condition matches the corresponding value', () => {
  const rule = {
    service: 'mental_health',
    appliesWhen: { firstTimeParent: true },
    dosing: { sessions: 3 },
    rationale: 'x',
    priority: 'medium'
  };
  const matching = applyRules(
    { isPostpartum: false, weeksUntilDue: 4, firstTimeParent: true },
    ['mental_health'],
    [rule]
  );
  const nonMatching = applyRules(
    { isPostpartum: false, weeksUntilDue: 4, firstTimeParent: false },
    ['mental_health'],
    [rule]
  );
  assert.equal(matching.length, 1);
  assert.equal(nonMatching.length, 0);
});

test('applyRules: results sorted by priority (high before medium before low)', () => {
  const rules = [
    { service: 'a', appliesWhen: {}, dosing: {}, rationale: 'a', priority: 'low' },
    { service: 'b', appliesWhen: {}, dosing: {}, rationale: 'b', priority: 'high' },
    { service: 'c', appliesWhen: {}, dosing: {}, rationale: 'c', priority: 'medium' }
  ];
  const result = applyRules(
    { isPostpartum: false, weeksUntilDue: 4 },
    ['a', 'b', 'c'],
    rules
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].service, 'b');
  assert.equal(result[1].service, 'c');
  assert.equal(result[2].service, 'a');
});

test('applyRules: empty appliesWhen matches any normalized state for an eligible service', () => {
  const rule = {
    service: 'massage_therapy',
    appliesWhen: {},
    dosing: { sessions: 4 },
    rationale: 'x',
    priority: 'medium'
  };
  const r1 = applyRules(
    { isPostpartum: false, weeksUntilDue: 30 },
    ['massage_therapy'],
    [rule]
  );
  const r2 = applyRules(
    { isPostpartum: true, weeksPostpartum: 10 },
    ['massage_therapy'],
    [rule]
  );
  assert.equal(r1.length, 1);
  assert.equal(r2.length, 1);
});

test('applyRules: postpartum window conditions match weeksPostpartum, not weeksUntilDue', () => {
  const rule = {
    service: 'massage_therapy',
    appliesWhen: { weeksPostpartumMax: 6 },
    dosing: {},
    rationale: 'x',
    priority: 'low'
  };
  const matchPP = applyRules(
    { isPostpartum: true, weeksPostpartum: 3 },
    ['massage_therapy'],
    [rule]
  );
  const noMatchPP = applyRules(
    { isPostpartum: true, weeksPostpartum: 10 },
    ['massage_therapy'],
    [rule]
  );
  // When not postpartum, the postpartum condition is not constraining and should match
  const prenatal = applyRules(
    { isPostpartum: false, weeksUntilDue: 4 },
    ['massage_therapy'],
    [rule]
  );
  assert.equal(matchPP.length, 1);
  assert.equal(noMatchPP.length, 0);
  assert.equal(prenatal.length, 1);
});

// ----- allocateFunding -----

test('allocateFunding: coverage fully covers cost', () => {
  const recs = [
    {
      service: 'massage_therapy',
      dosing: { sessions: 4, estimatedSessionCost: 100 }, // $400 total
      rationale: 'x',
      priority: 'medium'
    }
  ];
  const coverage = {
    massage_therapy: { amount: 500, perVisitCap: 0, reimbursementPercent: 100 }
  };
  const result = allocateFunding(recs, coverage, 0);
  assert.equal(result[0].totalCost, 400);
  assert.equal(result[0].covered, 400);
  assert.equal(result[0].fromHsa, 0);
  assert.equal(result[0].outOfPocket, 0);
});

test('allocateFunding: 80% reimbursement on $500 limit caps covered at $400', () => {
  const recs = [
    {
      service: 'massage_therapy',
      dosing: { sessions: 10, estimatedSessionCost: 100 }, // $1000 total
      rationale: 'x',
      priority: 'medium'
    }
  ];
  const coverage = {
    massage_therapy: { amount: 500, perVisitCap: 0, reimbursementPercent: 80 }
  };
  const result = allocateFunding(recs, coverage, 0);
  assert.equal(result[0].totalCost, 1000);
  assert.equal(result[0].covered, 400); // 500 * 0.8
  assert.equal(result[0].outOfPocket, 600);
});

test('allocateFunding: HSA depletes across multiple services in order', () => {
  const recs = [
    {
      service: 'a',
      dosing: { sessions: 1, estimatedSessionCost: 300 },
      rationale: 'x',
      priority: 'high'
    },
    {
      service: 'b',
      dosing: { sessions: 1, estimatedSessionCost: 300 },
      rationale: 'y',
      priority: 'high'
    }
  ];
  const result = allocateFunding(recs, {}, 400);
  // First rec consumes 300 of HSA, leaving 100
  assert.equal(result[0].fromHsa, 300);
  assert.equal(result[0].outOfPocket, 0);
  // Second rec consumes remaining 100 of HSA
  assert.equal(result[1].fromHsa, 100);
  assert.equal(result[1].outOfPocket, 200);
});

test('allocateFunding: out-of-pocket = remainder when neither covers fully', () => {
  const recs = [
    {
      service: 'massage_therapy',
      dosing: { sessions: 4, estimatedSessionCost: 100 }, // $400
      rationale: 'x',
      priority: 'medium'
    }
  ];
  const coverage = {
    massage_therapy: { amount: 100, perVisitCap: 0, reimbursementPercent: 100 }
  };
  const result = allocateFunding(recs, coverage, 50);
  assert.equal(result[0].totalCost, 400);
  assert.equal(result[0].covered, 100);
  assert.equal(result[0].fromHsa, 50);
  assert.equal(result[0].outOfPocket, 250);
});

test('allocateFunding: does not mutate input array', () => {
  const recs = [
    {
      service: 'massage_therapy',
      dosing: { sessions: 4, estimatedSessionCost: 100 },
      rationale: 'x',
      priority: 'medium'
    }
  ];
  const before = JSON.parse(JSON.stringify(recs));
  allocateFunding(recs, {}, 0);
  assert.deepEqual(recs, before);
});

// ----- computeResults -----

test('computeResults: end-to-end with realistic input returns correct shape', () => {
  const today = new Date('2026-05-10');
  const inputs = {
    dueDate: '2026-07-05', // ~8 weeks out
    firstTimeParent: true,
    coverage: {
      massage_therapy: { amount: 500, perVisitCap: 0, reimbursementPercent: 80 },
      lactation_consulting: { amount: 300, perVisitCap: 0, reimbursementPercent: 100 }
    },
    hasHsa: true,
    hsaBalance: 200
  };
  const result = computeResults(inputs, RULES, ALMA_SERVICES, today);

  assert.ok(result.normalized);
  assert.equal(result.normalized.weeksUntilDue, 8);
  assert.deepEqual(result.eligibleServiceIds.sort(), ['lactation_consulting', 'massage_therapy']);
  assert.ok(Array.isArray(result.recommendations));
  assert.ok(result.recommendations.length >= 1);
  // First rec should be the high-priority one (lactation_consulting for first-time parent)
  assert.equal(result.recommendations[0].service, 'lactation_consulting');
  assert.ok(typeof result.totalCovered === 'number');
  assert.ok(typeof result.totalRecommendedCost === 'number');
  assert.ok(Array.isArray(result.fundingStrategy));
});

test('computeResults: zero coverage + zero HSA produces empathetic copy', () => {
  const today = new Date('2026-05-10');
  const inputs = {
    dueDate: '2026-07-05',
    firstTimeParent: true,
    coverage: {},
    hasHsa: false,
    hsaBalance: 0
  };
  const result = computeResults(inputs, RULES, ALMA_SERVICES, today);

  // No eligible services means no recommendations from coverage, but fundingStrategy should explain
  const joined = result.fundingStrategy.join(' ');
  assert.match(joined, /out-of-pocket/i);
  assert.match(joined, /gift card/i);
});

test('computeResults: SERVICE_NAMES exports human-readable names', () => {
  assert.equal(SERVICE_NAMES.massage_therapy, 'Massage therapy');
  assert.equal(SERVICE_NAMES.lactation_consulting, 'Lactation consulting');
  assert.equal(SERVICE_NAMES.psw, 'Personal support worker');
});
