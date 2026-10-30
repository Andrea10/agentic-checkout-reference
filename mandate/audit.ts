/**
 * The audit log: every policy check and every settlement, pass or fail,
 * written down and never edited.
 *
 * This is the piece a regulator or an auditor reads. The question it answers
 * is not "did the order go through?" but "why was this purchase allowed, or
 * why was it refused, and by which rule?" So an allowed check is recorded as
 * carefully as a refused one, and nothing can be amended afterwards: the log
 * only grows.
 *
 * Two kinds of event go in, and they are one log rather than two (D94). A
 * check is a *decision*: the mandate covers this purchase, or it does not. A
 * settlement is what then happened to the money. An auditor needs them in one
 * order — the decision, then the payment it authorised — so the log carries a
 * `kind` on every entry and `formatEntry` prints both in the same columns.
 * Until T07c there was only the first kind, and a declined card left the log
 * reading `confirm_required, confirm_required` with nothing about the refusal
 * (the gap D86 records).
 *
 * `print()` takes the stream to write to as a parameter and has no default
 * (decision D46). The merchant speaks MCP over stdio, where stdout carries
 * protocol messages: a stray line on stdout corrupts the conversation. Nor
 * does anything here go through MCP's own Logging utility, which revision
 * 2026-07-28 deprecates (SEP-2577); the migration path that revision states
 * is "Log to `stderr` for stdio transports". The demo has no stdio
 * transport: it reaches the merchant over an in-memory transport, so no part
 * of its stdout carries protocol messages, and it prints the log to stdout
 * with the rest of its output (D102).
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

/** Which kind of event an entry records (D94). */
export type AuditEntryKind = 'mandate_check' | 'settlement';

/** One check, as the log holds it. Frozen on the way in. */
export interface MandateCheckEntry {
  /** A decision about a mandate, not a payment. */
  readonly kind: 'mandate_check';
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

/**
 * What the rail did about the money, in the words the agent was told.
 *
 * These are not new vocabulary: `paid` is the order status and the success
 * body's `status`, and the other three are the merchant's own error codes
 * (`payment_declined`, `capture_failed`, `rail_unavailable`). One word means
 * one thing across the wire, the order store and the log (D95).
 */
export type SettlementOutcome =
  /** The rail held the funds and took them. Money moved. */
  | 'paid'
  /** The rail would not hold the funds. Nothing was taken. */
  | 'payment_declined'
  /** The funds were held and could not be taken; the hold is outstanding. */
  | 'capture_failed'
  /** The rail threw rather than answering, so the payment state is unknown. */
  | 'rail_unavailable';

/** Which of the two rail calls an entry refers to. */
export type AuditRailCall = 'authorise' | 'capture';

/**
 * Why the money did not move, as much of it as an audit line should carry.
 *
 * The code and the origin, and not the rail's message (D96). `origin` is the
 * field a reader has to see named: an issuer refusing a cardholder's money is
 * a different event from the payment system rejecting a request (D53). Both
 * are `string` here rather than the rail's own unions, because nothing in
 * `mandate/` depends on `rail/` and this layer is meant to be liftable on its
 * own (D49); a rail's narrower `RailDecline` satisfies this shape unchanged.
 */
export interface SettlementDecline {
  /** The rail's own code, e.g. `insufficient_funds`. */
  readonly code: string;
  /** `issuer` if the bank refused, `rail` if the payment system did. */
  readonly origin: string;
}

/** One settlement, as the log holds it. Frozen on the way in. */
export interface SettlementEntry {
  /** What the rail did, not what the policy decided. */
  readonly kind: 'settlement';
  /** When the settlement was recorded, from the policy's clock (D97). */
  readonly at: Instant;
  /** The mandate the order was placed under. */
  readonly mandate_id: string;
  /** The order that was being paid for. */
  readonly order_id: string;
  /** On `paid`, the amount the rail took; otherwise the amount attempted (D97). */
  readonly amount_minor: MinorUnits;
  /** The currency of `amount_minor`. */
  readonly currency: CurrencyCode;
  /** What happened to the money. */
  readonly outcome: SettlementOutcome;
  /** Set on `payment_declined` and `capture_failed` only. */
  readonly decline?: SettlementDecline;
  /** Set on `rail_unavailable` only: the call that never answered. */
  readonly rail_call?: AuditRailCall;
}

/**
 * One entry of either kind. A discriminated union on `kind`, so a reader
 * cannot take a refusal reason off a settlement or an order id off a check.
 */
export type AuditEntry = MandateCheckEntry | SettlementEntry;

/** Every word an entry's `outcome` can be, of either kind. */
export type AuditOutcome = PolicyOutcome | SettlementOutcome;

/**
 * A settlement, as {@link AuditLog.recordSettlement} wants it: the entry
 * without its `kind`, which the log supplies.
 *
 * The time comes in with the record rather than from a clock inside the log,
 * exactly as it does for a decision's `checked_at`: the log holds entries and
 * reads nothing of its own (D97).
 */
export type SettlementRecord = Omit<SettlementEntry, 'kind'>;

/**
 * Width of the outcome column in `print()`.
 *
 * Sixteen is the longest word of either kind: `confirm_required`,
 * `payment_declined` and `rail_unavailable` are all exactly that, which is
 * how the settlement words were able to keep the merchant's spelling without
 * moving a column (D95).
 */
const OUTCOME_WIDTH = 16;

/**
 * An append-only log of policy checks and settlements, held in this process's
 * memory.
 *
 * There are two ways in — {@link AuditLog.record} for a decision and
 * {@link AuditLog.recordSettlement} for what the rail then did — and no way
 * to remove or change an entry (D95). {@link AuditLog.entries} hands back a
 * copy, so a caller cannot reach into the log through the array it is given.
 *
 * Like the spend ledger, this is memory only: a restarted merchant starts
 * with an empty log. A real deployment would append to durable storage
 * behind the same shape.
 */
export class AuditLog {
  private readonly log: AuditEntry[] = [];

