/**
 * StripeRail: the same two calls as {@link StubRail}, answered by Stripe in
 * test mode.
 *
 * An authorisation is a PaymentIntent created with `capture_method: manual`
 * and confirmed in the same call with a Stripe test PaymentMethod
 * (`pm_card_visa` by default). Stripe holds the funds and leaves the
 * PaymentIntent in `requires_capture`; its id is the `authorisation_id`.
 * `capture` captures that PaymentIntent in full (D52).
 *
 * What comes back is sorted into the two kinds of failure `Rail` allows
 * (D50):
 *
 * - **A decline, returned.** A Stripe `card_error` is the issuer refusing:
 *   origin `issuer`. An `invalid_request_error` this rail can name — an amount
 *   Stripe will not take, an unknown PaymentIntent, one already captured — is
 *   the payment system rejecting the request: origin `rail`. Either way the
 *   code is one of the eight `DeclineCode`s, never a new one (D53).
 * - **A throw.** A connection, authentication, permission, rate-limit,
 *   idempotency or API error says nothing about the money: the payment may
 *   have gone through. So does an `invalid_request_error` this rail cannot
 *   name, and a PaymentIntent in a status it did not expect. All of them
 *   throw a {@link StripeRailError}, never a decline.
 *
 * The SDK itself is loaded only when the rail builds its own client, with a
 * dynamic `import()`: importing `rail/` for the stub must not load it, because
 * the SDK writes to stderr on load under some agent environments. That is
 * also why Stripe's errors are recognised by their documented `type` field
 * rather than `instanceof`.
 *
 * The secret key is read from `STRIPE_SECRET_KEY` and nowhere else, and only
 * when no client is injected. A key that does not start with `sk_test_` is
 * refused before a client exists, so a rail that builds its own client cannot
 * be pointed at live money. A client passed in is the caller's: the rail never
 * sees its key. A log entry holds a time, the rail's name, the call, the
 * outcome, the order reference, the authorisation id, an amount, a currency
 * and a decline code; it has no field for the key or for a Stripe message.
 * What the rail throws: {@link StripeKeyError} carries a fixed sentence per
 * problem and never the value, and {@link StripeRailError} carries a message
 * with key-shaped runs replaced, plus Stripe's code and request id unchanged.
 */

import { randomUUID } from 'node:crypto';

import type Stripe from 'stripe';

import { discardRailLog, type RailLogEntry, type RailLogSink } from './log.js';
import { systemClock, type Clock } from './stub.js';
import type {
  Authorisation,
  AuthoriseRequest,
  AuthoriseResult,
  Capture,
  CaptureRequest,
  CaptureResult,
  CurrencyCode,
  DeclineCode,
  Instant,
  Rail,
  RailCall,
  RailDecline,
} from './types.js';

/** The one environment variable the key may come from. */
export const STRIPE_SECRET_KEY_ENV = 'STRIPE_SECRET_KEY';

/** The only key prefix this rail accepts: a Stripe test-mode secret key. */
export const STRIPE_TEST_KEY_PREFIX = 'sk_test_';

/**
 * Currencies accepted by default, in this repo's uppercase ISO 4217 form.
 *
 * GBP only, the same as {@link STUB_RAIL_CURRENCIES}, because it is the one
 * currency the repo prices anything in (D16). Stripe is sent the lowercase
 * form.
 */
export const STRIPE_RAIL_CURRENCIES: readonly CurrencyCode[] = ['GBP'];

/** The Stripe test PaymentMethod used when none is given: a Visa that succeeds. */
export const STRIPE_DEFAULT_TEST_PAYMENT_METHOD = 'pm_card_visa';

/** Returns the idempotency key for the next Stripe request. Injected, never implicit. */
export type IdempotencyKeyFactory = () => string;

/** What this rail reads from a PaymentIntent. Every Stripe PaymentIntent has these. */
export interface StripePaymentIntentLike {
  readonly id: string;
  readonly status: string;
  readonly amount: number;
  readonly amount_received: number;
  readonly currency: string;
  readonly metadata: Readonly<Record<string, string>>;
}

/** The two Stripe calls this rail makes, with the parameters it sends. */
export interface StripeClientLike {
  readonly paymentIntents: {
    create(
      params: Stripe.PaymentIntentCreateParams,
      options: Stripe.RequestOptions,
    ): Promise<StripePaymentIntentLike>;
    capture(
      id: string,
      params: Stripe.PaymentIntentCaptureParams,
      options: Stripe.RequestOptions,
    ): Promise<StripePaymentIntentLike>;
  };
}

