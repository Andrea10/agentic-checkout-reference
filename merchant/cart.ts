/**
 * Carts.
 *
 * MCP v2 is stateless: nothing is remembered between calls unless the client
 * hands it back. So a cart is addressed by an explicit `cart_id` that
 * `create_cart` returns and every later call carries. The store below holds
 * carts in the server process's memory for the life of that process; it is a
 * reference implementation, not a database.
 */

import { CURRENCY, findProduct, type Currency, type Product } from './catalogue.js';
import { MerchantError } from './errors.js';

/** Largest quantity accepted for a single `add_to_cart` call or line. */
export const MAX_LINE_QUANTITY = 99;

/** One product line in a cart. Prices are copied in at the time of the call. */
export interface CartLine {
  readonly product_id: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit_price_minor: number;
  readonly line_total_minor: number;
}

/**
 * A cart as the tools return it.
 *
 * `subtotal_minor` is the sum of the lines and nothing else: no shipping, tax
 * or fulfilment. A priced quote is T06b's `get_quote`.
 */
export interface Cart {
  readonly cart_id: string;
  readonly currency: Currency;
  readonly items: readonly CartLine[];
  readonly subtotal_minor: number;
  readonly created_at: string;
  readonly updated_at: string;
}

/** An item asked for, before it is priced against the catalogue. */
export interface CartItemRequest {
  readonly product_id: string;
  readonly quantity: number;
}

/** Returns a new ISO-8601 timestamp. Injected so tests can freeze time. */
export type Clock = () => string;

/** Returns the next cart id. Injected so tests get stable ids. */
export type CartIdFactory = () => string;

/** Wall-clock time, to the second, in UTC. */
export const systemClock: Clock = () => new Date().toISOString();

/**
 * Sequential cart ids: `cart_000001`, `cart_000002`, ...
 *
 * Deterministic on purpose, so the T09 demo and the T08 agent tests produce
 * the same transcript on every run. The ids are therefore guessable, which a
 * real merchant could not accept; see docs/DECISIONS.md.
 */
export function sequentialCartIds(): CartIdFactory {
  let next = 0;
  return () => {
    next += 1;
    return `cart_${String(next).padStart(6, '0')}`;
  };
}

/** Rejects anything that is not a whole number of units within the line cap. */
function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
    throw new MerchantError(
      'invalid_quantity',
      `quantity must be a whole number between 1 and ${String(MAX_LINE_QUANTITY)}, got ${String(quantity)}`,
    );
  }
}

/** Sums the lines. Integers throughout, so no rounding is involved. */
function subtotalOf(lines: readonly CartLine[]): number {
  return lines.reduce((total, line) => total + line.line_total_minor, 0);
}

function lineFor(product: Product, quantity: number): CartLine {
  return {
    product_id: product.id,
    name: product.name,
    quantity,
    unit_price_minor: product.price_minor,
    line_total_minor: product.price_minor * quantity,
  };
}

/**
 * In-memory cart store.
 *
 * One instance per server process. Carts are never evicted: the process is
 * short-lived (a stdio server lives as long as its client) and Stage 1 has no
 * persistence story.
 */
export class CartStore {
  readonly #carts = new Map<string, Cart>();
  readonly #catalogue: readonly Product[];
  readonly #nextId: CartIdFactory;
  readonly #now: Clock;

  constructor(
    catalogue: readonly Product[],
    options: { nextId?: CartIdFactory; now?: Clock } = {},
  ) {
    this.#catalogue = catalogue;
    this.#nextId = options.nextId ?? sequentialCartIds();
    this.#now = options.now ?? systemClock;
  }

  /** Number of carts currently held. Tests and the demo read it. */
  get size(): number {
    return this.#carts.size;
  }

  /** Creates a cart, optionally seeded with items. */
  create(items: readonly CartItemRequest[] = []): Cart {
    const timestamp = this.#now();
    const cart: Cart = {
      cart_id: this.#nextId(),
      currency: CURRENCY,
      items: [],
      subtotal_minor: 0,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.#carts.set(cart.cart_id, cart);

    let current = cart;
    for (const item of items) {
      current = this.addItem(current.cart_id, item.product_id, item.quantity);
    }
    return current;
  }

  /** Reads a cart. Throws `cart_not_found` when the id is unknown. */
  get(cartId: string): Cart {
    const cart = this.#carts.get(cartId);
    if (cart === undefined) {
      throw new MerchantError('cart_not_found', `no cart with id ${cartId}`);
    }
    return cart;
  }

  /**
   * Adds units of a product, merging into an existing line for the same
   * product. The merged quantity is what is checked against stock and the
   * line cap, so repeated calls cannot creep past either.
   */
  addItem(cartId: string, productId: string, quantity: number): Cart {
    const cart = this.get(cartId);
    assertQuantity(quantity);

    const product = findProduct(this.#catalogue, productId);
    if (product === undefined) {
      throw new MerchantError('product_not_found', `no product with id ${productId}`);
    }

    const existing = cart.items.find((line) => line.product_id === productId);
    const merged = (existing?.quantity ?? 0) + quantity;
    assertQuantity(merged);

    if (merged > product.stock) {
      throw new MerchantError(
        'insufficient_stock',
        `only ${String(product.stock)} units of ${productId} are available, asked for ${String(merged)}`,
      );
    }

    const items =
      existing === undefined
        ? [...cart.items, lineFor(product, merged)]
        : cart.items.map((line) =>
            line.product_id === productId ? lineFor(product, merged) : line,
          );

    const updated: Cart = {
      ...cart,
      items,
      subtotal_minor: subtotalOf(items),
      updated_at: this.#now(),
    };
    this.#carts.set(cartId, updated);
    return updated;
  }
}
