/**
 * The failure-case suite PRD R10 asks for: expired, wrong merchant, over cap,
 * a field added after signing, and replay, each driven end to end through
 * the merchant server over the MCP pipe, each asserted as the exact lines the
 * audit log prints.
 *
 * Most of these refusals already have a test that asserts the reason code
 * (`place-order.test.ts`, `confirm-order.test.ts`). What is asserted here is
 * what each one leaves behind for the reader the log exists for: the line, in
 * the columns `formatEntry` prints, so a refusal that stopped being logged, or
 * started being logged under another reason, fails by name.
 *
 * Replay is the case that leaves no line of its own. A replayed quote or
 * token is refused before the mandate check, and D65 and D99 rule that such a
 * refusal writes nothing. So the replay tests assert the log is exactly what
 * the first attempt left, line for line, and that the rail and the ledger did
 * not move (D126, D127).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OutputStream } from '../../mandate/index.js';

import {
  AGENT,
  MANDATE_ID,
  MUG_PRICE,
  NOW,
  confirm,
  holdOrder,
  mandateFor,
  openMerchant,
  order,
  quoteFor,
  reasonsOf,
  refusalOf,
  successOf,
  type Merchant,
} from './support/merchant-harness.js';
import { ScriptedRail } from './support/scripted-rail.js';

/** The log exactly as `print()` writes it, one string per line. */
function printed(merchant: Merchant): string[] {
  const written: string[] = [];
  const stream: OutputStream = { write: (chunk) => written.push(chunk) };
  merchant.policy.audit.print(stream);
  return written.join('').split('\n').slice(0, -1);
}

/** A mandate check line, as `formatEntry` prints one at {@link NOW}. */
function checkLine(outcome: string, reasons: string): string {
  return `${NOW}  ${outcome.padEnd(16)}  ${MUG_PRICE} GBP  ${AGENT} -> merchant-demo  mandate ${MANDATE_ID}  ${reasons}`;
}

/** A settlement line for the first order, as `formatEntry` prints one at {@link NOW}. */
function settlementLine(outcome: string, detail: string): string {
  return `${NOW}  ${outcome.padEnd(16)}  ${MUG_PRICE} GBP  order order_000001  mandate ${MANDATE_ID}  ${detail}`;
}

