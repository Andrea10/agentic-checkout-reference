/**
 * Structured tool errors.
 *
 * Handlers throw; the MCP layer turns the throw into a tool result with
 * `isError: true` and a machine-readable `{ error: { code, message } }` body.
 * T07 refuses mandates through the same shape, so an agent only has to learn
 * one failure envelope.
 *
 * A mandate refusal is the one case where a code and a message are not enough:
 * the policy reports every failed check at once (D42), so the body carries a
 * `reasons` list alongside them (D66). The list is the machine-readable part;
 * the message is a summary for a person reading a transcript.
 */

import type { PolicyRefusal } from '../mandate/index.js';

/** Every refusal the merchant can raise. T07b appends its own. */
export type MerchantErrorCode =
  | 'product_not_found'
  | 'cart_not_found'
  | 'invalid_quantity'
  | 'insufficient_stock'
  // T06b: quoting.
  | 'cart_empty'
  | 'quote_not_found'
  | 'quote_expired'
  | 'quote_stale'
  // T07a: ordering.
  | 'mandate_refused'
  | 'quote_already_ordered'
  | 'merchant_misconfigured';

/** A refusal the agent is expected to read and act on. */
export class MerchantError extends Error {
  readonly code: MerchantErrorCode;

  constructor(code: MerchantErrorCode, message: string) {
    super(message);
    this.name = 'MerchantError';
    this.code = code;
  }
}

/**
 * The mandate did not authorise this order.
 *
 * Carries every failed check, in the order the policy made them, because a
 * refusal that named only the first reason would cost an agent developer one
 * round trip per problem — the thing D42 exists to avoid. The reasons are the
 * mandate layer's own {@link PolicyRefusal} objects, passed through unchanged
 * rather than translated into merchant codes: the vocabulary of *why a
 * mandate did not hold* belongs to the mandate layer.
 */
export class MandateRefusedError extends MerchantError {
  readonly refusals: readonly PolicyRefusal[];

  constructor(refusals: readonly PolicyRefusal[]) {
    super('mandate_refused', summarise(refusals));
    this.name = 'MandateRefusedError';
    this.refusals = refusals;
  }
}

/** One line naming every reason, for the human reading a refused tool call. */
function summarise(refusals: readonly PolicyRefusal[]): string {
  const reasons = refusals.map((refusal) => refusal.reason).join(', ');
  return `the mandate does not authorise this order: ${reasons}`;
}

/** The wire body of a refusal. */
export interface MerchantErrorBody {
  readonly error: {
    readonly code: MerchantErrorCode | 'internal_error';
    readonly message: string;
    /** Present only on `mandate_refused`: every failed check, in check order. */
    readonly reasons?: readonly { readonly reason: string; readonly message: string }[];
  };
}

/** Shapes any thrown value into {@link MerchantErrorBody}. */
export function toErrorBody(thrown: unknown): MerchantErrorBody {
  if (thrown instanceof MandateRefusedError) {
    return {
      error: {
        code: thrown.code,
        message: thrown.message,
        reasons: thrown.refusals.map((refusal) => ({
          reason: refusal.reason,
          message: refusal.message,
        })),
      },
    };
  }
  if (thrown instanceof MerchantError) {
    return { error: { code: thrown.code, message: thrown.message } };
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return { error: { code: 'internal_error', message } };
}
