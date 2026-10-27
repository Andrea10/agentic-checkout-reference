import { describe, expect, it } from 'vitest';

import { CartStore, sequentialCartIds } from '../../merchant/cart.js';
import { CATALOGUE } from '../../merchant/catalogue.js';
import type { MerchantError } from '../../merchant/errors.js';
import {
  addToCart,
  addToCartInput,
  createCart,
  createCartInput,
  createMerchantState,
  getProduct,
  listProducts,
  listProductsInput,
  type MerchantState,
} from '../../merchant/tools.js';

function freshState(): MerchantState {
  return createMerchantState(
    CATALOGUE,
    new CartStore(CATALOGUE, {
      nextId: sequentialCartIds(),
      now: () => '2026-10-27T00:00:00.000Z',
    }),
  );
}

describe('list_products', () => {
  it('returns the whole catalogue with a count and the currency', () => {
    const result = listProducts(freshState());

    expect(result.count).toBe(CATALOGUE.length);
    expect(result.products).toHaveLength(CATALOGUE.length);
    expect(result.currency).toBe('GBP');
  });

  it('filters by category', () => {
    const result = listProducts(freshState(), { category: 'kitchen' });

    expect(result.count).toBeGreaterThan(0);
    expect(result.products.every((product) => product.category === 'kitchen')).toBe(true);
  });

  it('filters by a price ceiling in minor units', () => {
    const result = listProducts(freshState(), { max_price_minor: 1500 });

    expect(result.products.every((product) => product.price_minor <= 1500)).toBe(true);
    expect(result.products.map((product) => product.id)).toContain('prod_cobbleford_mug');
    expect(result.products.map((product) => product.id)).not.toContain(
      'prod_harrowmere_blanket',
    );
  });

  it('returns an empty list rather than an error for a category with no products', () => {
    const result = listProducts(freshState(), { category: 'spacecraft' });

    expect(result.count).toBe(0);
    expect(result.products).toEqual([]);
  });

  it('accepts no arguments at all', () => {
    expect(listProductsInput.parse({})).toEqual({});
  });
});

describe('get_product', () => {
  it('returns one product', () => {
    const { product } = getProduct(freshState(), { product_id: 'prod_gallowbrook_cafetiere' });

    expect(product.name).toBe('Gallowbrook Cafetiere');
    expect(product.price_minor).toBe(2750);
  });

  it('refuses an unknown id with a structured code', () => {
    expect(() => getProduct(freshState(), { product_id: 'prod_nonexistent' })).toThrowError(
      expect.objectContaining({ code: 'product_not_found' }) as MerchantError,
    );
  });

  it('requires product_id', () => {
    expect(() => getProduct(freshState(), { product_id: '' })).toThrowError(
      expect.objectContaining({ code: 'product_not_found' }) as MerchantError,
    );
  });
});

describe('create_cart', () => {
  it('returns an empty cart with an id', () => {
    const { cart } = createCart(freshState());

    expect(cart.cart_id).toBe('cart_000001');
    expect(cart.items).toEqual([]);
    expect(cart.subtotal_minor).toBe(0);
  });

  it('seeds the cart from items', () => {
    const { cart } = createCart(freshState(), {
      items: [{ product_id: 'prod_dunlin_merino_socks', quantity: 2 }],
    });

    expect(cart.items).toHaveLength(1);
    expect(cart.subtotal_minor).toBe(2300);
  });

  it('treats items as optional', () => {
    expect(createCartInput.parse({})).toEqual({});
  });
});

describe('add_to_cart', () => {
  it('adds to an existing cart and returns the whole cart', () => {
    const state = freshState();
    const { cart } = createCart(state);
    const result = addToCart(state, {
      cart_id: cart.cart_id,
      product_id: 'prod_inglevale_chopping_board',
      quantity: 2,
    });

    expect(result.cart.cart_id).toBe(cart.cart_id);
    expect(result.cart.items).toHaveLength(1);
    expect(result.cart.subtotal_minor).toBe(6900);
  });

  it('defaults quantity to 1', () => {
    const parsed = addToCartInput.parse({
      cart_id: 'cart_000001',
      product_id: 'prod_cobbleford_mug',
    });

    expect(parsed.quantity).toBe(1);
  });

  it('refuses an unknown cart', () => {
    const state = freshState();
    expect(() =>
      addToCart(state, {
        cart_id: 'cart_999999',
        product_id: 'prod_cobbleford_mug',
        quantity: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'cart_not_found' }) as MerchantError);
  });

  it('rejects a non-integer quantity at the schema boundary', () => {
    const parsed = addToCartInput.safeParse({
      cart_id: 'cart_000001',
      product_id: 'prod_cobbleford_mug',
      quantity: 1.5,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('state isolation', () => {
  it('gives each merchant state its own carts', () => {
    const first = freshState();
    const second = freshState();
    createCart(first);

    expect(first.carts.size).toBe(1);
    expect(second.carts.size).toBe(0);
  });
});
