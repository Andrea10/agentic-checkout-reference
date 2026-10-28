/**
 * The mandate layer: issue a signed, scoped spending authorisation, check the
 * signature on it, check that it actually covers the purchase in front of
 * you, and write down what was decided.
 *
 * ```ts
 * const { publicKey, privateKey } = generateMandateKeyPair();
 * const mandate = issue(claims, privateKey);   // signs
 * const result = verify(mandate, publicKey);   // { ok: true } — signature only
 *
 * const policy = createMandatePolicy({ publicKey });
 * const decision = checkMandate(policy, {     // agent, merchant, window,
 *   mandate,                                  // currency, caps, budget
 *   agent: 'agent-buyer-1',
 *   merchant: 'merchant-demo',
 *   amount_minor: 2500,
 *   currency: 'GBP',
 * });
 * policy.audit.print(process.stderr);         // never stdout: see audit.ts
 * ```
 *
 * `verify()` is the signature check and nothing more; `checkMandate()` is the
 * policy. They are separate calls (decision D40), and every call to the second
 * one lands in the audit log, pass or fail.
 */

export { AuditLog, formatEntry } from './audit.js';
export { canonicalBytes, canonicalise, CanonicalisationError } from './canonical.js';
export { fixedClock, systemClock } from './clock.js';
export { createMemoryLedger, isNonNegativeMinorUnits, isPositiveMinorUnits } from './ledger.js';
export { checkMandate, createMandatePolicy, recordSpend } from './policy.js';
export { exportPublicKey, generateMandateKeyPair, importPublicKey, issue, verify } from './sign.js';
export { SIGNATURE_FIELD } from './types.js';

export type { AuditEntry, OutputStream } from './audit.js';
export type { Clock } from './clock.js';
export type {
  PolicyDecision,
  PolicyOutcome,
  PolicyRefusal,
  PolicyRefusalReason,
} from './decision.js';
export type { SpendLedger } from './ledger.js';
export type {
  MandatePolicy,
  MandatePolicyOptions,
  PolicyRequest,
  SpendRecord,
} from './policy.js';
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
