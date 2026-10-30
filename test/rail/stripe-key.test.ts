/**
 * The key guard: the Stripe rail takes its key from `STRIPE_SECRET_KEY` only,
 * accepts only a test-mode secret key, and never repeats the key anywhere.
 *
 * The key values below are made up. None of them is, or was, a real key.
 */

import { describe, expect, it } from 'vitest';

import {
  readStripeTestKey,
  StripeKeyError,
  StripeRail,
  StripeRailError,
  type RailLogEntry,
} from '../../rail/index.js';

import { forbidNetwork, NETWORK_FORBIDDEN } from './support/no-network.js';

forbidNetwork();

/** Every way a value can leave an error object: message, string form, own fields, JSON. */
function everythingIn(error: unknown): string {
  const own =
    typeof error === 'object' && error !== null
      ? Object.getOwnPropertyNames(error).map((name) => String((error as Record<string, unknown>)[name]))
      : [];
  return [String(error), JSON.stringify(error), ...own].join('\n');
}

/** Constructs a rail from `env` alone and returns what was thrown, or undefined. */
function constructFrom(env: Record<string, string | undefined>): unknown {
  try {
    new StripeRail({ env });
    return undefined;
  } catch (thrown) {
    return thrown;
  }
}

const REFUSED = [
  ['missing', {}, 'missing'],
  ['empty', { STRIPE_SECRET_KEY: '' }, 'empty'],
  ['whitespace', { STRIPE_SECRET_KEY: '   ' }, 'empty'],
  ['the bare prefix', { STRIPE_SECRET_KEY: 'sk_test_' }, 'not_test_secret'],
  ['malformed', { STRIPE_SECRET_KEY: 'not-a-key-at-all-0000' }, 'not_test_secret'],
  ['a publishable test key', { STRIPE_SECRET_KEY: 'pk_test_FAKEFAKEFAKE0000' }, 'not_test_secret'],
  ['a restricted test key', { STRIPE_SECRET_KEY: 'rk_test_FAKEFAKEFAKE0000' }, 'not_test_secret'],
  ['a test key with leading space', { STRIPE_SECRET_KEY: ' sk_test_FAKEFAKEFAKE0000' }, 'not_test_secret'],
  ['a live secret key', { STRIPE_SECRET_KEY: 'sk_live_FAKEFAKEFAKE0000' }, 'live'],
  ['a live restricted key', { STRIPE_SECRET_KEY: 'rk_live_FAKEFAKEFAKE0000' }, 'live'],
] as const;

describe('the Stripe key guard', () => {
  it.each(REFUSED)('refuses %s at construction', (_label, env, problem) => {
    const thrown = constructFrom(env);
    expect(thrown).toBeInstanceOf(StripeKeyError);
    expect((thrown as StripeKeyError).problem).toBe(problem);
  });

  it.each(REFUSED)('never repeats the value when it refuses %s', (_label, env) => {
    const value = (env as { STRIPE_SECRET_KEY?: string }).STRIPE_SECRET_KEY;
    const thrown = constructFrom(env);
    // Nothing to leak when there is no value, or when the value is the public
    // prefix itself, which the message names on purpose.
    if (value === undefined || value.trim() === '' || value === 'sk_test_') return;
    expect(everythingIn(thrown)).not.toContain(value);
    // Not even the part after the prefix.
    expect(everythingIn(thrown)).not.toContain('FAKEFAKEFAKE0000');
  });

  it('accepts a test-mode secret key, and builds its client without touching the network', () => {
    expect(() => new StripeRail({ env: { STRIPE_SECRET_KEY: 'sk_test_FAKEFAKEFAKE0000' } })).not.toThrow();
    expect(readStripeTestKey({ STRIPE_SECRET_KEY: 'sk_test_FAKEFAKEFAKE0000' })).toBe(
      'sk_test_FAKEFAKEFAKE0000',
    );
  });

  it('reads STRIPE_SECRET_KEY and no other variable', () => {
    const thrown = constructFrom({
      STRIPE_KEY: 'sk_test_FAKEFAKEFAKE0000',
      STRIPE_API_KEY: 'sk_test_FAKEFAKEFAKE0000',
      STRIPE_TEST_SECRET_KEY: 'sk_test_FAKEFAKEFAKE0000',
    });
    expect((thrown as StripeKeyError).problem).toBe('missing');
  });

  it('does not keep the key anywhere a caller can read it', () => {
    const rail = new StripeRail({ env: { STRIPE_SECRET_KEY: 'sk_test_FAKEFAKEFAKE0000' } });
    expect(everythingIn(rail)).not.toContain('FAKEFAKEFAKE0000');
    expect(Object.keys(rail)).toEqual(['name']);
  });

  it('a real client built from the key is stopped by the network guard, and the failure is thrown without the key', async () => {
    const entries: RailLogEntry[] = [];
    const rail = new StripeRail({
      env: { STRIPE_SECRET_KEY: 'sk_test_FAKEFAKEFAKE0000' },
      log: (entry) => entries.push(entry),
    });

    const thrown = await rail
      .authorise({ order_ref: 'order_1', amount_minor: 2499, currency: 'GBP' })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(StripeRailError);
    expect(thrown).toMatchObject({ failure: 'connection', call: 'authorise' });
    expect(everythingIn(thrown)).not.toContain('FAKEFAKEFAKE0000');
    expect(entries).toEqual([]);
  }, 20_000);
});

describe('the network guard itself', () => {
  it('fails a socket connection', async () => {
    const net = await import('node:net');
    expect(() => net.connect(443, 'api.stripe.com')).toThrow(NETWORK_FORBIDDEN);
  });

  it('fails fetch', async () => {
    await expect(fetch('https://api.stripe.com/v1/payment_intents')).rejects.toThrow(
      NETWORK_FORBIDDEN,
    );
  });
});