/** The environment, or the part of it the rail reads. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** How to build a {@link StripeRail}. */
export interface StripeRailOptions {
  /**
   * The Stripe client. Tests inject a mock. When omitted, the rail builds a
   * real client from `STRIPE_SECRET_KEY` in {@link env}, after the key check.
   */
  readonly client?: StripeClientLike;
  /** Where the key is read from when no client is given. Default `process.env`. */
  readonly env?: Environment;
  /** Name the rail reports in its log. Default `stripe`. */
  readonly name?: string;
  /** Where log entries go. Default: nowhere (D54). */
  readonly log?: RailLogSink;
  /** Default: {@link systemClock}. Stripe's own timestamps are not used. */
  readonly now?: Clock;
  /** Default: a random UUID per request. Never derived from `order_ref` (D56). */
  readonly nextIdempotencyKey?: IdempotencyKeyFactory;
  /** Default {@link STRIPE_DEFAULT_TEST_PAYMENT_METHOD}. */
  readonly paymentMethod?: string;
  /** Uppercase ISO 4217 codes. Default {@link STRIPE_RAIL_CURRENCIES}. */
  readonly currencies?: readonly CurrencyCode[];
}

/** Why a key was refused. Each one names a kind of key, never the key. */
export type StripeKeyProblem = 'missing' | 'empty' | 'live' | 'not_test_secret';

/**
 * The key in `STRIPE_SECRET_KEY` is absent or is not a test-mode secret key.
 *
 * The message says which of {@link StripeKeyProblem} it is and nothing about
 * the value, not even a prefix the caller supplied: a fixed sentence per
 * problem.
 */
export class StripeKeyError extends Error {
  override readonly name = 'StripeKeyError';
  readonly problem: StripeKeyProblem;

  constructor(problem: StripeKeyProblem) {
    super(KEY_PROBLEM_MESSAGES[problem]);
    this.problem = problem;
  }
}

const KEY_PROBLEM_MESSAGES: Readonly<Record<StripeKeyProblem, string>> = {
  missing: `${STRIPE_SECRET_KEY_ENV} is not set; the Stripe rail needs a test-mode secret key (${STRIPE_TEST_KEY_PREFIX}...)`,
  empty: `${STRIPE_SECRET_KEY_ENV} is empty; the Stripe rail needs a test-mode secret key (${STRIPE_TEST_KEY_PREFIX}...)`,
  live: `${STRIPE_SECRET_KEY_ENV} holds a live-mode key; the Stripe rail refuses live keys and needs a test-mode secret key (${STRIPE_TEST_KEY_PREFIX}...)`,
  not_test_secret: `${STRIPE_SECRET_KEY_ENV} is not a test-mode secret key; it must start with ${STRIPE_TEST_KEY_PREFIX}`,
};

/**
 * Returns the test-mode secret key from `env`, or throws {@link StripeKeyError}.
 *
 * Exported so a caller can fail before printing anything, as the demo does.
 */
export function readStripeTestKey(env: Environment): string {
  const key = env[STRIPE_SECRET_KEY_ENV];
  if (key === undefined) throw new StripeKeyError('missing');
  if (key.trim().length === 0) throw new StripeKeyError('empty');
  if (key.startsWith(STRIPE_TEST_KEY_PREFIX) && key.length > STRIPE_TEST_KEY_PREFIX.length) {
    return key;
  }
  // Two letters then `_live_` (sk_live_, rk_live_, pk_live_) is reported as a
  // live key; anything else is simply not a test secret key.
  throw new StripeKeyError(/^[a-z]{2}_live_/.test(key) ? 'live' : 'not_test_secret');
}

/** Which way the Stripe call failed, when it was not an answer about the money. */
export type StripeRailFailure =
  | 'connection'
  | 'authentication'
  | 'permission'
  | 'rate_limit'
  | 'idempotency'
  | 'api'
  | 'invalid_request'
  | 'unexpected_status'
  | 'unknown';

/**
 * Stripe could not give an answer about the money (D50).
 *
 * Built fresh rather than rethrowing the SDK's error, and with no `cause`:
 * the SDK error is an object this rail does not control, holding text from
 * Stripe's response. `scrubKeys` is applied to the message only: every run
 * matching `KEY_SHAPED` becomes `[redacted key]`. Stripe's error code and
 * request id are copied through unchanged. What a reader gets to look the
 * request up is the category, the call, that code and that request id.
 */
export class StripeRailError extends Error {
  override readonly name = 'StripeRailError';
  readonly failure: StripeRailFailure;
  readonly call: RailCall;
  readonly stripe_code: string | undefined;
  readonly request_id: string | undefined;

