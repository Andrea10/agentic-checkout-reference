/**
 * Tests for the spend ledger: the record of how much of each mandate's total
 * cap has already been used.
 */

import { describe, expect, it } from 'vitest';

import { createMemoryLedger, isNonNegativeMinorUnits } from '../../mandate/index.js';

const MANDATE = '7f1c2a5e-9b3d-4c81-a2f6-0d5e8b4a1c33';
const OTHER_MANDATE = '00000000-0000-4000-8000-000000000000';

describe('createMemoryLedger', () => {
  it('reports nothing spent under a mandate it has never seen', () => {
    expect(createMemoryLedger().spent(MANDATE)).toBe(0);
  });

  it('adds spends up and returns the running total', () => {
    const ledger = createMemoryLedger();

    expect(ledger.record(MANDATE, 1500)).toBe(1500);
    expect(ledger.record(MANDATE, 1000)).toBe(2500);
    expect(ledger.spent(MANDATE)).toBe(2500);
  });

  it('keeps each mandate separate', () => {
    const ledger = createMemoryLedger();

    ledger.record(MANDATE, 1500);

    expect(ledger.spent(OTHER_MANDATE)).toBe(0);
  });

  it('accepts a zero spend', () => {
    const ledger = createMemoryLedger();

    expect(ledger.record(MANDATE, 0)).toBe(0);
  });

  it('gives each ledger its own history', () => {
    const first = createMemoryLedger();
    first.record(MANDATE, 1500);

    expect(createMemoryLedger().spent(MANDATE)).toBe(0);
  });

  it.each([1500.5, -1, -0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2])(
    'refuses to record %p, which is not a non-negative integer of minor units',
    (amount) => {
      const ledger = createMemoryLedger();

      expect(() => ledger.record(MANDATE, amount)).toThrow(TypeError);
      expect(ledger.spent(MANDATE)).toBe(0);
    },
  );
});

describe('isNonNegativeMinorUnits', () => {
  it.each([0, 1, 2500, Number.MAX_SAFE_INTEGER])('accepts %p', (amount) => {
    expect(isNonNegativeMinorUnits(amount)).toBe(true);
  });

  it.each([
    -1,
    -0.5,
    0.5,
    2500.000001,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 2,
    '2500',
    null,
    undefined,
    {},
  ])('rejects %p', (amount) => {
    expect(isNonNegativeMinorUnits(amount)).toBe(false);
  });
});
