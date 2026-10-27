import { describe, expect, it } from 'vitest';

import { CATALOGUE, CURRENCY, findProduct } from '../../merchant/catalogue.js';

describe('catalogue', () => {
  it('holds between 8 and 12 products', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(8);
    expect(CATALOGUE.length).toBeLessThanOrEqual(12);
  });

  it('gives every product a unique id', () => {
    const ids = CATALOGUE.map((product) => product.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prices everything in GBP minor units as positive integers', () => {
    for (const product of CATALOGUE) {
      expect(product.currency).toBe(CURRENCY);
      expect(Number.isInteger(product.price_minor)).toBe(true);
      expect(product.price_minor).toBeGreaterThan(0);
      expect(Number.isInteger(product.stock)).toBe(true);
      expect(product.stock).toBeGreaterThan(0);
    }
  });

  it('describes every product', () => {
    for (const product of CATALOGUE) {
      expect(product.name.length).toBeGreaterThan(0);
      expect(product.description.length).toBeGreaterThan(0);
      expect(product.category.length).toBeGreaterThan(0);
    }
  });

  it('finds a product by id and returns undefined for an unknown one', () => {
    expect(findProduct(CATALOGUE, 'prod_cobbleford_mug')?.price_minor).toBe(1450);
    expect(findProduct(CATALOGUE, 'prod_nonexistent')).toBeUndefined();
  });
});
