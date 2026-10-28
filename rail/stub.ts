/**
 * StubRail: a payment rail that holds and takes imaginary money.
 *
 * It exists so the rest of the repo can run end to end with no payment
 * processor, no keys and no network. It always grants an authorisation for a
 * well-formed request — it never pretends to be a bank refusing a card — and
 * it refuses only what it genuinely cannot honour: a malformed request, a
 * capture of an authorisation it has never heard of, and a second capture of
 * one it has already settled. Every refusal it produces therefore has origin
 * `rail`, never `issuer`.
 *
 * It is deterministic by construction. The authorisation ids are sequential
 * and the clock is a fixed epoch that steps one second per call, so two runs
 * produce byte-identical transcripts. Randomness and wall-clock time are
 * available (`randomAuthorisationIds`, `systemClock`) but only if you inject
 * them.
 */

import { randomUUID } from 'node:crypto';

import { discardRailLog, type RailLogEntry, type RailLogSink } from './log.js';
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
  RailDecline,
} from './types.js';

/** Returns the instant to stamp on the next event. Injected, never implicit. */
export type Clock = () => Instant;

/** Returns the id for the next authorisation. Injected, never implicit. */
export type AuthorisationIdFactory = () => string;

/**
 * Where the stub's clock starts: a round, obviously synthetic instant.
 *
 * Nothing in the repo should read a stub timestamp as a real one.
 */
export const STUB_RAIL_EPOCH: Instant = '2026-01-01T00:00:00.000Z';

/** The one currency Stage 1 prices anything in (D16). */
export const STUB_RAIL_CURRENCIES: readonly CurrencyCode[] = ['GBP'];

/**
 * A clock that starts at `from` and steps forward on every read.
 *
 * Deterministic, and still ordered: an authorise and the capture that follows
 * it get different timestamps, which a frozen clock would not give.
 */
export function steppingClock(from: Instant = STUB_RAIL_EPOCH, stepMilliseconds = 1000): Clock {
  const start = Date.parse(from);
  if (Number.isNaN(start)) {
    throw new RangeError(`steppingClock needs an ISO 8601 instant, got ${from}`);
  }
  let steps = 0;
  return () => {
    const at = new Date(start + steps * stepMilliseconds).toISOString();
    steps += 1;
    return at;
  };
}

/** Wall-clock time in UTC. Inject it to make the stub non-deterministic. */
export const systemClock: Clock = () => new Date().toISOString();

/** Sequential authorisation ids: `auth_000001`, `auth_000002`, ... */
export function sequentialAuthorisationIds(): AuthorisationIdFactory {
  let next = 0;
  return () => {
    next += 1;
    return `auth_${String(next).padStart(6, '0')}`;
  };
}

/**
 * Unguessable authorisation ids.
 *
 * The sequential default is fine for a stub, which holds no money and whose
 * whole point is a repeatable transcript. Inject this one wherever a stub
 * authorisation id would reach an untrusted caller, for the reason cart ids
 * are random by default (D12).
 */
export const randomAuthorisationIds: AuthorisationIdFactory = () => `auth_${randomUUID()}`;

/** How to build a {@link StubRail}. Every default is deterministic. */
export interface StubRailOptions {
  /** Name the rail reports in its log. Default `stub`. */
  readonly name?: string;
  /** Where log entries go. Default: nowhere (D54). */
  readonly log?: RailLogSink;
  /** Default: {@link steppingClock} from {@link STUB_RAIL_EPOCH}. */
  readonly now?: Clock;
  /** Default: {@link sequentialAuthorisationIds}. */
  readonly nextAuthorisationId?: AuthorisationIdFactory;
  /** Currencies accepted. Default {@link STUB_RAIL_CURRENCIES}. */
  readonly currencies?: readonly CurrencyCode[];
}

/** What the stub remembers about one authorisation. */
type StubRecord =
  | { readonly status: 'authorised'; readonly authorisation: Authorisation }
  | {
      readonly status: 'captured';
      readonly authorisation: Authorisation;
      readonly capture: Capture;
    };

/** The state an authorisation can be in. Tests and the demo read it. */
export type StubAuthorisationStatus = StubRecord['status'];

/**
 * A refusal from the rail itself rather than from an issuer.
 *
 * The only kind the stub ever produces: it has no issuer to ask.
 */
function railRefusal(code: DeclineCode, message: string): RailDecline {
  return { code, message, origin: 'rail' };
}

/** Rejects anything that is not a whole number of minor units above zero. */
function amountIsValid(amount: number): boolean {
  return Number.isInteger(amount) && amount > 0;
}

export class StubRail implements Rail {
  readonly name: string;

  readonly #records = new Map<string, StubRecord>();
  readonly #log: RailLogSink;
  readonly #now: Clock;
  readonly #nextId: AuthorisationIdFactory;
  readonly #currencies: readonly CurrencyCode[];

