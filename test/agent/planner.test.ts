/**
 * The planner, with no server anywhere in sight.
 *
 * This is what the decide/call separation buys (D70): every question about
 * what the agent buys, when it re-prices, and when it gives up is answered by
 * calling a pure function with a literal. No transport, no mandate, no clock.
 */

import { describe, expect, it } from 'vitest';

import {
  EMPTY_MEMORY,
  PICK_COUNT,
  pickIds,
  scriptedPlanner,
  twoCheapest,
} from '../../agent/index.js';

import type { AgentCart, AgentProduct, AgentQuote, PlanMemory } from '../../agent/index.js';

function product(id: string, amount: number, title = id): AgentProduct {
  return { id, title, variants: [{ id: `${id}_v1`, price: { amount, currency: 'GBP' } }] };
}

/** Three products, deliberately not in price order. */
const CATALOGUE: readonly AgentProduct[] = [
  product('prod_lamp', 4250, 'Aurora Desk Lamp'),
  product('prod_mug', 1450, 'Cobbleford Stoneware Mug'),
  product('prod_notebook', 900, 'Elderflint Notebook'),
];

function cart(
  items: readonly { product_id: string; quantity: number }[],
  version = 1,
  cart_id = 'cart_000001',
): AgentCart {
  return {
    cart_id,
    currency: 'GBP',
    items: items.map((item) => ({ ...item, line_total_minor: 0 })),
    subtotal_minor: 0,
    version,
  };
}

function quote(cart_id: string, cart_version: number, id = 'quote_000001'): AgentQuote {
  return {
    id,
    status: 'ready_for_payment',
    currency: 'GBP',
    totals: [{ type: 'total', amount: 2350 }],
    expires_at: '2026-10-28T12:00:00.000Z',
    cart_id,
    cart_version,
  };
}

function memory(over: Partial<PlanMemory>): PlanMemory {
  return { ...EMPTY_MEMORY, ...over };
}

describe('ScriptedPlanner: the order of the steps', () => {
  const planner = scriptedPlanner();

  it('starts by listing the catalogue', () => {
    expect(planner.next(EMPTY_MEMORY)).toEqual({ kind: 'list_products' });
  });

  it('creates a cart once it knows what is for sale', () => {
    expect(planner.next(memory({ products: CATALOGUE }))).toEqual({ kind: 'create_cart' });
  });

  it('adds the first pick to the new cart, naming the cart_id', () => {
    const step = planner.next(memory({ products: CATALOGUE, cart: cart([]) }));

    expect(step).toEqual({
      kind: 'add_to_cart',
      cart_id: 'cart_000001',
      pick: { product_id: 'prod_notebook', quantity: 1 },
    });
  });

  it('adds the second pick once the first is in the cart', () => {
    const step = planner.next(
      memory({
        products: CATALOGUE,
        cart: cart([{ product_id: 'prod_notebook', quantity: 1 }], 2),
      }),
    );

    expect(step).toEqual({
      kind: 'add_to_cart',
      cart_id: 'cart_000001',
      pick: { product_id: 'prod_mug', quantity: 1 },
    });
  });

  it('quotes the cart once both picks are in it', () => {
    const full = cart(
      [
        { product_id: 'prod_notebook', quantity: 1 },
        { product_id: 'prod_mug', quantity: 1 },
      ],
      3,
    );

    expect(planner.next(memory({ products: CATALOGUE, cart: full }))).toEqual({
      kind: 'get_quote',
      cart_id: 'cart_000001',
    });
  });

  it('places the order once the quote prices the cart it is looking at', () => {
    const full = cart(
      [
        { product_id: 'prod_notebook', quantity: 1 },
        { product_id: 'prod_mug', quantity: 1 },
      ],
      3,
    );

    expect(
      planner.next(memory({ products: CATALOGUE, cart: full, quote: quote('cart_000001', 3) })),
    ).toEqual({ kind: 'place_order', quote_id: 'quote_000001' });
  });
});

