import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimateDocDefinition, buildEstimateFilename } from '../src/pdf.js';

const baseState = {
  lead: {
    firstName: 'Jane',
    lastName: 'Doe',
    streetAddress: '123 Main St',
    city: 'Toronto',
    postalCode: 'M5V 2T6'
  }
};

const baseResults = {
  nursing: { eligibleAmount: 2000 }
};

// Local-time constructor (month is 0-indexed). Avoids ISO-string parsing
// that lands at UTC midnight and produces wrong dates west of UTC.
const TODAY = new Date(2026, 4, 23);

test('returns null when nursing eligibleAmount is 0', () => {
  const doc = buildEstimateDocDefinition(baseState, { nursing: { eligibleAmount: 0 } }, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  assert.strictEqual(doc, null);
});

test('returns null when nursing missing entirely', () => {
  const doc = buildEstimateDocDefinition(baseState, {}, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  assert.strictEqual(doc, null);
});

test('returns null when hourlyRate is null/0/undefined', () => {
  assert.strictEqual(
    buildEstimateDocDefinition(baseState, baseResults, { rnHourlyRate: null, pswHourlyRate: 90, today: TODAY }),
    null
  );
  assert.strictEqual(
    buildEstimateDocDefinition(baseState, baseResults, { rnHourlyRate: 0, pswHourlyRate: 90, today: TODAY }),
    null
  );
});

test('$2000 nursing at $90/hr → 22 hours, $2,000 eligible', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /22 hours/);
  assert.match(flat, /\$2,000\.00/);
  assert.match(flat, /\$90\.00/);
});

test('$1500 nursing at $100/hr → 15 hours, $1,500 eligible (clean division)', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 1500 } },
    { rnHourlyRate: 100, pswHourlyRate: 100, today: TODAY }
  );
  const flat = JSON.stringify(doc);
  assert.match(flat, /15 hours/);
  assert.match(flat, /\$1,500/);
});

test('"Prepared for" includes name, street, city, postal code', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /Jane Doe/);
  assert.match(flat, /123 Main St/);
  assert.match(flat, /Toronto/);
  assert.match(flat, /M5V 2T6/);
});

test('"Prepared for" gracefully omits street when missing', () => {
  const state = { lead: { ...baseState.lead, streetAddress: '' } };
  const doc = buildEstimateDocDefinition(state, baseResults, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /Toronto/);
  assert.doesNotMatch(flat, /123 Main St/);
});

test('generated date uses long form (May 23, 2026)', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /May 23, 2026/);
});

test('includes purpose statement, disclaimer, and concierge footer', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /insurance coverage inquiry or pre-determination/i);
  assert.match(flat, /does not guarantee reimbursement/i);
  assert.match(flat, /Postnatal Care Concierge/i);
  assert.match(flat, /Private Duty Nursing/);
  assert.match(flat, /Service Estimate/);
  assert.match(flat, /Hourly rate/);
  assert.match(flat, /Eligible amount/);
  assert.match(flat, /Estimated hours/);
});

// ---------- Province inference + name fallback ----------

test('"Prepared for" includes inferred province between city and postal code', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  // M5V 2T6 → first letter M → ON
  assert.match(flat, /Toronto, ON · M5V 2T6/);
});

