/**
 * The plan, run against the real merchant server.
 *
 * Everything up to and including `get_quote` is the merchant on main: the
 * real catalogue, the real cart store, the real ACP-shaped quote, reached
 * through the v2 client. Only `place_order` comes from the stub
 * (`stub-server.ts`), routed in by {@link routeTools}, because that tool is
 * T07a's and is not on main yet. The real end-to-end check is T09's.
 *
 * The amounts asserted below are the real catalogue's: the two cheapest
 * products are the Elderflint Notebook at 895 and the Dunlin Merino Socks at
 * 1150, so a one-of-each cart subtotals 2045 pence.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runPlan, scriptedPlanner, pickIds, totalOf } from '../../agent/index.js';
import { createMerchantServer, sequentialCartIds, sequentialQuoteIds, CartStore, QuoteStore, CATALOGUE, createMerchantState } from '../../merchant/index.js';
import { connectInMemory, routeTools } from './harness.js';
import { createStubOrderServer } from './stub-server.js';
import { testIdentity } from './identity-fixture.js';

import type { MerchantConnection, Planner, ToolCaller } from '../../agent/index.js';

/** The two cheapest products in the shipped catalogue, and their total. */
const CHEAPEST = 'prod_elderflint_notebook';
const NEXT_CHEAPEST = 'prod_dunlin_merino_socks';
const TWO_ITEM_SUBTOTAL = 2045;

/** A merchant with deterministic cart and quote ids, so the test can name them. */
function deterministicMerchant(): ReturnType<typeof createMerchantServer> {
  const carts = new CartStore(CATALOGUE, { nextId: sequentialCartIds() });
  const quotes = new QuoteStore(CATALOGUE, carts, { nextId: sequentialQuoteIds() });
  return createMerchantServer(createMerchantState(CATALOGUE, carts, quotes));
}

describe('the full plan: list, pick two, cart, add both, quote, place_order', () => {
  let merchant: MerchantConnection;
  let orders: MerchantConnection;
  let caller: ToolCaller;
  const stub = createStubOrderServer({
    responses: {
      quote_000001: { kind: 'approved', order_id: 'order_000001', total_minor: TWO_ITEM_SUBTOTAL },
    },
  });

  beforeAll(async () => {
    merchant = await connectInMemory(deterministicMerchant());
    orders = await connectInMemory(stub.server);
    caller = routeTools(merchant, orders);
  });

  afterAll(async () => {
    await merchant.close();
    await orders.close();
  });

  it('takes the six steps in order and ends with an order', async () => {
    const result = await runPlan({ planner: scriptedPlanner(), caller, identity: testIdentity() });

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
        status: 'paid',
        body: { order_id: 'order_000001', status: 'paid', total_minor: TWO_ITEM_SUBTOTAL },
      },
    });
  });

  it('bought the two cheapest products, one of each', async () => {
    const result = await runPlan({ planner: scriptedPlanner(), caller, identity: testIdentity() });
    const items = result.memory.cart?.items ?? [];

    expect(items.map((item) => item.product_id).sort()).toEqual(
      [CHEAPEST, NEXT_CHEAPEST].sort(),
    );
    expect(items.every((item) => item.quantity === 1)).toBe(true);
    expect(result.memory.cart?.subtotal_minor).toBe(TWO_ITEM_SUBTOTAL);
  });

  it('read the real catalogue through the ACP feed shape', async () => {
    const result = await runPlan({ planner: scriptedPlanner(), caller, identity: testIdentity() });

    expect(result.memory.products).toHaveLength(CATALOGUE.length);
    expect(result.memory.products?.[0]?.variants[0]?.price.currency).toBe('GBP');
  });

  it('priced the cart it quoted, and the quote total matches the subtotal', async () => {
    const result = await runPlan({ planner: scriptedPlanner(), caller, identity: testIdentity() });
    const quote = result.memory.quote;

    expect(quote?.status).toBe('ready_for_payment');
    expect(quote?.cart_id).toBe(result.memory.cart?.cart_id);
    expect(quote?.cart_version).toBe(result.memory.cart?.version);
    expect(quote === undefined ? undefined : totalOf(quote)).toBe(TWO_ITEM_SUBTOTAL);
  });

  it('sent the quote id, the agent id and the mandate to place_order', () => {
    const call = stub.calls.at(-1);

    expect(call?.agent).toBe(testIdentity().agent);
    expect(call?.quote_id).toMatch(/^quote_/);
    expect(call?.mandate.signature).toBe(testIdentity().mandate.signature);
  });
});

