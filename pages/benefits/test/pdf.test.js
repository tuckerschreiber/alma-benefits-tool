import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimateDocDefinition, buildEstimateFilename } from '../src/pdf.js';

const baseState = {
  lead: {
    firstName: 'Jane',
    lastName: 'Doe',
    streetAddress: '123 Main St',
    city: 'Toronto',
    postalCode: 'M5V 2T6',
    email: 'jane@example.com',
    phone: '(416) 555-0100',
    dueDate: '2026-07-19',
    isPostpartum: false
  }
};

// Local-time constructor (month is 0-indexed). Avoids ISO-string parsing
// that lands at UTC midnight and produces wrong dates west of UTC.
const TODAY = new Date(2026, 5, 2);   // June 2, 2026

// At $48/hr × 10hr shifts = $480/shift.
// $10,000 eligible → floor(10000/480) = 20 shifts.
// Subtotal = 20 × 480 = $9,600. Tax 13% = $1,248. Total = $10,848.
const baseResults = {
  nursing: { eligibleAmount: 10000 }
};

// ---------- Null cases ----------

test('returns null when nursing eligibleAmount is 0', () => {
  const doc = buildEstimateDocDefinition(baseState, { nursing: { eligibleAmount: 0 } }, { hourlyRate: 48, today: TODAY });
  assert.strictEqual(doc, null);
});

test('returns null when nursing missing entirely', () => {
  const doc = buildEstimateDocDefinition(baseState, {}, { hourlyRate: 48, today: TODAY });
  assert.strictEqual(doc, null);
});

test('returns null when hourlyRate is null/0/undefined', () => {
  assert.strictEqual(
    buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: null, today: TODAY }),
    null
  );
  assert.strictEqual(
    buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 0, today: TODAY }),
    null
  );
});

test('returns null when eligible amount is less than one hour of care', () => {
  // $30 < $48/hr -> not enough for even one hour -> null.
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 30 } },
    { hourlyRate: 48, today: TODAY }
  );
  assert.strictEqual(doc, null);
});

test('returns a partial-shift doc when amount covers some hours but less than one full shift', () => {
  // $200 / $48 = 4 hours; less than 10-hr shift -> partial overnight row.
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 200 } },
    { hourlyRate: 48, today: TODAY }
  );
  assert.notStrictEqual(doc, null);
  const flat = JSON.stringify(doc);
  // Single visit row with "Partial overnight" shift type and 4 hours.
  assert.match(flat, /Partial overnight/);
  assert.match(flat, /"text":"4"/);
  // Cost per visit = 4 × $48 = $192. Subtotal = $192.
  assert.match(flat, /\$192\.00/);
});

test('partial-shift doc has exactly one visit row', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 384 } }, // 8 hours
    { hourlyRate: 48, today: TODAY }
  );
  const flat = JSON.stringify(doc);
  // Visit "1" appears, but "2" does not.
  assert.match(flat, /"text":"1"/);
  assert.doesNotMatch(flat, /"text":"2"/);
});

// ---------- Math ----------

test('$10,000 eligible at $48/hr → 20 overnight shifts; subtotal $9,600, tax $1,248, total $10,848', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 48, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /\$9,600\.00/);
  assert.match(flat, /\$1,248\.00/);
  assert.match(flat, /\$10,848\.00/);
  for (let i = 1; i <= 20; i++) {
    assert.match(flat, new RegExp(`"text":"${i}"`));
  }
});

test('$5,000 eligible at $48/hr → 10 shifts; subtotal $4,800', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 5000 } },
    { hourlyRate: 48, today: TODAY }
  );
  assert.match(JSON.stringify(doc), /\$4,800\.00/);
});

// ---------- Header content ----------

test('header includes Alma contact details + client contact details', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 48, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /Alma Care Postnatal/);
  assert.match(flat, /280 Bloor St W/);
  assert.match(flat, /contact@almacare\.ca/);
  assert.match(flat, /Service Recipient Details/);
  assert.match(flat, /Jane Doe/);
  assert.match(flat, /123 Main St/);
  assert.match(flat, /Toronto, ON M5V 2T6/);
  assert.match(flat, /jane@example\.com/);
});

test('date renders in long form', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 48, today: TODAY });
  assert.match(JSON.stringify(doc), /June 2, 2026/);
});