test('"Prepared for" infers province for a BC postal code', () => {
  const state = { lead: { ...baseState.lead, city: 'Vancouver', postalCode: 'V6B 5K3' } };
  const doc = buildEstimateDocDefinition(state, baseResults, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  assert.match(JSON.stringify(doc), /Vancouver, BC · V6B 5K3/);
});

test('"Prepared for" renders "—" when both first and last name are missing', () => {
  const state = { lead: { firstName: '', lastName: '', city: 'Toronto', postalCode: 'M5V 2T6' } };
  const doc = buildEstimateDocDefinition(state, baseResults, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  assert.match(JSON.stringify(doc), /Prepared for: —/);
});

test('HSA-applied amount is reflected when caller folds it into eligibleAmount', () => {
  // The pdf builder trusts the caller to have folded HSA dollars into
  // results.nursing.eligibleAmount upstream. This test pins that contract.
  const results = { nursing: { eligibleAmount: 2500 } }; // $2000 nursing benefit + $500 HSA
  const doc = buildEstimateDocDefinition(baseState, results, { rnHourlyRate: 90, pswHourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  // 2500 / 90 = 27.77 → floor 27 hours; eligible amount column shows $2,500.00
  assert.match(flat, /27 hours/);
  assert.match(flat, /\$2,500/);
});

// ---------- buildEstimateFilename ----------

test('buildEstimateFilename: standard last name + date', () => {
  const name = buildEstimateFilename({ lead: { lastName: 'Doe' } }, TODAY);
  assert.strictEqual(name, 'alma-coverage-estimate-doe-2026-05-23.pdf');
});

test('buildEstimateFilename: strips non-alphanumeric from last name', () => {
  const name = buildEstimateFilename({ lead: { lastName: "O'Brien-Smith" } }, TODAY);
  assert.strictEqual(name, 'alma-coverage-estimate-obriensmith-2026-05-23.pdf');
});

test('buildEstimateFilename: falls back to "family" when lastName is empty/missing', () => {
  assert.strictEqual(
    buildEstimateFilename({ lead: { lastName: '' } }, TODAY),
    'alma-coverage-estimate-family-2026-05-23.pdf'
  );
  assert.strictEqual(
    buildEstimateFilename({ lead: {} }, TODAY),
    'alma-coverage-estimate-family-2026-05-23.pdf'
  );
});

test('buildEstimateFilename: pads month and day with leading zeros', () => {
  const jan5 = new Date(2026, 0, 5);
  const name = buildEstimateFilename({ lead: { lastName: 'Doe' } }, jan5);
  assert.strictEqual(name, 'alma-coverage-estimate-doe-2026-01-05.pdf');
});

// ---------- Round-4: RN + PSW dual pathway rendering ----------

test('RN-only: PSW absent → single RN row, no Total row', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 10000 } },
    { rnHourlyRate: 50, pswHourlyRate: 50, today: TODAY }
  );
  assert.notStrictEqual(doc, null);
  const flat = JSON.stringify(doc);
  assert.match(flat, /Private Duty Nursing/);
  assert.match(flat, /200 hours/);            // 10000/50
  assert.doesNotMatch(flat, /Personal Support Worker/);
  assert.doesNotMatch(flat, /Total/);         // no total row when single pathway
});

test('PSW-only: nursing zero, PSW eligible → single PSW row', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 0 }, psw: { eligibleAmount: 1000 } },
    { rnHourlyRate: 50, pswHourlyRate: 50, today: TODAY }
  );
  assert.notStrictEqual(doc, null);
  const flat = JSON.stringify(doc);
  assert.match(flat, /Personal Support Worker/);
  assert.match(flat, /20 hours/);             // 1000/50
  assert.doesNotMatch(flat, /Private Duty Nursing/);
  assert.doesNotMatch(flat, /Total/);
});

test('RN + PSW: both eligible → both rows + Total row', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 10000 }, psw: { eligibleAmount: 1000 } },
    { rnHourlyRate: 50, pswHourlyRate: 50, today: TODAY }
  );
  const flat = JSON.stringify(doc);
  assert.match(flat, /Private Duty Nursing/);
  assert.match(flat, /Personal Support Worker/);
  assert.match(flat, /200 hours/);
  assert.match(flat, /20 hours/);
  assert.match(flat, /Total/);
  assert.match(flat, /\$11,000/);             // total eligible
  assert.match(flat, /220 hours/);            // total hours
});

test('both pathways zero → null', () => {
  assert.strictEqual(
    buildEstimateDocDefinition(
      baseState,
      { nursing: { eligibleAmount: 0 }, psw: { eligibleAmount: 0 } },
      { rnHourlyRate: 50, pswHourlyRate: 50, today: TODAY }
    ),
    null
  );
});

test('RN eligible but rnHourlyRate unset → that row hidden; if no PSW, null', () => {
  assert.strictEqual(
    buildEstimateDocDefinition(
      baseState,
      { nursing: { eligibleAmount: 10000 } },
      { rnHourlyRate: null, pswHourlyRate: 50, today: TODAY }
    ),
    null
  );
});

test('RN+PSW eligible but only RN rate configured → renders RN only, no Total', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 10000 }, psw: { eligibleAmount: 1000 } },
    { rnHourlyRate: 50, pswHourlyRate: null, today: TODAY }
  );
  assert.notStrictEqual(doc, null);
  const flat = JSON.stringify(doc);
  assert.match(flat, /Private Duty Nursing/);
  assert.doesNotMatch(flat, /Personal Support Worker/);
  assert.doesNotMatch(flat, /Total/);
});
