/**
 * A Stripe client double for the rail tests: just the two PaymentIntent calls
 * StripeRail makes, with the state changes Stripe's documentation describes.
 *
 * - `create` with `capture_method: manual` and `confirm: true` answers a
 *   PaymentIntent in `requires_capture` (docs.stripe.com, "Place a hold on a
 *   payment method").
 * - `capture` of a `requires_capture` PaymentIntent answers it in
 *   `succeeded`; of anything else, an `invalid_request_error` (API reference,
 *   "Capture a PaymentIntent"). The code used for that error,
 *   `payment_intent_unexpected_state`, and `resource_missing` for an unknown
 *   id, are from Stripe's error-code table; which code a real capture returns
 *   is UNVERIFIED (PROGRESS.md).
 *
 * Errors are the SDK's own classes, so `type`, `rawType` and the fields are
 * exactly what the SDK would hand StripeRail. A test that wants a different
 * answer passes `onCreate` or `onCapture`.
 */

import Stripe from 'stripe';

import type { StripeClientLike, StripePaymentIntentLike } from '../../../rail/index.js';

type CreateParams = Stripe.PaymentIntentCreateParams;
type CaptureParams = Stripe.PaymentIntentCaptureParams;
type Options = Stripe.RequestOptions;

/** One call the fake received, in order. */
export type FakeStripeCall =
  | { readonly method: 'create'; readonly params: CreateParams; readonly options: Options }
  | {
      readonly method: 'capture';
      readonly id: string;
      readonly params: CaptureParams;
      readonly options: Options;
    };

export interface FakeStripeOptions {
  /** Replace the default answer to `create`. Throw to simulate an error. */
  readonly onCreate?: (params: CreateParams) => StripePaymentIntentLike;
  /** Replace the default answer to `capture`. Throw to simulate an error. */
  readonly onCapture?: (id: string) => StripePaymentIntentLike;
}

export interface FakeStripe {
  readonly client: StripeClientLike;
  readonly calls: FakeStripeCall[];
  /** The PaymentIntents the fake holds, by id. */
  readonly intents: Map<string, StripePaymentIntentLike>;
}

export function fakeStripe(options: FakeStripeOptions = {}): FakeStripe {
  const calls: FakeStripeCall[] = [];
  const intents = new Map<string, StripePaymentIntentLike>();
  let next = 0;

  const defaultCreate = (params: CreateParams): StripePaymentIntentLike => {
    next += 1;
    const intent: StripePaymentIntentLike = {
      id: `pi_fake_${String(next).padStart(4, '0')}`,
      status: 'requires_capture',
      amount: params.amount ?? 0,
      amount_received: 0,
      currency: params.currency ?? '',
      metadata: { ...(params.metadata as Record<string, string> | undefined) },
    };
    intents.set(intent.id, intent);
    return intent;
  };

  const defaultCapture = (id: string): StripePaymentIntentLike => {
    const intent = intents.get(id);
    if (intent === undefined) {
      throw invalidRequest('resource_missing', `No such payment_intent: '${id}'`);
    }
    if (intent.status !== 'requires_capture') {
      throw invalidRequest(
        'payment_intent_unexpected_state',
        `This PaymentIntent could not be captured because it has a status of ${intent.status}.`,
        { payment_intent: intent },
      );
    }
    const captured = { ...intent, status: 'succeeded', amount_received: intent.amount };
    intents.set(id, captured);
    return captured;
  };

  const client: StripeClientLike = {
    paymentIntents: {
      create(params, requestOptions) {
        calls.push({ method: 'create', params, options: requestOptions });
        // Inside `then`, so a throw from the handler becomes a rejection, as
        // the SDK's own errors are.
        return Promise.resolve().then(() => (options.onCreate ?? defaultCreate)(params));
      },
      capture(id, params, requestOptions) {
        calls.push({ method: 'capture', id, params, options: requestOptions });
        return Promise.resolve().then(() => (options.onCapture ?? defaultCapture)(id));
      },
    },
  };

  return { client, calls, intents };
}

/** A PaymentIntent in a given status, for tests that answer `create` themselves. */
export function intentWithStatus(status: string, id = 'pi_fake_status'): StripePaymentIntentLike {
  return {
    id,
    status,
    amount: 2499,
    amount_received: 0,
    currency: 'gbp',
    metadata: { order_ref: 'order_1' },
  };
}

/** An `invalid_request_error`, as the SDK raises it. */
export function invalidRequest(
  code: string,
  message: string,
  extra: { readonly param?: string; readonly payment_intent?: StripePaymentIntentLike } = {},
): Stripe.errors.StripeInvalidRequestError {
  return new Stripe.errors.StripeInvalidRequestError({
    type: 'invalid_request_error',
    code,
    message,
    ...(extra.param === undefined ? {} : { param: extra.param }),
    ...(extra.payment_intent === undefined
      ? {}
      : { payment_intent: extra.payment_intent as unknown as Stripe.PaymentIntent }),
  });
}

/** A `card_error`, as the SDK raises it. */
export function cardError(code: string, declineCode?: string): Stripe.errors.StripeCardError {
  return new Stripe.errors.StripeCardError({
    type: 'card_error',
    code,
    message: 'Your card was declined.',
    ...(declineCode === undefined ? {} : { decline_code: declineCode }),
  });
}

/** The four kinds of failure the brief names as thrown. */
export type ThrownCategory = 'connection' | 'authentication' | 'rate_limit' | 'api';

/**
 * The four failures `Rail` says must throw, as the SDK raises them. The
 * authentication message's shape (a masked key) is an assumption made to test
 * the scrubbing, not a quotation of Stripe.
 */
export const THROWN_STRIPE_ERRORS: Readonly<Record<ThrownCategory, () => Stripe.errors.StripeError>> = {
  connection: () =>
    new Stripe.errors.StripeConnectionError({
      message: 'An error occurred with our connection to Stripe.',
    }),
  authentication: () =>
    new Stripe.errors.StripeAuthenticationError({
      type: 'invalid_request_error',
      message: 'Invalid API Key provided: sk_test_********************1234',
    }),
  rate_limit: () =>
    new Stripe.errors.StripeRateLimitError({
      type: 'invalid_request_error',
      code: 'rate_limit',
      message: 'Too many requests hit the API too quickly.',
    }),
  api: () =>
    new Stripe.errors.StripeAPIError({
      type: 'api_error',
      message: 'Something went wrong on our end.',
    }),
};
