/**
 * `place_order`: the tool where money is authorised and, on the direct path,
 * taken.
 *
 * Most of what follows is driven over the real MCP pipe — raw JSON-RPC over
 * the SDK's in-memory transport pair, as D20 settled — because the refusals
 * are the product here, and a refusal is only worth something if it survives
 * the trip to the agent: the right `isError`, the right code, and every policy
 * reason in a list the agent can read without parsing prose.
 *
 * The in-memory transport rather than the spawned stdio process, for two
 * reasons: the server has to be built with a configured mandate policy (the
 * spawned one reads its key from the environment), and several of the tests
 * reach into the catalogue and the clock mid-conversation, which only works in
 * process. `protocol.test.ts` keeps the spawned-process suite.
 *
 * The payment *failures* live next door in `confirm-order.test.ts`, which owns
 * the scripted rails: the two tools share one `settle()` (D88), so the
 * declines, the stuck capture and the broken rail are tested once.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMandatePolicy, type Mandate } from '../../mandate/index.js';
import { CATALOGUE } from '../../merchant/catalogue.js';
import { MandateRefusedError } from '../../merchant/errors.js';
import { placeOrder } from '../../merchant/place-order.js';
import { totalOf } from '../../merchant/quote.js';
import { createMerchantState, getQuote } from '../../merchant/tools.js';

import {
  AGENT,
  MANDATE_ID,
  MERCHANT,
  MUG,
  MUG_PRICE,
  NOW,
  claims,
  issuer,
  mandateFor,
  openMerchant,
  order,
  quoteFor,
  reasonsOf,
  refusalOf,
  successOf,
  type Merchant,
} from './support/merchant-harness.js';
import { bodyOf } from './support/raw-client.js';

describe('place_order: the approved path', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('pays an order the mandate covers, in one call, and says so in one word (D88)', async () => {
    const { quote_id } = await quoteFor(merchant);

    const body = successOf(await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() }));

    // `approved` is a state the order passed through while the rail was being
    // called; it is never a body the merchant sends (D88).
    expect(body.status).toBe('paid');
    expect(body.order_id).toBe('order_000001');
    // No token, because nothing is waiting for a human.
    expect(body.confirmation_token).toBeUndefined();
    expect(Object.keys(body).sort()).toEqual(['order_id', 'status']);
  });

  it('matches its advertised output schema, so structuredContent is sent too', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    expect(result.structuredContent).toEqual(bodyOf(result));
  });

  it('stores the order with the quote, the cart version and the amount quoted', async () => {
    const { quote_id, cart_id } = await quoteFor(merchant);

    await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });
    const stored = merchant.state.orders.get('order_000001');

    expect(stored?.status).toBe('paid');
    expect(stored?.quote_id).toBe(quote_id);
    expect(stored?.cart_id).toBe(cart_id);
    expect(stored?.cart_version).toBe(2);
    expect(stored?.amount_minor).toBe(MUG_PRICE);
    expect(stored?.currency).toBe('GBP');
    expect(stored?.mandate_id).toBe(MANDATE_ID);
    expect(stored?.items).toEqual([
      {
        product_id: MUG,
        name: 'Cobbleford Stoneware Mug',
        quantity: 1,
        unit_price_minor: MUG_PRICE,
        line_total_minor: MUG_PRICE,
      },
    ]);
  });

  it('checks the amount from the stored quote, not from anything the caller sends', async () => {
    const { quote_id } = await quoteFor(merchant);

    // A caller inventing an amount, a currency and a merchant gets nowhere:
    // the extra arguments are not in the advertised schema and are dropped,
    // and the order is still for 1450 GBP at this merchant.
    await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: mandateFor(),
      amount_minor: 1,
      currency: 'USD',
      merchant: 'merchant-somewhere-else',
    });

    const entry = merchant.policy.audit.entries()[0];
    expect(entry?.amount_minor).toBe(MUG_PRICE);
    expect(entry?.currency).toBe('GBP');
    expect(entry?.merchant).toBe(MERCHANT);
    expect(entry?.outcome).toBe('allow');
  });

  it('authorises then captures, using the order id as the rail\u2019s order_ref (D56)', async () => {
    const { quote_id } = await quoteFor(merchant);

    await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    expect(
      merchant.railLog.map((entry) => ({
        call: entry.call,
        outcome: entry.outcome,
        order_ref: entry.order_ref,
        amount_minor: entry.amount_minor,
      })),
    ).toEqual([
      { call: 'authorise', outcome: 'ok', order_ref: 'order_000001', amount_minor: MUG_PRICE },
      { call: 'capture', outcome: 'ok', order_ref: 'order_000001', amount_minor: MUG_PRICE },
    ]);
    // And the rail is holding a settled authorisation, so a second capture of
    // it would be refused by the rail itself (D57).
    expect(merchant.stub?.statusOf('auth_000001')).toBe('captured');
  });

  it('records the spend once, for the amount the rail took (D45, D87)', async () => {
    const { quote_id } = await quoteFor(merchant);

    await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    // The amount checked, the amount authorised and the amount recorded are
    // one number. Nothing in the type system ties them together (D51's cost),
    // so a test does.
    expect(merchant.policy.audit.entries()[0]?.amount_minor).toBe(MUG_PRICE);
    expect(merchant.railLog[1]?.amount_minor).toBe(MUG_PRICE);
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(MUG_PRICE);
  });

  it('keeps the authorisation and the capture on the order', async () => {
    const { quote_id } = await quoteFor(merchant);

    await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });
    const stored = merchant.state.orders.get('order_000001');

    expect(stored?.status === 'paid' ? stored.authorisation.authorisation_id : '').toBe(
      'auth_000001',
    );
    expect(stored?.status === 'paid' ? stored.capture.amount_minor : 0).toBe(MUG_PRICE);
  });

  it('spends the budget, so a second order over what is left is refused', async () => {
    const first = await quoteFor(merchant, MUG, 2);
    const second = await quoteFor(merchant);
    // 2900 for two mugs, under a 3000 cap and a 3000 per-transaction cap,
    // leaving 100 of the 3000 for anything after it.
    const mandate = mandateFor({
      amount_cap_minor: 3000,
      per_transaction_cap_minor: 3000,
      human_confirm_above_minor: 5000,
    });

    expect(successOf(await order(merchant, { quote_id: first.quote_id, agent: AGENT, mandate })).status).toBe('paid');
    const refused = await order(merchant, { quote_id: second.quote_id, agent: AGENT, mandate });

    expect(reasonsOf(refused)).toEqual(['budget_exceeded']);
    expect(refusalOf(refused).reasons?.[0]?.message).toContain('100');
    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(2900);
  });
});

describe('place_order: the awaiting path (PRD R4)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('holds an order above the confirm threshold and returns a token', async () => {
    const { quote_id } = await quoteFor(merchant);

    // 1450 is above this mandate's threshold of 1000, and inside both caps:
    // nothing is wrong, a human simply asked to be consulted (D41).
    const body = successOf(
      await order(merchant, {
        quote_id,
        agent: AGENT,
        mandate: mandateFor({ human_confirm_above_minor: 1000 }),
      }),
    );

    expect(body.status).toBe('awaiting_confirmation');
    expect(body.order_id).toBe('order_000001');
    expect(body.confirmation_token).toBe('confirm_000001');
  });

  it('holds the token server-side, and it is not the order id (D63)', async () => {
    const { quote_id } = await quoteFor(merchant);

    const body = successOf(
      await order(merchant, {
        quote_id,
        agent: AGENT,
        mandate: mandateFor({ human_confirm_above_minor: 1000 }),
      }),
    );
    const held = merchant.state.orders.forConfirmationToken(body.confirmation_token ?? '');

    expect(held?.order_id).toBe(body.order_id);
    expect(body.confirmation_token).not.toBe(body.order_id);
    expect(held?.status).toBe('awaiting_confirmation');
    expect(held?.status === 'awaiting_confirmation' ? held.human_confirm_above_minor : 0).toBe(
      1000,
    );
  });

  it('records the held order as a decision, not as a refusal', async () => {
    const { quote_id } = await quoteFor(merchant);

    await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: mandateFor({ human_confirm_above_minor: 1000 }),
    });

    expect(merchant.policy.audit.entries()[0]?.outcome).toBe('confirm_required');
    expect(merchant.policy.audit.entries()[0]?.reasons).toEqual([]);
  });

  it('does not pay a held order either', async () => {
    const { quote_id } = await quoteFor(merchant);

    await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: mandateFor({ human_confirm_above_minor: 1000 }),
    });

    expect(merchant.policy.ledger.spent(MANDATE_ID)).toBe(0);
  });
});

describe('place_order: every policy refusal, through the server (D42, D66)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('signature_invalid: a field changed after signing', async () => {
    const { quote_id } = await quoteFor(merchant);
    const tampered: Mandate = { ...mandateFor(), amount_cap_minor: 99_999 };

    const result = await order(merchant, { quote_id, agent: AGENT, mandate: tampered });

    expect(reasonsOf(result)).toEqual(['signature_invalid']);
  });

  it('signature_invalid: a field added after signing is not stripped away (D67)', async () => {
    const { quote_id } = await quoteFor(merchant);

    // T03 signs every field present, so an added field has to reach `verify()`
    // for the signature to break. A schema that quietly dropped unknown keys
    // would hand the policy a mandate that verifies. This is the test T12's
    // tampering suite builds on.
    const result = await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: { ...mandateFor(), amount_cap_minor_override: 99_999 },
    });

    expect(reasonsOf(result)).toEqual(['signature_invalid']);
  });

  it('mandate_malformed: no signature to check', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: { ...claims(), signature: '' },
    });

    expect(reasonsOf(result)).toEqual(['mandate_malformed']);
  });

  it('agent_mismatch: the caller is not the agent the mandate names', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, {
      quote_id,
      agent: 'agent-impostor',
      mandate: mandateFor(),
    });

    expect(reasonsOf(result)).toEqual(['agent_mismatch']);
  });

  it('merchant_mismatch: the mandate is good somewhere else', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: mandateFor({ merchant: 'merchant-elsewhere' }),
    });

    expect(reasonsOf(result)).toEqual(['merchant_mismatch']);
  });

  it('mandate_window_invalid: a window this runtime cannot read', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: mandateFor({ valid_from: 'whenever' }),
    });

    expect(reasonsOf(result)).toEqual(['mandate_window_invalid']);
  });

  it('mandate_not_yet_valid: the window has not opened', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: mandateFor({
        valid_from: '2026-10-29T00:00:00.000Z',
        valid_until: '2026-10-30T00:00:00.000Z',
      }),
    });

    expect(reasonsOf(result)).toEqual(['mandate_not_yet_valid']);
  });

  it('mandate_expired: the window has closed', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: mandateFor({
        valid_from: '2026-10-26T00:00:00.000Z',
        valid_until: '2026-10-27T00:00:00.000Z',
      }),
    });

    expect(reasonsOf(result)).toEqual(['mandate_expired']);
  });

  it('currency_mismatch: caps in another currency say nothing about this amount (D43)', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: mandateFor({ currency: 'USD' }),
    });

    // The cap comparisons are suppressed, not merely passed: 1450 USD is not a
    // number this GBP quote can be compared with.
    expect(reasonsOf(result)).toEqual(['currency_mismatch']);
  });

  it('mandate_limits_invalid: a cap that is not a whole number of minor units', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: mandateFor({ per_transaction_cap_minor: 2500.5 }),
    });

    // Reachable only because the tool's schema describes shape and not
    // validity (D67): a `z.int()` here would have turned this into a protocol
    // error with nothing in the audit log.
    expect(reasonsOf(result)).toEqual(['mandate_limits_invalid']);
  });

  it('per_transaction_cap_exceeded: one order above the ceiling', async () => {
    const { quote_id } = await quoteFor(merchant, MUG, 2);

    const result = await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    // Two mugs is 2900, above the mandate's 2500 per-transaction cap.
    expect(reasonsOf(result)).toEqual(['per_transaction_cap_exceeded']);
  });

  it('budget_exceeded: more than the mandate has left', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, {
      quote_id,
      agent: AGENT,
      mandate: mandateFor({ amount_cap_minor: 1000 }),
    });

    expect(reasonsOf(result)).toEqual(['budget_exceeded']);
  });

  it('reports two failures together, in check order (D42)', async () => {
    const { quote_id } = await quoteFor(merchant);

    const result = await order(merchant, {
      quote_id,
      agent: 'agent-impostor',
      mandate: mandateFor({ merchant: 'merchant-elsewhere' }),
    });

    // Not one round trip per problem: the agent developer learns both at once,
    // in the order the policy checked them.
    expect(reasonsOf(result)).toEqual(['agent_mismatch', 'merchant_mismatch']);
  });

  it('carries a message per reason, and a summary naming them all', async () => {
    const { quote_id } = await quoteFor(merchant);

    const error = refusalOf(
      await order(merchant, {
        quote_id,
        agent: 'agent-impostor',
        mandate: mandateFor({ merchant: 'merchant-elsewhere' }),
      }),
    );

    expect(error.code).toBe('mandate_refused');
    expect(error.message).toContain('agent_mismatch');
    expect(error.message).toContain('merchant_mismatch');
    expect(error.reasons?.[0]?.message).toContain('agent-impostor');
    expect(error.reasons?.[1]?.message).toContain('merchant-elsewhere');
  });

  it('places no order when the mandate is refused', async () => {
    const { quote_id } = await quoteFor(merchant);

    await order(merchant, { quote_id, agent: 'agent-impostor', mandate: mandateFor() });

    expect(merchant.state.orders.size).toBe(0);
    // And the quote is still usable, so an agent with a fixed mandate can
    // retry rather than having to re-price the cart (D64).
    const body = successOf(
      await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() }),
    );
    expect(body.status).toBe('paid');
  });
});

describe('place_order: the quote has to be good (D38, D39, D64)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('refuses an unknown quote_id', async () => {
    const result = await order(merchant, {
      quote_id: 'quote_999999',
      agent: AGENT,
      mandate: mandateFor(),
    });

    expect(refusalOf(result).code).toBe('quote_not_found');
  });

  it('refuses an expired quote', async () => {
    const { quote_id } = await quoteFor(merchant);

    merchant.advance(901);
    const result = await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    expect(refusalOf(result).code).toBe('quote_expired');
  });

  it('refuses a stale quote once the cart has moved on', async () => {
    const { quote_id, cart_id } = await quoteFor(merchant);

    await merchant.client.request('tools/call', {
      name: 'add_to_cart',
      arguments: { cart_id, product_id: MUG, quantity: 1 },
    });
    const result = await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    // The price the agent was shown is no longer the price of this cart. That
    // is the check that stops an agent being authorised for 1450 and charged
    // for 2900.
    expect(refusalOf(result).code).toBe('quote_stale');
    expect(refusalOf(result).message).toContain('version');
  });

  it('refuses a second order against the same quote (D64)', async () => {
    const { quote_id } = await quoteFor(merchant);

    successOf(await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() }));
    const second = await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    expect(refusalOf(second).code).toBe('quote_already_ordered');
    expect(refusalOf(second).message).toContain('order_000001');
    expect(merchant.state.orders.size).toBe(1);
  });

  it('refuses a second order against a quote that is only held (D64)', async () => {
    const { quote_id } = await quoteFor(merchant);
    const mandate = mandateFor({ human_confirm_above_minor: 1000 });

    successOf(await order(merchant, { quote_id, agent: AGENT, mandate }));
    const second = await order(merchant, { quote_id, agent: AGENT, mandate });

    // Otherwise an agent could collect confirmation tokens for one quote until
    // a human said yes to one of them.
    expect(refusalOf(second).code).toBe('quote_already_ordered');
    expect(refusalOf(second).message).toContain('awaiting_confirmation');
  });
});

describe('place_order: stock is re-checked at order time (D17)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('refuses when the stock has gone since the quote was made', async () => {
    const { quote_id } = await quoteFor(merchant);

    merchant.sellOut(MUG);
    const result = await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    expect(refusalOf(result).code).toBe('insufficient_stock');
    expect(refusalOf(result).message).toContain(MUG);
    expect(refusalOf(result).message).toContain('0 left');
  });

  it('refuses when some of the stock has gone, naming what is short', async () => {
    const { quote_id } = await quoteFor(merchant, MUG, 4);

    merchant.sellOut(MUG, 3);
    const result = await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    expect(refusalOf(result).code).toBe('insufficient_stock');
    expect(refusalOf(result).message).toContain('3 left, 4 ordered');
  });

  it('places no order and consults no mandate when the stock has gone (D65)', async () => {
    const { quote_id } = await quoteFor(merchant);

    merchant.sellOut(MUG);
    await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    expect(merchant.state.orders.size).toBe(0);
    // The mandate check is the last gate, so there is nothing to log: no
    // purchase was authorised, and an `allow` entry for an order that was then
    // refused would read, to an auditor, as a purchase the merchant allowed.
    expect(merchant.policy.audit.size).toBe(0);
  });
});

describe('place_order: a merchant with no issuer configured (D60)', () => {
  it('refuses to take an order at all, rather than trusting the mandate it is given', async () => {
    const merchant = await openMerchant({ configured: false });
    try {
      const { quote_id } = await quoteFor(merchant);

      const result = await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

      expect(refusalOf(result).code).toBe('merchant_misconfigured');
      expect(merchant.state.orders.size).toBe(0);
    } finally {
      await merchant.close();
    }
  });
});

describe('place_order: the audit log (D48, D65)', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  it('writes one entry for every call that reaches the mandate check', async () => {
    const first = await quoteFor(merchant);
    const second = await quoteFor(merchant);
    const third = await quoteFor(merchant);

    await order(merchant, { quote_id: first.quote_id, agent: AGENT, mandate: mandateFor() });
    await order(merchant, {
      quote_id: second.quote_id,
      agent: 'agent-impostor',
      mandate: mandateFor(),
    });
    await order(merchant, {
      quote_id: third.quote_id,
      agent: AGENT,
      mandate: mandateFor({ human_confirm_above_minor: 1000 }),
    });

    expect(merchant.policy.audit.size).toBe(3);
    expect(merchant.policy.audit.entries().map((entry) => entry.outcome)).toEqual([
      'allow',
      'refuse',
      'confirm_required',
    ]);
    expect(merchant.policy.audit.entries()[1]?.reasons).toEqual(['agent_mismatch']);
  });

  it('records what was asked for, so a refusal is legible afterwards', async () => {
    const { quote_id } = await quoteFor(merchant);

    await order(merchant, {
      quote_id,
      agent: 'agent-impostor',
      mandate: mandateFor(),
    });
    const entry = merchant.policy.audit.entries()[0];

    expect(entry?.at).toBe(NOW);
    expect(entry?.mandate_id).toBe(MANDATE_ID);
    expect(entry?.agent).toBe('agent-impostor');
    expect(entry?.merchant).toBe(MERCHANT);
    expect(entry?.amount_minor).toBe(MUG_PRICE);
  });

  it('writes nothing for a call refused before the mandate check (D65)', async () => {
    await order(merchant, {
      quote_id: 'quote_999999',
      agent: AGENT,
      mandate: mandateFor(),
    });

    expect(merchant.policy.audit.size).toBe(0);
  });

  it('is reachable through the server state, and through no tool (D69)', async () => {
    const { quote_id } = await quoteFor(merchant);
    await order(merchant, { quote_id, agent: AGENT, mandate: mandateFor() });

    // The demo prints it from the state it built; an agent cannot read it,
    // because a readable log of refusals is a probing oracle (D42).
    expect(merchant.state.policy?.audit.size).toBe(1);

    const response = await merchant.client.request('tools/list');
    const tools = (response.result?.['tools'] ?? []) as { name: string }[];
    expect(tools.map((tool) => tool.name)).not.toContain('get_audit_log');
  });
});

describe('place_order: what the tool advertises', () => {
  let merchant: Merchant;

  beforeEach(async () => {
    merchant = await openMerchant();
  });

  afterEach(async () => {
    await merchant.close();
  });

  async function schemasOf(): Promise<{
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
  }> {
    const response = await merchant.client.request('tools/list');
    const tools = (response.result?.['tools'] ?? []) as {
      name: string;
      inputSchema?: Record<string, unknown>;
      outputSchema?: Record<string, unknown>;
    }[];
    const tool = tools.find((entry) => entry.name === 'place_order');
    expect(tool).toBeDefined();
    return {
      inputSchema: tool?.inputSchema ?? {},
      outputSchema: tool?.outputSchema ?? {},
    };
  }

  it('asks for a quote id, an agent and a mandate, and nothing else', async () => {
    const { inputSchema } = await schemasOf();

    expect((inputSchema['required'] as string[]).sort()).toEqual([
      'agent',
      'mandate',
      'quote_id',
    ]);
    expect(Object.keys(inputSchema['properties'] as Record<string, unknown>).sort()).toEqual([
      'agent',
      'mandate',
      'quote_id',
    ]);
  });

  it('describes the mandate by shape and not by validity (D67)', async () => {
    const { inputSchema } = await schemasOf();
    const properties = inputSchema['properties'] as Record<string, Record<string, unknown>>;
    const mandate = properties['mandate'] ?? {};
    const fields = (mandate['properties'] ?? {}) as Record<string, Record<string, unknown>>;

    // `number`, not `integer`: a fractional cap is the policy's refusal to
    // make, with a reason code and an audit entry, not the SDK's.
    expect(fields['amount_cap_minor']?.['type']).toBe('number');
    expect(fields['per_transaction_cap_minor']?.['type']).toBe('number');
    expect(fields['human_confirm_above_minor']?.['type']).toBe('number');
    // Plain strings: `mandate_window_invalid` has to stay reachable too.
    expect(fields['valid_from']?.['type']).toBe('string');
    expect(fields['valid_until']?.['type']).toBe('string');
    // And unknown fields are not stripped, so a field added after signing
    // breaks the signature instead of vanishing.
    expect(mandate['additionalProperties']).not.toBe(false);
  });

  it('advertises both statuses and the optional token (D62)', async () => {
    const { outputSchema } = await schemasOf();
    const properties = outputSchema['properties'] as Record<string, Record<string, unknown>>;

    expect(properties['status']?.['enum']).toEqual(['paid', 'awaiting_confirmation']);
    expect((outputSchema['required'] as string[]).sort()).toEqual(['order_id', 'status']);
    expect(properties['confirmation_token']?.['type']).toBe('string');
  });
});

describe('place_order as a plain function (D14)', () => {
  it('throws a MandateRefusedError carrying every reason', async () => {
    const state = createMerchantState({
      merchant_id: MERCHANT,
      policy: createMandatePolicy({ publicKey: issuer.publicKey, clock: () => NOW }),
    });
    const { cart } = { cart: state.carts.create([{ product_id: MUG, quantity: 1 }]) };
    const { quote } = getQuote(state, { cart_id: cart.cart_id });

    let thrown: unknown;
    try {
      // Async since T07b: the money-out path awaits the rail (D88).
      await placeOrder(state, {
        quote_id: quote.id,
        agent: 'agent-impostor',
        mandate: mandateFor({ merchant: 'merchant-elsewhere' }),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MandateRefusedError);
    expect((thrown as MandateRefusedError).code).toBe('mandate_refused');
    expect((thrown as MandateRefusedError).refusals.map((refusal) => refusal.reason)).toEqual([
      'agent_mismatch',
      'merchant_mismatch',
    ]);
  });

  /**
   * `amount_invalid` is the one policy refusal `place_order` cannot produce,
   * and it is left unreached rather than faked (D68).
   *
   * The amount comes from the stored quote's `total`, and a quote is only ever
   * issued for a cart with at least one line (D37), every line has a whole
   * quantity of at least 1 (D19) and an integer unit price (D16). So the total
   * is always a positive integer, which is exactly what the gate asks for.
   * The gate itself is tested in `test/mandate/policy.test.ts`, where the
   * amount can be whatever the test says.
   *
   * The test below pins the invariant that makes the claim true, so that a
   * change to pricing that broke it would fail here rather than silently open
   * the path.
   */
  it('cannot reach amount_invalid: every quote this merchant issues totals a positive integer', () => {
    const state = createMerchantState({ merchant_id: MERCHANT });

    for (const product of CATALOGUE) {
      const cart = state.carts.create([{ product_id: product.id, quantity: 1 }]);
      const { quote } = getQuote(state, { cart_id: cart.cart_id });
      const amount = totalOf(quote.totals, 'total');

      expect(amount).toBeDefined();
      expect(Number.isSafeInteger(amount)).toBe(true);
      expect(amount ?? 0).toBeGreaterThan(0);
    }
  });
});
