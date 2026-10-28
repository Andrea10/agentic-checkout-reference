/**
 * The whole plan, against the whole merchant.
 *
 * Nothing is stubbed here any more. T07a shipped `place_order`, so all six
 * tools in this suite are the merchant's own: the real catalogue, the real
 * cart store, the real ACP-shaped quote, the real mandate policy and the real
 * order store, reached through the v2 client.
 *
 * The merchant runs with sequential ids and a clock frozen inside the test
 * mandate's window (`harness.ts`), so the assertions name `cart_000001` and
 * `2045` rather than matching a pattern.
 *
 * One number drives the two paths. The two cheapest products total **2045
 * pence**, and the README mandate's `human_confirm_above_minor` is **2000**,
 * so the default plan ends in `awaiting_confirmation`. A mandate with a
 * higher threshold ends it in `ordered`. That is the straddle T06a priced the
 * catalogue for.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { pickIds, runPlan, scriptedPlanner, totalOf } from '../../agent/index.js';
import { CATALOGUE } from '../../merchant/index.js';
import { MERCHANT_TOOL_NAMES, connectMerchant } from './harness.js';
import { testIdentity } from './identity-fixture.js';

import type { AgentIdentity, MerchantConnection, Planner } from '../../agent/index.js';

/** The two cheapest products in the shipped catalogue, and their total. */
const CHEAPEST = 'prod_elderflint_notebook';
const NEXT_CHEAPEST = 'prod_dunlin_merino_socks';
const TWO_ITEM_SUBTOTAL = 2045;

/** A mandate that allows 2045 outright. */
function permissive(): AgentIdentity {
  return testIdentity({ human_confirm_above_minor: 3000 });
}

const open: MerchantConnection[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map(async (connection) => connection.close()));
});

async function merchant(): Promise<MerchantConnection> {
  const connection = await connectMerchant();
  open.push(connection);
  return connection;
}

describe('the full plan: list, pick two, cart, add both, quote, place_order', () => {
  it('takes the six steps in order and ends with an order', async () => {
    const caller = await merchant();

    const result = await runPlan({
      planner: scriptedPlanner(),
      caller,
      identity: permissive(),
    });

    expect(result.steps.map((step) => step.kind)).toEqual([
      'list_products',
      'create_cart',
      'add_to_cart',
      'add_to_cart',
      'get_quote',
      'place_order',
    ]);
    expect(result.outcome).toEqual({
      kind: 'ordered',
      order: {
        order_id: 'order_000001',
        status: 'approved',
        body: { order_id: 'order_000001', status: 'approved' },
      },
    });
  });

  it('bought the two cheapest products, one of each', async () => {
    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: await merchant(),
      identity: permissive(),
    });
    const items = result.memory.cart?.items ?? [];

    expect(items.map((item) => item.product_id).sort()).toEqual([CHEAPEST, NEXT_CHEAPEST].sort());
    expect(items.every((item) => item.quantity === 1)).toBe(true);
    expect(result.memory.cart?.subtotal_minor).toBe(TWO_ITEM_SUBTOTAL);
  });

  it('read the real catalogue through the ACP feed shape', async () => {
    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: await merchant(),
      identity: permissive(),
    });

    expect(result.memory.products).toHaveLength(CATALOGUE.length);
    expect(result.memory.products?.[0]?.variants[0]?.price.currency).toBe('GBP');
  });

  it('priced the cart it quoted, and the quote total matches the subtotal', async () => {
    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: await merchant(),
      identity: permissive(),
    });
    const quote = result.memory.quote;

    expect(quote?.status).toBe('ready_for_payment');
    expect(quote?.cart_id).toBe(result.memory.cart?.cart_id);
    expect(quote?.cart_version).toBe(result.memory.cart?.version);
    expect(quote === undefined ? undefined : totalOf(quote)).toBe(TWO_ITEM_SUBTOTAL);
  });

  it('sees all six tools the merchant advertises', async () => {
    const caller = await merchant();

    expect(await caller.listToolNames()).toEqual(MERCHANT_TOOL_NAMES);
  });
});

describe('the same plan under the README mandate trips human-confirm', () => {
  it('ends in awaiting_confirmation, because 2045 is above the 2000 threshold', async () => {
    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: await merchant(),
      identity: testIdentity(),
    });

    expect(result.outcome.kind).toBe('awaiting_confirmation');
    if (result.outcome.kind !== 'awaiting_confirmation') return;
    expect(result.outcome.held.confirmation_token).toMatch(/^confirm_/);
    expect(result.outcome.held.order_id).toBe('order_000001');
  });

  it('takes the same six steps either way: the difference is the mandate', async () => {
    const held = await runPlan({
      planner: scriptedPlanner(),
      caller: await merchant(),
      identity: testIdentity(),
    });
    const ordered = await runPlan({
      planner: scriptedPlanner(),
      caller: await merchant(),
      identity: permissive(),
    });

    expect(held.steps).toEqual(ordered.steps);
    expect(held.outcome.kind).not.toBe(ordered.outcome.kind);
  });
});

