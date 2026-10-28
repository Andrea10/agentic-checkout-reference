/**
 * The audit log: every policy check, pass or fail, written down and never
 * edited.
 *
 * This is the piece a regulator or an auditor reads. The question it answers
 * is not "did the order go through?" but "why was this purchase allowed, or
 * why was it refused, and by which rule?" So an allowed check is recorded as
 * carefully as a refused one, and nothing can be amended afterwards: the log
 * only grows.
 *
 * `print()` takes the stream to write to as a parameter and has no default
 * (decision D46). The merchant speaks MCP over stdio, where stdout carries
 * protocol messages: a stray line on stdout corrupts the conversation. Nor
 * does anything here go through MCP's own Logging utility, which revision
 * 2026-07-28 deprecates (SEP-2577); the migration path that revision states
 * is "Log to `stderr` for stdio transports", which is what the demo does.
 */

import type { PolicyDecision, PolicyOutcome, PolicyRefusalReason } from './decision.js';
import type { CurrencyCode, Instant, MinorUnits } from './types.js';

/**
 * Anywhere text can be written: `process.stderr`, a file stream, or an array
 * collector in a test. Deliberately the smallest shape that works, so a
 * caller never has to produce a real Node stream.
 */
export interface OutputStream {
  write(chunk: string): unknown;
}

/** One check, as the log holds it. Frozen on the way in. */
export interface AuditEntry {
  /** When the check was made, from the clock injected into the policy. */
  readonly at: Instant;
  /** The mandate presented. On a signature failure, not proven to be real. */
  readonly mandate_id: string;
  /** The agent that asked. */
  readonly agent: string;
  /** The merchant it asked to buy from. */
  readonly merchant: string;
  /** The amount asked for, in minor units. */
  readonly amount_minor: MinorUnits;
  /** The currency asked for. */
  readonly currency: CurrencyCode;
  /** What the check decided. */
  readonly outcome: PolicyOutcome;
  /** The reason codes, in check order. Empty unless the outcome is `refuse`. */
  readonly reasons: readonly PolicyRefusalReason[];
}

/** Width of the outcome column in `print()`: `confirm_required` is longest. */
const OUTCOME_WIDTH = 16;

/**
 * An append-only log of policy checks, held in this process's memory.
 *
 * There is one way in — {@link AuditLog.record} — and no way to remove or
 * change an entry. {@link AuditLog.entries} hands back a copy, so a caller
 * cannot reach into the log through the array it is given.
 *
 * Like the spend ledger, this is memory only: a restarted merchant starts
 * with an empty log. A real deployment would append to durable storage
 * behind the same shape.
 */
export class AuditLog {
  private readonly log: AuditEntry[] = [];

  /** Append one decision to the log and return the entry that was written. */
  record(decision: PolicyDecision): AuditEntry {
    const entry: AuditEntry = Object.freeze({
      at: decision.checked_at,
      mandate_id: decision.mandate_id,
      agent: decision.agent,
      merchant: decision.merchant,
      amount_minor: decision.amount_minor,
      currency: decision.currency,
      outcome: decision.outcome,
      reasons: Object.freeze(
        decision.outcome === 'refuse' ? decision.refusals.map((refusal) => refusal.reason) : [],
      ),
    });

    this.log.push(entry);
    return entry;
  }

  /** Every entry, oldest first. A copy: writing to it changes nothing. */
  entries(): readonly AuditEntry[] {
    return [...this.log];
  }

  /** How many checks have been recorded. */
  get size(): number {
    return this.log.length;
  }

  /**
   * Write the log to `stream`, one line per check, oldest first.
   *
   * The stream is a parameter and not a default, so nothing in this package
   * can write to stdout by accident. The demo passes `process.stderr`; a test
   * passes a collector.
   *
   * Amounts are printed in minor units (`2500 GBP` is twenty-five pounds).
   */
  print(stream: OutputStream): void {
    for (const entry of this.log) {
      stream.write(`${formatEntry(entry)}\n`);
    }
  }
}

/** One audit line. Exported so a test can assert on the format in one place. */
export function formatEntry(entry: AuditEntry): string {
  const reasons = entry.reasons.length > 0 ? entry.reasons.join(', ') : '-';
  return [
    entry.at,
    entry.outcome.padEnd(OUTCOME_WIDTH),
    `${entry.amount_minor} ${entry.currency}`,
    `${entry.agent} -> ${entry.merchant}`,
    `mandate ${entry.mandate_id}`,
    reasons,
  ].join('  ');
}
