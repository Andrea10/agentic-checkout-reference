/**
 * Tests for the ACP product-feed shaping.
 *
 * These are the tests that would fail if someone renamed a field back to the
 * internal vocabulary, or quietly let the catalogue's `stock` count leak into
 * an object whose schema forbids extra fields.
 */

import { describe, expect, it } from 'vitest';

import {
  ACP_SPEC_VERSION,
  LOW_STOCK_THRESHOLD,
  acpProductSchema,
  acpProductsResponseSchema,
  checkoutAvailabilityStatus,
  feedAvailabilityStatus,
  toAcpProduct,
} from '../../merchant/acp.js';
import { CATALOGUE, findProduct, type Product } from '../../merchant/catalogue.js';
import { createMerchantState, listProducts } from '../../merchant/tools.js';

/** The catalogue entry the fixtures below are built from. */
function sample(): Product {
  const product = findProduct(CATALOGUE, 'prod_aurora_desk_lamp');
  if (product === undefined) throw new Error('fixture product missing');
  return product;
}

describe('ACP spec version', () => {
  it('names the stable version the shapes were read from', () => {
    expect(ACP_SPEC_VERSION).toBe('2026-04-17');
  });
});

describe('toAcpProduct', () => {
  it('maps a catalogue product onto an ACP product with one variant', () => {
    const product = sample();

    expect(toAcpProduct(product)).toEqual({
      id: 'prod_aurora_desk_lamp',
      title: 'Aurora Desk Lamp',
      description: { plain: product.description },
      variants: [
        {
          id: 'prod_aurora_desk_lamp',
          title: 'Aurora Desk Lamp',
          description: { plain: product.description },
          price: { amount: 4250, currency: 'GBP' },
          availability: { available: true, status: 'in_stock' },
          categories: [{ value: 'lighting', taxonomy: 'merchant' }],
        },
      ],
    });
  });

  it('gives the single variant the same id as the product (D29)', () => {
    for (const product of CATALOGUE) {
      const shaped = toAcpProduct(product);
      expect(shaped.variants).toHaveLength(1);
      expect(shaped.variants[0]?.id).toBe(shaped.id);
    }
  });

  it('keeps the currency upper case, as the feed schema requires (D32)', () => {
    for (const product of CATALOGUE) {
      expect(toAcpProduct(product).variants[0]?.price.currency).toBe('GBP');
    }
  });

  it('prices in integer minor units, never a float (D16)', () => {
    for (const product of CATALOGUE) {
      const amount = toAcpProduct(product).variants[0]?.price.amount ?? -1;
      expect(Number.isInteger(amount)).toBe(true);
      expect(amount).toBeGreaterThan(0);
    }
  });

  it('does not carry the stock count as a number anywhere (D30)', () => {
    const lowStock: Product = { ...sample(), stock: 3 };
    const shaped = JSON.stringify(toAcpProduct(lowStock));

    expect(shaped).not.toContain('stock_');
    expect(shaped).not.toContain('"stock"');
    expect(shaped).not.toContain('price_minor');
    // The level survives only as a status word.
    expect(shaped).toContain('limited_stock');
  });

  it('shapes every catalogue entry into something the ACP schema accepts', () => {
    for (const product of CATALOGUE) {
      expect(acpProductSchema.safeParse(toAcpProduct(product)).success).toBe(true);
    }
  });
});

describe('availability status', () => {
  it.each([
    [0, 'out_of_stock'],
    [1, 'limited_stock'],
    [LOW_STOCK_THRESHOLD, 'limited_stock'],
    [LOW_STOCK_THRESHOLD + 1, 'in_stock'],
  ])('feed: %i units reads as %s', (stock: number, expected: string) => {
    expect(feedAvailabilityStatus(stock)).toBe(expected);
  });

  it.each([
    [0, 'out_of_stock'],
    [1, 'low_stock'],
    [LOW_STOCK_THRESHOLD, 'low_stock'],
    [LOW_STOCK_THRESHOLD + 1, 'in_stock'],
  ])('checkout: %i units reads as %s', (stock: number, expected: string) => {
    expect(checkoutAvailabilityStatus(stock)).toBe(expected);
  });

  it('uses each ACP file’s own word for low stock (D31)', () => {
    // The feed schema says `limited_stock`; the checkout schema says
    // `low_stock`. Neither is a typo on our side, and we do not pick one.
    expect(feedAvailabilityStatus(2)).toBe('limited_stock');
    expect(checkoutAvailabilityStatus(2)).toBe('low_stock');
  });

  it('marks a sold-out product unavailable, not merely out of stock', () => {
    const soldOut: Product = { ...sample(), stock: 0 };

    expect(toAcpProduct(soldOut).variants[0]?.availability).toEqual({
      available: false,
      status: 'out_of_stock',
    });
  });
});

describe('list_products as an ACP ProductsResponse', () => {
  it('matches the ACP ProductsResponse schema exactly (D33)', () => {
    const result = listProducts(createMerchantState());

    expect(acpProductsResponseSchema.safeParse(result).success).toBe(true);
    expect(Object.keys(result)).toEqual(['products']);
  });
});