describe('determinism (D79)', () => {
  it('two runs against a fresh server take the same steps and reach the same total', async () => {
    const stub = createStubOrderServer({
      responses: {},
      fallback: { kind: 'approved', order_id: 'order_000001' },
    });
    const orders = await connectInMemory(stub.server);

    const run = async (): Promise<{ steps: string[]; total: number | undefined }> => {
      const merchant = await connectInMemory(deterministicMerchant());
      const result = await runPlan({
        planner: scriptedPlanner(),
        caller: routeTools(merchant, orders),
        identity: testIdentity(),
      });
      await merchant.close();
      const quote = result.memory.quote;
      return {
        steps: result.steps.map((step) => step.kind),
        total: quote === undefined ? undefined : totalOf(quote),
      };
    };

    const first = await run();
    const second = await run();

    expect(second).toEqual(first);
    expect(first.total).toBe(TWO_ITEM_SUBTOTAL);
    await orders.close();
  });

  it('names the same cart and quote ids on a server with deterministic ids', async () => {
    const stub = createStubOrderServer({
      responses: {},
      fallback: { kind: 'approved', order_id: 'order_000001' },
    });
    const orders = await connectInMemory(stub.server);
    const merchant = await connectInMemory(deterministicMerchant());

    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: routeTools(merchant, orders),
      identity: testIdentity(),
    });

    expect(result.memory.cart?.cart_id).toBe('cart_000001');
    expect(result.memory.quote?.id).toBe('quote_000001');
    await merchant.close();
    await orders.close();
  });
});

describe('a refusal from a real merchant tool stops the run (D73)', () => {
  it('returns the refusal and names the step, rather than throwing', async () => {
    const merchant = await connectInMemory(deterministicMerchant());
    const stub = createStubOrderServer({ responses: {} });
    const orders = await connectInMemory(stub.server);

    // A plan that asks for a product the catalogue does not sell. The choice
    // itself would throw, so the refusal is forced one level lower: the
    // planner picks a real product and the cart call names a bad one.
    const planner = scriptedPlanner({ choose: () => [{ product_id: 'prod_nope', quantity: 1 }] });
    const result = await runPlan({
      planner,
      caller: routeTools(merchant, orders),
      identity: testIdentity(),
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

    await merchant.close();
    await orders.close();
  });

  it('surfaces the merchant’s empty-cart refusal when the plan quotes nothing', async () => {
    const merchant = await connectInMemory(deterministicMerchant());
    const stub = createStubOrderServer({ responses: {} });
    const orders = await connectInMemory(stub.server);

    // A planner that creates a cart and quotes it without putting anything
    // in, which is the one thing get_quote refuses (D37).
    const planner: Planner = {
      name: 'quotes-an-empty-cart',
      next: (memory) =>
        memory.cart === undefined
          ? { kind: 'create_cart' }
          : { kind: 'get_quote', cart_id: memory.cart.cart_id },
    };
    const result = await runPlan({
      planner,
      caller: routeTools(merchant, orders),
      identity: testIdentity(),
    });

    expect(result.outcome).toMatchObject({ kind: 'refused', step: 'get_quote' });
    if (result.outcome.kind !== 'refused') return;
    expect(result.outcome.refusal.code).toBe('cart_empty');

    await merchant.close();
    await orders.close();
  });
});

describe('the step budget', () => {
  it('stops and says so rather than looping for ever', async () => {
    const merchant = await connectInMemory(deterministicMerchant());
    const stub = createStubOrderServer({ responses: {} });
    const orders = await connectInMemory(stub.server);

    // A planner that always asks for the catalogue: a bug, on purpose.
    const result = await runPlan({
      planner: { name: 'stuck', next: () => ({ kind: 'list_products' }) },
      caller: routeTools(merchant, orders),
      identity: testIdentity(),
      maxSteps: 3,
    });

    expect(result.outcome).toEqual({
      kind: 'stopped',
      why: 'the planner did not finish within 3 steps',
    });
    expect(result.steps).toHaveLength(3);

    await merchant.close();
    await orders.close();
  });

  it('reports a planner that stops, with its reason', async () => {
    const merchant = await connectInMemory(deterministicMerchant());
    const stub = createStubOrderServer({ responses: {} });
    const orders = await connectInMemory(stub.server);

    const result = await runPlan({
      planner: { name: 'quitter', next: () => ({ kind: 'stop', why: 'nothing worth buying' }) },
      caller: routeTools(merchant, orders),
      identity: testIdentity(),
    });

    expect(result.outcome).toEqual({ kind: 'stopped', why: 'nothing worth buying' });

    await merchant.close();
    await orders.close();
  });
});

describe('a named plan, for the demo (T09)', () => {
  it('buys exactly the products it was told to', async () => {
    const merchant = await connectInMemory(deterministicMerchant());
    const stub = createStubOrderServer({
      responses: {},
      fallback: { kind: 'approved', order_id: 'order_000009' },
    });
    const orders = await connectInMemory(stub.server);

    const result = await runPlan({
      planner: scriptedPlanner({ choose: pickIds('prod_aurora_desk_lamp', 'prod_cobbleford_mug') }),
      caller: routeTools(merchant, orders),
      identity: testIdentity(),
    });

    expect(result.memory.cart?.items.map((item) => item.product_id)).toEqual([
      'prod_aurora_desk_lamp',
      'prod_cobbleford_mug',
    ]);
    expect(result.memory.cart?.subtotal_minor).toBe(4250 + 1450);
    expect(result.outcome.kind).toBe('ordered');

    await merchant.close();
    await orders.close();
  });
});
