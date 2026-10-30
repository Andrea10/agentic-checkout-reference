/**
 * Choosing a rail from the environment.
 *
 * `ACR_RAIL` unset, empty or `stub` gives {@link StubRail}; `stripe` gives
 * {@link StripeRail}. Anything else is refused rather than quietly falling
 * back to the stub, so a typo cannot make a run look like it used Stripe.
 *
 * The choice returns a factory, not a rail, because a caller such as the demo
 * builds a fresh rail per merchant with its own log sink. The Stripe key is
 * checked when the choice is made, so a missing or live key fails before the
 * caller has printed or started anything.
 */

import type { RailLogSink } from './log.js';
import { readStripeTestKey, StripeRail, type Environment } from './stripe.js';
import { StubRail } from './stub.js';
import type { Rail } from './types.js';

/** The environment variable that picks the rail. */
export const RAIL_ENV = 'ACR_RAIL';

/** Builds one rail that writes to `log`. */
export type RailFactory = (log: RailLogSink) => Rail;

/** The default: a deterministic {@link StubRail} with every other option left alone. */
export const stubRailFactory: RailFactory = (log) => new StubRail({ log });

/**
 * `ACR_RAIL` held a value that names no rail. The message does not quote the
 * value: whatever was pasted there is not echoed anywhere.
 */
export class RailChoiceError extends Error {
  override readonly name = 'RailChoiceError';
}

/**
 * The rail factory `env` asks for.
 *
 * Throws {@link RailChoiceError} for an unknown name and
 * {@link StripeKeyError} when `stripe` is chosen without a test-mode key.
 */
export function railFactoryFromEnvironment(env: Environment): RailFactory {
  const choice = env[RAIL_ENV];
  if (choice === undefined || choice === '' || choice === 'stub') return stubRailFactory;
  if (choice === 'stripe') {
    readStripeTestKey(env);
    return (log) => new StripeRail({ env, log });
  }
  throw new RailChoiceError(`${RAIL_ENV} must be stub or stripe`);
}