  constructor(
    failure: StripeRailFailure,
    call: RailCall,
    message: string,
    details: { readonly stripe_code?: string | undefined; readonly request_id?: string | undefined } = {},
  ) {
    super(`stripe ${call} failed (${failure}): ${scrubKeys(message)}`);
    this.failure = failure;
    this.call = call;
    this.stripe_code = details.stripe_code;
    this.request_id = details.request_id;
  }
}

/** Anything shaped like a Stripe secret, restricted or publishable key. */
const KEY_SHAPED = /\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9*]*/g;

/** Replaces every key-shaped run in `text` with a marker. */
function scrubKeys(text: string): string {
  return text.replace(KEY_SHAPED, '[redacted key]');
}

/** The SDK error class names, as `error.type` reports them. */
const THROWN_FAILURES: Readonly<Record<string, StripeRailFailure>> = {
  StripeConnectionError: 'connection',
  StripeAuthenticationError: 'authentication',
  StripePermissionError: 'permission',
  StripeRateLimitError: 'rate_limit',
  StripeIdempotencyError: 'idempotency',
  StripeAPIError: 'api',
};

/** Stripe error codes that mean the amount itself was refused. */
const AMOUNT_CODES: ReadonlySet<string> = new Set([
  'amount_too_small',
  'amount_too_large',
  'invalid_charge_amount',
]);

function railDecline(code: DeclineCode, message: string): RailDecline {
  return { code, message, origin: 'rail' };
}

function issuerDecline(code: DeclineCode, message: string): RailDecline {
  return { code, message, origin: 'issuer' };
}

/** Rejects anything that is not a whole number of minor units above zero. */
function amountIsValid(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0;
}

/**
 * The issuer's reason, folded into the three issuer codes `DeclineCode` has.
 *
 * Stripe has many more (expired card, wrong CVC, a Radar block); every one of
 * them is still the card being refused, so the rest become `card_declined`
 * and keep Stripe's own code in the message.
 */
function issuerCodeFor(error: StripeErrorLike): DeclineCode {
  if (error.code === 'insufficient_funds' || error.decline_code === 'insufficient_funds') {
    return 'insufficient_funds';
  }
  if (error.code === 'authentication_required' || error.decline_code === 'authentication_required') {
    return 'authentication_required';
  }
  return 'card_declined';
}

/** Stripe's code and decline code, for a decline message. */
function describe(error: StripeErrorLike): string {
  const parts = [error.code ?? 'no code'];
  // The SDK sets an absent decline_code on a card error to ''.
  if (error.decline_code !== undefined && error.decline_code !== '') {
    parts.push(`decline_code ${error.decline_code}`);
  }
  return `stripe ${error.rawType ?? 'error'}: ${parts.join(', ')}`;
}

export class StripeRail implements Rail {
  readonly name: string;

  readonly #client: Promise<StripeClientLike>;
  readonly #log: RailLogSink;
  readonly #now: Clock;
  readonly #nextIdempotencyKey: IdempotencyKeyFactory;
  readonly #paymentMethod: string;
  readonly #currencies: readonly CurrencyCode[];

  constructor(options: StripeRailOptions = {}) {
    this.name = options.name ?? 'stripe';
    if (options.client !== undefined) {
      this.#client = Promise.resolve(options.client);
    } else {
      // The key is checked now, synchronously, so a bad one fails construction;
      // only the SDK load waits for the first call.
      const key = readStripeTestKey(options.env ?? process.env);
      this.#client = import('stripe').then(({ default: StripeClient }) => new StripeClient(key));
      // A load failure surfaces on the first call, not as an unhandled rejection.
      this.#client.catch(() => undefined);
    }
    this.#log = options.log ?? discardRailLog;
    this.#now = options.now ?? systemClock;
    this.#nextIdempotencyKey = options.nextIdempotencyKey ?? randomUUID;
    this.#paymentMethod = options.paymentMethod ?? STRIPE_DEFAULT_TEST_PAYMENT_METHOD;
    this.#currencies = options.currencies ?? STRIPE_RAIL_CURRENCIES;
  }

