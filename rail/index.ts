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
 * Two implementations sit behind the one {@link Rail} interface:
 * {@link StubRail}, which never touches a payment system, and
 * {@link StripeRail}, which authorises and captures Stripe PaymentIntents in
 * test mode and refuses any key that is not a test-mode secret key (T11).
 * {@link railFactoryFromEnvironment} picks one from `ACR_RAIL`; the stub is
 * the default.
 */

export {
  discardRailLog,
  formatRailLogEntry,
  writeTo,
} from './log.js';
export {
  RAIL_ENV,
  RailChoiceError,
  railFactoryFromEnvironment,
  stubRailFactory,
} from './select.js';
export {
  readStripeTestKey,
  STRIPE_DEFAULT_TEST_PAYMENT_METHOD,
  STRIPE_RAIL_CURRENCIES,
  STRIPE_SECRET_KEY_ENV,
  STRIPE_TEST_KEY_PREFIX,
  StripeKeyError,
  StripeRail,
  StripeRailError,
} from './stripe.js';
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
export type { RailFactory } from './select.js';
export type {
  Environment,
  IdempotencyKeyFactory,
  StripeClientLike,
  StripeKeyProblem,
  StripePaymentIntentLike,
  StripeRailFailure,
  StripeRailOptions,
} from './stripe.js';
