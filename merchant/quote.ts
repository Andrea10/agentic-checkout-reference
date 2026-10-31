/**
 * Quotes: what the purchase would cost, as a promise with an expiry.
 *
 * A quote is the merchant's priced answer to "here is my cart, what do I owe
 * you?". It is the object the buyer agent shows a human before spending, and
 * the object T07's `place_order` charges against, so three properties matter
 * more than the arithmetic:
 *
 * 1. **It is shaped to ACP.** The quote carries the field names of the ACP
 *    agentic-checkout session: `line_items`, `totals`, `status`, `currency`
 *    (D34). An agent that can read an ACP checkout can read this.
 * 2. **It expires.** Fifteen minutes, stamped as `expires_at` (D38). A price
 *    with no expiry is a price the merchant has to honour forever.
 * 3. **It is tied to one version of one cart.** Add something to the cart and
 *    the quote goes stale, because it is no longer a quote for what is in
 *    there (D38). That is what stops an agent being authorised for £5 and
 *    charged for £500.
 *
 * Quotes are held in the server process, addressed by an explicit `quote_id`,
 * for the same reason carts are (D11, D39): MCP is stateless, so the merchant
 * must be handed the identifier rather than remember a session. Holding the
 * quote server-side also means T07 can look up what it quoted instead of
 * trusting a quote object handed back by the agent.
 *
 * There is no tax and no shipping in this quote, because there is no tax or
 * shipping in the catalogue. Those lines are absent rather than zero (D36).
 */

import { randomUUID } from 'node:crypto';

import * as z from 'zod';

import {
  acpCapabilitiesSchema,
  acpCheckoutStatusSchema,
  acpEmptyArraySchema,
  acpLineItemSchema,
  acpTotalSchema,
  checkoutAvailabilityStatus,
  total,
  type AcpLineItem,
  type AcpTotal,
} from './acp.js';
import { systemClock, type Cart, type CartLine, type CartStore, type Clock } from './cart.js';
import { CURRENCY, findProduct, type Product } from './catalogue.js';
import { MerchantError } from './errors.js';

/** How long a quote is good for. Fifteen minutes (D38). */
export const QUOTE_TTL_SECONDS = 900;

/** Returns the next quote id. Injected so tests and the demo get stable ids. */
export type QuoteIdFactory = () => string;

/** The default quote ids: `quote_` followed by a random UUID, as for carts (D12). */
export const randomQuoteIds: QuoteIdFactory = () => `quote_${randomUUID()}`;

/** Deterministic quote ids, for tests and the demo only. Never the default. */
export function sequentialQuoteIds(): QuoteIdFactory {
  let next = 0;
  return () => {
    next += 1;
    return `quote_${String(next).padStart(6, '0')}`;
  };
}

/**
 * A quote, shaped to the ACP checkout session.
 *
 * The first nine fields are the ones the ACP checkout schema requires. The
 * last four are this merchant's: `created_at` and `expires_at` are ACP
 * session fields used for the quote's own life (D38), and `cart_id` and
 * `cart_version` are the tie back to the cart (D38).
 */
export const quoteSchema = z.object({
  id: z.string().describe('Quote identifier. Pass it to place_order.'),
  status: acpCheckoutStatusSchema.describe('ACP checkout status of this quote.'),
  currency: z.literal(CURRENCY).describe('ISO 4217 currency of every amount below.'),
  line_items: z.array(acpLineItemSchema),
  totals: z
    .array(acpTotalSchema)
    .describe('Cart-level money lines. No tax or fulfilment line is quoted (D36).'),
  fulfillment_options: acpEmptyArraySchema.describe('Always empty: nothing is shipped.'),
  messages: acpEmptyArraySchema.describe('Always empty: refusals come back as errors (D13).'),
  links: acpEmptyArraySchema.describe('Always empty: this merchant publishes no policy pages.'),
  capabilities: acpCapabilitiesSchema.describe('Always empty: nothing is negotiated.'),
  created_at: z.string().describe('ISO 8601 UTC time the quote was made.'),
  expires_at: z.string().describe('ISO 8601 UTC time after which the quote is refused.'),
  cart_id: z.string().describe('The cart this quote prices.'),
  cart_version: z
    .int()
    .describe('The cart version priced. A later version makes this quote stale.'),
});

export type Quote = z.infer<typeof quoteSchema>;

/**
 * Adds whole seconds to an ISO 8601 instant and returns another one.
 *
 * Throws a plain `Error` rather than a {@link MerchantError} when the clock
 * hands back something unreadable: that is a broken merchant, not a refusal
 * the agent could do anything about, so it surfaces as `internal_error`.
 */
function plusSeconds(instant: string, seconds: number): string {
  const base = Date.parse(instant);
  if (Number.isNaN(base)) {
    throw new Error(`the clock returned an unreadable instant: ${instant}`);
  }
  return new Date(base + seconds * 1_000).toISOString();
}

/**
 * Prices one cart line.
 *
 * `available_quantity` and `availability_status` are read from the catalogue
 * at quote time. Nothing is reserved (D17), so both are a snapshot: T07's
 * `place_order` re-checks stock rather than trusting them.
 */