describe('ScriptedPlanner: reacting rather than replaying (D71)', () => {
  const planner = scriptedPlanner();
  const full = cart(
    [
      { product_id: 'prod_notebook', quantity: 1 },
      { product_id: 'prod_mug', quantity: 1 },
    ],
    4,
  );

  it('re-quotes when the cart has moved on from the quote it holds', () => {
    const step = planner.next(
      memory({ products: CATALOGUE, cart: full, quote: quote('cart_000001', 3) }),
    );

    expect(step).toEqual({ kind: 'get_quote', cart_id: 'cart_000001' });
  });

  it('re-quotes when the quote belongs to a different cart', () => {
    const step = planner.next(
      memory({ products: CATALOGUE, cart: full, quote: quote('cart_000999', 4) }),
    );

    expect(step).toEqual({ kind: 'get_quote', cart_id: 'cart_000001' });
  });

  it('tops up a line the merchant only partly filled', () => {
    const planner3 = scriptedPlanner({ choose: pickIds({ product_id: 'prod_mug', quantity: 3 }) });
    const step = planner3.next(
      memory({
        products: CATALOGUE,
        cart: cart([{ product_id: 'prod_mug', quantity: 1 }], 2),
      }),
    );

    expect(step).toEqual({
      kind: 'add_to_cart',
      cart_id: 'cart_000001',
      pick: { product_id: 'prod_mug', quantity: 2 },
    });
  });

  it('stops rather than buying one thing when the catalogue is too small', () => {
    const step = planner.next(memory({ products: [product('prod_only', 100)] }));

    expect(step.kind).toBe('stop');
    expect(step).toMatchObject({ why: expect.stringContaining('fewer than the 2') as unknown });
  });

  it('stops when the choice comes back empty', () => {
    const empty = scriptedPlanner({ choose: () => [] });

    expect(empty.next(memory({ products: CATALOGUE })).kind).toBe('stop');
  });
});

describe('choosing what to buy is deterministic (D79)', () => {
  it('takes the two cheapest products', () => {
    expect(twoCheapest(CATALOGUE)).toEqual([
      { product_id: 'prod_notebook', quantity: 1 },
      { product_id: 'prod_mug', quantity: 1 },
    ]);
  });

  it('buys exactly PICK_COUNT products', () => {
    expect(twoCheapest(CATALOGUE)).toHaveLength(PICK_COUNT);
  });

  it('gives the same answer whatever order the catalogue arrives in', () => {
    const reversed = [...CATALOGUE].reverse();

    expect(twoCheapest(reversed)).toEqual(twoCheapest(CATALOGUE));
  });

  it('breaks a price tie on product id, so the order never moves', () => {
    const tied = [product('prod_b', 500), product('prod_a', 500), product('prod_c', 500)];

    expect(twoCheapest(tied)).toEqual([
      { product_id: 'prod_a', quantity: 1 },
      { product_id: 'prod_b', quantity: 1 },
    ]);
  });

  it('does not reorder the caller’s array', () => {
    const given = [...CATALOGUE];
    twoCheapest(given);

    expect(given.map((entry) => entry.id)).toEqual(CATALOGUE.map((entry) => entry.id));
  });

  it('pickIds buys what it was told to, in that order', () => {
    expect(pickIds('prod_lamp', { product_id: 'prod_mug', quantity: 2 })(CATALOGUE)).toEqual([
      { product_id: 'prod_lamp', quantity: 1 },
      { product_id: 'prod_mug', quantity: 2 },
    ]);
  });

  it('pickIds refuses a product the catalogue does not have', () => {
    expect(() => pickIds('prod_nonexistent')(CATALOGUE)).toThrow('prod_nonexistent');
  });
});

describe('the planner is pure', () => {
  it('does not touch the memory it is given', () => {
    const planner = scriptedPlanner();
    const state = memory({ products: CATALOGUE, cart: cart([]) });
    const before = JSON.stringify(state);

    planner.next(state);
    planner.next(state);

    expect(JSON.stringify(state)).toBe(before);
  });

  it('answers the same memory the same way every time', () => {
    const planner = scriptedPlanner();
    const state = memory({ products: CATALOGUE, cart: cart([]) });

    expect(planner.next(state)).toEqual(planner.next(state));
  });

  it('names itself for the demo transcript', () => {
    expect(scriptedPlanner().name).toBe('ScriptedPlanner');
  });
});
