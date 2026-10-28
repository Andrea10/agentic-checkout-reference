/**
 * Reading a "no".
 *
 * Three bodies arrive on the one `isError: true` envelope, and all three have
 * to come out as a {@link MerchantRefusal} rather than a thrown error (D73).
 */

import { describe, expect, it } from 'vitest';

import {
  MANDATE_REFUSED_CODE,
  UNSTRUCTURED_REFUSAL_CODE,
  describeRefusal,
  readRefusal,
} from '../../agent/index.js';

describe('the merchant envelope', () => {
  it('reads the code and the message', () => {
    const refusal = readRefusal(
      JSON.stringify({ error: { code: 'cart_empty', message: 'nothing in cart cart_000001' } }),
    );

    expect(refusal).toEqual({
      code: 'cart_empty',
      message: 'nothing in cart cart_000001',
      reasons: [],
    });
  });

  it('ignores fields it does not read, rather than rejecting them (D77)', () => {
    const refusal = readRefusal(
      JSON.stringify({
        error: { code: 'quote_stale', message: 'cart moved on', quoted_version: 3 },
        trace_id: 'abc',
      }),
    );

    expect(refusal.code).toBe('quote_stale');
  });
});

describe('place_order’s refusal, which lists the mandate checks that failed (D66)', () => {
  it('reads error.reasons as the mandate layer’s PolicyRefusal objects', () => {
    const refusal = readRefusal(
      JSON.stringify({
        error: {
          code: MANDATE_REFUSED_CODE,
          message: 'the mandate does not authorise this order: mandate_expired, budget_exceeded',
          reasons: [
            { reason: 'mandate_expired', message: 'this mandate expired at 2026-10-26T00:00:00Z' },
            { reason: 'budget_exceeded', message: '2350 is more than the 1000 GBP left' },
          ],
        },
      }),
    );

    expect(refusal.code).toBe('mandate_refused');
    expect(refusal.reasons.map((entry) => entry.reason)).toEqual([
      'mandate_expired',
      'budget_exceeded',
    ]);
    expect(refusal.reasons[1]?.message).toBe('2350 is more than the 1000 GBP left');
  });

  it('ignores error.refusals, which no merchant sends', () => {
    // An earlier draft of the agent accepted this field too, written before
    // `place_order` was on main. The shipped envelope is `reasons` (D66), so
    // the tolerance was dropped: a reader should not have to rule out a
    // second field that never existed.
    const refusal = readRefusal(
      JSON.stringify({
        error: {
          code: MANDATE_REFUSED_CODE,
          message: 'refused',
          refusals: [{ reason: 'agent_mismatch', message: 'wrong agent' }],
        },
      }),
    );

    expect(refusal.code).toBe('mandate_refused');
    expect(refusal.reasons).toEqual([]);
  });

  it('treats a missing reason list as an empty one, not an error', () => {
    // Every refusal but `mandate_refused` arrives without the field.
    const refusal = readRefusal(
      JSON.stringify({ error: { code: 'quote_already_ordered', message: 'already ordered' } }),
    );

    expect(refusal.reasons).toEqual([]);
  });

  it('ignores a reason list it cannot read', () => {
    const refusal = readRefusal(
      JSON.stringify({ error: { code: MANDATE_REFUSED_CODE, message: 'refused', reasons: 7 } }),
    );

    expect(refusal.reasons).toEqual([]);
  });

  it('ignores a reason list whose entries are bare strings', () => {
    const refusal = readRefusal(
      JSON.stringify({
        error: { code: MANDATE_REFUSED_CODE, message: 'refused', reasons: ['agent_mismatch'] },
      }),
    );

    expect(refusal.reasons).toEqual([]);
  });
});

describe('a body that is not the envelope at all (D78)', () => {
  it('turns the SDK’s input-validation sentence into tool_error', () => {
    const text = 'Input validation error: Invalid arguments for tool add_to_cart: quantity: Too small';
    const refusal = readRefusal(text);

    expect(refusal).toEqual({ code: UNSTRUCTURED_REFUSAL_CODE, message: text, reasons: [] });
  });

  it('keeps JSON that is not the envelope as its own text', () => {
    const refusal = readRefusal('{"oops":true}');

    expect(refusal.code).toBe(UNSTRUCTURED_REFUSAL_CODE);
    expect(refusal.message).toBe('{"oops":true}');
  });

  it('never throws, whatever the text is', () => {
    for (const text of ['', 'null', '[]', '{', 'undefined']) {
      expect(readRefusal(text).code).toBe(UNSTRUCTURED_REFUSAL_CODE);
    }
  });
});

describe('describeRefusal', () => {
  it('renders a refusal without reasons as code and message', () => {
    expect(describeRefusal({ code: 'cart_empty', message: 'nothing in it', reasons: [] })).toBe(
      'cart_empty: nothing in it',
    );
  });

  it('appends the reason codes when there are some', () => {
    const rendered = describeRefusal({
      code: 'mandate_refused',
      message: 'no',
      reasons: [
        { reason: 'mandate_expired', message: 'x' },
        { reason: 'budget_exceeded', message: 'y' },
      ],
    });

    expect(rendered).toBe('mandate_refused: no [mandate_expired, budget_exceeded]');
  });
});
