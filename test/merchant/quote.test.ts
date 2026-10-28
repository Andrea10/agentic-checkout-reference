/**
 * Tests for the quote.
 *
 * The four that matter most to the authorisation story are the ones about
 * money and freshness: the totals add up, an empty cart is refused, a quote
 * expires, and a cart that changed after being quoted makes the quote stale
 * rather than silently repricing it.
 */

import { describe, expect, it } from 'vitest';

import { CartStore, sequentialCartIds } from '../../merchant/cart.js';
import { CATALOGUE } from '../../merchant/catalogue.js';
import type { MerchantError } from '../../merchant/errors.js';
import {
  isQuoteCurrentFor,
  QUOTE_TTL_SECONDS,
  QuoteStore,
  quoteSchema,
  randomQuoteIds,
  sequentialQuoteIds,
  totalOf,
} from '../../merchant/quote.js';

const START = '2026-10-27T09:00:00.000Z';

/** A cart store and a quote store sharing one clock the test can wind on. */
function fixture(start: string = START): {
  carts: CartStore;
  quotes: QuoteStore;
  setNow: (instant: string) => void;
} {
  let now = start;
  const carts = new CartStore(CATALOGUE, {
    nextId: sequentialCartIds(),
    now: () => now,
  });
  const quotes = new QuoteStore(CATALOGUE, carts, {
    nextId: sequentialQuoteIds(),
    now: () => now,
  });
  return {
    carts,
    quotes,
    setNow: (instant: string) => {
      now = instant;
    },
  };
}

describe('quote totals', () => {
  it('prices one line as unit amount times quantity', () => {
    const { carts, quotes } = fixture();
    // prod_cobbleford_mug is 1450.
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 3 }]);
    const quote = quotes.issue(cart.cart_id);
    const [line] = quote.line_items;

    expect(line?.unit_amount).toBe(1450);
    expect(line?.quantity).toBe(3);
    expect(totalOf(line?.totals ?? [], 'subtotal')).toBe(4350);
    expect(totalOf(line?.totals ?? [], 'total')).toBe(4350);
  });

  it('sums several lines into the cart-level totals', () => {
    const { carts, quotes } = fixture();
    // 1450 * 2 + 895 = 3795.
    const cart = carts.create([
      { product_id: 'prod_cobbleford_mug', quantity: 2 },
      { product_id: 'prod_elderflint_notebook', quantity: 1 },
    ]);
    const quote = quotes.issue(cart.cart_id);

    expect(quote.line_items).toHaveLength(2);
    expect(totalOf(quote.totals, 'items_base_amount')).toBe(3795);
    expect(totalOf(quote.totals, 'subtotal')).toBe(3795);
    expect(totalOf(quote.totals, 'total')).toBe(3795);
  });

  it('agrees with the cart subtotal it priced', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([
      { product_id: 'prod_harrowmere_blanket', quantity: 2 },
      { product_id: 'prod_jessamy_tea_caddy', quantity: 3 },
    ]);
    const quote = quotes.issue(cart.cart_id);

    expect(totalOf(quote.totals, 'total')).toBe(cart.subtotal_minor);
  });

  it('keeps every amount an integer of minor units (D16)', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_fernlow_watering_can', quantity: 2 }]);
    const quote = quotes.issue(cart.cart_id);
    const amounts = [
      ...quote.totals.map((entry) => entry.amount),
      ...quote.line_items.flatMap((line) => line.totals.map((entry) => entry.amount)),
      ...quote.line_items.map((line) => line.unit_amount),
    ];

    expect(amounts.length).toBeGreaterThan(0);
    for (const amount of amounts) {
      expect(Number.isInteger(amount)).toBe(true);
    }
  });

  it('quotes no tax and no fulfilment line at all, rather than zeros (D36)', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const quote = quotes.issue(cart.cart_id);

    expect(quote.totals.map((entry) => entry.type)).toEqual([
      'items_base_amount',
      'subtotal',
      'total',
    ]);
    expect(totalOf(quote.totals, 'tax')).toBeUndefined();
    expect(totalOf(quote.totals, 'fulfillment')).toBeUndefined();
    expect(quote.fulfillment_options).toEqual([]);
  });

  it('carries the currency once on the quote, not on each amount (D35)', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const quote = quotes.issue(cart.cart_id);

    expect(quote.currency).toBe('GBP');
    for (const entry of quote.totals) {
      expect(Object.keys(entry).sort()).toEqual(['amount', 'display_text', 'type']);
    }
  });

  it('reports the stock snapshot on the line in checkout vocabulary (D30, D31)', () => {
    const { carts, quotes } = fixture();
    // prod_harrowmere_blanket has 8 in stock, below the low-stock threshold.
    const cart = carts.create([{ product_id: 'prod_harrowmere_blanket', quantity: 1 }]);
    const [line] = quotes.issue(cart.cart_id).line_items;

    expect(line?.available_quantity).toBe(8);
    expect(line?.availability_status).toBe('low_stock');
  });

  it('gives each line a distinct id and the catalogue id alongside it', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([
      { product_id: 'prod_cobbleford_mug', quantity: 1 },
      { product_id: 'prod_elderflint_notebook', quantity: 1 },
    ]);
    const quote = quotes.issue(cart.cart_id);

    expect(quote.line_items.map((line) => line.id)).toEqual(['li_1', 'li_2']);
    expect(quote.line_items.map((line) => line.product_id)).toEqual([
      'prod_cobbleford_mug',
      'prod_elderflint_notebook',
    ]);
  });

  it('produces a body the advertised quote schema accepts', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);

    expect(quoteSchema.safeParse(quotes.issue(cart.cart_id)).success).toBe(true);
  });
});

