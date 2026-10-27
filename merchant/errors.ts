/**
 * Structured tool errors.
 *
 * Handlers throw; the MCP layer turns the throw into a tool result with
 * `isError: true` and a machine-readable `{ error: { code, message } }` body.
 * T07 refuses mandates through the same shape, so an agent only has to learn
 * one failure envelope.
 */

/** Every refusal this task can raise. T06b and T07 append their own. */
export type MerchantErrorCode =
  | 'product_not_found'
  | 'cart_not_found'
  | 'invalid_quantity'
  | 'insufficient_stock';

/** A refusal the agent is expected to read and act on. */
export class MerchantError extends Error {
  readonly code: MerchantErrorCode;

  constructor(code: MerchantErrorCode, message: string) {
    super(message);
    this.name = 'MerchantError';
    this.code = code;
  }
}

/** The wire body of a refusal. */
export interface MerchantErrorBody {
  readonly error: {
    readonly code: MerchantErrorCode | 'internal_error';
    readonly message: string;
  };
}

/** Shapes any thrown value into {@link MerchantErrorBody}. */
export function toErrorBody(thrown: unknown): MerchantErrorBody {
  if (thrown instanceof MerchantError) {
    return { error: { code: thrown.code, message: thrown.message } };
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  return { error: { code: 'internal_error', message } };
}
