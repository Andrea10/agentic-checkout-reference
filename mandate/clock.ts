/**
 * Where "now" comes from.
 *
 * A mandate is only good inside a window, so every policy check needs a
 * reading of the current time. That reading is injected rather than taken
 * straight from the system, so a test can stand on either side of an expiry
 * and get the same answer every run.
 *
 * `mandate/` declares its own clock rather than borrowing the merchant's, so
 * the mandate layer stays usable on its own (decision D49).
 */

import type { Instant } from './types.js';

/** Returns the current time as an ISO 8601 instant in UTC. */
export type Clock = () => Instant;

/** Wall-clock time, to the millisecond, in UTC. The production clock. */
export const systemClock: Clock = () => new Date().toISOString();

/**
 * A clock frozen at one instant. For tests and for the demo, where the same
 * run has to produce the same audit log every time.
 *
 * @throws TypeError if `at` is not a time this runtime can read.
 */
export function fixedClock(at: Instant): Clock {
  if (!Number.isFinite(Date.parse(at))) {
    throw new TypeError(`fixedClock needs a readable instant, got ${JSON.stringify(at)}`);
  }
  return () => at;
}
