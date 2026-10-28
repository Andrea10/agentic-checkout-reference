/**
 * `confirm_order`, and every way a payment can fail.
 *
 * Two things are being tested here, and they are tested together on purpose.
 *
 * The first is the human-confirm path end to end: an order held above the
 * mandate's threshold, a token presented, the rail charged, `paid`. The checks
 * that run in between — the stock, the hold's own window, the mandate against
 * the clock and the budget as they are *now* — are the point of the tool, so
 * each has a test that fails without it.
 *
 * The second is the payment itself. `place_order` and `confirm_order` share
 * one `settle()` (D88), so the declines are driven through `confirm_order`
 * rather than written twice: a rail that will not hold the funds, a capture
 * refused after the funds were held, and a rail that throws instead of
 * answering. The property that matters in all three is the same one — the
 * order is not `paid` and the mandate's budget is untouched — because budget
 * consumed by a payment that failed is budget the user never gets back (D45).
 *
 * Everything runs over the real MCP pipe, for the reason `place-order.test.ts`
 * gives: a refusal is only worth something if it survives the trip to the
 * agent.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  AGENT,
  MANDATE_ID,
  MERCHANT,
  MUG,
  MUG_PRICE,
  checksOf,
  confirm,
  heldMandate,
  holdOrder,
  mandateFor,
  openMerchant,
  order,
  outcomesOf,
  quoteFor,
  reasonsOf,
  refusalOf,
  settlementsOf,
  successOf,
  type Merchant,
} from './support/merchant-harness.js';
import { bodyOf } from './support/raw-client.js';
import {
  CAPTURE_DECLINE,
  ISSUER_DECLINE,
  ScriptedRail,
} from './support/scripted-rail.js';

import type { RailCall } from '../../rail/index.js';

describe('confirm_order: held, confirmed, paid (PRD R4)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('completes the held order and answers paid, in two fields (D88)', async () => {
    const { confirmation_token, order_id } = await holdOrder(merchant);

    const body = successOf(await confirm(merchant, confirmation_token));

    expect(body.status).toBe('paid');
    expect(body.order_id).toBe(order_id);
    expect(body.order_id).toBe('order_000001');
    expect(Object.keys(body).sort()).toEqual(['order_id', 'status']);
  });

  it('matches its advertised output schema, so structuredContent is sent too', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    const result = await confirm(merchant, confirmation_token);

    expect(result.structuredContent).toEqual(bodyOf(result));
  });

  it('authorises then captures, with the order id as the rail’s order_ref (D56)', async () => {
    const { confirmation_token, order_id } = await holdOrder(merchant);

    await confirm(merchant, confirmation_token);

    expect(
      merchant.railLog.map((entry) => ({ call: entry.call, outcome: entry.outcome })),
    ).toEqual([
      { call: 'authorise', outcome: 'ok' },
      { call: 'capture', outcome: 'ok' },
    ]);
    expect(merchant.railLog.every((entry) => entry.order_ref === order_id)).toBe(true);
    expect(merchant.stub?.statusOf('auth_000001')).toBe('captured');
  });

  it('moves the order through authorised to paid, keeping both rail records', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    await confirm(merchant, confirmation_token);
    const stored = merchant.state.orders.get('order_000001');

    expect(stored?.status).toBe('paid');
    expect(stored?.status === 'paid' ? stored.authorisation.authorisation_id : '').toBe(
      'auth_000001',
    );
    expect(stored?.status === 'paid' ? stored.capture.amount_minor : 0).toBe(MUG_PRICE);
    // The price the human agreed to is the price that was taken: the order
    // carries its own snapshot, so nothing downstream re-reads the quote.
    expect(stored?.amount_minor).toBe(MUG_PRICE);
  });

  it('records the spend exactly once, for the amount the rail took (D45, D87)', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
    await confirm(merchant, confirmation_token);

    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
  });

  it('needs no mandate on the wire: the principal confirming is not the agent (D61, D74)', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    const response = await merchant.client.request('tools/list');
    const tools = (response.result?.['tools'] ?? []) as {
      name: string;
      inputSchema?: Record<string, unknown>;
    }[];
    const tool = tools.find((entry) => entry.name === 'confirm_order');

    expect(Object.keys(tool?.inputSchema?.['properties'] ?? {})).toEqual([
      'confirmation_token',
    ]);
    expect(tool?.inputSchema?.['required']).toEqual(['confirmation_token']);
    // And the token alone really is enough.
    expect(successOf(await confirm(merchant, confirmation_token)).status).toBe('paid');
  });

  it('advertises paid as the only way out', async () => {
    const response = await merchant.client.request('tools/list');
    const tools = (response.result?.['tools'] ?? []) as {
      name: string;
      outputSchema?: Record<string, unknown>;
    }[];
    const schema = tools.find((entry) => entry.name === 'confirm_order')?.outputSchema ?? {};
    const properties = schema['properties'] as Record<string, Record<string, unknown>>;

    // A literal rather than an enum of one: a confirmation that does not end
    // in a payment ends in a refusal, so there is no second word to advertise.
    expect(properties['status']?.['const']).toBe('paid');
    expect(properties['status']?.['type']).toBe('string');
    expect((schema['required'] as string[]).sort()).toEqual(['order_id', 'status']);
  });
});

describe('confirm_order: the token is good for one payment (D84)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('refuses a token no order was ever held under', async () => {
    await holdOrder(merchant);

    const result = await confirm(merchant, 'confirm_999999');

    expect(refusalOf(result).code).toBe('confirmation_token_unknown');
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
  });

  it('refuses an empty token', async () => {
    const result = await confirm(merchant, '');

    expect(refusalOf(result).code).toBe('confirmation_token_unknown');
  });

  it('refuses the order id, which is a name and not a capability (D63)', async () => {
    const { order_id } = await holdOrder(merchant);

    const result = await confirm(merchant, order_id);

    expect(refusalOf(result).code).toBe('confirmation_token_unknown');
  });

  it('refuses a second confirmation, and says the order is already paid', async () => {
    const { confirmation_token } = await holdOrder(merchant);
    successOf(await confirm(merchant, confirmation_token));

    const second = await confirm(merchant, confirmation_token);

    expect(refusalOf(second).code).toBe('order_already_paid');
    expect(refusalOf(second).message).toContain('order_000001');
  });

  it('charges the rail once, however many times the token comes back', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    await confirm(merchant, confirmation_token);
    await confirm(merchant, confirmation_token);
    await confirm(merchant, confirmation_token);

    // Two rail calls in total, not six: the second and third confirmations are
    // refused before `settle()` is reached, so the rail never sees them — and
    // the money is taken once.
    expect(merchant.railLog).toHaveLength(2);
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
  });

  it('refuses a token whose order the rail declined', async () => {
    const declining = await openMerchant({ rail: new ScriptedRail({ authorise: ISSUER_DECLINE }) });
    try {
      const { confirmation_token } = await holdOrder(declining);
      expect(refusalOf(await confirm(declining, confirmation_token)).code).toBe(
        'payment_declined',
      );

      const again = await confirm(declining, confirmation_token);

      // The token was spent by the attempt that reached the rail. A declined
      // payment is not a retry oracle: the order is closed and the agent has
      // to re-quote (D84).
      expect(refusalOf(again).code).toBe('order_not_awaiting_confirmation');
      expect(refusalOf(again).message).toContain('declined');
    } finally {
      await declining.close();
    }
  });
});

describe('confirm_order: the hold has a lifetime (D82)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('confirms inside the fifteen minutes', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    merchant.advance(899);

    expect(successOf(await confirm(merchant, confirmation_token)).status).toBe('paid');
  });

  it('refuses once the hold has lapsed, naming the window it had', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    merchant.advance(900);
    const result = await confirm(merchant, confirmation_token);

    expect(refusalOf(result).code).toBe('order_expired');
    expect(refusalOf(result).message).toContain('2026-10-28T12:15:00.000Z');
    expect(merchant.state.orders.get('order_000001')?.status).toBe('awaiting_confirmation');
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
    expect(merchant.railLog).toHaveLength(0);
  });

  it('does not re-read the quote, whose own expiry is beside the point (D82)', async () => {
    // A quote is good for fifteen minutes from when it was priced; a hold for
    // fifteen minutes from when it was taken. Order ten minutes into the
    // quote's life and the two windows no longer line up.
    const { quote_id } = await quoteFor(merchant);
    merchant.advance(600);
    const held = successOf(
      await order(merchant, { quote_id, agent: AGENT, mandate: heldMandate() }),
    );

    // Seventeen minutes in: the quote lapsed two minutes ago and the hold has
    // eight minutes left. An order against that quote is now refused for
    // expiry, which is checked before anything else about it (D65).
    merchant.advance(420);
    expect(
      refusalOf(await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() })).code,
    ).toBe('quote_expired');

    // And the hold still confirms: the order carries the price the human is
    // being asked about, so a lapsed quote has no say in it.
    expect(
      successOf(await confirm(merchant, held.confirmation_token ?? '')).status,
    ).toBe('paid');
  });

  it('does not re-read the cart either: a cart that moved cannot cancel a hold', async () => {
    const { confirmation_token, order_id } = await holdOrder(merchant);
    const { cart_id } = { cart_id: merchant.state.orders.get(order_id)?.cart_id ?? '' };

    await merchant.client.request('tools/call', {
      name: 'add_to_cart',
      arguments: { cart_id, product_id: MUG, quantity: 1 },
    });

    expect(successOf(await confirm(merchant, confirmation_token)).status).toBe('paid');
    // Still the amount that was held, not the amount the cart now says.
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
  });
});

describe('confirm_order: the stock is re-checked (D17)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('refuses when the stock has gone while the human was thinking', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    merchant.sellOut(MUG);
    const result = await confirm(merchant, confirmation_token);

    expect(refusalOf(result).code).toBe('insufficient_stock');
    expect(refusalOf(result).message).toContain('the order was held');
    expect(refusalOf(result).message).toContain('0 left, 1 ordered');
  });

  it('leaves the order held, and the token live, when the stock comes back', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    merchant.sellOut(MUG);
    expect(refusalOf(await confirm(merchant, confirmation_token)).code).toBe(
      'insufficient_stock',
    );
    merchant.sellOut(MUG, 60);

    // A refusal before the rail changes nothing, so the human's yes is still
    // good — the same reasoning D64 gives for a quote whose order was refused.
    expect(successOf(await confirm(merchant, confirmation_token)).status).toBe('paid');
  });

  it('consults no mandate and calls no rail when the stock has gone (D65)', async () => {
    const { confirmation_token } = await holdOrder(merchant);
    const before = merchant.policy.audit.size;

    merchant.sellOut(MUG);
    await confirm(merchant, confirmation_token);

    expect(merchant.policy.audit.size).toBe(before);
    expect(merchant.railLog).toHaveLength(0);
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
  });
});

describe('confirm_order: the mandate is checked again (D83)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('refuses a mandate that expired between the hold and the token', async () => {
    const { confirmation_token } = await holdOrder(merchant, {
      valid_until: '2026-10-28T12:05:00.000Z',
    });

    merchant.advance(600);
    const result = await confirm(merchant, confirmation_token);

    // The human said yes ten minutes after the authority ran out. This is the
    // check that would not exist if the mandate were trusted from the hold.
    expect(reasonsOf(result)).toEqual(['mandate_expired']);
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
    expect(merchant.railLog).toHaveLength(0);
  });

  it('refuses when another order ate the budget while the human was thinking', async () => {
    // A cap with room for one mug and a little over, a per-transaction cap
    // above both, and a confirm threshold the mug clears so the first order
    // is held.
    const overrides = {
      amount_cap_minor: 2000,
      per_transaction_cap_minor: 2500,
      human_confirm_above_minor: 1000,
    };
    const { confirmation_token } = await holdOrder(merchant, overrides);

    // A second order under the same mandate, paid outright, takes 1450 of the
    // 2000. The held order's 1450 no longer fits in the 550 left.
    const second = await quoteFor(merchant);
    expect(
      successOf(
        await order(merchant, {
          quote_id: second.quote_id,
          agent: AGENT,
          mandate: mandateFor({ ...overrides, human_confirm_above_minor: 5000 }),
        }),
      ).status,
    ).toBe('paid');

    const result = await confirm(merchant, confirmation_token);

    expect(reasonsOf(result)).toEqual(['budget_exceeded']);
    // Only the order that was actually paid is in the ledger.
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
  });

  it('is not refused merely for being above the threshold again', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    // `confirm_required` is the expected answer to the re-check: the amount is
    // above the threshold, which is the whole reason this call exists. Reading
    // it as a refusal would make every held order unconfirmable.
    expect(successOf(await confirm(merchant, confirmation_token)).status).toBe('paid');
    expect(outcomesOf(merchant)).toEqual(['confirm_required', 'confirm_required', 'paid']);
  });

  it('refuses to complete anything at all with no issuer configured (D60)', async () => {
    const unconfigured = await openMerchant({ configured: false });
    try {
      const result = await confirm(unconfigured, 'confirm_000001');

      expect(refusalOf(result).code).toBe('merchant_misconfigured');
    } finally {
      await unconfigured.close();
    }
  });
});

describe('confirm_order: the audit log (D48, D65, D94)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('leaves one entry per call that reaches the mandate check, and none before it', async () => {
    const { confirmation_token } = await holdOrder(merchant);
    // One entry so far: the hold's own check.
    expect(merchant.policy.audit.size).toBe(1);

    await confirm(merchant, 'confirm_999999');
    await confirm(merchant, confirmation_token);
    await confirm(merchant, confirmation_token);

    // The unknown token and the already-paid order are refused before the
    // gate, so neither is logged: neither reached the mandate check (D65) and
    // neither reached the rail (D99). Only the confirmation in the middle
    // adds anything, and it adds two lines — its own re-check, and the
    // payment that followed it (D94).
    expect(checksOf(merchant)).toHaveLength(2);
    expect(checksOf(merchant).map((entry) => entry.outcome)).toEqual([
      'confirm_required',
      'confirm_required',
    ]);
    expect(outcomesOf(merchant)).toEqual([
      'confirm_required',
      'confirm_required',
      'paid',
    ]);
  });

  it('leaves no settlement entry for a confirmation refused before the rail (D99)', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    // A lapsed hold is the clearest of the four pre-rail refusals: fifteen
    // minutes is the window (D82), and nothing is asked of the rail after it.
    merchant.advance(901);
    expect(refusalOf(await confirm(merchant, confirmation_token)).code).toBe('order_expired');

    // One entry, the hold's own check. The refusal is in the error body and
    // nowhere else, which is D65's boundary seen from `confirm_order`: the log
    // records mandate decisions and settlements, and this is neither.
    expect(outcomesOf(merchant)).toEqual(['confirm_required']);
    expect(settlementsOf(merchant)).toEqual([]);
  });

  it('records the confirmation under the same mandate, agent and amount as the hold', async () => {
    const { confirmation_token } = await holdOrder(merchant);

    merchant.advance(60);
    await confirm(merchant, confirmation_token);
    const [hold, confirmation] = checksOf(merchant);

    expect(confirmation?.mandate_id).toBe(hold?.mandate_id);
    expect(confirmation?.agent).toBe(AGENT);
    expect(confirmation?.merchant).toBe(MERCHANT);
    expect(confirmation?.amount_minor).toBe(MUG_PRICE);
    // Two checks, a minute apart, on one purchase: the log is a record of
    // decisions, so both are in it.
    expect(hold?.at).toBe('2026-10-28T12:00:00.000Z');
    expect(confirmation?.at).toBe('2026-10-28T12:01:00.000Z');
  });

  it('says why the payment failed, in the same log as the decisions (D86, D94)', async () => {
    const declining = await openMerchant({ rail: new ScriptedRail({ authorise: ISSUER_DECLINE }) });
    try {
      const { confirmation_token } = await holdOrder(declining);
      await confirm(declining, confirmation_token);

      // **This test was the record of a gap, and now pins the fix.** On T07b
      // the log read `confirm_required, confirm_required` and not a word about
      // the decline: a settlement was a different kind of event and widening
      // `AuditEntry` meant changing `mandate/`, which T07b was not allowed to
      // touch (D48's cost, named in D86). Andrea ruled on 28 Oct that the gap
      // is fixed rather than documented, so T07c widened the entry and the
      // third line below is the one an auditor was missing: the card was
      // refused, by the issuer, under this mandate, on this order.
      expect(outcomesOf(declining)).toEqual([
        'confirm_required',
        'confirm_required',
        'payment_declined',
      ]);
      expect(checksOf(declining).every((entry) => entry.reasons.length === 0)).toBe(true);
      expect(settlementsOf(declining)[0]).toMatchObject({
        kind: 'settlement',
        outcome: 'payment_declined',
        order_id: 'order_000001',
        mandate_id: MANDATE_ID,
        amount_minor: MUG_PRICE,
        decline: { code: 'insufficient_funds', origin: 'issuer' },
      });
      // The other two sources still say what they said: the ledger is
      // untouched and the order is declined. What changed is that the audit
      // log alone now answers "why was this purchase not made?".
      expect(declining.policy.ledger.spent(MANDATE_ID)).toBe(0);
      expect(declining.state.orders.get('order_000001')?.status).toBe('declined');
    } finally {
      await declining.close();
    }
  });
});

describe('a payment that does not go through (D50, D81, D85)', () => {
  /** Holds an order on a merchant whose rail is scripted to fail. */
  async function withRail(rail: ScriptedRail): Promise<{
    merchant: Merchant;
    confirmation_token: string;
  }> {
    const merchant = await openMerchant({ rail });
    const { confirmation_token } = await holdOrder(merchant);
    return { merchant, confirmation_token };
  }

  it('reports an authorise decline with its code, message and origin (D53, D86)', async () => {
    const rail = new ScriptedRail({ authorise: ISSUER_DECLINE });
    const { merchant, confirmation_token } = await withRail(rail);
    try {
      const error = refusalOf(await confirm(merchant, confirmation_token));

      expect(error.code).toBe('payment_declined');
      expect(error.decline).toEqual({
        code: 'insufficient_funds',
        message: 'the issuer refused: not enough funds',
        origin: 'issuer',
      });
      // The origin is the distinction only payments needs: the issuer refusing
      // a cardholder's money is not the payment system rejecting a request.
      expect(error.decline?.origin).toBe('issuer');
    } finally {
      await merchant.close();
    }
  });

  it('marks the order declined, pays nothing, and records no spend', async () => {
    const rail = new ScriptedRail({ authorise: ISSUER_DECLINE });
    const { merchant, confirmation_token } = await withRail(rail);
    try {
      await confirm(merchant, confirmation_token);

      expect(merchant.state.orders.get('order_000001')?.status).toBe('declined');
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
      // No capture was attempted: there was nothing held to capture.
      expect(rail.calls).toEqual(['authorise']);
    } finally {
      await merchant.close();
    }
  });

  it('carries the decline onto the order, so the record says why', async () => {
    const rail = new ScriptedRail({ authorise: ISSUER_DECLINE });
    const { merchant, confirmation_token } = await withRail(rail);
    try {
      await confirm(merchant, confirmation_token);
      const stored = merchant.state.orders.get('order_000001');

      expect(stored?.status === 'declined' ? stored.decline : undefined).toEqual(
        ISSUER_DECLINE,
      );
    } finally {
      await merchant.close();
    }
  });

  it('declines the direct path the same way, and leaves the quote spent', async () => {
    const rail = new ScriptedRail({ authorise: ISSUER_DECLINE });
    const merchant = await openMerchant({ rail });
    try {
      const { quote_id } = await quoteFor(merchant);

      const error = refusalOf(
        await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() }),
      );

      expect(error.code).toBe('payment_declined');
      expect(merchant.state.orders.get('order_000001')?.status).toBe('declined');
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
      // The order exists, so the quote is used: a declined payment is not a
      // refused order, and D64's "a refused order creates nothing" does not
      // reach this far. The agent has to re-quote.
      expect(refusalOf(await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() })).code).toBe(
        'quote_already_ordered',
      );
    } finally {
      await merchant.close();
    }
  });

  it('leaves a refused capture authorised, and says so in a different code (D81)', async () => {
    const rail = new ScriptedRail({ capture: CAPTURE_DECLINE });
    const { merchant, confirmation_token } = await withRail(rail);
    try {
      const error = refusalOf(await confirm(merchant, confirmation_token));
      const stored = merchant.state.orders.get('order_000001');

      // The funds are held and could not be taken. That is neither paid nor
      // declined, and the agent is told which of the two it is not.
      expect(error.code).toBe('capture_failed');
      expect(error.decline).toEqual(CAPTURE_DECLINE);
      expect(error.message).toContain('authorisation is outstanding');
      expect(stored?.status).toBe('authorised');
      expect(stored?.status === 'authorised' ? stored.capture_decline : undefined).toEqual(
        CAPTURE_DECLINE,
      );
      expect(stored?.status === 'authorised' ? stored.authorisation.amount_minor : 0).toBe(
        MUG_PRICE,
      );
      // Nothing was taken, so nothing is spent. There is no cancel and no
      // refund in the rail interface, so the hold simply sits there (D57).
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
      expect(rail.calls).toEqual(['authorise', 'capture']);
    } finally {
      await merchant.close();
    }
  });

  it('will not re-confirm an order stuck authorised', async () => {
    const rail = new ScriptedRail({ capture: CAPTURE_DECLINE });
    const { merchant, confirmation_token } = await withRail(rail);
    try {
      await confirm(merchant, confirmation_token);

      const again = await confirm(merchant, confirmation_token);

      expect(refusalOf(again).code).toBe('order_not_awaiting_confirmation');
      expect(refusalOf(again).message).toContain('authorised');
      // One authorise, one capture: a second confirmation does not double the
      // hold on the cardholder's money (D56 names the hazard).
      expect(rail.calls).toEqual(['authorise', 'capture']);
    } finally {
      await merchant.close();
    }
  });

  it('reports a rail that throws as unavailable, not as a decline (D50, D85)', async () => {
    const rail = new ScriptedRail({ authorise: new Error('ECONNRESET talking to acquirer at 10.0.0.1') });
    const { merchant, confirmation_token } = await withRail(rail);
    try {
      const error = refusalOf(await confirm(merchant, confirmation_token));

      expect(error.code).toBe('rail_unavailable');
      expect(error.message).toContain('the payment state is unknown');
      // A decline is an answer about the money; a throw is not, so there is
      // no `decline` on the body to mistake for one.
      expect(error.decline).toBeUndefined();
      // And the rail's own message does not travel: a real rail's internal
      // errors carry hosts, URLs and sometimes credentials (D85).
      expect(error.message).not.toContain('ECONNRESET');
      expect(error.message).not.toContain('10.0.0.1');
    } finally {
      await merchant.close();
    }
  });

  it('records no spend and marks nothing when the rail throws on authorise', async () => {
    const rail = new ScriptedRail({ authorise: new Error('timeout') });
    const { merchant, confirmation_token } = await withRail(rail);
    try {
      await confirm(merchant, confirmation_token);

      // The payment may have gone through. Marking the order declined would
      // record a refused card that nobody refused, so the order keeps the
      // state it had and the ledger is untouched.
      expect(merchant.state.orders.get('order_000001')?.status).toBe(
        'awaiting_confirmation',
      );
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
    } finally {
      await merchant.close();
    }
  });

  it('leaves the order authorised when the rail throws on capture', async () => {
    const rail = new ScriptedRail({ capture: new Error('timeout') });
    const { merchant, confirmation_token } = await withRail(rail);
    try {
      const error = refusalOf(await confirm(merchant, confirmation_token));

      expect(error.code).toBe('rail_unavailable');
      // `authorised` is true whatever happened next: the rail granted the
      // hold, and whether it then took the funds is exactly what is unknown.
      expect(merchant.state.orders.get('order_000001')?.status).toBe('authorised');
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
    } finally {
      await merchant.close();
    }
  });

  it('never records a spend on any failing path', async () => {
    const failures = [
      new ScriptedRail({ authorise: ISSUER_DECLINE }),
      new ScriptedRail({ capture: CAPTURE_DECLINE }),
      new ScriptedRail({ authorise: new Error('down') }),
      new ScriptedRail({ capture: new Error('down') }),
    ];

    for (const rail of failures) {
      const { merchant, confirmation_token } = await withRail(rail);
      try {
        expect((await confirm(merchant, confirmation_token)).isError).toBe(true);
        expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
        expect(merchant.state.orders.get('order_000001')?.status).not.toBe('paid');
      } finally {
        await merchant.close();
      }
    }
  });
});

