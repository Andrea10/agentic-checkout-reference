/**
 * The stock re-check, in one place.
 *
 * D17 decided that stock is checked and never reserved, and named this as the
 * consequence: a cart can pass the check in `add_to_cart` and still be
 * unfulfillable later. So the catalogue is re-read at every point where the
 * merchant is about to commit — `place_order` against the quote's lines, and
 * `confirm_order` against the held order's lines, which may have been sitting
 * for minutes while a human thought about it.
 *
 * Every short line is named in one refusal, for the same reason the policy
 * reports every failed check at once (D42): the agent can act on the whole
 * answer.
 */

import { findProduct, type Product } from './catalogue.js';
import { MerchantError } from './errors.js';

/** The least a line has to say for its stock to be checked. */
export interface StockLine {
  readonly product_id: string;
  readonly quantity: number;
}

/**
 * Re-checks every line against the catalogue as it is now.
 *
 * @param since what the refusal message says the stock has gone since, e.g.
 * `the quote was made`.
 * @throws MerchantError `product_not_found` or `insufficient_stock`.
 */
export function assertStockAvailable(
  catalogue: readonly Product[],
  lines: readonly StockLine[],
  since: string,
): void {
  const short: string[] = [];

  for (const line of lines) {
    const product = findProduct(catalogue, line.product_id);
    if (product === undefined) {
      throw new MerchantError(
        'product_not_found',
        `the order names ${line.product_id}, which is no longer in the catalogue`,
      );
    }
    if (product.stock < line.quantity) {
      short.push(
        `${line.product_id} (${String(product.stock)} left, ${String(line.quantity)} ordered)`,
      );
    }
  }

  if (short.length > 0) {
    throw new MerchantError(
      'insufficient_stock',
      `stock has gone since ${since}: ${short.join('; ')}`,
    );
  }
}