  /**
   * Hold funds: create a manual-capture PaymentIntent and confirm it.
   *
   * The request is checked here first, with the stub's rules and messages, so
   * a malformed one never reaches Stripe.
   */
  async authorise(request: AuthoriseRequest): Promise<AuthoriseResult> {
    const local = this.#checkAuthorise(request);
    if (local !== undefined) return this.#refuseAuthorise(this.#now(), request, local);

    let intent: StripePaymentIntentLike;
    try {
      const client = await this.#client;
      intent = await client.paymentIntents.create(
        {
          amount: request.amount_minor,
          currency: request.currency.toLowerCase(),
          capture_method: 'manual',
          confirm: true,
          payment_method: this.#paymentMethod,
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          metadata: { order_ref: request.order_ref },
        },
        { idempotencyKey: this.#nextIdempotencyKey() },
      );
    } catch (thrown) {
      const decline = this.#declineFromAuthoriseError(thrown);
      return this.#refuseAuthorise(this.#now(), request, decline);
    }

    const at = this.#now();
    switch (intent.status) {
      case 'requires_capture':
        break;
      case 'requires_action':
        // The cardholder has to authenticate (3D Secure, for example). No one
        // is present to do it, so this is a refusal. The PaymentIntent is left
        // open: there is no cancel on `Rail`.
        return this.#refuseAuthorise(
          at,
          request,
          issuerDecline(
            'authentication_required',
            `PaymentIntent ${intent.id} needs cardholder authentication (status requires_action)`,
          ),
        );
      case 'requires_payment_method':
        return this.#refuseAuthorise(
          at,
          request,
          issuerDecline(
            'card_declined',
            `PaymentIntent ${intent.id} was not authorised (status requires_payment_method)`,
          ),
        );
      default:
        // Anything else — `succeeded` above all, which would mean the money
        // was taken without a capture — is not a hold, and not a refusal
        // either. The caller must not record it as a declined card.
        throw new StripeRailError(
          'unexpected_status',
          'authorise',
          `PaymentIntent ${intent.id} has status ${intent.status}, expected requires_capture`,
        );
    }

