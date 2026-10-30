/**
 * One authorise and capture against Stripe's test mode, for a person with a
 * test key to run by hand: `STRIPE_SECRET_KEY=sk_test_... npx vitest run
 * test/rail/stripe.live.test.ts`.
 *
 * Skipped unless STRIPE_SECRET_KEY is set, and always skipped in CI (GitHub
 * Actions sets CI=true), so `npm test` never makes a network call. The rail
 * refuses any key that is not a test-mode secret key before it can send one.
 */

import { describe, expect, it } from 'vitest';

import { StripeRail } from '../../rail/index.js';

const hasKey = (process.env['STRIPE_SECRET_KEY'] ?? '') !== '';
const inCi = process.env['CI'] !== undefined && process.env['CI'] !== '';

describe.skipIf(!hasKey || inCi)('StripeRail against Stripe test mode (live, opt-in)', () => {
  it('holds GBP 24.99 with pm_card_visa, then captures it', async () => {
    const rail = new StripeRail();

    const held = await rail.authorise({
      order_ref: `live_test_${String(Date.now())}`,
      amount_minor: 2499,
      currency: 'GBP',
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.authorisation.authorisation_id).toMatch(/^pi_/);

    const taken = await rail.capture({ authorisation_id: held.authorisation.authorisation_id });
    expect(taken.ok && taken.capture.amount_minor).toBe(2499);
  }, 60_000);
});
