import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEstimateDocDefinition } from '../src/pdf.js';

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

const TODAY = new Date('2026-05-23');

test('returns null when nursing eligibleAmount is 0', () => {
  const doc = buildEstimateDocDefinition(baseState, { nursing: { eligibleAmount: 0 } }, { hourlyRate: 90, today: TODAY });
  assert.strictEqual(doc, null);
});

test('returns null when nursing missing entirely', () => {
  const doc = buildEstimateDocDefinition(baseState, {}, { hourlyRate: 90, today: TODAY });
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

test('$2000 nursing at $90/hr → 22 hours, $1,980 cost', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /22 hours/);
  assert.match(flat, /\$1,980/);
  assert.match(flat, /\$90\.00/);
});

test('$1500 nursing at $100/hr → 15 hours, $1,500 cost (clean division)', () => {
  const doc = buildEstimateDocDefinition(
    baseState,
    { nursing: { eligibleAmount: 1500 } },
    { hourlyRate: 100, today: TODAY }
  );
  const flat = JSON.stringify(doc);
  assert.match(flat, /15 hours/);
  assert.match(flat, /\$1,500/);
});

test('"Prepared for" includes name, street, city, postal code', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /Jane Doe/);
  assert.match(flat, /123 Main St/);
  assert.match(flat, /Toronto/);
  assert.match(flat, /M5V 2T6/);
});

test('"Prepared for" gracefully omits street when missing', () => {
  const state = { lead: { ...baseState.lead, streetAddress: '' } };
  const doc = buildEstimateDocDefinition(state, baseResults, { hourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /Toronto/);
  assert.doesNotMatch(flat, /123 Main St/);
});

test('generated date uses long form (May 23, 2026)', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /May 23, 2026/);
});

test('includes purpose statement, disclaimer, and concierge footer', () => {
  const doc = buildEstimateDocDefinition(baseState, baseResults, { hourlyRate: 90, today: TODAY });
  const flat = JSON.stringify(doc);
  assert.match(flat, /insurance coverage inquiry or pre-determination/i);
  assert.match(flat, /does not guarantee reimbursement/i);
  assert.match(flat, /Postnatal Care Concierge/i);
  assert.match(flat, /RN eligible pathway/);
  assert.match(flat, /Postpartum In-Home Nursing Support/i);
});