function lineItemFor(line: CartLine, product: Product, index: number): AcpLineItem {
  const lineTotal = line.unit_price_minor * line.quantity;

  return {
    id: `li_${String(index + 1)}`,
    item: { id: product.id, name: product.name, unit_amount: line.unit_price_minor },
    quantity: line.quantity,
    name: line.name,
    unit_amount: line.unit_price_minor,
    product_id: product.id,
    category: product.category,
    availability_status: checkoutAvailabilityStatus(product.stock),
    available_quantity: product.stock,
    totals: [
      total('subtotal', 'Subtotal', lineTotal),
      total('total', 'Total', lineTotal),
    ],
  };
}

/**
 * The cart-level money lines.
 *
 * Three totals that are all the same number, deliberately: `items_base_amount`
 * is the items before any item-level adjustment, `subtotal` is after them, and
 * `total` is after cart-level ones. Their all being equal is the quote's way
 * of saying there are no discounts, no fees and no tip (D35).
 */
function totalsFor(lineItems: readonly AcpLineItem[]): AcpTotal[] {
  const items = lineItems.reduce(
    (sum, lineItem) => sum + lineItem.unit_amount * lineItem.quantity,
    0,
  );

  return [
    total('items_base_amount', 'Items', items),
    total('subtotal', 'Subtotal', items),
    total('total', 'Total', items),
  ];
}

/**
 * In-memory quote store.
 *
 * One instance per server process, alongside the cart store. Quotes are never
 * evicted while the process lives; an expired quote stays in the map and is
 * refused on read, which is what lets the refusal name expiry rather than a
 * missing id.
 */
export class QuoteStore {
  readonly #quotes = new Map<string, Quote>();
  readonly #catalogue: readonly Product[];
  readonly #carts: CartStore;
  readonly #nextId: QuoteIdFactory;
  readonly #now: Clock;
  readonly #ttlSeconds: number;

  constructor(
    catalogue: readonly Product[],
    carts: CartStore,
    options: { nextId?: QuoteIdFactory; now?: Clock; ttlSeconds?: number } = {},
  ) {
    this.#catalogue = catalogue;
    this.#carts = carts;
    this.#nextId = options.nextId ?? randomQuoteIds;
    this.#now = options.now ?? systemClock;
    this.#ttlSeconds = options.ttlSeconds ?? QUOTE_TTL_SECONDS;
  }

  /** Number of quotes currently held. Tests and the demo read it. */
  get size(): number {
    return this.#quotes.size;
  }

  /**
   * Prices a cart and records the quote.
   *
   * Refuses `cart_not_found` for an unknown cart, `cart_closed` for one an
   * order was placed from (D130), and `cart_empty` for one with nothing in
   * it: a quote is a priced promise, and there is nothing to price (D37).
   */
  issue(cartId: string): Quote {
    const cart = this.#carts.get(cartId);
    this.#carts.assertOpen(cartId);
    if (cart.items.length === 0) {
      throw new MerchantError('cart_empty', `cart ${cartId} has no items to quote`);
    }

    const lineItems = cart.items.map((line, index) =>
      lineItemFor(line, this.#productFor(line), index),
    );
    const createdAt = this.#now();

    const quote: Quote = {
      id: this.#nextId(),
      status: 'ready_for_payment',
      currency: CURRENCY,
      line_items: lineItems,
      totals: totalsFor(lineItems),
      fulfillment_options: [],
      messages: [],
      links: [],
      capabilities: {},
      created_at: createdAt,
      expires_at: plusSeconds(createdAt, this.#ttlSeconds),
      cart_id: cart.cart_id,
      cart_version: cart.version,
    };

    this.#quotes.set(quote.id, quote);
    return quote;
  }

  /** Reads a quote as issued, with no freshness check. Throws `quote_not_found`. */
  get(quoteId: string): Quote {
    const quote = this.#quotes.get(quoteId);
    if (quote === undefined) {
      throw new MerchantError('quote_not_found', `no quote with id ${quoteId}`);
    }
    return quote;
  }

  /**
   * Reads a quote and refuses it unless it is still good.
   *
   * This is the call T07's `place_order` makes: `quote_expired` once
   * `expires_at` has passed, `quote_stale` once the cart has moved on from the
   * version that was priced.
   */
  current(quoteId: string): Quote {
    const quote = this.get(quoteId);
    const now = this.#now();

    if (Date.parse(now) >= Date.parse(quote.expires_at)) {
      throw new MerchantError(
        'quote_expired',
        `quote ${quoteId} expired at ${quote.expires_at}`,
      );
    }

    const cart = this.#carts.get(quote.cart_id);
    if (cart.version !== quote.cart_version) {
      throw new MerchantError(
        'quote_stale',
        `quote ${quoteId} prices version ${String(quote.cart_version)} of cart ${quote.cart_id}, which is now at version ${String(cart.version)}`,
      );
    }

    return quote;
  }

  /** The catalogue entry behind a cart line. Lines are priced, so it must exist. */
  #productFor(line: CartLine): Product {
    const product = findProduct(this.#catalogue, line.product_id);
    if (product === undefined) {
      throw new MerchantError(
        'product_not_found',
        `cart line names ${line.product_id}, which is not in the catalogue`,
      );
    }
    return product;
  }
}

/** Reads one labelled total out of a quote. Returns `undefined` if absent. */
export function totalOf(
  totals: readonly AcpTotal[],
  type: AcpTotal['type'],
): number | undefined {
  return totals.find((entry) => entry.type === type)?.amount;
}

/** True when the quote still prices what is in the cart now. */
export function isQuoteCurrentFor(quote: Quote, cart: Cart): boolean {
  return quote.cart_id === cart.cart_id && quote.cart_version === cart.version;
}
