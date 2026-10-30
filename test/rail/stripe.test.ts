/**
 * What the Stripe rail promises, against a fake Stripe client: the two calls
 * go to Stripe in the documented shape, every Stripe refusal comes back as a
 * decline with the right code and origin, every Stripe failure that is not a
 * refusal is thrown, and the log looks like the stub's.
 *
 * No test here reaches the network; `forbidNetwork` fails any that tries.
 */

import { describe, expect, it } from 'vitest';

import {
  steppingClock,
  StripeRail,
  StripeRailError,
  StubRail,
  type RailLogEntry,
  type StripeRailOptions,
} from '../../rail/index.js';

import {
  cardError,
  fakeStripe,
  intentWithStatus,
  invalidRequest,
  THROWN_STRIPE_ERRORS,
  type FakeStripe,
  type FakeStripeOptions,
  type ThrownCategory,
} from './support/fake-stripe.js';
import { forbidNetwork } from './support/no-network.js';

forbidNetwork();

/** A request for one GBP 24.99 order, as the merchant sends it. */
const ORDER = { order_ref: 'order_1', amount_minor: 2499, currency: 'GBP' } as const;

/** A Stripe rail over a fake client, with a stepping clock and readable log. */
function stripeRail(
  fake: FakeStripeOptions = {},
  options: Omit<StripeRailOptions, 'client' | 'log'> = {},
): { rail: StripeRail; stripe: FakeStripe; entries: RailLogEntry[] } {
  const stripe = fakeStripe(fake);
  const entries: RailLogEntry[] = [];
  let key = 0;
  const rail = new StripeRail({
    now: steppingClock(),
    nextIdempotencyKey: () => `idem_${String((key += 1))}`,
    ...options,
    client: stripe.client,
    log: (entry) => entries.push(entry),
  });
  return { rail, stripe, entries };
}

describe('StripeRail.authorise then capture', () => {
  it('creates a confirmed manual-capture PaymentIntent in the documented shape', async () => {
    const { rail, stripe } = stripeRail();

    const held = await rail.authorise(ORDER);

    expect(held.ok).toBe(true);
    expect(stripe.calls).toEqual([
      {
        method: 'create',
        params: {
          amount: 2499,
          currency: 'gbp',
          capture_method: 'manual',
          confirm: true,
          payment_method: 'pm_card_visa',
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          metadata: { order_ref: 'order_1' },
        },
        options: { idempotencyKey: 'idem_1' },
      },
    ]);
  });

  it('returns the PaymentIntent id as the authorisation id, and captures that same id', async () => {
    const { rail, stripe } = stripeRail();

    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('expected a hold');
    expect(held.authorisation).toEqual({
      authorisation_id: 'pi_fake_0001',
      order_ref: 'order_1',
      amount_minor: 2499,
      currency: 'GBP',
      authorised_at: '2026-01-01T00:00:00.000Z',
    });

    const taken = await rail.capture({ authorisation_id: held.authorisation.authorisation_id });

    expect(stripe.calls[1]).toEqual({
      method: 'capture',
      id: 'pi_fake_0001',
      params: {},
      options: { idempotencyKey: 'idem_2' },
    });
    expect(taken).toEqual({
      ok: true,
      capture: {
        authorisation_id: 'pi_fake_0001',
        order_ref: 'order_1',
        amount_minor: 2499,
        currency: 'GBP',
        captured_at: '2026-01-01T00:00:01.000Z',
      },
    });
  });

  it('sends a fresh idempotency key per request, never the order reference (D56)', async () => {
    const stripe = fakeStripe();
    const rail = new StripeRail({ client: stripe.client });
    await rail.authorise(ORDER);
    await rail.authorise(ORDER);

    const keys = stripe.calls.map((call) => call.options.idempotencyKey);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys).not.toContain(ORDER.order_ref);
  });

  it('uses the test PaymentMethod it is given', async () => {
    const { rail, stripe } = stripeRail({}, { paymentMethod: 'pm_card_mastercard' });
    await rail.authorise(ORDER);
    const [call] = stripe.calls;
    expect(call?.method === 'create' && call.params.payment_method).toBe('pm_card_mastercard');
  });
});

