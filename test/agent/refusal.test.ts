/**
 * Reading a "no".
 *
 * Three bodies arrive on the one `isError: true` envelope, and all three have
 * to come out as a {@link MerchantRefusal} rather than a thrown error (D73).
 */

import { describe, expect, it } from 'vitest';

import { UNSTRUCTURED_REFUSAL_CODE, describeRefusal, readRefusal } from '../../agent/index.js';

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

describe('place_order’s refusal, which lists the mandate checks that failed', () => {
  it('reads error.refusals as PolicyRefusal objects', () => {
    const refusal = readRefusal(
      JSON.stringify({
        error: {
          code: 'mandate_refused',
          message: 'the mandate does not cover this purchase',
          refusals: [
            { reason: 'mandate_expired', message: 'valid_until was 2026-10-26T00:00:00Z' },
            { reason: 'budget_exceeded', message: '2350 asked, 1000 left' },
          ],
        },
      }),
    );

    expect(refusal.code).toBe('mandate_refused');
    expect(refusal.reasons.map((entry) => entry.reason)).toEqual([
      'mandate_expired',
      'budget_exceeded',
    ]);
    expect(refusal.reasons[1]?.message).toBe('2350 asked, 1000 left');
  });

  it('reads error.reasons as bare codes, because T07a may name it that way', () => {
    const refusal = readRefusal(
      JSON.stringify({
        error: {
          code: 'mandate_refused',
          message: 'refused',
          reasons: ['agent_mismatch', 'currency_mismatch'],
        },
      }),
    );

    expect(refusal.reasons).toEqual([
      { reason: 'agent_mismatch', message: 'agent_mismatch' },
      { reason: 'currency_mismatch', message: 'currency_mismatch' },
    ]);
  });

  it('treats a missing reason list as an empty one, not an error', () => {
    const refusal = readRefusal(
      JSON.stringify({ error: { code: 'mandate_refused', message: 'refused' } }),
    );

    expect(refusal.reasons).toEqual([]);
  });

  it('ignores a reason list it cannot read', () => {
    const refusal = readRefusal(
      JSON.stringify({ error: { code: 'mandate_refused', message: 'refused', refusals: 7 } }),
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
