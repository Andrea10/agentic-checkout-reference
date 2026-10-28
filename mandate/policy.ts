/**
 * The policy check: does this mandate actually authorise *this* purchase?
 *
 * T03's `verify()` answers a narrower question — was this mandate signed by
 * the issuer and unchanged since. That is necessary and nowhere near
 * sufficient: a genuine mandate can still be the wrong agent's, for another
 * merchant, out of date, in the wrong currency, over its per-order ceiling,
 * or out of budget. `checkMandate()` below asks all of it, in one pass, and
 * writes the answer to the audit log whichever way it goes.
 *
 * ```ts
 * const policy = createMandatePolicy({ publicKey, clock: fixedClock(now) });
 * const decision = checkMandate(policy, {
 *   mandate, agent: 'agent-buyer-1', merchant: 'merchant-demo',
 *   amount_minor: 2500, currency: 'GBP',
 * });
 * if (decision.outcome === 'allow') {
 *   await rail.authorise(...);          // then, and only then:
 *   recordSpend(policy, decision);      // the spend is a separate step
 * }
 * ```
 *
 * The order of the checks, and which failures are reported together, is
 * deliberate (decisions D42 and D43):
 *
 * 1. **Two gates.** The amount has to be a whole number of minor units above
 *    zero, and the signature has to hold. Fail either and the pass stops:
 *    an amount that is not a number cannot be compared to a cap, and claims
 *    under a broken signature are not the issuer's to answer for. Both gates
 *    are reported together if both fail.
 * 2. **Then every scope and limit check runs**, and every failure is named:
 *    agent, merchant, window, currency, the mandate's own limits, the
 *    per-transaction cap, the remaining budget. An agent developer gets all
 *    the bad news in one answer instead of one round trip per problem.
 *
 * Only when nothing has failed does the human-confirm threshold come up, and
 * being above it is not a refusal — it is `confirm_required`.
 */

import { AuditLog } from './audit.js';
import { systemClock } from './clock.js';
import { createMemoryLedger, isNonNegativeMinorUnits, isPositiveMinorUnits } from './ledger.js';
import { verify } from './sign.js';

import type { Clock } from './clock.js';
import type { PolicyDecision, PolicyRefusal } from './decision.js';
import type { SpendLedger } from './ledger.js';
import type { CurrencyCode, Mandate, MinorUnits } from './types.js';
import type { KeyObject } from 'node:crypto';

/**
 * Everything the check needs that is not part of a single request: the key
 * mandates are expected to be signed with, where "now" comes from, what has
 * been spent already, and where the log goes.
 *
 * The public key sits here rather than in the request because it is the
 * merchant's configuration — the one issuer it trusts — not something a
 * caller gets to choose per order.
 */
export interface MandatePolicy {
  readonly publicKey: KeyObject;
  readonly clock: Clock;
  readonly ledger: SpendLedger;
  readonly audit: AuditLog;
}

/** Options for {@link createMandatePolicy}. Only the key is required. */
export interface MandatePolicyOptions {
  /** The issuer's Ed25519 public key, as `verify()` wants it. */
  readonly publicKey: KeyObject;
  /** Where "now" comes from. Defaults to the system clock. */
  readonly clock?: Clock;
  /** The spend history. Defaults to a fresh in-memory ledger. */
  readonly ledger?: SpendLedger;
  /** The audit log to write to. Defaults to a fresh, empty log. */
  readonly audit?: AuditLog;
}

/** One purchase, as the agent presents it for checking. */
export interface PolicyRequest {
  /** The signed mandate the agent is relying on. */
  readonly mandate: Mandate;
  /** The agent making the purchase, as the merchant knows it. */
  readonly agent: string;
  /** The merchant being bought from, as it knows itself. */
  readonly merchant: string;
  /** The amount to be spent, in minor units. Checked before anything else. */
  readonly amount_minor: MinorUnits;
  /** The currency of that amount. */
  readonly currency: CurrencyCode;
}

/**
 * A completed spend, as {@link recordSpend} wants it. A {@link PolicyDecision}
 * already has this shape, so the usual call is `recordSpend(policy, decision)`.
 */
export interface SpendRecord {
  readonly mandate_id: string;
  readonly amount_minor: MinorUnits;
}

/**
 * Assemble a policy. Pass a `clock` to make the result reproducible, and a
 * shared `ledger` and `audit` to make budget and history outlive one check.
 */
export function createMandatePolicy(options: MandatePolicyOptions): MandatePolicy {
  return {
    publicKey: options.publicKey,
    clock: options.clock ?? systemClock,
    ledger: options.ledger ?? createMemoryLedger(),
    audit: options.audit ?? new AuditLog(),
  };
}

/**
 * Check one purchase against one mandate, record the result in the audit log,
 * and return it.
 *
 * The audit entry is written whatever the answer: a complete log is the point
 * of having one. Nothing here moves money and nothing here consumes budget —
 * {@link recordSpend} does that, after the rail has succeeded.
 *
 * @throws TypeError if the injected clock does not return a readable instant,
 * or if the configured public key is not an Ed25519 key.
 */
export function checkMandate(policy: MandatePolicy, request: PolicyRequest): PolicyDecision {
  const decision = decide(policy, request);
  policy.audit.record(decision);
  return decision;
}

