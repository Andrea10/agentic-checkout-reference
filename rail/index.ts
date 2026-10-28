/**
 * The payment rail: the seam between this repo's checkout and whatever moves
 * the money.
 *
 * ```ts
 * const rail = new StubRail({ log: writeTo(process.stderr) });
 *
 * const held = await rail.authorise({ order_ref: 'order_1', amount_minor: 2499, currency: 'GBP' });
 * if (!held.ok) return held.decline;            // a decline is a result, not a throw
 * const taken = await rail.capture({ authorisation_id: held.authorisation.authorisation_id });
 * ```
 *
 * Stage 1 has one implementation, {@link StubRail}, which never touches a
 * payment system. Stage 2 adds a Stripe test-mode rail behind the same
 * {@link Rail} interface (T11).
 */

export {
  discardRailLog,
  formatRailLogEntry,
  writeTo,
} from './log.js';
export { DECLINE_CODES } from './types.js';
export {
  randomAuthorisationIds,
  sequentialAuthorisationIds,
  steppingClock,
  StubRail,
  STUB_RAIL_CURRENCIES,
  STUB_RAIL_EPOCH,
  systemClock,
} from './stub.js';

export type { RailLogEntry, RailLogOutcome, RailLogSink, StringSink } from './log.js';
export type {
  Authorisation,
  AuthoriseRequest,
  AuthoriseResult,
  Capture,
  CaptureRequest,
  CaptureResult,
  CurrencyCode,
  DeclineCode,
  DeclineOrigin,
  Instant,
  MinorUnits,
  Rail,
  RailCall,
  RailDecline,
} from './types.js';
export type {
  AuthorisationIdFactory,
  Clock,
  StubAuthorisationStatus,
  StubRailOptions,
} from './stub.js';