describe('quote refusals', () => {
  it('refuses to quote an empty cart (D37)', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create();

    expect(() => quotes.issue(cart.cart_id)).toThrowError(
      expect.objectContaining({ code: 'cart_empty' }) as MerchantError,
    );
    expect(quotes.size).toBe(0);
  });

  it('refuses an unknown cart id', () => {
    const { quotes } = fixture();

    expect(() => quotes.issue('cart_999999')).toThrowError(
      expect.objectContaining({ code: 'cart_not_found' }) as MerchantError,
    );
  });

  it('refuses an unknown quote id', () => {
    const { quotes } = fixture();

    expect(() => quotes.get('quote_999999')).toThrowError(
      expect.objectContaining({ code: 'quote_not_found' }) as MerchantError,
    );
    expect(() => quotes.current('quote_999999')).toThrowError(
      expect.objectContaining({ code: 'quote_not_found' }) as MerchantError,
    );
  });
});

describe('quote expiry (D38)', () => {
  it('stamps an expiry the configured number of seconds ahead', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const quote = quotes.issue(cart.cart_id);

    expect(quote.created_at).toBe(START);
    expect(Date.parse(quote.expires_at) - Date.parse(quote.created_at)).toBe(
      QUOTE_TTL_SECONDS * 1_000,
    );
    expect(QUOTE_TTL_SECONDS).toBe(900);
  });

  it('is still current a second before it expires', () => {
    const { carts, quotes, setNow } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const quote = quotes.issue(cart.cart_id);

    setNow(new Date(Date.parse(quote.expires_at) - 1_000).toISOString());

    expect(quotes.current(quote.id).id).toBe(quote.id);
  });

  it('refuses the quote once the expiry has been reached', () => {
    const { carts, quotes, setNow } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const quote = quotes.issue(cart.cart_id);

    setNow(quote.expires_at);

    expect(() => quotes.current(quote.id)).toThrowError(
      expect.objectContaining({ code: 'quote_expired' }) as MerchantError,
    );
    // The quote is still readable as issued; only freshness is refused.
    expect(quotes.get(quote.id).id).toBe(quote.id);
  });
});

describe('a changed cart invalidates the quote (D38)', () => {
  it('ties the quote to the cart version it priced', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const quote = quotes.issue(cart.cart_id);

    // create() plus one addItem: version 2.
    expect(cart.version).toBe(2);
    expect(quote.cart_version).toBe(2);
    expect(isQuoteCurrentFor(quote, cart)).toBe(true);
  });

  it('refuses the old quote after the cart changes', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const quote = quotes.issue(cart.cart_id);

    const changed = carts.addItem(cart.cart_id, 'prod_elderflint_notebook', 1);

    expect(isQuoteCurrentFor(quote, changed)).toBe(false);
    expect(() => quotes.current(quote.id)).toThrowError(
      expect.objectContaining({ code: 'quote_stale' }) as MerchantError,
    );
  });

  it('names both versions in the refusal, so an agent can see what happened', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const quote = quotes.issue(cart.cart_id);
    carts.addItem(cart.cart_id, 'prod_cobbleford_mug', 1);

    expect(() => quotes.current(quote.id)).toThrowError(/version 2 .* now at version 3/);
  });

  it('issues a fresh quote for the new contents', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const before = quotes.issue(cart.cart_id);

    carts.addItem(cart.cart_id, 'prod_cobbleford_mug', 1);
    const after = quotes.issue(cart.cart_id);

    expect(after.id).not.toBe(before.id);
    expect(after.cart_version).toBe(before.cart_version + 1);
    expect(totalOf(after.totals, 'total')).toBe(2900);
    expect(totalOf(before.totals, 'total')).toBe(1450);
    // The old quote is untouched: it still prices what it priced.
    expect(quotes.get(before.id).cart_version).toBe(before.cart_version);
  });

  it('leaves a quote current when nothing changed, however often it is read', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const quote = quotes.issue(cart.cart_id);

    expect(quotes.current(quote.id).id).toBe(quote.id);
    expect(quotes.current(quote.id).id).toBe(quote.id);
  });
});

describe('quote ids', () => {
  it('defaults to unguessable ids (D12, D39)', () => {
    const carts = new CartStore(CATALOGUE);
    const quotes = new QuoteStore(CATALOGUE, carts);
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    const ids = [quotes.issue(cart.cart_id).id, quotes.issue(cart.cart_id).id];

    expect(new Set(ids).size).toBe(2);
    for (const id of ids) {
      expect(id).toMatch(
        /^quote_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
    expect(randomQuoteIds()).not.toBe(randomQuoteIds());
  });

  it('counts the quotes it holds', () => {
    const { carts, quotes } = fixture();
    const cart = carts.create([{ product_id: 'prod_cobbleford_mug', quantity: 1 }]);
    quotes.issue(cart.cart_id);
    quotes.issue(cart.cart_id);

    expect(quotes.size).toBe(2);
  });
});
