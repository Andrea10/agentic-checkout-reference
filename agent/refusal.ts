/**
 * What the agent does with a "no".
 *
 * The merchant answers a refusal as an MCP tool result with `isError: true`
 * and a JSON body `{ error: { code, message } }` (D13). That is a decision
 * the merchant made, not a failure of the call: the connection is fine, the
 * request was understood, and the answer is no. So the agent carries it as a
 * value — {@link MerchantRefusal} — and never as a thrown error (D73).
 *
 * Three bodies arrive on that one envelope, and all three land here:
 *
 * 1. The merchant's own envelope, which parses into a `code` and a `message`.
 * 2. `place_order`'s `mandate_refused`, which carries `error.reasons`: every
 *    mandate check that failed, in the order the policy made them, as the
 *    mandate layer's own `PolicyRefusal` objects (D66). The agent reads that
 *    one field and no other — see {@link readReasons}.
 * 3. Something that is not the envelope at all: the SDK's own input-schema
 *    rejection answers `isError: true` with a plain sentence. That becomes
 *    the code `tool_error` with the sentence as its message (D78), so a
 *    caller still has one shape to read.
 */

import * as z from 'zod';

/** The code the agent uses when a refusal body is not the merchant envelope (D78). */
export const UNSTRUCTURED_REFUSAL_CODE = 'tool_error';

/** The merchant's code for "the mandate did not authorise this order" (D66). */
export const MANDATE_REFUSED_CODE = 'mandate_refused';

/**
 * One failed mandate check, as `place_order` reports it.
 *
 * The shape mirrors `PolicyRefusal` in `mandate/decision.ts`, but the type is
 * declared here rather than imported: this is what came off the wire, not
 * what the mandate layer decided in this process.
 */
export interface RefusalReason {
  readonly reason: string;
  readonly message: string;
}

/** A merchant "no", in the one shape the agent reads everywhere. */
export interface MerchantRefusal {
  /** The merchant's refusal code, or {@link UNSTRUCTURED_REFUSAL_CODE}. */
  readonly code: string;
  readonly message: string;
  /** The mandate checks that failed. Empty for every refusal but `mandate_refused`. */
  readonly reasons: readonly RefusalReason[];
}

/**
 * The merchant's refusal envelope, as the agent reads it.
 *
 * Only `error.code` and `error.message` are required, because they are the
 * two every refusal carries. Everything else on the body is ignored rather
 * than rejected, so a later merchant may add fields without breaking this
 * agent (D77).
 */
const refusalBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

/** `error.reasons`, as `MerchantErrorBody` declares it. */
const reasonsSchema = z.array(z.object({ reason: z.string(), message: z.string() }));

/**
 * Pulls the failed mandate checks off a refusal body.
 *
 * One field, `reasons`, because that is the one the merchant ships (D66). An
 * earlier draft of this file also accepted `error.refusals` and a list of
 * bare code strings, written before `place_order` was on main. Both are gone:
 * tolerance for a field no merchant has ever sent is speculative code kept
 * alive by a test that pins fiction, and it hid the real shape behind two
 * alternatives a reader would have to rule out.
 *
 * Absence is still an empty list rather than an error, because every refusal
 * except `mandate_refused` arrives without the field.
 */
function readReasons(error: Record<string, unknown>): readonly RefusalReason[] {
  const parsed = reasonsSchema.safeParse(error['reasons']);
  return parsed.success ? parsed.data : [];
}

/**
 * Reads a refusal out of the text a failed tool call carried.
 *
 * Never throws: text that is not the envelope becomes
 * {@link UNSTRUCTURED_REFUSAL_CODE} with the text as the message.
 */
export function readRefusal(text: string): MerchantRefusal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { code: UNSTRUCTURED_REFUSAL_CODE, message: text, reasons: [] };
  }

  const body = refusalBodySchema.safeParse(parsed);
  if (!body.success) {
    return { code: UNSTRUCTURED_REFUSAL_CODE, message: text, reasons: [] };
  }

  const error = (parsed as { error: Record<string, unknown> }).error;
  return {
    code: body.data.error.code,
    message: body.data.error.message,
    reasons: readReasons(error),
  };
}

/** A one-line rendering of a refusal, for a log or a demo transcript. */
export function describeRefusal(refusal: MerchantRefusal): string {
  const reasons =
    refusal.reasons.length === 0
      ? ''
      : ` [${refusal.reasons.map((entry) => entry.reason).join(', ')}]`;
  return `${refusal.code}: ${refusal.message}${reasons}`;
}