/**
 * Record a spend that has already happened. Call it after the payment rail
 * succeeds, never before: budget consumed by a payment that then failed would
 * be budget the user never gets back.
 *
 * @returns the new total spent under that mandate.
 * @throws TypeError if the amount is not a non-negative integer of minor units.
 */
export function recordSpend(policy: MandatePolicy, spend: SpendRecord): MinorUnits {
  return policy.ledger.record(spend.mandate_id, spend.amount_minor);
}

/** The check itself, with no logging, so the logging has one home. */
function decide(policy: MandatePolicy, request: PolicyRequest): PolicyDecision {
  const { mandate, amount_minor: amount } = request;
  const checkedAt = policy.clock();
  const now = Date.parse(checkedAt);
  if (!Number.isFinite(now)) {
    throw new TypeError(`the clock must return a readable instant, got ${JSON.stringify(checkedAt)}`);
  }

  const attempt = {
    mandate_id: mandate.mandate_id,
    agent: request.agent,
    merchant: request.merchant,
    amount_minor: amount,
    currency: request.currency,
    checked_at: checkedAt,
  } as const;

  // Gate 1 and gate 2: a usable amount, and a mandate that is really the
  // issuer's. Nothing below either of these can be trusted or compared.
  const gates: PolicyRefusal[] = [];

  if (!isPositiveMinorUnits(amount)) {
    gates.push({
      reason: 'amount_invalid',
      message: `amount must be a whole number of minor units above zero, got ${amount}`,
    });
  }

  const signature = verify(mandate, policy.publicKey);
  if (!signature.ok) {
    gates.push({
      reason: signature.reason,
      message:
        signature.reason === 'signature_invalid'
          ? 'the mandate was not signed by the expected issuer, or has been changed since'
          : 'the mandate could not be read, so its signature could not be checked',
    });
  }

  if (gates.length > 0) {
    return { ...attempt, outcome: 'refuse', refusals: gates };
  }

  // Scope and limits. Every one of these runs, so the caller learns every
  // reason at once.
  const refusals: PolicyRefusal[] = [];

  if (mandate.agent !== request.agent) {
    refusals.push({
      reason: 'agent_mismatch',
      message: `this mandate was granted to ${mandate.agent}, not to ${request.agent}`,
    });
  }

  if (mandate.merchant !== request.merchant) {
    refusals.push({
      reason: 'merchant_mismatch',
      message: `this mandate is good at ${mandate.merchant}, not at ${request.merchant}`,
    });
  }

  const validFrom = Date.parse(mandate.valid_from);
  const validUntil = Date.parse(mandate.valid_until);
  if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil)) {
    refusals.push({
      reason: 'mandate_window_invalid',
      message: 'the mandate does not state a readable validity window',
    });
  } else if (now < validFrom) {
    refusals.push({
      reason: 'mandate_not_yet_valid',
      message: `this mandate is not valid until ${mandate.valid_from}; it is ${checkedAt}`,
    });
  } else if (now > validUntil) {
    refusals.push({
      reason: 'mandate_expired',
      message: `this mandate expired at ${mandate.valid_until}; it is ${checkedAt}`,
    });
  }

  // Currency is checked before the caps, not after as the PRD lists it
  // (decision D43): a cap in one currency says nothing about an amount in
  // another, so a mismatch makes the cap comparisons meaningless rather than
  // merely wrong.
  const currencyMatches = mandate.currency === request.currency;
  if (!currencyMatches) {
    refusals.push({
      reason: 'currency_mismatch',
      message: `this mandate is denominated in ${mandate.currency}, not ${request.currency}`,
    });
  }

  const limitsUsable =
    isNonNegativeMinorUnits(mandate.amount_cap_minor) &&
    isNonNegativeMinorUnits(mandate.per_transaction_cap_minor) &&
    isNonNegativeMinorUnits(mandate.human_confirm_above_minor);
  if (!limitsUsable) {
    refusals.push({
      reason: 'mandate_limits_invalid',
      message: 'a cap or threshold in this mandate is not a whole number of minor units',
    });
  }

  // Budget left under the total cap, before this purchase is counted.
  const remaining = limitsUsable
    ? Math.max(0, mandate.amount_cap_minor - policy.ledger.spent(mandate.mandate_id))
    : 0;

  if (currencyMatches && limitsUsable) {
    if (amount > mandate.per_transaction_cap_minor) {
      refusals.push({
        reason: 'per_transaction_cap_exceeded',
        message: `${amount} is above this mandate's per-transaction cap of ${mandate.per_transaction_cap_minor} ${mandate.currency}`,
      });
    }

    if (amount > remaining) {
      refusals.push({
        reason: 'budget_exceeded',
        message: `${amount} is more than the ${remaining} ${mandate.currency} left of this mandate's total cap of ${mandate.amount_cap_minor}`,
      });
    }
  }

  if (refusals.length > 0) {
    return { ...attempt, outcome: 'refuse', refusals };
  }

  // Everything holds. The last question is whether the user wanted to be
  // asked about a purchase this size, which is not a refusal.
  if (amount > mandate.human_confirm_above_minor) {
    return {
      ...attempt,
      outcome: 'confirm_required',
      remaining_budget_minor: remaining,
      human_confirm_above_minor: mandate.human_confirm_above_minor,
    };
  }

  return { ...attempt, outcome: 'allow', remaining_budget_minor: remaining };
}
