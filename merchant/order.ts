/**
 * Orders: what the merchant decided to sell, before any money moves.
 *
 * An order in this reference implementation is the record of an authorisation
 * decision, not of a payment. `place_order` writes one when the mandate
 * covers the purchase, and that is all it does: nothing here touches the
 * payment rail and nothing here consumes mandate budget. T07b turns an
 * approved order into a paid one, which is why the status word for a fresh
 * order is `approved` and not `authorised` (D62): "authorised" is what the
 * rail will say, later, about money.
 *
 * Two statuses exist at T07a:
 *
 * - `approved` — the mandate covered it. T07b will charge it.
 * - `awaiting_confirmation` — the mandate covered it, but the amount is above
 *   the threshold the principal set for being asked, so the order is held with
 *   a confirmation token until a human presents that token (PRD R4).
 *
 * Orders are held in the server process, like carts (D11) and quotes (D39),
 * and are addressed by an `order_id` the factory makes unguessable by default
 * (D63). The confirmation token is a *separate* secret from the order id: an
 * agent that knows an order id still cannot confirm it.
 */

import { randomUUID } from 'node:crypto';

import { systemClock, type Clock } from './cart.js';
import { type Currency } from './catalogue.js';
import { MerchantError } from './errors.js';

/** The order statuses T07a can produce. T07b adds the paid one. */
export const ORDER_STATUSES = ['approved', 'awaiting_confirmation'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * One line of an order, in the merchant's internal vocabulary.
 *
 * ACP field names live on the wire and nowhere else (D28), and an order is
 * never sent whole: the success body is a status and an id (D62). So the
 * snapshot below uses `*_minor`, as the cart and the catalogue do.
 */
export interface OrderLine {
  readonly product_id: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit_price_minor: number;
  readonly line_total_minor: number;
}

/** Everything an order records whatever its status. */
export interface OrderFacts {
  /** The quote this order was placed against. One order per quote (D64). */
  readonly quote_id: string;
  readonly cart_id: string;
  /** The cart version the quote priced, so the order says what was bought. */
  readonly cart_version: number;
  readonly items: readonly OrderLine[];
  /** The quote's total, which is the amount the mandate was checked against. */
  readonly amount_minor: number;
  readonly currency: Currency;
  /** The agent as it presented itself. Not authenticated (D61). */
  readonly agent: string;
  /** This merchant's own id, from its configuration (D60). */
  readonly merchant: string;
  /** The mandate the decision was made under. */
  readonly mandate_id: string;
}

/**
 * An order as the store holds it.
 *
 * A union on `status`, the shape T04 chose for policy decisions (D41), so a
 * confirmation token cannot be read off an order that does not have one.
 */
export type Order =
  | (OrderFacts & {
      readonly order_id: string;
      readonly placed_at: string;
      readonly status: 'approved';
    })
  | (OrderFacts & {
      readonly order_id: string;
      readonly placed_at: string;
      readonly status: 'awaiting_confirmation';
      /** Held server-side. The only thing that will confirm this order. */
      readonly confirmation_token: string;
      /** The threshold the amount went above, copied from the mandate. */
      readonly human_confirm_above_minor: number;
    });

/** An order the mandate allowed outright. */
export type ApprovedOrder = Extract<Order, { status: 'approved' }>;

/** An order held for a human, with the token that will release it. */
export type HeldOrder = Extract<Order, { status: 'awaiting_confirmation' }>;

/** Returns the next order id. Injected so tests and the demo get stable ids. */
export type OrderIdFactory = () => string;

/** Returns the next confirmation token. Injected for the same reason. */
export type ConfirmationTokenFactory = () => string;

/** The default order ids: `order_` followed by a random UUID, as for carts (D12). */
export const randomOrderIds: OrderIdFactory = () => `order_${randomUUID()}`;

/** Deterministic order ids, for tests and the demo only. Never the default. */
export function sequentialOrderIds(): OrderIdFactory {
  let next = 0;
  return () => {
    next += 1;
    return `order_${String(next).padStart(6, '0')}`;
  };
}

/**
 * The default confirmation tokens: `confirm_` followed by a random UUID.
 *
 * This is the one value in the repo that is a capability rather than a name:
 * whoever holds it can complete the order. Hence a UUID from `node:crypto`
 * and not a counter, and hence `sequentialConfirmationTokens` below carries
 * the same warning the cart ids do (D12).
 */
export const randomConfirmationTokens: ConfirmationTokenFactory = () =>
  `confirm_${randomUUID()}`;

/** Deterministic confirmation tokens, for tests and the demo only. */
export function sequentialConfirmationTokens(): ConfirmationTokenFactory {
  let next = 0;
  return () => {
    next += 1;
    return `confirm_${String(next).padStart(6, '0')}`;
  };
}

/**
 * In-memory order store.
 *
 * One instance per server process, alongside the cart and quote stores, with
 * the same costs: orders die with the process and are never evicted (D63).
 * Two indexes are kept beside the orders themselves — by quote, which is what
 * makes a quote single use (D64), and by confirmation token, which is how
 * T07b will find a held order.
 */
export class OrderStore {
  readonly #orders = new Map<string, Order>();
  readonly #byQuote = new Map<string, string>();
  readonly #byToken = new Map<string, string>();
  readonly #nextId: OrderIdFactory;
  readonly #nextToken: ConfirmationTokenFactory;
  readonly #now: Clock;

  constructor(
    options: {
      nextId?: OrderIdFactory;
      nextToken?: ConfirmationTokenFactory;
      now?: Clock;
    } = {},
  ) {
    this.#nextId = options.nextId ?? randomOrderIds;
    this.#nextToken = options.nextToken ?? randomConfirmationTokens;
    this.#now = options.now ?? systemClock;
  }

  /** Number of orders currently held. Tests and the demo read it. */
  get size(): number {
    return this.#orders.size;
  }

  /** Records an order the mandate allowed outright. */
  approve(facts: OrderFacts): ApprovedOrder {
    return this.#record({
      ...facts,
      order_id: this.#nextId(),
      placed_at: this.#now(),
      status: 'approved',
    });
  }

  /** Records an order held for a human, with the token that will release it. */
  holdForConfirmation(facts: OrderFacts, humanConfirmAboveMinor: number): HeldOrder {
    return this.#record({
      ...facts,
      order_id: this.#nextId(),
      placed_at: this.#now(),
      status: 'awaiting_confirmation',
      confirmation_token: this.#nextToken(),
      human_confirm_above_minor: humanConfirmAboveMinor,
    });
  }

  /** Reads an order by id. `undefined` when there is no such order. */
  get(orderId: string): Order | undefined {
    return this.#orders.get(orderId);
  }

  /** The order placed against a quote, if one was. */
  forQuote(quoteId: string): Order | undefined {
    const orderId = this.#byQuote.get(quoteId);
    return orderId === undefined ? undefined : this.#orders.get(orderId);
  }

  /** The held order a confirmation token releases. T07b's way in. */
  forConfirmationToken(token: string): Order | undefined {
    const orderId = this.#byToken.get(token);
    return orderId === undefined ? undefined : this.#orders.get(orderId);
  }

  /**
   * Refuses a second order against the same quote (D64).
   *
   * A quote is a priced promise for one purchase, and an order already holds
   * it — including an order still awaiting confirmation, or the agent could
   * collect confirmation tokens for one quote until a human said yes to one of
   * them.
   */
  assertQuoteUnused(quoteId: string): void {
    const existing = this.forQuote(quoteId);
    if (existing !== undefined) {
      throw new MerchantError(
        'quote_already_ordered',
        `quote ${quoteId} has already been ordered as ${existing.order_id} (${existing.status})`,
      );
    }
  }

  /** Every order, oldest first. A copy, so the store cannot be written to. */
  orders(): readonly Order[] {
    return [...this.#orders.values()];
  }

  #record<T extends Order>(order: T): T {
    const frozen: T = Object.freeze(order);
    this.#orders.set(frozen.order_id, frozen);
    this.#byQuote.set(frozen.quote_id, frozen.order_id);
    if (frozen.status === 'awaiting_confirmation') {
      this.#byToken.set(frozen.confirmation_token, frozen.order_id);
    }
    return frozen;
  }
}
