/**
 * What the merchant knows about itself.
 *
 * Two facts cannot come from a tool argument, because a caller must not be
 * able to choose them (D60):
 *
 * - **Which merchant this is.** A mandate names the one merchant it is good
 *   at, and the policy compares that name with the merchant's own. If the
 *   caller supplied the name, `merchant_mismatch` could never fire: the agent
 *   would simply echo whatever its mandate says.
 * - **Which issuer it trusts.** The signature check is only worth making
 *   against a key the merchant decided to trust in advance. A public key
 *   handed over with the mandate would verify every mandate, including one the
 *   agent signed itself.
 *
 * Both are read from an environment, so that nothing has to be written to a
 * file. `merchant/stdio.ts` passes `process.env`. The demo does not start that
 * server: it exports the public key, hands `configFromEnvironment` a synthetic
 * environment holding it, and hosts the merchant in its own process (D100). A
 * public key is not a secret; nothing secret is read here, and nothing in this
 * file writes to a log or a stream.
 */

import { importPublicKey, createMandatePolicy } from '../mandate/index.js';

import type { MandatePolicy } from '../mandate/index.js';
import type { KeyObject } from 'node:crypto';

/** The merchant id used when the environment does not name one. */
export const DEFAULT_MERCHANT_ID = 'merchant-demo';

/** Environment variable naming this merchant. */
export const MERCHANT_ID_ENV = 'ACR_MERCHANT_ID';

/**
 * Environment variable holding the issuer's Ed25519 public key, as
 * `exportPublicKey()` writes it: DER SPKI, base64url, unpadded (D24).
 */
export const ISSUER_PUBLIC_KEY_ENV = 'ACR_MANDATE_PUBLIC_KEY';

/** The merchant's own configuration. */
export interface MerchantConfig {
  readonly merchant_id: string;
  /**
   * The one issuer whose mandates this merchant will check signatures
   * against, or `undefined` when none was configured. An unconfigured
   * merchant still serves its catalogue; it refuses to take orders (D60).
   */
  readonly issuerPublicKey: KeyObject | undefined;
}

/** A minimal view of `process.env`, so a test can pass a plain object. */
export type Environment = Record<string, string | undefined>;

/**
 * Reads the configuration out of the environment.
 *
 * @throws TypeError if a public key is named but cannot be read. A merchant
 * configured with a broken key is misconfigured in a way no order could
 * recover from, so it fails at startup rather than per call.
 */
export function configFromEnvironment(env: Environment = process.env): MerchantConfig {
  const merchantId = env[MERCHANT_ID_ENV];
  const encodedKey = env[ISSUER_PUBLIC_KEY_ENV];

  return {
    merchant_id:
      merchantId !== undefined && merchantId.length > 0 ? merchantId : DEFAULT_MERCHANT_ID,
    issuerPublicKey:
      encodedKey !== undefined && encodedKey.length > 0 ? readKey(encodedKey) : undefined,
  };
}

/**
 * The mandate policy this configuration implies, or `undefined` when no
 * issuer key was configured.
 *
 * One policy per call, and therefore one ledger and one audit log per server
 * instance — which is one per stdio connection, exactly as the cart store is
 * (D11). Two connections do not share a spend ledger; D44 already names that
 * cost.
 */
export function policyFor(config: MerchantConfig): MandatePolicy | undefined {
  return config.issuerPublicKey === undefined
    ? undefined
    : createMandatePolicy({ publicKey: config.issuerPublicKey });
}

function readKey(encoded: string): KeyObject {
  try {
    return importPublicKey(encoded);
  } catch (thrown) {
    const reason = thrown instanceof Error ? thrown.message : String(thrown);
    throw new TypeError(
      `${ISSUER_PUBLIC_KEY_ENV} is not a readable Ed25519 public key: ${reason}`,
    );
  }
}
