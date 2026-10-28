/**
 * The answer the policy check gives, and the vocabulary of refusals.
 *
 * There are three answers, not two (decision D41):
 *
 * - `allow` — the mandate covers this purchase. Go to the rail.
 * - `confirm_required` — the mandate covers it, but the amount is above the
 *   threshold the user set for being asked. Nothing is wrong; a human has to
 *   say yes. T07a turns this into the order status `awaiting_confirmation`.
 * - `refuse` — one or more checks failed. Each failure is named, so an agent
 *   developer reads one answer and knows every reason.
 *
 * These live in their own file because both the policy check that produces
 * them and the audit log that records them need the vocabulary, and neither
 * should have to import the other.
 */

import type { CurrencyCode, Instant, MinorUnits, VerifyFailureReason } from './types.js';

/** Which of the three answers a check came to. */
export type PolicyOutcome = 'allow' | 'confirm_required' | 'refuse';

/**
 * One reason code per check that can fail. Two are inherited from T03's
 * signature check, so a caller has one list to learn rather than two.
 */
export type PolicyRefusalReason =
  /** The signature does not match the claims, or the mandate is unreadable. */
  | VerifyFailureReason
  /** The amount asked for is not a non-negative whole number of minor units. */
  | 'amount_not_integer_minor_units'
  /** The mandate was granted to a different agent. */
  | 'agent_mismatch'
  /** The mandate is good at a different merchant. */
  | 'merchant_mismatch'
  /** `valid_from` or `valid_until` is not a time this runtime can read. */
  | 'mandate_window_invalid'
  /** The mandate's window has not opened yet. */
  | 'mandate_not_yet_valid'
  /** The mandate's window has closed. */
  | 'mandate_expired'
  /** The purchase is in a different currency from the mandate's caps. */
  | 'currency_mismatch'
  /** A cap or threshold in the mandate is not a usable amount. */
  | 'mandate_limits_invalid'
  /** This one purchase is above the mandate's per-transaction ceiling. */
  | 'per_transaction_cap_exceeded'
  /** The purchase is more than the mandate has left of its total cap. */
  | 'budget_exceeded';

/**
 * A single failed check. The message is written for a person reading an audit
 * log or a refused tool call, and never contains a key or a signature.
 */
export interface PolicyRefusal {
  readonly reason: PolicyRefusalReason;
  readonly message: string;
}

/**
 * What every decision records about the attempt, whatever the outcome.
 *
 * `agent`, `merchant`, `amount_minor` and `currency` are what the caller
 * *asked for*, not what the mandate allows: that is what makes a refusal
 * legible after the fact. `mandate_id` is the id presented — on a
 * `signature_invalid` refusal nothing proves it is the issuer's.
 */
interface PolicyDecisionCommon {
  readonly mandate_id: string;
  readonly agent: string;
  readonly merchant: string;
  readonly amount_minor: MinorUnits;
  readonly currency: CurrencyCode;
  /** The time the check was made, read from the injected clock. */
  readonly checked_at: Instant;
}

/**
 * The outcome of one policy check. A discriminated union on `outcome`, so the
 * caller cannot read `remaining_budget_minor` off a refusal or forget the
 * middle case.
 */
export type PolicyDecision =
  | (PolicyDecisionCommon & {
      readonly outcome: 'allow';
      /** Budget left under the mandate *before* this amount is recorded. */
      readonly remaining_budget_minor: MinorUnits;
    })
  | (PolicyDecisionCommon & {
      readonly outcome: 'confirm_required';
      /** Budget left under the mandate *before* this amount is recorded. */
      readonly remaining_budget_minor: MinorUnits;
      /** The threshold the amount went above, copied from the mandate. */
      readonly human_confirm_above_minor: MinorUnits;
    })
  | (PolicyDecisionCommon & {
      readonly outcome: 'refuse';
      /** Every check that failed, in the order they were made. Never empty. */
      readonly refusals: readonly PolicyRefusal[];
    });
