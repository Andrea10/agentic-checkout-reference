/**
 * A rail that answers however the test tells it to.
 *
 * `StubRail` is deliberately incapable of pretending to be a bank refusing a
 * card — it refuses only what it genuinely cannot honour, and every decline it
 * produces has origin `rail` (D55). That is the right default and it leaves
 * three cases the merchant has to get right untestable: an issuer decline, a
 * capture refused after the funds were held, and a rail that throws rather
 * than answering at all (D50).
 *
 * This wrapper supplies them. Anything it is not told to fail is delegated to
 * a real `StubRail`, so the authorisation ids, the clock and the
 * already-captured bookkeeping stay the genuine article.
 *
 * It is support code, not a suite: it holds no `it()` of its own.
 */

import {
  StubRail,
  type AuthoriseRequest,
  type AuthoriseResult,
  type CaptureRequest,
  type CaptureResult,
  type Rail,
  type RailCall,
  type RailDecline,
  type RailLogEntry,
} from '../../../rail/index.js';

/** What a scripted call does instead of succeeding. */
export type RailFailure = RailDecline | Error;

export interface RailScript {
  /** Decline or throw on `authorise`. Omit to let it succeed. */
  readonly authorise?: RailFailure;
  /** Decline or throw on `capture`. Omit to let it succeed. */
  readonly capture?: RailFailure;
  /**
   * Capture *less* than was authorised.
   *
   * `StubRail` captures in full and always will (D52), so a rail that takes
   * 1400 of a 1450 hold is the one thing nothing else in the repo can
   * produce — and it is the case D87 turns on: the ledger has to record what
   * the rail took, not what the policy checked. Omit it and the capture is in
   * full, as everywhere else.
   */
  readonly captureAmount?: number;
  /** Hold this call open until {@link ScriptedRail.release} is called. */
  readonly pauseAt?: RailCall;
  /** Where the delegated stub's log entries go. */
  readonly log?: (entry: RailLogEntry) => void;
}

/** An issuer decline, the kind `StubRail` will never produce (D53). */
export const ISSUER_DECLINE: RailDecline = {
  code: 'insufficient_funds',
  message: 'the issuer refused: not enough funds',
  origin: 'issuer',
};

/** A capture the rail will not honour, after it granted the hold. */
export const CAPTURE_DECLINE: RailDecline = {
  code: 'authorisation_already_captured',
  message: 'that authorisation has already been settled',
  origin: 'rail',
};

export class ScriptedRail implements Rail {
  readonly name = 'scripted';

  readonly #inner: StubRail;
  readonly #script: RailScript;
  readonly #gate: { release: () => void; opened: Promise<void> };
  /** Every call the merchant made, in order, whatever the answer was. */
  readonly calls: RailCall[] = [];

  constructor(script: RailScript = {}) {
    this.#script = script;
    this.#inner = script.log === undefined ? new StubRail() : new StubRail({ log: script.log });

    let release = (): void => undefined;
    const opened = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#gate = { release, opened };
  }

  /** Lets a paused call finish. */
  release(): void {
    this.#gate.release();
  }

  /** The authorisation states the delegated stub is holding. */
  statusOf(authorisationId: string): string | undefined {
    return this.#inner.statusOf(authorisationId);
  }

  async authorise(request: AuthoriseRequest): Promise<AuthoriseResult> {
    this.calls.push('authorise');
    await this.#pause('authorise');
    const scripted = this.#script.authorise;
    if (scripted instanceof Error) throw scripted;
    if (scripted !== undefined) return { ok: false, decline: scripted };
    return this.#inner.authorise(request);
  }

  async capture(request: CaptureRequest): Promise<CaptureResult> {
    this.calls.push('capture');
    await this.#pause('capture');
    const scripted = this.#script.capture;
    if (scripted instanceof Error) throw scripted;
    if (scripted !== undefined) return { ok: false, decline: scripted };

    const result = await this.#inner.capture(request);
    const taken = this.#script.captureAmount;
    if (!result.ok || taken === undefined) return result;
    // The hold stays what the stub granted; only the amount taken differs.
    return { ok: true, capture: { ...result.capture, amount_minor: taken } };
  }

  async #pause(call: RailCall): Promise<void> {
    if (this.#script.pauseAt === call) {
      await this.#gate.opened;
    }
  }
}