test('estimate label appears', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 48, today: TODAY });
  assert.match(JSON.stringify(doc), /ESTIMATE/);
});

// ---------- Description branches ----------

test('description branches on prenatal: mentions due date', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 48, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /expecting on July 19, 2026/);
  assert.match(flat, /In-home overnight postpartum support/);
});

test('description branches on postpartum: mentions birth date', () => {
  const state = { lead: { ...baseState.lead, isPostpartum: true, dueDate: '2026-04-15' } };
  const doc = buildEstimateDocDefinition(state, baseResults, { hourlyRate: 48, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /gave birth on April 15, 2026/);
  assert.match(flat, /currently in the postpartum recovery period/);
});

// ---------- Non-medical language pinning ----------

test('no medical/clinical language anywhere in the document', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 48, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.doesNotMatch(flat, /\bRN\b/);
  assert.doesNotMatch(flat, /Registered Nurse/i);
  assert.doesNotMatch(flat, /RNAO/i);
  assert.doesNotMatch(flat, /Private Duty Nursing/i);
  assert.doesNotMatch(flat, /clinical/i);
  assert.doesNotMatch(flat, /vital signs/i);
  assert.doesNotMatch(flat, /complication/i);
});

test('service label uses "In-Home Postpartum Support"', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 48, today: TODAY });
  assert.match(JSON.stringify(doc), /In-Home Postpartum Support/);
});

test('footer points to concierge email, not consult booking', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 48, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /concierge@almacare\.ca/);
  assert.doesNotMatch(flat, /book-a-call/);
  assert.doesNotMatch(flat, /Book a consultation/i);
});

// ---------- Province + name fallbacks ----------

test('province is inferred from postal code (M → ON)', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 48, today: TODAY });
  assert.match(JSON.stringify(doc), /Toronto, ON M5V 2T6/);
});

test('province is inferred for a BC postal code', () => {
  const state = { lead: { ...baseState.lead, city: 'Vancouver', postalCode: 'V6B 5K3' } };
  const doc = buildEstimateDocDefinition(state, baseResults, { hourlyRate: 48, today: TODAY });
  assert.match(JSON.stringify(doc), /Vancouver, BC V6B 5K3/);
});

test('name falls back to em-dash when both first and last are missing', () => {
  const state = { lead: { firstName: '', lastName: '', city: 'Toronto', postalCode: 'M5V 2T6', dueDate: '2026-07-19' } };
  const doc = buildEstimateDocDefinition(state, baseResults, { hourlyRate: 48, today: TODAY });
  assert.match(JSON.stringify(doc), /"text":"—"/);
});

test('street line is omitted when streetAddress is empty', () => {
  const state = { lead: { ...baseState.lead, streetAddress: '' } };
  const doc = buildEstimateDocDefinition(state, baseResults, { hourlyRate: 48, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.doesNotMatch(flat, /123 Main St/);
  assert.match(flat, /Toronto, ON M5V 2T6/);
});

// ---------- buildEstimateFilename ----------

test('buildEstimateFilename: standard last name + date', () => {
  const name = buildEstimateFilename({ lead: { lastName: 'Doe' } }, TODAY);
  assert.strictEqual(name, 'alma-coverage-estimate-doe-2026-06-02.pdf');
});

test('buildEstimateFilename: strips non-alphanumeric from last name', () => {
  const name = buildEstimateFilename({ lead: { lastName: "O'Brien-Smith" } }, TODAY);
  assert.strictEqual(name, 'alma-coverage-estimate-obriensmith-2026-06-02.pdf');
});

test('buildEstimateFilename: falls back to "family" when lastName is empty/missing', () => {
  assert.strictEqual(
    buildEstimateFilename({ lead: { lastName: '' } }, TODAY),
    'alma-coverage-estimate-family-2026-06-02.pdf'
  );
  assert.strictEqual(
    buildEstimateFilename({ lead: {} }, TODAY),
    'alma-coverage-estimate-family-2026-06-02.pdf'
  );
});

test('buildEstimateFilename: pads month and day with leading zeros', () => {
  const jan5 = new Date(2026, 0, 5);
  const name = buildEstimateFilename({ lead: { lastName: 'Doe' } }, jan5);
  assert.strictEqual(name, 'alma-coverage-estimate-doe-2026-01-05.pdf');
});