describe('failure cases, end to end, with the audit line each leaves (PRD R10)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('expired: a mandate whose window closed before the order', async () => {
    const { quote_id } = await quoteFor(merchant);
    const mandate = mandateFor({
      valid_from: '2026-10-27T00:00:00.000Z',
      valid_until: '2026-10-28T00:00:00.000Z',
    });

    const result = await order(merchant, { quote_id, agent: AGENT, mandate });

    expect(reasonsOf(result)).toEqual(['mandate_expired']);
    expect(printed(merchant)).toEqual([checkLine('refuse', 'mandate_expired')]);
    expect(merchant.railLog).toHaveLength(0);
  });

  it('wrong merchant: a mandate good at another merchant', async () => {
    const { quote_id } = await quoteFor(merchant);
    const mandate = mandateFor({ merchant: 'merchant-other' });

    const result = await order(merchant, { quote_id, agent: AGENT, mandate });

    expect(reasonsOf(result)).toEqual(['merchant_mismatch']);
    // The line names the merchant asked of, which is this one: what makes the
    // refusal legible is that the mandate said otherwise.
    expect(printed(merchant)).toEqual([checkLine('refuse', 'merchant_mismatch')]);
    expect(merchant.railLog).toHaveLength(0);
  });

  it('over cap: one order above the per-transaction ceiling', async () => {
    const { quote_id } = await quoteFor(merchant);
    const mandate = mandateFor({ per_transaction_cap_minor: MUG_PRICE - 1 });

    const result = await order(merchant, { quote_id, agent: AGENT, mandate });

    expect(reasonsOf(result)).toEqual(['per_transaction_cap_exceeded']);
    expect(printed(merchant)).toEqual([checkLine('refuse', 'per_transaction_cap_exceeded')]);
    expect(merchant.railLog).toHaveLength(0);
  });

  it('over cap: a second order more than the budget has left', async () => {
    const mandate = mandateFor({ amount_cap_minor: MUG_PRICE * 2 - 1 });
    const first = await quoteFor(merchant);
    successOf(await order(merchant, { quote_id: first.quote_id, agent: AGENT, mandate }));
    const second = await quoteFor(merchant);

    const result = await order(merchant, { quote_id: second.quote_id, agent: AGENT, mandate });

    expect(reasonsOf(result)).toEqual(['budget_exceeded']);
    expect(printed(merchant)).toEqual([
      checkLine('allow', '-'),
      settlementLine('paid', '-'),
      checkLine('refuse', 'budget_exceeded'),
    ]);
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
  });

  it('a field added after signing: the signature no longer holds (D23, D67)', async () => {
    const { quote_id } = await quoteFor(merchant);
    const mandate = { ...mandateFor(), per_transaction_cap_override_minor: 99_999 };

    const result = await order(merchant, { quote_id, agent: AGENT, mandate });

    expect(reasonsOf(result)).toEqual(['signature_invalid']);
    expect(printed(merchant)).toEqual([checkLine('refuse', 'signature_invalid')]);
    expect(merchant.railLog).toHaveLength(0);
  });

  it('replay of place_order: the same quote a second time (D64, D127)', async () => {
    const { quote_id } = await quoteFor(merchant);
    successOf(await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() }));
    const before = printed(merchant);

    const replay = await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    expect(refusalOf(replay).code).toBe('quote_already_ordered');
    expect(refusalOf(replay).message).toContain('order_000001');
    // Refused before the mandate check, so no line of its own (D65): the log
    // is the first order's two lines and nothing else.
    expect(before).toEqual([checkLine('allow', '-'), settlementLine('paid', '-')]);
    expect(printed(merchant)).toEqual(before);
    // One authorise and one capture, from the first call only.
    expect(merchant.railLog).toHaveLength(2);
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
  });

  it('replay of confirm_order: the same token after the order was paid (D84, D127)', async () => {
    const { confirmation_token } = await holdOrder(merchant);
    successOf(await confirm(merchant, confirmation_token));
    const before = printed(merchant);

    const replay = await confirm(merchant, confirmation_token);

    expect(refusalOf(replay).code).toBe('order_already_paid');
    // The hold, the re-check at confirmation, the payment; the replay adds
    // nothing, because it never reached the mandate check or the rail (D99).
    expect(before).toEqual([
      checkLine('confirm_required', '-'),
      checkLine('confirm_required', '-'),
      settlementLine('paid', '-'),
    ]);
    expect(printed(merchant)).toEqual(before);
    expect(merchant.railLog).toHaveLength(2);
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
  });
});

describe('replay after a rail that never answered (D85, D126)', () => {
  it('refuses the token a second time, so the rail is asked for one hold, not two', async () => {
    const rail = new ScriptedRail({ authorise: new Error('timeout') });
    const merchant = await openMerchant({ rail });
    try {
      const { confirmation_token } = await holdOrder(merchant);
      expect(refusalOf(await confirm(merchant, confirmation_token)).code).toBe(
        'rail_unavailable',
      );
      const before = printed(merchant);

      const replay = await confirm(merchant, confirmation_token);

      expect(refusalOf(replay).code).toBe('confirmation_token_spent');
      expect(refusalOf(replay).message).toContain('order_000001');
      expect(rail.calls).toEqual(['authorise']);
      expect(before).toEqual([
        checkLine('confirm_required', '-'),
        checkLine('confirm_required', '-'),
        settlementLine('rail_unavailable', 'no answer from authorise'),
      ]);
      expect(printed(merchant)).toEqual(before);
      // D85 still holds: nothing is known about the money, so the order keeps
      // its state and the ledger is untouched. Only the token is used up.
      expect(merchant.state.orders.get('order_000001')?.status).toBe('awaiting_confirmation');
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
    } finally {
      await merchant.close();
    }
  });
});