  constructor(options: StubRailOptions = {}) {
    this.name = options.name ?? 'stub';
    this.#log = options.log ?? discardRailLog;
    this.#now = options.now ?? steppingClock();
    this.#nextId = options.nextAuthorisationId ?? sequentialAuthorisationIds();
    this.#currencies = options.currencies ?? STUB_RAIL_CURRENCIES;
  }

  /** How many authorisations this rail has granted. */
  get size(): number {
    return this.#records.size;
  }

  /** The state of one authorisation, or `undefined` if the id is unknown. */
  statusOf(authorisationId: string): StubAuthorisationStatus | undefined {
    return this.#records.get(authorisationId)?.status;
  }

  /**
   * Hold funds. Succeeds for every well-formed request in a supported
   * currency; see {@link StubRail} for what "well-formed" excludes.
   *
   * Synchronous work wrapped in a resolved promise: the interface is async
   * because a real rail is a network call (see {@link Rail}), and the stub
   * must not make the call sites different.
   */
  authorise(request: AuthoriseRequest): Promise<AuthoriseResult> {
    return Promise.resolve(this.#authoriseNow(request));
  }

  /** Take funds already held, in full. The authorisation id is the handle. */
  capture(request: CaptureRequest): Promise<CaptureResult> {
    return Promise.resolve(this.#captureNow(request));
  }

  #authoriseNow(request: AuthoriseRequest): AuthoriseResult {
    const at = this.#now();

    if (request.order_ref.length === 0) {
      return this.#refuseAuthorise(
        at,
        request,
        railRefusal('order_ref_invalid', 'order_ref must not be empty'),
      );
    }
    if (!amountIsValid(request.amount_minor)) {
      return this.#refuseAuthorise(
        at,
        request,
        railRefusal(
          'amount_invalid',
          `amount_minor must be a whole number of minor units above zero, got ${String(request.amount_minor)}`,
        ),
      );
    }
    if (!this.#currencies.includes(request.currency)) {
      return this.#refuseAuthorise(
        at,
        request,
        railRefusal(
          'currency_unsupported',
          `${this.name} handles ${this.#currencies.join(', ')}, not ${request.currency}`,
        ),
      );
    }

    const authorisation: Authorisation = {
      authorisation_id: this.#nextId(),
      order_ref: request.order_ref,
      amount_minor: request.amount_minor,
      currency: request.currency,
      authorised_at: at,
    };
    this.#records.set(authorisation.authorisation_id, { status: 'authorised', authorisation });

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

  #captureNow(request: CaptureRequest): CaptureResult {
    const at = this.#now();
    const record = this.#records.get(request.authorisation_id);

    // A capture request carries only an id (D52), so when the id is unknown
    // there is no order, amount or currency to write down.
    if (record === undefined) {
      const refusal = railRefusal(
        'authorisation_not_found',
        `no authorisation with id ${request.authorisation_id}`,
      );
      this.#log({
        at,
        rail: this.name,
        call: 'capture',
        outcome: 'declined',
        authorisation_id: request.authorisation_id,
        decline_code: refusal.code,
      });
      return { ok: false, decline: refusal };
    }

    const { authorisation } = record;

    if (record.status === 'captured') {
      const refusal = railRefusal(
        'authorisation_already_captured',
        `authorisation ${authorisation.authorisation_id} was captured at ${record.capture.captured_at}`,
      );
      this.#log(this.#captureEntry(at, 'declined', authorisation, refusal.code));
      return { ok: false, decline: refusal };
    }

    const capture: Capture = {
      authorisation_id: authorisation.authorisation_id,
      order_ref: authorisation.order_ref,
      amount_minor: authorisation.amount_minor,
      currency: authorisation.currency,
      captured_at: at,
    };
    this.#records.set(authorisation.authorisation_id, {
      status: 'captured',
      authorisation,
      capture,
    });

    this.#log(this.#captureEntry(at, 'ok', authorisation));
    return { ok: true, capture };
  }

  /** Logs an authorise refusal and hands it back as a result. */
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
    // An empty order_ref is left out rather than logged as a blank field.
    this.#log(
      request.order_ref.length === 0 ? known : { ...known, order_ref: request.order_ref },
    );
    return { ok: false, decline: refusal };
  }

  /** One capture log entry, with everything the authorisation knows. */
  #captureEntry(
    at: Instant,
    outcome: 'ok' | 'declined',
    authorisation: Authorisation,
    declineCode?: DeclineCode,
  ): RailLogEntry {
    const base = {
      at,
      rail: this.name,
      call: 'capture',
      outcome,
      order_ref: authorisation.order_ref,
      authorisation_id: authorisation.authorisation_id,
      amount_minor: authorisation.amount_minor,
      currency: authorisation.currency,
    } as const;
    return declineCode === undefined ? base : { ...base, decline_code: declineCode };
  }
}
