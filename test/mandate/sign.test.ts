import { describe, expect, it } from 'vitest';

import {
  canonicalise,
  exportPublicKey,
  generateMandateKeyPair,
  importPublicKey,
  issue,
  verify,
} from '../../mandate/index.js';

import type { Mandate, MandateClaims } from '../../mandate/index.js';
import type { KeyObject } from 'node:crypto';

/**
 * Keys are generated at run time, every run. No key, public or private, is
 * ever committed to this repository.
 */
const keys = generateMandateKeyPair();

/** The example mandate from README.md, minus the signature. */
const claims: MandateClaims = {
  mandate_id: '7f1c2a5e-9b3d-4c81-a2f6-0d5e8b4a1c33',
  principal: 'user-andrea',
  agent: 'agent-buyer-1',
  merchant: 'merchant-demo',
  currency: 'GBP',
  amount_cap_minor: 5000,
  per_transaction_cap_minor: 2500,
  valid_from: '2026-10-25T00:00:00Z',
  valid_until: '2026-10-26T00:00:00Z',
  human_confirm_above_minor: 2000,
};

/** A different, same-typed value for every signed field. */
const tamperedValues: { readonly [K in keyof MandateClaims]-?: MandateClaims[K] } = {
  mandate_id: '00000000-0000-4000-8000-000000000000',
  principal: 'user-mallory',
  agent: 'agent-rogue',
  merchant: 'merchant-other',
  currency: 'USD',
  amount_cap_minor: 500000,
  per_transaction_cap_minor: 250000,
  valid_from: '2020-01-01T00:00:00Z',
  valid_until: '2099-01-01T00:00:00Z',
  human_confirm_above_minor: 999999,
};

describe('issue', () => {
  it('returns the claims unchanged with a signature added', () => {
    const mandate = issue(claims, keys.privateKey);

    expect(mandate).toMatchObject(claims);
    expect(mandate.signature).toEqual(expect.any(String));
  });

  it('signs with Ed25519: the signature is 64 bytes, base64url encoded', () => {
    const mandate = issue(claims, keys.privateKey);

    expect(mandate.signature).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(mandate.signature, 'base64url')).toHaveLength(64);
  });

  it('is deterministic: Ed25519 signatures are not randomised', () => {
    expect(issue(claims, keys.privateKey).signature).toBe(
      issue(claims, keys.privateKey).signature,
    );
  });

  it('refuses a key that is not Ed25519', () => {
    const wrongCurve = { asymmetricKeyType: 'rsa' } as unknown as KeyObject;

    expect(() => issue(claims, wrongCurve)).toThrow(TypeError);
  });
});

describe('verify, valid mandate', () => {
  it('accepts a mandate signed by the matching private key', () => {
    const mandate = issue(claims, keys.privateKey);

    expect(verify(mandate, keys.publicKey)).toEqual({ ok: true });
  });

  it('accepts it under a public key that made the round trip through the wire', () => {
    const mandate = issue(claims, keys.privateKey);
    const wireKey = importPublicKey(exportPublicKey(keys.publicKey));

    expect(verify(mandate, wireKey)).toEqual({ ok: true });
  });

  it('does not care what order the fields arrive in', () => {
    const mandate = issue(claims, keys.privateKey);
    const reordered = Object.fromEntries(
      Object.entries(mandate).reverse(),
    ) as unknown as Mandate;

    expect(Object.keys(reordered)).not.toEqual(Object.keys(mandate));
    expect(verify(reordered, keys.publicKey)).toEqual({ ok: true });
  });
});

describe('verify, tampered mandate', () => {
  it.each(Object.keys(tamperedValues) as readonly (keyof MandateClaims)[])(
    'rejects a mandate whose %s was changed after signing',
    (field) => {
      const mandate = issue(claims, keys.privateKey);
      const tampered = { ...mandate, [field]: tamperedValues[field] };

      expect(tampered[field]).not.toBe(mandate[field]);
      expect(verify(tampered, keys.publicKey)).toEqual({
        ok: false,
        reason: 'signature_invalid',
      });
    },
  );

  it('rejects a mandate with a signed field removed', () => {
    const mandate = issue(claims, keys.privateKey);
    const withoutMerchant = Object.fromEntries(
      Object.entries(mandate).filter(([key]) => key !== 'merchant'),
    ) as unknown as Mandate;

    expect(verify(withoutMerchant, keys.publicKey)).toEqual({
      ok: false,
      reason: 'signature_invalid',
    });
  });

  it('rejects a mandate with a field added after signing (D23: every field present is signed)', () => {
    const mandate = issue(claims, keys.privateKey);
    const extended = { ...mandate, nonce: 'n-1' } as Mandate;

    expect(verify(extended, keys.publicKey)).toEqual({
      ok: false,
      reason: 'signature_invalid',
    });
  });

  it('ignores an added field whose value is undefined, which JSON cannot carry (D23 rule 4)', () => {
    const mandate = issue(claims, keys.privateKey);
    const extended = { ...mandate, nonce: undefined } as Mandate;

    expect(verify(extended, keys.publicKey)).toEqual({ ok: true });
  });

  it('rejects a signature lifted from a different mandate', () => {
    const other = issue({ ...claims, amount_cap_minor: 9999 }, keys.privateKey);
    const forged: Mandate = { ...claims, signature: other.signature };

    expect(verify(forged, keys.publicKey)).toEqual({
      ok: false,
      reason: 'signature_invalid',
    });
  });

  it('rejects a mandate signed by a different issuer', () => {
    const attacker = generateMandateKeyPair();
    const mandate = issue(claims, attacker.privateKey);

    expect(verify(mandate, keys.publicKey)).toEqual({
      ok: false,
      reason: 'signature_invalid',
    });
  });

  it('rejects an edited signature', () => {
    const mandate = issue(claims, keys.privateKey);
    const flipped = mandate.signature.startsWith('A')
      ? `B${mandate.signature.slice(1)}`
      : `A${mandate.signature.slice(1)}`;

    expect(verify({ ...mandate, signature: flipped }, keys.publicKey)).toEqual({
      ok: false,
      reason: 'signature_invalid',
    });
  });

  it('reports a mandate with no signature as malformed', () => {
    expect(verify({ ...claims, signature: '' }, keys.publicKey)).toEqual({
      ok: false,
      reason: 'mandate_malformed',
    });
  });

  it('reports an unsignable value as malformed rather than guessing', () => {
    const broken = { ...claims, amount_cap_minor: Number.NaN, signature: 'x' };

    expect(verify(broken, keys.publicKey)).toEqual({
      ok: false,
      reason: 'mandate_malformed',
    });
  });
});

describe('canonicalise', () => {
  it('sorts the signed fields and leaves the signature out', () => {
    const mandate = issue(claims, keys.privateKey);

    expect(canonicalise(mandate)).toBe(
      '{"agent":"agent-buyer-1",' +
        '"amount_cap_minor":5000,' +
        '"currency":"GBP",' +
        '"human_confirm_above_minor":2000,' +
        '"mandate_id":"7f1c2a5e-9b3d-4c81-a2f6-0d5e8b4a1c33",' +
        '"merchant":"merchant-demo",' +
        '"per_transaction_cap_minor":2500,' +
        '"principal":"user-andrea",' +
        '"valid_from":"2026-10-25T00:00:00Z",' +
        '"valid_until":"2026-10-26T00:00:00Z"}',
    );
  });

  it('gives the same bytes for signed and unsigned claims', () => {
    expect(canonicalise(issue(claims, keys.privateKey))).toBe(canonicalise(claims));
  });
});
