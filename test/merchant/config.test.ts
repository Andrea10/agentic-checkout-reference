/**
 * The merchant's own configuration (D60).
 *
 * Two facts a caller must not be able to choose: which merchant this is, and
 * whose mandates it trusts. Both come from the environment, and the tests
 * below pass a plain object rather than touching `process.env`, so nothing
 * here leaks between test files.
 */

import { describe, expect, it } from 'vitest';

import {
  exportPublicKey,
  generateMandateKeyPair,
  issue,
  verify,
} from '../../mandate/index.js';
import {
  DEFAULT_MERCHANT_ID,
  ISSUER_PUBLIC_KEY_ENV,
  MERCHANT_ID_ENV,
  configFromEnvironment,
  policyFor,
} from '../../merchant/config.js';

const issuer = generateMandateKeyPair();

const CLAIMS = {
  mandate_id: 'mandate-config-1',
  principal: 'user-andrea',
  agent: 'agent-buyer-1',
  merchant: DEFAULT_MERCHANT_ID,
  currency: 'GBP',
  amount_cap_minor: 5000,
  per_transaction_cap_minor: 2500,
  valid_from: '2026-10-28T00:00:00.000Z',
  valid_until: '2026-10-29T00:00:00.000Z',
  human_confirm_above_minor: 2000,
} as const;

describe('configFromEnvironment', () => {
  it('names itself merchant-demo when the environment does not', () => {
    const config = configFromEnvironment({});

    expect(config.merchant_id).toBe(DEFAULT_MERCHANT_ID);
    expect(config.issuerPublicKey).toBeUndefined();
  });

  it('takes the merchant id from the environment', () => {
    const config = configFromEnvironment({ [MERCHANT_ID_ENV]: 'merchant-acme' });

    expect(config.merchant_id).toBe('merchant-acme');
  });

  it('treats an empty variable as unset, not as an empty merchant id', () => {
    const config = configFromEnvironment({
      [MERCHANT_ID_ENV]: '',
      [ISSUER_PUBLIC_KEY_ENV]: '',
    });

    expect(config.merchant_id).toBe(DEFAULT_MERCHANT_ID);
    expect(config.issuerPublicKey).toBeUndefined();
  });

  it('reads the issuer key in the form exportPublicKey writes (D24)', () => {
    const config = configFromEnvironment({
      [ISSUER_PUBLIC_KEY_ENV]: exportPublicKey(issuer.publicKey),
    });

    expect(config.issuerPublicKey).toBeDefined();
    expect(config.issuerPublicKey?.asymmetricKeyType).toBe('ed25519');
  });

  it('fails at startup on a key it cannot read, naming the variable', () => {
    expect(() => configFromEnvironment({ [ISSUER_PUBLIC_KEY_ENV]: 'not-a-key' })).toThrow(
      TypeError,
    );
    expect(() => configFromEnvironment({ [ISSUER_PUBLIC_KEY_ENV]: 'not-a-key' })).toThrow(
      ISSUER_PUBLIC_KEY_ENV,
    );
  });
});

describe('policyFor', () => {
  it('builds no policy without an issuer, so the merchant cannot take orders', () => {
    expect(policyFor(configFromEnvironment({}))).toBeUndefined();
  });

  it('builds a policy that trusts the configured issuer and nobody else', () => {
    const other = generateMandateKeyPair();
    const policy = policyFor(
      configFromEnvironment({ [ISSUER_PUBLIC_KEY_ENV]: exportPublicKey(issuer.publicKey) }),
    );
    expect(policy).toBeDefined();

    const mine = issue(CLAIMS, issuer.privateKey);
    const theirs = issue(CLAIMS, other.privateKey);

    expect(policy && verify(mine, policy.publicKey)).toEqual({ ok: true });
    expect(policy && verify(theirs, policy.publicKey)).toEqual({
      ok: false,
      reason: 'signature_invalid',
    });
  });

  it('gives each server its own ledger and audit log', () => {
    const config = configFromEnvironment({
      [ISSUER_PUBLIC_KEY_ENV]: exportPublicKey(issuer.publicKey),
    });
    const first = policyFor(config);
    const second = policyFor(config);

    expect(first?.ledger).not.toBe(second?.ledger);
    expect(first?.audit).not.toBe(second?.audit);
  });
});
