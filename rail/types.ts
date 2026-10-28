/**
 * The payment rail interface: the seam between this repo's checkout and
 * whatever actually moves the money.
 *
 * Stage 1 ships one implementation, `StubRail`, which never touches a real
 * payment system. Stage 2 adds a Stripe test-mode rail (T11) behind this same
 * interface. Everything here is therefore written to be satisfied by both: a
 * two-step authorise-then-capture flow, a request object per call, an
 * explicit decline on the result rather than an exception, and no knowledge
 * of mandates, carts or MCP.
 *
 * Money is always an integer in the currency's minor units (pence for GBP),
 * never a float (D16). Times are ISO 8601 instants in UTC.
 */

/**
 * ISO 4217 alpha-3 currency code, e.g. `GBP`.
 *
 * Declared here rather than imported from `mandate/`: nothing in `rail/`
 * depends on the mandate layer, so a rail can be dropped in without it.
 */
export type CurrencyCode = string;

/** ISO 8601 instant in UTC, e.g. `2026-01-01T00:00:00.000Z`. */
export type Instant = string;

/** An integer amount in the currency's minor units, e.g. 5000 = GBP 50.00. */
export type MinorUnits = number;

/** Which of the two rail calls something refers to. */
export type RailCall = 'authorise' | 'capture';

/**
 * Ask the rail to hold funds.
 *
 * `order_ref` is the merchant's own reference for the order. The rail echoes
 * it back and writes it to its log, so a reader can line a payment up against
 * an order; it is not an idempotency key (D56).
 */
export interface AuthoriseRequest {
  /** The merchant's reference for the order being paid for. */
  readonly order_ref: string;
  /** Amount to hold, an integer in minor units. Must be greater than zero. */
  readonly amount_minor: MinorUnits;
  /** Currency of `amount_minor`. */
  readonly currency: CurrencyCode;
}

/** Funds held, and the id the rail wants back when it is time to take them. */
export interface Authorisation {
  /** The rail's own id for this hold. Pass it to {@link Rail.capture}. */
  readonly authorisation_id: string;
  /** Echoed from the request. */
  readonly order_ref: string;
  /** The amount held. */
  readonly amount_minor: MinorUnits;
  /** Currency of `amount_minor`. */
  readonly currency: CurrencyCode;
  /** When the rail granted the hold. */
  readonly authorised_at: Instant;
}

/**
 * Ask the rail to take the funds it is holding.
 *
 * A request object rather than a bare id, so a later partial capture can add
 * an optional amount without changing a single call site (D52).
 */
export interface CaptureRequest {
  /** The id {@link Rail.authorise} returned. */
  readonly authorisation_id: string;
}

/**
 * Funds taken. There is no separate capture id: a capture is identified by
 * the authorisation it settles, because a rail here captures once, in full
 * (D52).
 */
export interface Capture {
  /** The authorisation this capture settled. */
  readonly authorisation_id: string;
  /** Carried through from the authorisation. */
  readonly order_ref: string;
  /** The amount taken, always the full authorised amount. */
  readonly amount_minor: MinorUnits;
  /** Currency of `amount_minor`. */
  readonly currency: CurrencyCode;
  /** When the rail took the funds. */
  readonly captured_at: Instant;
}

/**
 * Who said no.
 *
 * `issuer` is a real decline: the cardholder's bank refused the money.
 * `rail` is the payment system rejecting the request before it ever reached
 * an issuer — a malformed amount, an unknown authorisation. The distinction
 * is the one Stripe draws between a `card_error` and an
 * `invalid_request_error`, and it matters to whoever reads the audit log:
 * only the first is about the customer.
 */
export type DeclineOrigin = 'issuer' | 'rail';

/**
 * Every way a rail in this repo can say no.
 *
 * A closed union, declared in full now so that Stage 2's Stripe rail does not
 * have to widen it (D53). The first three are issuer declines and
 * `StubRail` never produces them; the rest are the rail rejecting a request.
 */
export type DeclineCode =
  /** The issuer refused, with no more specific reason given. */
  | 'card_declined'
  /** The issuer refused for want of funds. */
  | 'insufficient_funds'
  /** The issuer wants the cardholder to authenticate (SCA under PSD2). */
  | 'authentication_required'
  /** The amount was not an integer in minor units greater than zero. */
  | 'amount_invalid'
  /** The rail does not handle that currency. */
  | 'currency_unsupported'
  /** `order_ref` was empty. */
  | 'order_ref_invalid'
  /** No authorisation with that id. */
  | 'authorisation_not_found'
  /** That authorisation has already been captured. */
  | 'authorisation_already_captured';

/** The declared codes, in declaration order, for tests and documentation. */
export const DECLINE_CODES: readonly DeclineCode[] = [
  'card_declined',
  'insufficient_funds',
  'authentication_required',
  'amount_invalid',
  'currency_unsupported',
  'order_ref_invalid',
  'authorisation_not_found',
  'authorisation_already_captured',
];

/**
 * A refusal.
 *
 * Shaped like the merchant's error body (D13) — a machine-readable `code` and
 * a human-readable `message` — so a reader meets one failure envelope across
 * the repo, plus the `origin` that only payments needs.
 */
export interface RailDecline {
  /** What to branch on. */
  readonly code: DeclineCode;
  /** For the log and for a developer. Never shown to a cardholder verbatim. */
  readonly message: string;
  /** Whether the issuer refused, or the rail rejected the request. */
  readonly origin: DeclineOrigin;
}

/** Either funds are held, or the rail said no. */
export type AuthoriseResult =
  | { readonly ok: true; readonly authorisation: Authorisation }
  | { readonly ok: false; readonly decline: RailDecline };

/** Either funds are taken, or the rail said no. */
export type CaptureResult =
  | { readonly ok: true; readonly capture: Capture }
  | { readonly ok: false; readonly decline: RailDecline };

/**
 * A payment rail.
 *
 * Two calls, in order: `authorise` puts a hold on the money, `capture` takes
 * it. There is no cancel and no refund — out of scope for Stages 1 and 2 by
 * the PRD, which is why an uncaptured authorisation here simply sits there.
 *
 * Both calls return a result that may be a decline; neither throws for a
 * decline (D50). A thrown error means the rail itself is broken — no network,
 * bad credentials, a timeout — which is not an answer about the money and
 * which the caller must not record as a customer's card being refused.
 *
 * Both calls are asynchronous even though `StubRail` has nothing to wait for,
 * because a real rail is a network call and the interface must not change in
 * Stage 2.
 */
export interface Rail {
  /** Short identifier for this rail, e.g. `stub`. Appears in the log. */
  readonly name: string;
  /** Put a hold on funds for an order. */
  authorise(request: AuthoriseRequest): Promise<AuthoriseResult>;
  /** Take funds that are already held. */
  capture(request: CaptureRequest): Promise<CaptureResult>;
}
