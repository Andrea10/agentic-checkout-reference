/**
 * Orders: what the merchant decided to sell, and what the rail then did about
 * the money.
 *
 * An order starts as a record of an *authorisation decision* — the merchant
 * and the mandate agreed — and ends as a record of a *payment*. Those are two
 * different facts, so they are two different status words (D62): `approved` is
 * what the merchant decided, `authorised` is what the rail did to the money,
 * and `paid` is the money actually taken.
 *
 * Five states, and every transition is one of the five steps below (D80):
 *
 * ```text
 *                 place_order
 *                 ┌──────────┴───────────┐
 *            mandate allows      above the threshold
 *                 │                      │
 *            approved           awaiting_confirmation ──(hold expires: refused on read)
 *                 │                      │ confirm_order, re-checked
 *                 └──────────┬───────────┘
 *                    rail.authorise
 *            ┌──────────┴───────────┐
 *        declined              authorised
 *                                   │ rail.capture
 *                        ┌──────────┴──────────┐
 *                   (declined capture:      paid
 *                    stays authorised)
 * ```
 *
 * `paid` and `declined` are terminal. `authorised` is terminal too when the
 * capture was refused: the rail is holding money the merchant could not take,
 * and this interface has no cancel and no refund by the PRD, so the order
 * stops there and says so rather than pretending to be declined.
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

import type { Mandate } from '../mandate/index.js';
import type { Authorisation, Capture, RailDecline } from '../rail/index.js';

/** Every state an order can be in. See the file comment for the transitions. */
export const ORDER_STATUSES = [
  'approved',
  'awaiting_confirmation',
  'authorised',
  'paid',
  'declined',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * How long a held order waits for its human. Fifteen minutes, the same window
 * a quote gets (D38), counted from the moment the order was held (D82).
 */
export const HELD_ORDER_TTL_SECONDS = 900;

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

/** What every order carries, whatever the rail has done. */
interface OrderIdentity extends OrderFacts {
  readonly order_id: string;
  readonly placed_at: string;
}

/**
 * An order as the store holds it.
 *
 * A union on `status`, the shape T04 chose for policy decisions (D41), so a
 * confirmation token cannot be read off an order that does not have one, and
 * a capture cannot be read off an order nothing has captured.
 *
 * There is no merchant timestamp for the payment steps: the rail stamps its
 * own `authorised_at` and `captured_at`, and a second clock's opinion of the
 * same event is a field that can disagree with itself (D80).
 */
export type Order =
  | (OrderIdentity & { readonly status: 'approved' })
  | (OrderIdentity & {
      readonly status: 'awaiting_confirmation';
      /** Held server-side. The only thing that will confirm this order. */
      readonly confirmation_token: string;
      /** The threshold the amount went above, copied from the mandate. */
      readonly human_confirm_above_minor: number;
      /** When the hold lapses, after which the token is refused (D82). */
      readonly expires_at: string;
      /**
       * The mandate as it was presented, kept so `confirm_order` can re-check
       * it against the clock and the budget as they are at confirmation time
       * (D83). This is a credential held in the server's memory; D69's
       * process-level isolation is all that bounds it.
       */
      readonly mandate: Mandate;
    })
  | (OrderIdentity & {
      readonly status: 'authorised';
      /** The hold the rail granted. */
      readonly authorisation: Authorisation;
      /** Set only when a capture was attempted and refused (D81). */
      readonly capture_decline?: RailDecline;
    })
  | (OrderIdentity & {
      readonly status: 'paid';
      readonly authorisation: Authorisation;
      readonly capture: Capture;
    })
  | (OrderIdentity & {
      readonly status: 'declined';
      /** Why the rail refused to hold the money. */
      readonly decline: RailDecline;
    });

/** An order the mandate allowed outright, before the rail was called. */
export type ApprovedOrder = Extract<Order, { status: 'approved' }>;

/** An order held for a human, with the token that will release it. */
export type HeldOrder = Extract<Order, { status: 'awaiting_confirmation' }>;

/** An order whose funds the rail is holding. */
export type AuthorisedOrder = Extract<Order, { status: 'authorised' }>;

/** An order the rail has taken the money for. */
export type PaidOrder = Extract<Order, { status: 'paid' }>;

/** An order the rail refused to hold funds for. */
export type DeclinedOrder = Extract<Order, { status: 'declined' }>;

/** An order that can still be sent to the rail. */
export type PayableOrder = ApprovedOrder | HeldOrder;

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

/** The terms of a hold, beyond the facts every order carries. */
export interface HoldTerms {
  /** The threshold the amount went above, copied from the mandate. */
  readonly human_confirm_above_minor: number;
  /** The mandate to re-check when the token comes back (D83). */
  readonly mandate: Mandate;
}

/**
 * In-memory order store.
 *
 * One instance per server process, alongside the cart and quote stores, with
 * the same costs: orders die with the process and are never evicted (D63).
 * Two indexes are kept beside the orders themselves — by quote, which is what
 * makes a quote single use (D64), and by confirmation token, which is how
 * `confirm_order` finds a held order.
 *
 * Every order in the map is frozen. A transition does not amend an order: it
 * writes a new frozen one in its place, so a reference taken before the
 * transition still reads the state it was taken in.
 */
export class OrderStore {
  readonly #orders = new Map<string, Order>();
  readonly #byQuote = new Map<string, string>();
  readonly #byToken = new Map<string, string>();
  /** Tokens whose attempt has been sent to the rail (D126, D128). */
  readonly #spentTokens = new Set<string>();
  readonly #nextId: OrderIdFactory;
  readonly #nextToken: ConfirmationTokenFactory;
  readonly #now: Clock;
  readonly #holdTtlSeconds: number;

  constructor(
    options: {
      nextId?: OrderIdFactory;
      nextToken?: ConfirmationTokenFactory;
      now?: Clock;
      holdTtlSeconds?: number;
    } = {},
  ) {
    this.#nextId = options.nextId ?? randomOrderIds;
    this.#nextToken = options.nextToken ?? randomConfirmationTokens;
    this.#now = options.now ?? systemClock;
    this.#holdTtlSeconds = options.holdTtlSeconds ?? HELD_ORDER_TTL_SECONDS;
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
  holdForConfirmation(facts: OrderFacts, terms: HoldTerms): HeldOrder {
    const placedAt = this.#now();
    return this.#record({
      ...facts,
      order_id: this.#nextId(),
      placed_at: placedAt,
      status: 'awaiting_confirmation',
      confirmation_token: this.#nextToken(),
      human_confirm_above_minor: terms.human_confirm_above_minor,
      expires_at: plusSeconds(placedAt, this.#holdTtlSeconds),
      mandate: terms.mandate,
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

  /**
   * The order a confirmation token was issued for, whatever state it is in
   * now. `undefined` only when no order was ever held under that token.
   */
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

  /**
   * The held order a token releases, or a refusal saying why it does not.
   *
   * The token is single use in the sense that matters: it releases an order
   * once, and once that order has gone to the rail the same token will not
   * send it again (D84). The index is kept rather than deleted, so a second
   * confirmation is told what happened to its order instead of being told the
   * token does not exist — D39's reasoning about stale quotes, one level up.
   *
   * The token is spent as its attempt is sent to the rail, before the order
   * moves (D128). So two kinds of attempt leave a spent token on an order that
   * still reads `awaiting_confirmation`: one whose `authorise` threw (D85,
   * D126), and one whose `authorise` has not answered yet. A confirmation that
   * passes this check can still be refused by {@link spendToken}, if another
   * confirmation of the same token was sent to the rail after this check ran.
   *
   * @throws MerchantError `confirmation_token_unknown`, `order_already_paid`,
   * `order_not_awaiting_confirmation`, `confirmation_token_spent` or
   * `order_expired`.
   */
  requireConfirmable(token: string): HeldOrder {
    const order = this.forConfirmationToken(token);
    if (order === undefined) {
      throw new MerchantError(
        'confirmation_token_unknown',
        'that confirmation token does not match a held order',
      );
    }
    if (order.status === 'paid') {
      throw new MerchantError(
        'order_already_paid',
        `order ${order.order_id} was already paid; a confirmation token is good for one payment`,
      );
    }
    if (order.status !== 'awaiting_confirmation') {
      throw new MerchantError(
        'order_not_awaiting_confirmation',
        `order ${order.order_id} is ${order.status}, so there is nothing left to confirm`,
      );
    }
    if (this.#spentTokens.has(token)) {
      throw new MerchantError(
        'confirmation_token_spent',
        `order ${order.order_id} was already sent to the rail by an earlier confirmation, whose outcome is not known here, so this token will not send it again`,
      );
    }

    const now = this.#now();
    if (Date.parse(now) >= Date.parse(order.expires_at)) {
      throw new MerchantError(
        'order_expired',
        `order ${order.order_id} was held until ${order.expires_at}; it is ${now}`,
      );
    }

    return order;
  }

  /**
   * Spends a held order's token, or refuses if it is already spent.
   *
   * `settle()` calls this immediately before `authorise`, with no `await` in
   * between, so the check and the mark are one step: of two confirmations in
   * flight on one token, the second to get here is refused before the rail
   * (D128). The status is not touched, because nothing is known about the
   * money yet (D85, D126).
   *
   * @throws MerchantError `confirmation_token_spent`.
   */
  spendToken(token: string): void {
    if (this.#spentTokens.has(token)) {
      const orderId = this.#byToken.get(token) ?? 'unknown';
      throw new MerchantError(
        'confirmation_token_spent',
        `order ${orderId} was already sent to the rail by an earlier confirmation, whose outcome is not known here, so this token will not send it again`,
      );
    }
    this.#spentTokens.add(token);
  }

  /** The rail is holding the funds. The next step is a capture. */
  markAuthorised(orderId: string, authorisation: Authorisation): AuthorisedOrder {
    const order = this.#requireStatus(orderId, ['approved', 'awaiting_confirmation']);
    return this.#replace({
      ...identityOf(order),
      status: 'authorised',
      authorisation,
    });
  }

  /** The rail took the funds. This is the end of the order's life. */
  markPaid(orderId: string, capture: Capture): PaidOrder {
    const order = this.#requireStatus(orderId, ['authorised']);
    return this.#replace({
      ...identityOf(order),
      status: 'paid',
      authorisation: order.authorisation,
      capture,
    });
  }

  /** The rail would not hold the funds. Nothing was taken (D81). */
  markDeclined(orderId: string, decline: RailDecline): DeclinedOrder {
    const order = this.#requireStatus(orderId, ['approved', 'awaiting_confirmation']);
    return this.#replace({ ...identityOf(order), status: 'declined', decline });
  }

  /**
   * The funds are held and the capture was refused.
   *
   * The order stays `authorised`, because that is what is true: the rail has
   * the money and the merchant has not taken it. The decline is written onto
   * the order so that whoever reconciles it can see which attempt failed
   * (D81).
   */
  markCaptureDeclined(orderId: string, decline: RailDecline): AuthorisedOrder {
    const order = this.#requireStatus(orderId, ['authorised']);
    return this.#replace({
      ...identityOf(order),
      status: 'authorised',
      authorisation: order.authorisation,
      capture_decline: decline,
    });
  }

  /** Every order, oldest first. A copy, so the store cannot be written to. */
  orders(): readonly Order[] {
    return [...this.#orders.values()];
  }

  /**
   * The order in a state this transition is allowed from.
   *
   * An illegal transition is a bug in the merchant and not a refusal an agent
   * could act on, so it is a plain `Error`: the MCP layer reports it as
   * `internal_error`.
   */
  #requireStatus<S extends OrderStatus>(
    orderId: string,
    from: readonly S[],
  ): Extract<Order, { status: S }> {
    const order = this.#orders.get(orderId);
    if (order === undefined) {
      throw new Error(`no order with id ${orderId}`);
    }
    if (!from.includes(order.status as S)) {
      throw new Error(
        `order ${orderId} is ${order.status}, not ${from.join(' or ')}: illegal transition`,
      );
    }
    // The one cast in this file. `Array.includes` is a runtime check the
    // compiler cannot turn into a narrowing, and the alternative — a `switch`
    // per transition — would repeat the same check four times.
    return order as Extract<Order, { status: S }>;
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

  /**
   * Writes a transitioned order over the one in the map.
   *
   * The quote and token indexes are not touched: they point at an order id,
   * which does not change, and a token that has been used still has to find
   * its order so that a second confirmation can be told what happened to it.
   */
  #replace<T extends Order>(order: T): T {
    const frozen: T = Object.freeze(order);
    this.#orders.set(frozen.order_id, frozen);
    return frozen;
  }
}

/** The facts and the identity, with every status-specific field dropped. */
function identityOf(order: Order): OrderIdentity {
  return {
    quote_id: order.quote_id,
    cart_id: order.cart_id,
    cart_version: order.cart_version,
    items: order.items,
    amount_minor: order.amount_minor,
    currency: order.currency,
    agent: order.agent,
    merchant: order.merchant,
    mandate_id: order.mandate_id,
    order_id: order.order_id,
    placed_at: order.placed_at,
  };
}

/**
 * Adds whole seconds to an ISO 8601 instant.
 *
 * A clock that hands back something unreadable is a broken merchant rather
 * than a refusal an agent could act on, so this is a plain `Error`, exactly as
 * in `quote.ts`.
 */
function plusSeconds(instant: string, seconds: number): string {
  const base = Date.parse(instant);
  if (Number.isNaN(base)) {
    throw new Error(`the clock returned an unreadable instant: ${instant}`);
  }
  return new Date(base + seconds * 1_000).toISOString();
}
