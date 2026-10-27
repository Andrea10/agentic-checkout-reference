/**
 * The mandate layer: issue a signed, scoped spending authorisation and check
 * the signature on it.
 *
 * ```ts
 * const { publicKey, privateKey } = generateMandateKeyPair();
 * const mandate = issue(claims, privateKey);   // signs
 * const result = verify(mandate, publicKey);   // { ok: true }
 * ```
 *
 * Policy (agent, merchant, validity window, caps, remaining budget, currency,
 * human-confirm threshold) and the audit log arrive with T04.
 */

export { canonicalBytes, canonicalise, CanonicalisationError } from './canonical.js';
export { exportPublicKey, generateMandateKeyPair, importPublicKey, issue, verify } from './sign.js';
export { SIGNATURE_FIELD } from './types.js';

export type { MandateKeyPair } from './sign.js';
export type {
  CurrencyCode,
  Instant,
  Mandate,
  MandateClaims,
  MinorUnits,
  VerifyFailureReason,
  VerifyResult,
} from './types.js';