    const authorisation: Authorisation = {
      authorisation_id: intent.id,
      order_ref: request.order_ref,
      amount_minor: request.amount_minor,
      currency: request.currency,
      authorised_at: at,
    };
    this.#log({
      at,
      rail: this.name,
      call: 'authorise',
      outcome: 'ok',
      order_ref: authorisation.order_ref,
      authorisation_id: authorisation.authorisation_id,
      amount_minor: authorisation.amount_minor,
      currency: authorisation.currency,
    });
    return { ok: true, authorisation };
  }

  /** Take the funds held: capture the PaymentIntent, in full. */
  async capture(request: CaptureRequest): Promise<CaptureResult> {
    let intent: StripePaymentIntentLike;
    try {
      const client = await this.#client;
      intent = await client.paymentIntents.capture(
        request.authorisation_id,
        {},
        { idempotencyKey: this.#nextIdempotencyKey() },
      );
    } catch (thrown) {
      const { decline, known } = this.#declineFromCaptureError(thrown);
      const at = this.#now();
      this.#log(this.#captureEntry(at, 'declined', request.authorisation_id, known, decline.code));
      return { ok: false, decline };
    }

    if (intent.status !== 'succeeded') {
      throw new StripeRailError(
        'unexpected_status',
        'capture',
        `PaymentIntent ${intent.id} has status ${intent.status} after capture, expected succeeded`,
      );
    }

    const at = this.#now();
    const capture: Capture = {
      authorisation_id: intent.id,
      // Every PaymentIntent this rail creates carries order_ref in metadata.
      // One created elsewhere does not; its capture still happened, so it is
      // reported, with an empty reference rather than a made-up one.
      order_ref: intent.metadata['order_ref'] ?? '',
      amount_minor: intent.amount_received,
      currency: intent.currency.toUpperCase(),
      captured_at: at,
    };
    this.#log(this.#captureEntry(at, 'ok', capture.authorisation_id, intent));
    return { ok: true, capture };
  }

  /** The stub's three request checks, in the stub's order. */
  #checkAuthorise(request: AuthoriseRequest): RailDecline | undefined {
    if (request.order_ref.length === 0) {
      return railDecline('order_ref_invalid', 'order_ref must not be empty');
    }
    if (!amountIsValid(request.amount_minor)) {
      return railDecline(
        'amount_invalid',
        `amount_minor must be a whole number of minor units above zero, got ${String(request.amount_minor)}`,
      );
    }
    if (!this.#currencies.includes(request.currency)) {
      return railDecline(
        'currency_unsupported',
        `${this.name} handles ${this.#currencies.join(', ')}, not ${request.currency}`,
      );
    }
    return undefined;
  }

  /** A decline for what Stripe said, or a throw when it was not about the money. */
  #declineFromAuthoriseError(thrown: unknown): RailDecline {
    const error = asStripeError(thrown, 'authorise');
    if (error.type === 'StripeCardError') {
      return issuerDecline(issuerCodeFor(error), describe(error));
    }
    if (error.type === 'StripeInvalidRequestError') {
      if (error.code !== undefined && AMOUNT_CODES.has(error.code)) {
        return railDecline('amount_invalid', describe(error));
      }
      if (error.param === 'currency') {
        return railDecline('currency_unsupported', describe(error));
      }
    }
    throw toRailError(error, 'authorise');
  }

  /**
   * A decline for a capture Stripe refused, plus whatever the error says about
   * the PaymentIntent, for the log.
   */
  #declineFromCaptureError(thrown: unknown): {
    decline: RailDecline;
    known: StripePaymentIntentLike | undefined;
  } {
    const error = asStripeError(thrown, 'capture');
    if (error.type === 'StripeCardError') {
      return { decline: issuerDecline(issuerCodeFor(error), describe(error)), known: undefined };
    }
    if (error.type === 'StripeInvalidRequestError') {
      if (error.code === 'resource_missing') {
        return {
          decline: railDecline('authorisation_not_found', describe(error)),
          known: undefined,
        };
      }
      if (error.code === 'payment_intent_unexpected_state') {
        const intent = error.payment_intent as StripePaymentIntentLike | undefined;
        // Stripe's error object carries the PaymentIntent on a request that
        // involves one (API reference, Errors); whether it does on this error
        // is UNVERIFIED (PROGRESS.md). Only one that has already succeeded was
        // captured; any other state (cancelled after the hold expired, never
        // authorised), or none, is no capturable hold by that id.
        const code: DeclineCode =
          intent?.status === 'succeeded' ? 'authorisation_already_captured' : 'authorisation_not_found';
        const status = intent === undefined ? 'unknown status' : `status ${intent.status}`;
        return {
          decline: railDecline(code, `${describe(error)} (${status})`),
          known: intent,
        };
      }
    }
    throw toRailError(error, 'capture');
  }

  /** Logs an authorise refusal and hands it back as a result. Same shape as the stub's. */
  #refuseAuthorise(at: Instant, request: AuthoriseRequest, refusal: RailDecline): AuthoriseResult {
    const known = {
      at,
      rail: this.name,
      call: 'authorise',
      outcome: 'declined',
      amount_minor: request.amount_minor,
      currency: request.currency,
      decline_code: refusal.code,
    } as const;
    this.#log(
      request.order_ref.length === 0 ? known : { ...known, order_ref: request.order_ref },
    );
    return { ok: false, decline: refusal };
  }

  /**
   * One capture log entry. With a PaymentIntent in hand it carries the order,
   * amount and currency, as the stub's does; without one, only the id (D52).
   */
  #captureEntry(
    at: Instant,
    outcome: 'ok' | 'declined',
    authorisationId: string,
    intent: StripePaymentIntentLike | undefined,
    declineCode?: DeclineCode,
  ): RailLogEntry {
    const base = {
      at,
      rail: this.name,
      call: 'capture',
      outcome,
      authorisation_id: authorisationId,
    } as const;
    const orderRef = intent?.metadata['order_ref'];
    const withMoney =
      intent === undefined || orderRef === undefined
        ? base
        : {
            ...base,
            order_ref: orderRef,
            amount_minor: intent.amount,
            currency: intent.currency.toUpperCase(),
          };
    return declineCode === undefined ? withMoney : { ...withMoney, decline_code: declineCode };
  }
}

/**
 * The fields of a Stripe SDK error this rail reads. `type` is the SDK class
 * name (`StripeCardError`, ...), `rawType` the API's (`card_error`, ...).
 */
interface StripeErrorLike {
  readonly type: string;
  readonly rawType?: string | undefined;
  readonly message: string;
  readonly code?: string | undefined;
  readonly decline_code?: string | undefined;
  readonly param?: string | undefined;
  readonly payment_intent?: unknown;
  readonly requestId?: string | undefined;
}

/** The thrown value as a Stripe SDK error, or a {@link StripeRailError} thrown in its place. */
function asStripeError(thrown: unknown, call: RailCall): StripeErrorLike {
  if (
    thrown instanceof Error &&
    'type' in thrown &&
    typeof thrown.type === 'string' &&
    thrown.type.startsWith('Stripe')
  ) {
    return thrown as StripeErrorLike;
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  throw new StripeRailError('unknown', call, message);
}

/** A Stripe error that is not an answer about the money, as a throwable. */
function toRailError(error: StripeErrorLike, call: RailCall): StripeRailError {
  const failure =
    THROWN_FAILURES[error.type] ??
    (error.type === 'StripeInvalidRequestError' ? 'invalid_request' : 'unknown');
  return new StripeRailError(failure, call, error.message, {
    stripe_code: error.code,
    request_id: error.requestId,
  });
}
