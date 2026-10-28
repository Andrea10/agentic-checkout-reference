/**
 * Tests for the five tool handlers, called directly.
 *
 * The product and quote bodies are in the ACP vocabulary (D28), so these
 * assert on `price.amount` and `totals`, not on `price_minor`.
 */

import { describe, expect, it } from 'vitest';

import { CartStore, sequentialCartIds } from '../../merchant/cart.js';
import { CATALOGUE } from '../../merchant/catalogue.js';
import type { MerchantError } from '../../merchant/errors.js';
import { QuoteStore, sequentialQuoteIds, totalOf } from '../../merchant/quote.js';
import {
  addToCart,
  addToCartInput,
  createCart,
  createCartInput,
  createMerchantState,
  getProduct,
  getQuote,
  getQuoteInput,
  listProducts,
  listProductsInput,
  type MerchantState,
} from '../../merchant/tools.js';

const FROZEN = '2026-10-27T00:00:00.000Z';

function freshState(): MerchantState {
  const carts = new CartStore(CATALOGUE, {
    nextId: sequentialCartIds(),
    now: () => FROZEN,
  });
  return createMerchantState(
    CATALOGUE,
    carts,
    new QuoteStore(CATALOGUE, carts, {
      nextId: sequentialQuoteIds(),
      now: () => FROZEN,
    }),
  );
}

describe('list_products', () => {
  it('returns the whole catalogue and nothing but the products key (D33)', () => {
    const result = listProducts(freshState());

    expect(Object.keys(result)).toEqual(['products']);
    expect(result.products).toHaveLength(CATALOGUE.length);
  });

  it('filters by category, which lives on the ACP variant', () => {
    const result = listProducts(freshState(), { category: 'kitchen' });

    expect(result.products.length).toBeGreaterThan(0);
    expect(
      result.products.every((product) =>
        product.variants.every((variant) =>
          variant.categories.some((category) => category.value === 'kitchen'),
        ),
      ),
    ).toBe(true);
  });

  it('filters by a price ceiling in minor units', () => {
    const result = listProducts(freshState(), { max_price_minor: 1500 });

    expect(
      result.products.every((product) =>
        product.variants.every((variant) => variant.price.amount <= 1500),
      ),
    ).toBe(true);
    expect(result.products.map((product) => product.id)).toContain('prod_cobbleford_mug');
    expect(result.products.map((product) => product.id)).not.toContain(
      'prod_harrowmere_blanket',
    );
  });

  it('returns an empty list rather than an error for a category with no products', () => {
    const result = listProducts(freshState(), { category: 'spacecraft' });

    expect(result.products).toEqual([]);
  });

  it('accepts no arguments at all', () => {
    expect(listProductsInput.parse({})).toEqual({});
  });
});

describe('get_product', () => {
  it('returns one product in the ACP feed shape', () => {
    const { product } = getProduct(freshState(), { product_id: 'prod_gallowbrook_cafetiere' });

    expect(product.title).toBe('Gallowbrook Cafetiere');
    expect(product.variants[0]?.price).toEqual({ amount: 2750, currency: 'GBP' });
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

describe('get_quote', () => {
  it('prices a cart as an ACP checkout session', () => {
    const state = freshState();
    const { cart } = createCart(state, {
      items: [{ product_id: 'prod_cobbleford_mug', quantity: 2 }],
    });
    const { quote } = getQuote(state, { cart_id: cart.cart_id });

    expect(quote.id).toBe('quote_000001');
    expect(quote.status).toBe('ready_for_payment');
    expect(quote.currency).toBe('GBP');
    expect(quote.line_items).toHaveLength(1);
    expect(totalOf(quote.totals, 'total')).toBe(2900);
    expect(quote.cart_id).toBe(cart.cart_id);
  });

  it('refuses an empty cart', () => {
    const state = freshState();
    const { cart } = createCart(state);

    expect(() => getQuote(state, { cart_id: cart.cart_id })).toThrowError(
      expect.objectContaining({ code: 'cart_empty' }) as MerchantError,
    );
  });

  it('refuses an unknown cart id', () => {
    expect(() => getQuote(freshState(), { cart_id: 'cart_999999' })).toThrowError(
      expect.objectContaining({ code: 'cart_not_found' }) as MerchantError,
    );
  });

  it('requires a cart_id at the schema boundary', () => {
    expect(getQuoteInput.safeParse({}).success).toBe(false);
  });
});

describe('state isolation', () => {
  it('gives each merchant state its own carts and quotes', () => {
    const first = freshState();
    const second = freshState();
    const { cart } = createCart(first, {
      items: [{ product_id: 'prod_cobbleford_mug', quantity: 1 }],
    });
    getQuote(first, { cart_id: cart.cart_id });

    expect(first.carts.size).toBe(1);
    expect(first.quotes.size).toBe(1);
    expect(second.carts.size).toBe(0);
    expect(second.quotes.size).toBe(0);
  });
});
