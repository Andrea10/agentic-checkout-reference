import { describe, expect, it } from 'vitest';

import { CATALOGUE } from '../../merchant/catalogue.js';
import {
  CartStore,
  MAX_LINE_QUANTITY,
  randomCartIds,
  sequentialCartIds,
} from '../../merchant/cart.js';
import { MerchantError } from '../../merchant/errors.js';

/** A store with frozen time, so timestamps are not a source of flake. */
function storeWithFixedClock(): CartStore {
  return new CartStore(CATALOGUE, {
    nextId: sequentialCartIds(),
    now: () => '2026-10-27T00:00:00.000Z',
  });
}

describe('CartStore', () => {
  it('creates an empty cart with a fresh id and a zero subtotal', () => {
    const carts = storeWithFixedClock();
    const cart = carts.create();

    expect(cart.cart_id).toBe('cart_000001');
    expect(cart.items).toEqual([]);
    expect(cart.subtotal_minor).toBe(0);
    expect(cart.currency).toBe('GBP');
    expect(cart.created_at).toBe('2026-10-27T00:00:00.000Z');
  });

  it('defaults to unguessable ids: distinct, UUID-shaped, never sequential', () => {
    // No nextId injected, so the store uses randomCartIds (D12).
    const carts = new CartStore(CATALOGUE);
    const ids = [carts.create().cart_id, carts.create().cart_id, carts.create().cart_id];

    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(id).toMatch(
        /^cart_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
    expect(ids).not.toEqual(['cart_000001', 'cart_000002', 'cart_000003']);
    expect(randomCartIds()).not.toBe(randomCartIds());
  });

  it('gives each cart its own id', () => {
    const carts = storeWithFixedClock();
    expect(carts.create().cart_id).toBe('cart_000001');
    expect(carts.create().cart_id).toBe('cart_000002');
    expect(carts.size).toBe(2);
  });

  it('seeds a cart from items passed to create', () => {
    const carts = storeWithFixedClock();
    const cart = carts.create([
      { product_id: 'prod_cobbleford_mug', quantity: 2 },
      { product_id: 'prod_elderflint_notebook', quantity: 1 },
    ]);

    expect(cart.items).toHaveLength(2);
    expect(cart.subtotal_minor).toBe(1450 * 2 + 895);
  });

  it('prices a line as unit price times quantity', () => {
    const carts = storeWithFixedClock();
    const cart = carts.addItem(carts.create().cart_id, 'prod_aurora_desk_lamp', 3);
    const [line] = cart.items;

    expect(line?.unit_price_minor).toBe(4250);
    expect(line?.line_total_minor).toBe(12750);
    expect(cart.subtotal_minor).toBe(12750);
  });

  it('merges a repeated product into one line', () => {
    const carts = storeWithFixedClock();
    const cartId = carts.create().cart_id;
    carts.addItem(cartId, 'prod_cobbleford_mug', 2);
    const cart = carts.addItem(cartId, 'prod_cobbleford_mug', 3);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(5);
    expect(cart.subtotal_minor).toBe(1450 * 5);
  });

  it('is addressed only by cart_id: two carts never bleed into each other', () => {
    const carts = storeWithFixedClock();
    const first = carts.create().cart_id;
    const second = carts.create().cart_id;

    carts.addItem(first, 'prod_cobbleford_mug', 1);

    expect(carts.get(first).items).toHaveLength(1);
    expect(carts.get(second).items).toHaveLength(0);
  });

  it('does not let a returned cart be mutated behind the store', () => {
    const carts = storeWithFixedClock();
    const cartId = carts.create().cart_id;
    const before = carts.addItem(cartId, 'prod_cobbleford_mug', 1);

    carts.addItem(cartId, 'prod_cobbleford_mug', 1);

    expect(before.items[0]?.quantity).toBe(1);
    expect(carts.get(cartId).items[0]?.quantity).toBe(2);
  });

  it('refuses an unknown cart', () => {
    const carts = storeWithFixedClock();
    expect(() => carts.get('cart_999999')).toThrowError(
      expect.objectContaining({ code: 'cart_not_found' }) as MerchantError,
    );
  });

  it('refuses an unknown product', () => {
    const carts = storeWithFixedClock();
    const cartId = carts.create().cart_id;
    expect(() => carts.addItem(cartId, 'prod_nonexistent', 1)).toThrowError(
      expect.objectContaining({ code: 'product_not_found' }) as MerchantError,
    );
  });

  it.each([0, -1, 1.5, MAX_LINE_QUANTITY + 1])(
    'refuses quantity %s',
    (quantity: number) => {
      const carts = storeWithFixedClock();
      const cartId = carts.create().cart_id;
      expect(() => carts.addItem(cartId, 'prod_cobbleford_mug', quantity)).toThrowError(
        expect.objectContaining({ code: 'invalid_quantity' }) as MerchantError,
      );
    },
  );

  it('refuses more units than are in stock', () => {
    const carts = storeWithFixedClock();
    const cartId = carts.create().cart_id;
    // prod_harrowmere_blanket has 8 in stock.
    expect(() => carts.addItem(cartId, 'prod_harrowmere_blanket', 9)).toThrowError(
      expect.objectContaining({ code: 'insufficient_stock' }) as MerchantError,
    );
  });

  it('checks the merged quantity against stock, not just the increment', () => {
    const carts = storeWithFixedClock();
    const cartId = carts.create().cart_id;
    carts.addItem(cartId, 'prod_harrowmere_blanket', 5);

    expect(() => carts.addItem(cartId, 'prod_harrowmere_blanket', 5)).toThrowError(
      expect.objectContaining({ code: 'insufficient_stock' }) as MerchantError,
    );
    expect(carts.get(cartId).items[0]?.quantity).toBe(5);
  });
});
