import {
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

import { CanonicalisationError, canonicalBytes } from './canonical.js';

import type { Mandate, MandateClaims, VerifyResult } from './types.js';
import type { KeyObject } from 'node:crypto';

/**
 * Ed25519 keys as `node:crypto` holds them. The private key never leaves the
 * issuer; the merchant only ever needs the public half.
 */
export interface MandateKeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
}

/** A fresh Ed25519 key pair for issuing mandates. */
export function generateMandateKeyPair(): MandateKeyPair {
  return generateKeyPairSync('ed25519');
}

/**
 * The public key as a wire string: DER SPKI, base64url, no padding. SPKI
 * rather than the bare 32 bytes because it carries the algorithm with it, so a
 * verifier cannot be talked into reading a key as the wrong curve.
 */
export function exportPublicKey(publicKey: KeyObject): string {
  assertEd25519(publicKey, 'publicKey');
  return publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
}

/** Read back a key written by {@link exportPublicKey}. */
export function importPublicKey(encoded: string): KeyObject {
  const key = createPublicKey({
    key: Buffer.from(encoded, 'base64url'),
    format: 'der',
    type: 'spki',
  });
  assertEd25519(key, 'encoded');
  return key;
}

/**
 * Issue a mandate: sign the claims and return them with the signature in
 * place. The signature is Ed25519 over the canonical serialisation of the
 * claims (see `canonicalise`), encoded base64url without padding.
 *
 * @throws TypeError if `privateKey` is not an Ed25519 key.
 */
export function issue(claims: MandateClaims, privateKey: KeyObject): Mandate {
  assertEd25519(privateKey, 'privateKey');
  const signature = cryptoSign(null, canonicalBytes(claims), privateKey).toString('base64url');
  return { ...claims, signature };
}

/**
 * Check that a mandate was signed by the holder of `publicKey` and that no
 * signed field has changed since.
 *
 * This is the signature check and nothing else. Whether the mandate is in
 * date, names the right agent or merchant, or has budget left is policy, and
 * belongs to T04.
 *
 * @throws TypeError if `publicKey` is not an Ed25519 key.
 */
export function verify(mandate: Mandate, publicKey: KeyObject): VerifyResult {
  assertEd25519(publicKey, 'publicKey');

  let bytes: Buffer;
  try {
    bytes = canonicalBytes(mandate);
  } catch (error) {
    if (error instanceof CanonicalisationError) {
      return { ok: false, reason: 'mandate_malformed' };
    }
    throw error;
  }

  if (typeof mandate.signature !== 'string' || mandate.signature.length === 0) {
    return { ok: false, reason: 'mandate_malformed' };
  }

  const signature = Buffer.from(mandate.signature, 'base64url');
  return cryptoVerify(null, bytes, publicKey, signature)
    ? { ok: true }
    : { ok: false, reason: 'signature_invalid' };
}

function assertEd25519(key: KeyObject, name: string): void {
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new TypeError(`${name} must be an Ed25519 key, got ${String(key.asymmetricKeyType)}`);
  }
}
