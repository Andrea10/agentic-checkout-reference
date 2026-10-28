/**
 * The three steps that move money, in the one order they may ever happen in.
 *
 * Both paths through this merchant end here: `place_order` for an amount the
 * mandate covers outright, and `confirm_order` for one a human had to agree
 * to. Keeping the sequence in one function is the point — it is the part of
 * the repository where a mistake costs somebody money, and there should be
 * exactly one copy of it to read:
 *
 * 1. **`authorise`.** A refusal is a result, not an exception (D50), so a
 *    decline marks the order `declined` and is reported as
 *    `payment_declined`. A *throw* is the rail itself failing, which says
 *    nothing about the money: the order is left where it was and nothing is
 *    recorded (D85).
 * 2. **`capture`.** A decline here is a different event from a decline above —
 *    the funds are held and could not be taken — so the order stays
 *    `authorised` and the code is `capture_failed` (D81).
 * 3. **`recordSpend`.** Only after the capture succeeded, never before, and
 *    for the amount the rail actually took (D45, D87). This is the step that
 *    consumes mandate budget, so a payment that failed leaves the budget
 *    exactly as it was.
 *
 * The order id is the rail's `order_ref`. It is a reference the rail echoes
 * and logs, not an idempotency key (D56), so nothing here may retry a call
 * whose answer it did not get.
 */

import { recordSpend } from '../mandate/index.js';

import {
  CaptureFailedError,
  PaymentDeclinedError,
  RailUnavailableError,
} from './errors.js';

import type { MandatePolicy } from '../mandate/index.js';
import type {
  AuthoriseResult,
  Capture,
  CaptureResult,
  Rail,
} from '../rail/index.js';
import type { OrderStore, PayableOrder } from './order.js';

/** What a settled order comes back as on the wire: two fields (D62, D88). */
export interface PaidResult {
  readonly status: 'paid';
  readonly order_id: string;
}

/** Everything {@link settle} needs, so it takes no `MerchantState` of its own. */
export interface PaymentContext {
  readonly rail: Rail;
  readonly orders: OrderStore;
  readonly policy: MandatePolicy;
}

/**
 * Authorises, captures, records the spend, and returns the paid body.
 *
 * @throws PaymentDeclinedError if the rail would not hold the funds.
 * @throws CaptureFailedError if the funds were held and could not be taken.
 * @throws RailUnavailableError if the rail threw, in which case the payment
 * state is unknown and nothing has been recorded.
 */
export async function settle(
  context: PaymentContext,
  order: PayableOrder,
): Promise<PaidResult> {
  const { rail, orders, policy } = context;

  let authorised: AuthoriseResult;
  try {
    authorised = await rail.authorise({
      order_ref: order.order_id,
      amount_minor: order.amount_minor,
      currency: order.currency,
    });
  } catch (thrown) {
    // The rail may or may not have taken the money. The order keeps the state
    // it had and the ledger is untouched: recording either outcome would be a
    // guess (D50, D85).
    throw new RailUnavailableError('authorise', thrown);
  }

  if (!authorised.ok) {
    orders.markDeclined(order.order_id, authorised.decline);
    throw new PaymentDeclinedError(authorised.decline);
  }

  const held = orders.markAuthorised(order.order_id, authorised.authorisation);

  let captured: CaptureResult;
  try {
    captured = await rail.capture({
      authorisation_id: held.authorisation.authorisation_id,
    });
  } catch (thrown) {
    // The order stays `authorised`, which is true whatever happened: the rail
    // granted the hold, and whether it then took the funds is unknown.
    throw new RailUnavailableError('capture', thrown);
  }

  if (!captured.ok) {
    orders.markCaptureDeclined(order.order_id, captured.decline);
    throw new CaptureFailedError(captured.decline);
  }

  const paid = orders.markPaid(order.order_id, captured.capture);
  recordSpend(policy, spendFor(paid.mandate_id, captured.capture));

  return { status: 'paid', order_id: paid.order_id };
}

/**
 * What goes in the ledger: the amount the rail *took*, not the amount the
 * policy checked.
 *
 * They are the same number, by construction — the authorise request is built
 * from the order and the capture is in full (D52) — and that is exactly why
 * the captured amount is the one recorded. D51's cost names the hazard that
 * nothing in the type system ties the checked amount to the authorised one;
 * recording what the rail reports closes the loop at the far end, and a test
 * pins the three figures together (D87).
 */
function spendFor(mandateId: string, capture: Capture): {
  mandate_id: string;
  amount_minor: number;
} {
  return { mandate_id: mandateId, amount_minor: capture.amount_minor };
}