describe('determinism (D79)', () => {
  it('two runs against a fresh server take the same steps and reach the same total', async () => {
    const run = async (): Promise<{ steps: string[]; total: number | undefined; order: string }> => {
      const result = await runPlan({
        planner: scriptedPlanner(),
        caller: await merchant(),
        identity: permissive(),
      });
      const quote = result.memory.quote;
      return {
        steps: result.steps.map((step) => step.kind),
        total: quote === undefined ? undefined : totalOf(quote),
        order: result.outcome.kind === 'ordered' ? result.outcome.order.order_id : 'none',
      };
    };

    const first = await run();
    const second = await run();

    expect(second).toEqual(first);
    expect(first.total).toBe(TWO_ITEM_SUBTOTAL);
    expect(first.order).toBe('order_000001');
  });

  it('names the same cart and quote ids on a server with deterministic ids', async () => {
    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: await merchant(),
      identity: permissive(),
    });

    expect(result.memory.cart?.cart_id).toBe('cart_000001');
    expect(result.memory.quote?.id).toBe('quote_000001');
  });
});

describe('a refusal from a shopping tool stops the run (D73)', () => {
  it('returns the refusal and names the step, rather than throwing', async () => {
    const planner = scriptedPlanner({ choose: () => [{ product_id: 'prod_nope', quantity: 1 }] });

    const result = await runPlan({
      planner,
      caller: await merchant(),
      identity: permissive(),
    });

    expect(result.outcome).toMatchObject({ kind: 'refused', step: 'add_to_cart' });
    if (result.outcome.kind !== 'refused') return;
    expect(result.outcome.refusal.code).toBe('product_not_found');
    expect(result.outcome.refusal.message).toContain('prod_nope');
    expect(result.outcome.refusal.reasons).toEqual([]);
    expect(result.steps.map((step) => step.kind)).toEqual([
      'list_products',
      'create_cart',
      'add_to_cart',
    ]);
  });

  it('surfaces the merchant’s empty-cart refusal when the plan quotes nothing', async () => {
    const planner: Planner = {
      name: 'quotes-an-empty-cart',
      next: (memory) =>
        memory.cart === undefined
          ? { kind: 'create_cart' }
          : { kind: 'get_quote', cart_id: memory.cart.cart_id },
    };

    const result = await runPlan({
      planner,
      caller: await merchant(),
      identity: permissive(),
    });

    expect(result.outcome).toMatchObject({ kind: 'refused', step: 'get_quote' });
    if (result.outcome.kind !== 'refused') return;
    expect(result.outcome.refusal.code).toBe('cart_empty');
  });
});

describe('the step budget', () => {
  it('stops and says so rather than looping for ever', async () => {
    const result = await runPlan({
      planner: { name: 'stuck', next: () => ({ kind: 'list_products' }) },
      caller: await merchant(),
      identity: permissive(),
      maxSteps: 3,
    });

    expect(result.outcome).toEqual({
      kind: 'stopped',
      why: 'the planner did not finish within 3 steps',
    });
    expect(result.steps).toHaveLength(3);
  });

  it('reports a planner that stops, with its reason', async () => {
    const result = await runPlan({
      planner: { name: 'quitter', next: () => ({ kind: 'stop', why: 'nothing worth buying' }) },
      caller: await merchant(),
      identity: permissive(),
    });

    expect(result.outcome).toEqual({ kind: 'stopped', why: 'nothing worth buying' });
  });
});

describe('a named plan, for the demo (T09)', () => {
  it('buys exactly the products it was told to, and is refused above the cap', async () => {
    // The lamp at 4250 plus the mug at 1450 is 5700, above the README
    // mandate's 2500 per-transaction cap and its 5000 total cap. Both
    // reasons come back at once (D42).
    const result = await runPlan({
      planner: scriptedPlanner({ choose: pickIds('prod_aurora_desk_lamp', 'prod_cobbleford_mug') }),
      caller: await merchant(),
      identity: testIdentity(),
    });

    expect(result.memory.cart?.items.map((item) => item.product_id)).toEqual([
      'prod_aurora_desk_lamp',
      'prod_cobbleford_mug',
    ]);
    expect(result.memory.cart?.subtotal_minor).toBe(4250 + 1450);
    expect(result.outcome).toMatchObject({ kind: 'refused', step: 'place_order' });
    if (result.outcome.kind !== 'refused') return;
    expect(result.outcome.refusal.reasons.map((entry) => entry.reason)).toEqual([
      'per_transaction_cap_exceeded',
      'budget_exceeded',
    ]);
  });
});
