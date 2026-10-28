/**
 * How much has already been spent under each mandate.
 *
 * A mandate carries a total cap, so "is there budget left?" is a question
 * about history, not about the mandate: the signed object says £50, and only
 * a record of past orders says whether £45 of it is gone. That record lives
 * here, keyed by `mandate_id`.
 *
 * Two things are deliberate:
 *
 * 1. The store is an interface. Stage 1 keeps it in memory, which is enough
 *    for one server process and loses everything when that process ends
 *    (decision D44). Stage 2 or a real merchant would put the same interface
 *    in front of a database.
 * 2. Recording a spend is a separate call the merchant makes *after* the
 *    payment rail succeeds, never a side effect of checking (decision D45).
 *    A check that reserved budget would leak the cap on every refused card.
 */

import type { MinorUnits } from './types.js';

/** The running total spent under each mandate. */
export interface SpendLedger {
  /** Total already spent under `mandateId`. Zero for a mandate never used. */
  spent(mandateId: string): MinorUnits;
  /**
   * Add a completed spend and return the new total.
   *
   * @throws TypeError if `amountMinor` is not a non-negative integer.
   */
  record(mandateId: string, amountMinor: MinorUnits): MinorUnits;
}

/**
 * A ledger held in this process's memory, keyed by `mandate_id`.
 *
 * It has no eviction and no persistence: the budget a mandate has spent is
 * forgotten when the process ends, so a restarted merchant would honour the
 * full cap again. That is the cost recorded in D44 and the reason Stage 2
 * would swap the implementation rather than the interface.
 */
export function createMemoryLedger(): SpendLedger {
  const spentByMandate = new Map<string, MinorUnits>();

  return {
    spent(mandateId: string): MinorUnits {
      return spentByMandate.get(mandateId) ?? 0;
    },

    record(mandateId: string, amountMinor: MinorUnits): MinorUnits {
      if (!isNonNegativeMinorUnits(amountMinor)) {
        throw new TypeError(
          `a recorded spend must be a non-negative integer of minor units, got ${String(amountMinor)}`,
        );
      }
      const total = (spentByMandate.get(mandateId) ?? 0) + amountMinor;
      spentByMandate.set(mandateId, total);
      return total;
    },
  };
}

/**
 * Money in this repo is an integer count of minor units — 2500 pence, never
 * 25.0 pounds. `MinorUnits` is a plain `number` (T03 left it unbranded), so
 * the check has to happen at run time, at every boundary money crosses.
 *
 * It returns a plain boolean rather than a type predicate on purpose: a
 * predicate would narrow an amount that is already typed `number` to `never`
 * on the failing branch, and the failing branch is exactly where the caller
 * wants to put the offending value into a message.
 */
export function isNonNegativeMinorUnits(amount: unknown): boolean {
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0;
}

/**
 * The same check, but for an amount somebody is asking to *spend*: it must be
 * above zero as well (ruled by Andrea 28 Oct, decision D58). A zero-value
 * purchase has nothing to authorise, and T05's `StubRail` already refuses
 * one, so the two packages agree on what money is.
 *
 * The non-negative form above stays as it is, because the mandate's own caps
 * and a recorded spend may legitimately be zero: a cap of 0 authorises
 * nothing, and a `human_confirm_above_minor` of 0 means "ask me about
 * everything".
 */
export function isPositiveMinorUnits(amount: unknown): boolean {
  return isNonNegativeMinorUnits(amount) && (amount as number) > 0;
}
