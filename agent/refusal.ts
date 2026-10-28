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
 * 2. `place_order`'s refusal, which carries the list of mandate checks that
 *    failed as well (T07a). The field name is read tolerantly — see
 *    {@link readReasons}.
 * 3. Something that is not the envelope at all: the SDK's own input-schema
 *    rejection answers `isError: true` with a plain sentence. That becomes
 *    the code `tool_error` with the sentence as its message (D78), so a
 *    caller still has one shape to read.
 */

import * as z from 'zod';

/** The code the agent uses when a refusal body is not the merchant envelope (D78). */
export const UNSTRUCTURED_REFUSAL_CODE = 'tool_error';

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
  /** The mandate checks that failed. Empty for every refusal but `place_order`'s. */
  readonly reasons: readonly RefusalReason[];
}

/**
 * The merchant's refusal envelope, as the agent reads it.
 *
 * Only `error.code` and `error.message` are required, because only those two
 * are on main today. Everything else on the body is ignored rather than
 * rejected, so a later merchant may add fields without breaking this agent
 * (D77).
 */
const refusalBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

/** A reason list as either of the two shapes `place_order` might use. */
const reasonListSchema = z.union([
  z.array(z.object({ reason: z.string(), message: z.string() })),
  z.array(z.string()).transform((codes) =>
    codes.map((reason) => ({ reason, message: reason })),
  ),
]);

/**
 * Pulls the failed mandate checks off a refusal body.
 *
 * `place_order` is T07a's and is not on main, so the agent accepts either
 * `error.refusals` (the `PolicyRefusal` objects the mandate layer already
 * produces) or `error.reasons` (bare codes), and treats their absence as an
 * empty list rather than an error. T09 reconciles this against the shipped
 * tool; until then the tolerance is deliberate, not an oversight.
 */
function readReasons(error: Record<string, unknown>): readonly RefusalReason[] {
  for (const field of ['refusals', 'reasons'] as const) {
    const parsed = reasonListSchema.safeParse(error[field]);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return [];
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
