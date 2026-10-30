/**
 * Choosing the rail from `ACR_RAIL`, in the library and in the demo: the stub
 * stays the default, `stripe` without a test key fails before anything runs,
 * and the demo's default output is the stub's.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  RailChoiceError,
  railFactoryFromEnvironment,
  StripeKeyError,
  StripeRail,
  StubRail,
  stubRailFactory,
} from '../../rail/index.js';
import { runDemo } from '../../scripts/demo.js';

import { forbidNetwork } from './support/no-network.js';

forbidNetwork();

const ignore = (): void => undefined;

describe('railFactoryFromEnvironment', () => {
  it.each([[undefined], [''], ['stub']])('gives the stub for ACR_RAIL=%s', (value) => {
    const factory = railFactoryFromEnvironment(value === undefined ? {} : { ACR_RAIL: value });
    expect(factory).toBe(stubRailFactory);
    expect(factory(ignore)).toBeInstanceOf(StubRail);
  });

  it('gives the Stripe rail for ACR_RAIL=stripe with a test key', () => {
    const factory = railFactoryFromEnvironment({
      ACR_RAIL: 'stripe',
      STRIPE_SECRET_KEY: 'sk_test_FAKEFAKEFAKE0000',
    });
    const rail = factory(ignore);
    expect(rail).toBeInstanceOf(StripeRail);
    expect(rail.name).toBe('stripe');
  });

  it('refuses ACR_RAIL=stripe without a key when the choice is made, not later', () => {
    expect(() => railFactoryFromEnvironment({ ACR_RAIL: 'stripe' })).toThrow(StripeKeyError);
  });

  it('refuses a live key for ACR_RAIL=stripe', () => {
    expect(() =>
      railFactoryFromEnvironment({ ACR_RAIL: 'stripe', STRIPE_SECRET_KEY: 'sk_live_FAKEFAKEFAKE0000' }),
    ).toThrow(StripeKeyError);
  });

  it('refuses a name it does not know, without echoing it', () => {
    const attempt = (): unknown => railFactoryFromEnvironment({ ACR_RAIL: 'Stripe ' });
    expect(attempt).toThrow(RailChoiceError);
    expect(attempt).toThrow('ACR_RAIL must be stub or stripe');
  });
});

/** Collects what the demo writes. */
function capture(): { write(chunk: string): boolean; text: () => string } {
  const chunks: string[] = [];
  return {
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    text: () => chunks.join(''),
  };
}

describe('the demo rail switch', () => {
  it('prints the same transcript with no rail option as with the stub chosen explicitly', async () => {
    const unset = capture();
    const chosen = capture();
    await runDemo(unset);
    await runDemo(chosen, { rail: railFactoryFromEnvironment({ ACR_RAIL: 'stub' }) });
    expect(chosen.text()).toBe(unset.text());
    expect(unset.text()).toContain('rail=stub');
    expect(unset.text()).not.toContain('rail=stripe');
  });

  it('with ACR_RAIL=stripe and no key, exits non-zero with one line on stderr and nothing on stdout', () => {
    const demo = fileURLToPath(new URL('../../scripts/demo.ts', import.meta.url));
    const tsx = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));
    // stripe@23.1.0 writes a line to stderr when it loads and CLAUDECODE is
    // set. Setting it here makes this test fail if the demo ever loads the SDK
    // before refusing, wherever the test runs.
    const env: NodeJS.ProcessEnv = { ...process.env, ACR_RAIL: 'stripe', CLAUDECODE: '1' };
    delete env['STRIPE_SECRET_KEY'];

    const run = spawnSync(tsx, [demo], { env, encoding: 'utf8' });

    expect(run.status).toBe(1);
    expect(run.stdout).toBe('');
    expect(run.stderr).toBe(
      'demo: STRIPE_SECRET_KEY is not set; the Stripe rail needs a test-mode secret key (sk_test_...)\n',
    );
  }, 30_000);
});
