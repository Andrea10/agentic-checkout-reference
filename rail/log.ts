/**
 * What a rail writes down, and where it writes it.
 *
 * A rail is handed a *sink*: a callback that receives one structured entry
 * per call. It is never given a destination it did not ask for, and it never
 * writes to stdout — the merchant runs as an MCP stdio server, where stdout
 * carries JSON-RPC protocol frames and nothing else. The default sink
 * discards (D54); the demo and the tests pass one in.
 */

import type { DeclineCode, Instant, MinorUnits, CurrencyCode, RailCall } from './types.js';

/** What the rail answered. */
export type RailLogOutcome = 'ok' | 'declined';

/**
 * One line of a rail's record of itself.
 *
 * The money fields are optional because a failed capture may have nothing to
 * report them from: `capture` is given only an authorisation id (D52), so
 * when that id is unknown the rail does not know the order, the amount or the
 * currency. Everything the rail does know is always present.
 */
export interface RailLogEntry {
  /** When the rail answered, from the rail's injected clock. */
  readonly at: Instant;
  /** Which rail wrote this, from `Rail.name`. */
  readonly rail: string;
  /** Which of the two calls this was. */
  readonly call: RailCall;
  /** Whether the call was answered or refused. */
  readonly outcome: RailLogOutcome;
  /** The merchant's order reference, when the rail knew it. */
  readonly order_ref?: string;
  /** The rail's authorisation id, once there is one. */
  readonly authorisation_id?: string;
  /** Amount in minor units, when the rail knew it. */
  readonly amount_minor?: MinorUnits;
  /** Currency of `amount_minor`, when the rail knew it. */
  readonly currency?: CurrencyCode;
  /** Set when, and only when, `outcome` is `declined`. */
  readonly decline_code?: DeclineCode;
}

/** Where a rail's entries go. One call per entry, in order. */
export type RailLogSink = (entry: RailLogEntry) => void;

/** The default: the rail keeps no record anywhere. */
export const discardRailLog: RailLogSink = () => {
  // Deliberately empty: a rail with no sink injected must stay silent, because
  // the only stream it could guess at is one the MCP transport owns.
};

/**
 * The smallest thing `writeTo` needs. Narrower than `NodeJS.WritableStream`
 * on purpose, so a test can pass a plain object and `process.stderr` still
 * fits.
 */
export interface StringSink {
  write(chunk: string): unknown;
}

/** One entry as a single line of text, for a human reading a transcript. */
export function formatRailLogEntry(entry: RailLogEntry): string {
  const parts = [entry.at, `rail=${entry.rail}`, `call=${entry.call}`, `outcome=${entry.outcome}`];
  if (entry.order_ref !== undefined) parts.push(`order=${entry.order_ref}`);
  if (entry.authorisation_id !== undefined) parts.push(`auth=${entry.authorisation_id}`);
  if (entry.amount_minor !== undefined && entry.currency !== undefined) {
    parts.push(`amount=${String(entry.amount_minor)} ${entry.currency}`);
  }
  if (entry.decline_code !== undefined) parts.push(`decline=${entry.decline_code}`);
  return parts.join(' ');
}

/**
 * A sink that writes one formatted line per entry to a stream you choose.
 *
 * `writeTo(process.stderr)` is the sensible wiring for a server whose stdout
 * is a protocol channel.
 */
export function writeTo(stream: StringSink): RailLogSink {
  return (entry) => {
    stream.write(`${formatRailLogEntry(entry)}\n`);
  };
}