describe('the states an order passes through while the rail is called (D80)', () => {
  /** Waits until the merchant has actually reached the rail call. */
  async function untilCalled(rail: ScriptedRail, call: RailCall): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (rail.calls.includes(call)) return;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error(`the rail was never asked to ${call}`);
  }

  it('is approved while authorise is in flight on the direct path', async () => {
    const rail = new ScriptedRail({ pauseAt: 'authorise' });
    const merchant = await openMerchant({ rail });
    try {
      const { quote_id } = await quoteFor(merchant);
      const pending = order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });
      await untilCalled(rail, 'authorise');

      // `approved` is a real state, not a notional one: the order is written
      // down before any money moves, so a merchant that died here would have a
      // record of what it was about to charge for.
      expect(merchant.state.orders.get('order_000001')?.status).toBe('approved');

      rail.release();
      expect(successOf(await pending).status).toBe('paid');
    } finally {
      await merchant.close();
    }
  });

  it('is authorised while capture is in flight', async () => {
    const rail = new ScriptedRail({ pauseAt: 'capture' });
    const merchant = await openMerchant({ rail });
    try {
      const { quote_id } = await quoteFor(merchant);
      const mandate = heldMandate();
      const held = successOf(await order(merchant, { quote_id, agent: AGENT, mandate }));
      const pending = confirm(merchant, held.confirmation_token ?? '');
      await untilCalled(rail, 'capture');

      expect(merchant.state.orders.get('order_000001')?.status).toBe('authorised');
      // The budget is not consumed yet: the money has not been taken.
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);

      rail.release();
      expect(successOf(await pending).status).toBe('paid');
      expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
    } finally {
      await merchant.close();
    }
  });
});
