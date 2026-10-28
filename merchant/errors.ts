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
import type { RailCall, RailDecline } from '../rail/index.js';

/** Every refusal the merchant can raise. */
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
  | 'merchant_misconfigured'
  // T07b: confirming and paying.
  | 'confirmation_token_unknown'
  | 'order_already_paid'
  | 'order_not_awaiting_confirmation'
  | 'order_expired'
  | 'payment_declined'
  | 'capture_failed'
  | 'rail_unavailable';

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

/**
 * The rail said no.
 *
 * A decline is a result and not an exception at the rail's own seam (D50);
 * it becomes an exception here because the merchant's tools report every
 * refusal by throwing (D13), and because an order that was not paid must not
 * come back as a success body. The rail's own `{ code, message, origin }`
 * travels with it, unchanged, for the same reason the policy's reasons do
 * (D66): the vocabulary of *why the money did not move* belongs to the rail.
 */
export class RailDeclinedError extends MerchantError {
  readonly decline: RailDecline;

  constructor(
    code: 'payment_declined' | 'capture_failed',
    message: string,
    decline: RailDecline,
  ) {
    super(code, message);
    this.name = 'RailDeclinedError';
    this.decline = decline;
  }
}

/** The rail would not hold the funds, so nothing was taken (D81). */
export class PaymentDeclinedError extends RailDeclinedError {
  constructor(decline: RailDecline) {
    super(
      'payment_declined',
      `the payment was declined (${decline.code}, from the ${decline.origin}): ${decline.message}`,
      decline,
    );
    this.name = 'PaymentDeclinedError';
  }
}

/**
 * The funds were held and the capture was refused.
 *
 * A different code from `payment_declined` because the consequence is
 * different: there is an authorisation outstanding against the cardholder's
 * money, and this interface has no way to release it (D81).
 */
export class CaptureFailedError extends RailDeclinedError {
  constructor(decline: RailDecline) {
    super(
      'capture_failed',
      `the funds were held but could not be taken (${decline.code}, from the ${decline.origin}): ${decline.message}. The order is not paid and the authorisation is outstanding.`,
      decline,
    );
    this.name = 'CaptureFailedError';
  }
}

/**
 * The rail itself failed: it threw rather than answering.
 *
 * This is not a decline and must never be recorded as one — the payment may
 * have gone through (D50). The order is therefore left in the state it was in,
 * nothing is written to the spend ledger, and the agent is told that the
 * payment state is unknown.
 *
 * The thrown error's own message does not go on the wire (D85): a real rail's
 * internal errors carry request detail, URLs and sometimes credentials. It is
 * kept as `cause` for whoever is reading the server, and the wire gets a fixed
 * sentence.
 */
export class RailUnavailableError extends MerchantError {
  /** Which of the two rail calls failed. */
  readonly call: RailCall;

  constructor(call: RailCall, cause: unknown) {
    super(
      'rail_unavailable',
      `the payment rail failed during ${call}, so the payment state is unknown; nothing has been recorded as paid`,
    );
    this.name = 'RailUnavailableError';
    this.call = call;
    this.cause = cause;
  }
}

/** The wire body of a refusal. */
export interface MerchantErrorBody {
  readonly error: {
    readonly code: MerchantErrorCode | 'internal_error';
    readonly message: string;
    /** Present only on `mandate_refused`: every failed check, in check order. */
    readonly reasons?: readonly { readonly reason: string; readonly message: string }[];
    /**
     * Present only on `payment_declined` and `capture_failed`: the rail's own
     * refusal, including whether the issuer or the payment system said no
     * (D53, D86).
     */
    readonly decline?: {
      readonly code: string;
      readonly message: string;
      readonly origin: string;
    };
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
  if (thrown instanceof RailDeclinedError) {
    return {
      error: {
        code: thrown.code,
        message: thrown.message,
        decline: {
          code: thrown.decline.code,
          message: thrown.decline.message,
          origin: thrown.decline.origin,
        },
      },
    };
  }
  if (thrown instanceof MerchantError) {
    return { error: { code: thrown.code, message: thrown.message } };
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return { error: { code: 'internal_error', message } };
}
