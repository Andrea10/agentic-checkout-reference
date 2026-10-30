/**
 * The mandate: a signed, scoped authorisation that lets an agent spend on a
 * user's behalf. The shape is the flat object documented in README.md
 * ("The mandate"), kept flat for Stage 1 by decision D10.
 *
 * Money is always an integer in the currency's minor units (pence for GBP),
 * never a float. Times are ISO 8601 instants in UTC.
 */

/** ISO 4217 alpha-3 currency code, e.g. `GBP`. */
export type CurrencyCode = string;

/** ISO 8601 instant in UTC, e.g. `2026-10-25T00:00:00Z`. */
export type Instant = string;

/** An integer amount in the currency's minor units, e.g. 5000 = GBP 50.00. */
export type MinorUnits = number;

/**
 * Everything the user authorises. These are the fields covered by the
 * signature; `signature` itself is not signed.
 */
export interface MandateClaims {
  /** Unique id for this mandate (a UUID). */
  readonly mandate_id: string;
  /** The human who granted the authority. */
  readonly principal: string;
  /** The agent the authority was granted to. */
  readonly agent: string;
  /** The single merchant the authority is good at. */
  readonly merchant: string;
  /** Currency every cap below is denominated in. */
  readonly currency: CurrencyCode;
  /** Total the agent may spend under this mandate. */
  readonly amount_cap_minor: MinorUnits;
  /** Ceiling for any one transaction. */
  readonly per_transaction_cap_minor: MinorUnits;
  /** Not valid before this instant. */
  readonly valid_from: Instant;
  /** Not valid after this instant. */
  readonly valid_until: Instant;
  /** Above this amount a transaction pauses for a human decision. */
  readonly human_confirm_above_minor: MinorUnits;
}

/** A mandate as it travels: the claims plus the signature over them. */
export interface Mandate extends MandateClaims {
  /** Ed25519 signature over the canonical claims, base64url, no padding. */
  readonly signature: string;
}

/** The one field of a mandate that the signature does not cover. */
export const SIGNATURE_FIELD = 'signature';

/**
 * Why a signature check failed. Policy refusals are `PolicyRefusalReason` in
 * `decision.ts`, which includes these two.
 */
export type VerifyFailureReason =
  /** The signature does not match the claims under the given public key. */
  | 'signature_invalid'
  /** The object could not be canonicalised, so no signature check was possible. */
  | 'mandate_malformed';

/**
 * Result of {@link verify}. A deliberate union rather than a boolean (D25): the
 * reason is passed on by `checkMandate()` as one of its refusal reasons, and
 * the audit log records it.
 */
export type VerifyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: VerifyFailureReason };