describe('StripeRail declines: the issuer said no', () => {
  it.each([
    ['card_declined', 'generic_decline', 'card_declined'],
    ['card_declined', 'insufficient_funds', 'insufficient_funds'],
    ['insufficient_funds', undefined, 'insufficient_funds'],
    ['authentication_required', undefined, 'authentication_required'],
    ['card_declined', 'authentication_required', 'authentication_required'],
    ['expired_card', undefined, 'card_declined'],
    ['incorrect_cvc', undefined, 'card_declined'],
  ] as const)(
    'a card_error with code %s and decline_code %s is an issuer decline, %s',
    async (code, declineCode, expected) => {
      const { rail } = stripeRail({
        onCreate: () => {
          throw cardError(code, declineCode);
        },
      });

      const result = await rail.authorise(ORDER);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.decline.origin).toBe('issuer');
      expect(result.decline.code).toBe(expected);
      expect(result.decline.message).toContain(code);
    },
  );

  it('a PaymentIntent left in requires_action is an issuer decline, authentication_required', async () => {
    const { rail } = stripeRail({ onCreate: () => intentWithStatus('requires_action', 'pi_3ds') });

    const result = await rail.authorise(ORDER);

    expect(result).toEqual({
      ok: false,
      decline: {
        code: 'authentication_required',
        origin: 'issuer',
        message: 'PaymentIntent pi_3ds needs cardholder authentication (status requires_action)',
      },
    });
  });

  it('a PaymentIntent back in requires_payment_method is an issuer decline, card_declined', async () => {
    const { rail } = stripeRail({ onCreate: () => intentWithStatus('requires_payment_method') });
    const result = await rail.authorise(ORDER);
    expect(!result.ok && result.decline).toMatchObject({ code: 'card_declined', origin: 'issuer' });
  });
});

