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
 *    recorded as paid or spent (D85). The audit log does get a line saying
 *    which call went unanswered, which is not a claim about the money.
 * 2. **`capture`.** A decline here is a different event from a decline above —
 *    the funds are held and could not be taken — so the order stays
 *    `authorised` and the code is `capture_failed` (D81).
 * 3. **`recordSpend`.** Only after the capture succeeded, never before, and
 *    for the amount the rail actually took (D45, D87). This is the step that
 *    consumes mandate budget, so a payment that failed leaves the budget
 *    exactly as it was.
 *
 * Every one of those four outcomes — paid, declined, capture refused, rail
 * unavailable — is also appended to the audit log, beside the mandate decision
 * it followed (D94, D98). This is the only place that writes them, which is
 * why both `place_order` and `confirm_order` produce them without either tool
 * knowing anything about it: there is one copy of the sequence, so there is
 * one copy of the record of it. A call refused *before* the rail settles
 * nothing and therefore logs nothing (D99).
 *
 * The order id is the rail's `order_ref`. It is a reference the rail echoes
 * and logs, not an idempotency key (D56), so nothing here may retry a call
 * whose answer it did not get.
 */

import { isNonNegativeMinorUnits, recordSpend } from '../mandate/index.js';

import {
  CaptureFailedError,
  PaymentDeclinedError,
  RailUnavailableError,
} from './errors.js';

import type { MandatePolicy, SettlementRecord } from '../mandate/index.js';
import type {
  AuthoriseResult,
  Capture,
  CaptureResult,
  Rail,
  RailCall,
  RailDecline,
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
 * Authorises, captures, records the spend and the settlement, and returns the
 * paid body.
 *
 * @throws PaymentDeclinedError if the rail would not hold the funds.
 * @throws CaptureFailedError if the funds were held and could not be taken.
 * @throws RailUnavailableError if the rail threw, in which case the payment
 * state is unknown and nothing has been recorded as paid. The audit log still
 * gets a line: "we asked and got no answer" is what an auditor needs to see
 * (D98).
 */
export async function settle(
  context: PaymentContext,
  order: PayableOrder,
): Promise<PaidResult> {
  const { rail, orders, policy } = context;

  // A held order's token is spent here, before the first `await`, so the
  // check and the mark cannot be split by a second confirmation of the same
  // token (D84, D128). A throw from `authorise` leaves it spent (D126).
  if (order.status === 'awaiting_confirmation') {
    orders.spendToken(order.confirmation_token);
  }

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
    // guess (D50, D85). The audit line says exactly that much — which call
    // went unanswered — and no more. A held order's token was spent before
    // the call, so a replay will not ask the rail for a second hold (D126).
    logSettlement(context, order, { outcome: 'rail_unavailable', rail_call: 'authorise' });
    throw new RailUnavailableError('authorise', thrown);
  }

  if (!authorised.ok) {
    orders.markDeclined(order.order_id, authorised.decline);
    logSettlement(context, order, { outcome: 'payment_declined', decline: authorised.decline });
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
    logSettlement(context, order, { outcome: 'rail_unavailable', rail_call: 'capture' });
    throw new RailUnavailableError('capture', thrown);
  }

  if (!captured.ok) {
    orders.markCaptureDeclined(order.order_id, captured.decline);
    logSettlement(context, order, { outcome: 'capture_failed', decline: captured.decline });
    throw new CaptureFailedError(captured.decline);
  }

  // The rail says it took the money, but the ledger will only record a
  // non-negative whole number of minor units (`SpendLedger.record`). An amount
  // it would refuse is checked here, before the order is marked paid, so a
  // paid order and its recorded spend cannot disagree. The answer cannot be
  // read, so it is treated like no answer: the order stays `authorised` and
  // nothing is recorded as paid (D85, D129).
  if (!isNonNegativeMinorUnits(captured.capture.amount_minor)) {
    logSettlement(context, order, {
      outcome: 'rail_unavailable',
      rail_call: 'capture',
      rail_answer: 'unreadable',
    });
    throw new RailUnavailableError(
      'capture',
      new TypeError(
        `the rail reported a capture of ${String(captured.capture.amount_minor)}, which is not a whole number of minor units`,
      ),
    );
  }

  const paid = orders.markPaid(order.order_id, captured.capture);
  // The log before the ledger, and both after the order's own record. The
  // money has moved, so the auditor's line is written from the thing that
  // reports it moving and is written first: a throw out of `recordSpend` then
  // leaves a log that still says the money left (D98).
  logSettlement(context, order, {
    outcome: 'paid',
    amount_minor: captured.capture.amount_minor,
  });
  recordSpend(policy, spendFor(paid.mandate_id, captured.capture));

  return { status: 'paid', order_id: paid.order_id };
}

/** What varies between the four settlement lines; everything else is the order. */
type SettlementDetail =
  | { readonly outcome: 'paid'; readonly amount_minor: number }
  | {
      readonly outcome: 'payment_declined' | 'capture_failed';
      readonly decline: RailDecline;
    }
  | {
      readonly outcome: 'rail_unavailable';
      readonly rail_call: RailCall;
      readonly rail_answer?: 'unreadable';
    };

/**
 * Appends one settlement line to the audit log the policy writes its decisions
 * to, so the payment reads directly under the check that allowed it (D94).
 *
 * The time comes from the policy's clock and not from the rail's: the rail's
 * stub clock starts at its own synthetic epoch, and a log whose lines are
 * stamped by two clocks cannot be read in order (D97). The rail's own
 * `authorised_at` and `captured_at` stay where they are, on the order.
 *
 * The amount is the one the rail took when there is one, and the amount
 * attempted otherwise — the same reasoning as D87's ledger, one log along.
 * The decline's `message` is deliberately left behind: the code and the origin
 * are what an auditor reads, and prose belongs on the error body (D96).
 */
function logSettlement(
  context: PaymentContext,
  order: PayableOrder,
  detail: SettlementDetail,
): void {
  const { policy } = context;
  const common = {
    at: policy.clock(),
    mandate_id: order.mandate_id,
    order_id: order.order_id,
    currency: order.currency,
  } as const;

  const record: SettlementRecord =
    detail.outcome === 'paid'
      ? { ...common, outcome: 'paid', amount_minor: detail.amount_minor }
      : detail.outcome === 'rail_unavailable'
        ? {
            ...common,
            outcome: 'rail_unavailable',
            amount_minor: order.amount_minor,
            rail_call: detail.rail_call,
            ...(detail.rail_answer === undefined ? {} : { rail_answer: detail.rail_answer }),
          }
        : {
            ...common,
            outcome: detail.outcome,
            amount_minor: order.amount_minor,
            decline: { code: detail.decline.code, origin: detail.decline.origin },
          };

  policy.audit.recordSettlement(record);
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
