import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALMA_RN_HOURLY_RATE, ALMA_PSW_HOURLY_RATE, ALMA_NIGHT_HOURS } from '../src/rules.js';

test('ALMA_RN_HOURLY_RATE is the configured numeric rate', () => {
  assert.strictEqual(ALMA_RN_HOURLY_RATE, 50);
});

test('ALMA_PSW_HOURLY_RATE is the configured numeric rate', () => {
  assert.strictEqual(ALMA_PSW_HOURLY_RATE, 50);
});

test('ALMA_NIGHT_HOURS defaults to 10 hours per overnight shift', () => {
  assert.strictEqual(ALMA_NIGHT_HOURS, 10);
});