describe('StripeRail declines: the rail rejected the request', () => {
  it.each([
    [0, 'zero'],
    [-100, 'negative'],
    [24.99, 'not an integer'],
    [Number.NaN, 'NaN'],
  ])('an amount of %s (%s) is amount_invalid, and Stripe is never called', async (amount) => {
    const { rail, stripe } = stripeRail();
    const result = await rail.authorise({ ...ORDER, amount_minor: amount });
    expect(!result.ok && result.decline).toMatchObject({ code: 'amount_invalid', origin: 'rail' });
    expect(stripe.calls).toEqual([]);
  });

  it('a currency outside the supported set is currency_unsupported, and Stripe is never called', async () => {
    const { rail, stripe } = stripeRail();
    const result = await rail.authorise({ ...ORDER, currency: 'USD' });
    expect(!result.ok && result.decline).toEqual({
      code: 'currency_unsupported',
      origin: 'rail',
      message: 'stripe handles GBP, not USD',
    });
    expect(stripe.calls).toEqual([]);
  });

  it('a lowercase currency is not quietly accepted: the repo speaks uppercase', async () => {
    const { rail } = stripeRail();
    const result = await rail.authorise({ ...ORDER, currency: 'gbp' });
    expect(!result.ok && result.decline.code).toBe('currency_unsupported');
  });

  it('an empty order_ref is order_ref_invalid, and Stripe is never called', async () => {
    const { rail, stripe } = stripeRail();
    const result = await rail.authorise({ ...ORDER, order_ref: '' });
    expect(!result.ok && result.decline).toMatchObject({ code: 'order_ref_invalid', origin: 'rail' });
    expect(stripe.calls).toEqual([]);
  });

  it('converts any supported currency to lowercase for Stripe only', async () => {
    const { rail, stripe } = stripeRail({}, { currencies: ['GBP', 'EUR'] });
    const held = await rail.authorise({ ...ORDER, currency: 'EUR' });
    const [call] = stripe.calls;
    expect(call?.method === 'create' && call.params.currency).toBe('eur');
    expect(held.ok && held.authorisation.currency).toBe('EUR');
  });

  it.each(['amount_too_small', 'amount_too_large', 'invalid_charge_amount'])(
    'an invalid_request_error %s from Stripe is a rail decline, amount_invalid',
    async (code) => {
      const { rail } = stripeRail({
        onCreate: () => {
          throw invalidRequest(code, 'Amount must be at least £0.30 gbp', { param: 'amount' });
        },
      });
      const result = await rail.authorise(ORDER);
      expect(!result.ok && result.decline).toMatchObject({ code: 'amount_invalid', origin: 'rail' });
    },
  );

  it('an invalid_request_error on the currency parameter is a rail decline, currency_unsupported', async () => {
    const { rail } = stripeRail({
      onCreate: () => {
        throw invalidRequest('parameter_invalid_empty', 'Invalid currency', { param: 'currency' });
      },
    });
    const result = await rail.authorise(ORDER);
    expect(!result.ok && result.decline).toMatchObject({
      code: 'currency_unsupported',
      origin: 'rail',
    });
  });

  it('a capture of an unknown PaymentIntent is authorisation_not_found', async () => {
    const { rail } = stripeRail();
    const result = await rail.capture({ authorisation_id: 'pi_never_issued' });
    expect(!result.ok && result.decline).toMatchObject({
      code: 'authorisation_not_found',
      origin: 'rail',
    });
  });

  it('a second capture is authorisation_already_captured, and the money is taken once', async () => {
    const { rail, stripe } = stripeRail();
    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('expected a hold');
    const id = held.authorisation.authorisation_id;

    const first = await rail.capture({ authorisation_id: id });
    const second = await rail.capture({ authorisation_id: id });

    expect(first.ok).toBe(true);
    expect(!second.ok && second.decline).toMatchObject({
      code: 'authorisation_already_captured',
      origin: 'rail',
    });
    expect(stripe.intents.get(id)?.amount_received).toBe(2499);
  });

  it('a capture of a PaymentIntent in another wrong state is authorisation_not_found', async () => {
    const { rail } = stripeRail({
      onCapture: () => {
        throw invalidRequest('payment_intent_unexpected_state', 'cannot capture', {
          payment_intent: intentWithStatus('canceled'),
        });
      },
    });
    const result = await rail.capture({ authorisation_id: 'pi_fake_status' });
    expect(!result.ok && result.decline.code).toBe('authorisation_not_found');
    expect(!result.ok && result.decline.message).toContain('status canceled');
  });
});