  /** Append one decision to the log and return the entry that was written. */
  record(decision: PolicyDecision): MandateCheckEntry {
    const entry: MandateCheckEntry = Object.freeze({
      kind: 'mandate_check' as const,
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

  /**
   * Append what the rail did, and return the entry that was written.
   *
   * Called once per attempt that reached the rail, whichever way it went: a
   * payment that failed is exactly the event the log was missing (D86). A
   * call refused before the rail leaves no settlement entry, because nothing
   * was settled — the symmetry with D65, which is why a stock refusal leaves
   * no entry at all (D99).
   */
  recordSettlement(settlement: SettlementRecord): SettlementEntry {
    const known = {
      kind: 'settlement' as const,
      at: settlement.at,
      mandate_id: settlement.mandate_id,
      order_id: settlement.order_id,
      amount_minor: settlement.amount_minor,
      currency: settlement.currency,
      outcome: settlement.outcome,
    };
    // The two detail fields are each set on some outcomes only, and
    // `exactOptionalPropertyTypes` means an absent one is left out rather
    // than written as `undefined`.
    const withDecline =
      settlement.decline === undefined
        ? known
        : { ...known, decline: Object.freeze({ ...settlement.decline }) };
    const entry: SettlementEntry = Object.freeze(
      settlement.rail_call === undefined
        ? withDecline
        : { ...withDecline, rail_call: settlement.rail_call },
    );

    this.log.push(entry);
    return entry;
  }

  /** Every entry, oldest first. A copy: writing to it changes nothing. */
  entries(): readonly AuditEntry[] {
    return [...this.log];
  }

  /** How many events have been recorded, of both kinds. */
  get size(): number {
    return this.log.length;
  }

  /**
   * Write the log to `stream`, one line per event, oldest first.
   *
   * The stream is a parameter and not a default, so nothing in this package
   * can write to stdout by accident. The demo passes `process.stdout`, through
   * an indenting adapter, on purpose: nothing in its process speaks MCP over
   * stdio (D102). A test passes a collector.
   *
   * Amounts are printed in minor units (`2500 GBP` is twenty-five pounds).
   */
  print(stream: OutputStream): void {
    for (const entry of this.log) {
      stream.write(`${formatEntry(entry)}\n`);
    }
  }
}

/**
 * One audit line. Exported so a test can assert on the format in one place.
 *
 * Both kinds print in the same six columns — time, outcome, amount, who or
 * what, the mandate, and whatever detail there is — so a settlement reads
 * directly under the check that allowed it. A check names the parties; a
 * settlement names the order, which is the thing that was paid for (D95).
 */
export function formatEntry(entry: AuditEntry): string {
  return [
    entry.at,
    entry.outcome.padEnd(OUTCOME_WIDTH),
    `${entry.amount_minor} ${entry.currency}`,
    entry.kind === 'mandate_check' ? `${entry.agent} -> ${entry.merchant}` : `order ${entry.order_id}`,
    `mandate ${entry.mandate_id}`,
    entry.kind === 'mandate_check' ? reasonsOf(entry) : detailOf(entry),
  ].join('  ');
}

/** The reason codes of a check, or a dash where a passed check has none. */
function reasonsOf(entry: MandateCheckEntry): string {
  return entry.reasons.length > 0 ? entry.reasons.join(', ') : '-';
}

/**
 * The last column of a settlement line: why the money did not move.
 *
 * A decline prints its code and who said no. A rail that threw prints the
 * call that never answered, and nothing else — its own message does not
 * travel, here for the reason it does not travel on the wire (D85). A payment
 * that went through has nothing left to say, so it gets the same dash a
 * passed check does.
 */
function detailOf(entry: SettlementEntry): string {
  if (entry.decline !== undefined) {
    return `${entry.decline.code} (${entry.decline.origin})`;
  }
  if (entry.rail_call !== undefined) {
    return `no answer from ${entry.rail_call}`;
  }
  return '-';
}
