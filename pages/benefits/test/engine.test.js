import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeInputs,
  eligibilityFilter,
  applyRules,
  allocateFunding,
  computeResults,
  detectConcerns,
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

test('normalizeInputs: due date in the past auto-flips to postpartum', () => {
  const today = new Date('2026-05-10');
  const result = normalizeInputs({ dueDate: '2026-04-26' }, today);
  assert.equal(result.isPostpartum, true);
  assert.equal(result.weeksPostpartum, 2);
  assert.equal(result.weeksUntilDue, undefined);
});

test('normalizeInputs: due date 1 day in the past auto-flips to postpartum (handles -0)', () => {
  const today = new Date('2026-05-10');
  const yesterday = new Date('2026-05-09');
  const result = normalizeInputs({ dueDate: yesterday.toISOString().slice(0, 10) }, today);
  assert.equal(result.isPostpartum, true);
  assert.ok(result.weeksPostpartum >= 0);
  assert.equal(result.weeksUntilDue, undefined);
});

test('normalizeInputs: due date 3 days in the past auto-flips to postpartum', () => {
  const today = new Date('2026-05-10');
  const result = normalizeInputs({ dueDate: '2026-05-07' }, today);
  assert.equal(result.isPostpartum, true);
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

test('applyRules: postpartum user matches rule with weeksUntilDueMax (prenatal condition skipped)', () => {
  const normalized = { isPostpartum: true, weeksPostpartum: 4 };
  const rules = [{ service: 'massage_therapy', appliesWhen: { weeksUntilDueMax: 8 }, dosing: {sessions:1, estimatedSessionCost:120}, rationale:'x', priority:'medium' }];
  const result = applyRules(normalized, ['massage_therapy'], rules);
  assert.equal(result.length, 1);
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

test('allocateFunding: throws when rule has neither estimatedSessionCost nor totalCost', () => {
  const recs = [{ service: 'massage_therapy', dosing: { sessions: 4 } }];
  assert.throws(() => allocateFunding(recs, {}, 0), /must specify dosing.estimatedSessionCost or dosing.totalCost/);
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
  assert.equal(SERVICE_NAMES.massage_therapy, 'Registered Massage Therapy (RMT)');
  assert.equal(SERVICE_NAMES.lactation_consulting, 'Lactation Consultant / IBCLC');
  assert.equal(SERVICE_NAMES.psw, 'Personal Support Worker (PSW)');
});

// ----- detectConcerns -----

test('detectConcerns: matches PPD keywords case-insensitively', () => {
  assert.deepEqual(detectConcerns('I had PPD last time'), ['ppd']);
  assert.deepEqual(detectConcerns('Diagnosed with depression'), ['ppd']);
  assert.deepEqual(detectConcerns(''), []);
  assert.deepEqual(detectConcerns(null), []);
});

test('detectConcerns: matches multiple tags', () => {
  const result = detectConcerns('twin pregnancy with high blood pressure');
  assert.ok(result.includes('twins'));
  assert.ok(result.includes('hbp'));
});

test('computeResults: PPD concern injects mental_health when covered', () => {
  const inputs = {
    dueDate: '2026-09-01',
    isPostpartum: false,
    firstTimeParent: false,
    coverage: { mental_health: { amount: 1000, perVisitCap: 0, reimbursementPercent: 100 } },
    hasHsa: 'no',
    hsaBalance: 0,
    concerns: 'I had PPD with my first child'
  };
  const today = new Date('2026-05-10');
  const result = computeResults(inputs, RULES, ALMA_SERVICES, today);
  assert.ok(result.detectedConcerns.includes('ppd'));
  const mhRec = result.recommendations.find(r => r.service === 'mental_health');
  assert.ok(mhRec, 'mental_health recommendation should be present');
  assert.equal(mhRec.concernCallout, true);
});

test('computeResults: concern not injected if service not covered', () => {
  const inputs = {
    dueDate: '2026-09-01',
    isPostpartum: false,
    firstTimeParent: false,
    coverage: { massage_therapy: { amount: 500, perVisitCap: 0, reimbursementPercent: 100 } },
    concerns: 'I have a history of PPD'
  };
  const today = new Date('2026-05-10');
  const result = computeResults(inputs, RULES, ALMA_SERVICES, today);
  assert.ok(result.detectedConcerns.includes('ppd'));
  // mental_health not covered, so no rec injected
  const mhRec = result.recommendations.find(r => r.service === 'mental_health');
  assert.equal(mhRec, undefined);
});

test('applyRules: postpartum user matches postpartum-specific rule with weeksPostpartumMax', () => {
  const normalized = { isPostpartum: true, weeksPostpartum: 1, firstTimeParent: true, coverage: {}, hasHsa: 'no', hsaBalance: 0, concerns: '' };
  const result = applyRules(normalized, ['registered_nursing'], RULES);
  // Postpartum nursing rule with weeksPostpartumMax: 2 should match
  const nursingRec = result.find(r => r.service === 'registered_nursing');
  assert.ok(nursingRec, 'postpartum nursing rule should match');
});

test('detectConcerns: does not match "older child" as AMA', () => {
  assert.deepEqual(detectConcerns('I have an older child at home'), []);
});

test('detectConcerns: does not match "twin bed" as twins', () => {
  assert.deepEqual(detectConcerns('We have a twin bed in the nursery'), []);
});

test('computeResults: each rec has isCovered boolean reflecting state.coveredServices', () => {
  const state = {
    isPostpartum: true,
    weeksPostpartum: 2,
    coveredServices: { postpartum_doula_care: { limit: 1000 } },
    hsaBalance: 0,
    firstTimeParent: true,
    concerns: ''
  };
  const results = computeResults(state, RULES, ALMA_SERVICES, new Date());
  const doulaRec = results.recommendations.find(r => r.service === 'postpartum_doula_care');
  const otherRec = results.recommendations.find(r => r.service !== 'postpartum_doula_care');
  assert.equal(doulaRec.isCovered, true);
  if (otherRec) assert.equal(otherRec.isCovered, false);
});

test('computeResults: covered services rank above uncovered at the same priority', () => {
  const state = {
    isPostpartum: true,
    weeksPostpartum: 4,
    coveredServices: { massage_therapy: { limit: 500 } },
    hsaBalance: 0,
    firstTimeParent: true,
    concerns: ''
  };
  const results = computeResults(state, RULES, ALMA_SERVICES, new Date());
  const firstCoveredIdx = results.recommendations.findIndex(r => r.isCovered);
  const firstUncoveredIdx = results.recommendations.findIndex(r => !r.isCovered);
  if (firstCoveredIdx !== -1 && firstUncoveredIdx !== -1) {
    assert.ok(firstCoveredIdx < firstUncoveredIdx, 'covered must precede uncovered');
  }
});

test('computeResults: within the covered group, higher priority outranks lower priority', () => {
  // At ~6 weeks until due (prenatal, first-time parent), RULES matches:
  //   - lactation_consulting (high)
  //   - postpartum_doula_care (high)
  //   - mental_health (medium)
  //   - acupuncture (low)
  //   - massage_therapy (medium)
  // We cover lactation_consulting (high) and acupuncture (low) so both are
  // in the "covered" tier, and the high-priority service must come first.
  const today = new Date('2026-05-10');
  const state = {
    dueDate: '2026-06-21', // ~6 weeks out
    firstTimeParent: true,
    coverage: {
      lactation_consulting: { amount: 500, perVisitCap: 0, reimbursementPercent: 100 },
      acupuncture: { amount: 300, perVisitCap: 0, reimbursementPercent: 100 }
    },
    hsaBalance: 0,
    concerns: ''
  };
  const results = computeResults(state, RULES, ALMA_SERVICES, today);
  const lactationIdx = results.recommendations.findIndex(r => r.service === 'lactation_consulting');
  const acuIdx = results.recommendations.findIndex(r => r.service === 'acupuncture');
  assert.ok(lactationIdx !== -1, 'lactation_consulting must be present');
  assert.ok(acuIdx !== -1, 'acupuncture must be present');
  const lactationRec = results.recommendations[lactationIdx];
  const acuRec = results.recommendations[acuIdx];
  assert.equal(lactationRec.isCovered, true);
  assert.equal(acuRec.isCovered, true);
  assert.equal(lactationRec.priority, 'high');
  assert.equal(acuRec.priority, 'low');
  assert.ok(lactationIdx < acuIdx, 'high priority must outrank low priority within covered group');
});

test('computeResults: within same covered+priority tier, in-window outranks out-of-window', () => {
  // Postpartum at wp=2, firstTimeParent, covering three "high" services:
  //   - registered_nursing  window "first 2 weeks postpartum"  -> in-window  (rank 0)
  //   - lactation_consulting window "first 4 weeks postpartum" -> in-window  (rank 0)
  //   - postpartum_doula_care window "weeks 1–6 postpartum"    -> NOT parseable (rank 1)
  // All three are covered + high priority; the windowRank=1 doula rec must sort
  // LAST within the high tier, after both rank-0 services. Without the hybrid
  // sort (priority-only), doula would land between nursing and lactation by
  // rule-insertion order — so this assertion fails without Task 5's sort.
  const state = {
    isPostpartum: true,
    weeksPostpartum: 2,
    firstTimeParent: true,
    coveredServices: {
      registered_nursing: { amount: 500 },
      postpartum_doula_care: { amount: 500 },
      lactation_consulting: { amount: 500 }
    },
    hsaBalance: 0,
    concerns: ''
  };
  const results = computeResults(state, RULES, ALMA_SERVICES, new Date());
  const nursingIdx = results.recommendations.findIndex(r => r.service === 'registered_nursing');
  const lactationIdx = results.recommendations.findIndex(r => r.service === 'lactation_consulting');
  const doulaIdx = results.recommendations.findIndex(r => r.service === 'postpartum_doula_care');
  assert.ok(nursingIdx !== -1 && lactationIdx !== -1 && doulaIdx !== -1, 'all three high-priority covered recs must be present');
  // Sanity: ranks line up with what we expect.
  assert.equal(results.recommendations[nursingIdx].windowRank, 0);
  assert.equal(results.recommendations[lactationIdx].windowRank, 0);
  assert.equal(results.recommendations[doulaIdx].windowRank, 1);
  // The actual ordering claim:
  assert.ok(nursingIdx < doulaIdx, 'in-window nursing must precede out-of-window doula');
  assert.ok(lactationIdx < doulaIdx, 'in-window lactation must precede out-of-window doula');
});