describe('StripeRail throws when Stripe gave no answer about the money (D50)', () => {
  const categories = Object.keys(THROWN_STRIPE_ERRORS) as ThrownCategory[];

  it.each(categories)('a %s error on authorise is thrown, not declined', async (category) => {
    const { rail, entries } = stripeRail({
      onCreate: () => {
        throw THROWN_STRIPE_ERRORS[category]();
      },
    });

    const attempt = rail.authorise(ORDER);

    await expect(attempt).rejects.toBeInstanceOf(StripeRailError);
    await expect(attempt).rejects.toMatchObject({ failure: category, call: 'authorise' });
    expect(entries).toEqual([]);
  });

  it.each(categories)('a %s error on capture is thrown, not declined', async (category) => {
    const { rail, entries } = stripeRail({
      onCapture: () => {
        throw THROWN_STRIPE_ERRORS[category]();
      },
    });

    const attempt = rail.capture({ authorisation_id: 'pi_fake_0001' });

    await expect(attempt).rejects.toMatchObject({ failure: category, call: 'capture' });
    expect(entries).toEqual([]);
  });

  it('an invalid_request_error the rail cannot name is thrown, not guessed at', async () => {
    const { rail } = stripeRail({
      onCreate: () => {
        throw invalidRequest('parameter_unknown', 'Received unknown parameter: foo');
      },
    });
    await expect(rail.authorise(ORDER)).rejects.toMatchObject({
      failure: 'invalid_request',
      stripe_code: 'parameter_unknown',
    });
  });

  it.each(['succeeded', 'processing', 'canceled', 'requires_confirmation'])(
    'a PaymentIntent created in status %s is thrown as unexpected_status',
    async (status) => {
      const { rail } = stripeRail({ onCreate: () => intentWithStatus(status) });
      await expect(rail.authorise(ORDER)).rejects.toMatchObject({ failure: 'unexpected_status' });
    },
  );

  it('a capture that does not leave the PaymentIntent succeeded is thrown as unexpected_status', async () => {
    const { rail } = stripeRail({ onCapture: () => intentWithStatus('processing') });
    await expect(rail.capture({ authorisation_id: 'pi_fake_status' })).rejects.toMatchObject({
      failure: 'unexpected_status',
      call: 'capture',
    });
  });

  it('something that is not a Stripe error at all is thrown as unknown', async () => {
    const { rail } = stripeRail({
      onCreate: () => {
        throw new TypeError('boom');
      },
    });
    await expect(rail.authorise(ORDER)).rejects.toMatchObject({ failure: 'unknown' });
  });

  it('removes anything key-shaped from the thrown message', async () => {
    const { rail } = stripeRail({
      onCreate: () => {
        throw THROWN_STRIPE_ERRORS.authentication();
      },
    });
    const thrown = await rail.authorise(ORDER).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(StripeRailError);
    expect(String((thrown as Error).message)).not.toMatch(/sk_test_/);
    expect(String((thrown as Error).message)).toContain('[redacted key]');
    expect(thrown).not.toHaveProperty('cause');
  });
});

describe('StripeRail log entries have the stub’s shape', () => {
  /** Runs the same script against a rail and returns its log. */
  async function script(
    rail: StubRail | StripeRail,
    entries: RailLogEntry[],
    unknownId: string,
  ): Promise<RailLogEntry[]> {
    const held = await rail.authorise(ORDER);
    if (!held.ok) throw new Error('expected a hold');
    await rail.capture({ authorisation_id: held.authorisation.authorisation_id });
    await rail.capture({ authorisation_id: held.authorisation.authorisation_id });
    await rail.capture({ authorisation_id: unknownId });
    await rail.authorise({ ...ORDER, amount_minor: 0 });
    await rail.authorise({ ...ORDER, order_ref: '' });
    return entries;
  }

  it('writes the same entries as StubRail for the same calls, apart from the rail name and ids', async () => {
    const stubEntries: RailLogEntry[] = [];
    const stub = new StubRail({ log: (entry) => stubEntries.push(entry) });
    const { rail, entries } = stripeRail();

    const fromStub = await script(stub, stubEntries, 'auth_999999');
    const fromStripe = await script(rail, entries, 'pi_never_issued');

    const normalise = (entry: RailLogEntry): RailLogEntry => ({
      ...entry,
      rail: '<rail>',
      ...(entry.authorisation_id === undefined ? {} : { authorisation_id: '<id>' }),
    });
    expect(fromStripe.map(normalise)).toEqual(fromStub.map(normalise));
    expect(new Set(fromStripe.map((entry) => entry.rail))).toEqual(new Set(['stripe']));
  });

  it('logs an issuer decline the way the stub logs a rail decline', async () => {
    const { rail, entries } = stripeRail({
      onCreate: () => {
        throw cardError('card_declined', 'insufficient_funds');
      },
    });
    await rail.authorise(ORDER);
    expect(entries).toEqual([
      {
        at: '2026-01-01T00:00:00.000Z',
        rail: 'stripe',
        call: 'authorise',
        outcome: 'declined',
        order_ref: 'order_1',
        amount_minor: 2499,
        currency: 'GBP',
        decline_code: 'insufficient_funds',
      },
    ]);
  });
});
