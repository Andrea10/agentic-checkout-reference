/**
 * `confirm_order`: the human's yes, turned into a payment.
 *
 * `place_order` holds an order above the mandate's `human_confirm_above_minor`
 * and hands back a token (PRD R4, D62). This tool takes that token back and
 * finishes the purchase. The token is the only argument: whoever confirms is
 * the principal, who is not the agent and may well not be holding the mandate
 * (D61, D74).
 *
 * The time between the hold and the token coming back is the whole problem
 * this tool has to solve. A human may take minutes, and in those minutes the
 * world moves: stock sells out, the hold lapses, the mandate's window closes,
 * another order under the same mandate eats the budget. So everything that
 * can have changed is checked again, in the same order `place_order` checks
 * it:
 *
 * 1. **Is this merchant able to take orders at all?** (D60.)
 * 2. **Is the token good, and is its order still waiting?** A token releases
 *    one payment (D84): a second confirmation is refused, by name — including
 *    after an attempt the rail never answered (D126), and while one is still
 *    waiting on the rail (D128).
 * 3. **Has the hold lapsed?** Fifteen minutes (D82).
 * 4. **Is the stock still there?** Re-read from the catalogue (D17), against
 *    the order's own lines.
 * 5. **Does the mandate still authorise it?** The mandate stored with the
 *    held order is checked again, against the clock and the ledger as they
 *    are now (D83). A `confirm_required` answer is not a refusal here — being
 *    above the threshold is the reason this call exists.
 * 6. **Pay.** Authorise, capture, record the spend (`pay.ts`).
 *
 * The quote is deliberately *not* re-checked. The order carries its own
 * priced snapshot — the lines, the amount, the currency — and that snapshot
 * is what the human is being asked about, so a cart that moved or a quote
 * that lapsed after the hold changes nothing about the price being confirmed
 * (D82).
 */

import * as z from 'zod';

import { checkMandate } from '../mandate/index.js';

import { MandateRefusedError, MerchantError } from './errors.js';
import { settle } from './pay.js';
import { assertStockAvailable } from './stock.js';

import type { MerchantState } from './tools.js';

export const confirmOrderInput = z.object({
  confirmation_token: z
    .string()
    .describe(
      'The confirmation_token place_order returned with status awaiting_confirmation. It completes that one order, once.',
    ),
});

/**
 * The success body: the same two fields `place_order` answers with, so an
 * agent learns one success shape (D62, D88). `status` is a literal rather
 * than an enum because there is only one way out of this tool — a confirmation
 * that does not end in a payment ends in a refusal.
 */
export const confirmOrderOutput = z.object({
  status: z.literal('paid').describe('The rail has taken the money.'),
  order_id: z.string().describe('The order that was paid.'),
});

export interface ConfirmOrderArgs {
  readonly confirmation_token: string;
}

export type ConfirmOrderResult = z.infer<typeof confirmOrderOutput>;

/**
 * Completes a held order.
 *
 * @throws MerchantError `merchant_misconfigured`,
 * `confirmation_token_unknown`, `order_already_paid`,
 * `order_not_awaiting_confirmation`, `confirmation_token_spent`,
 * `order_expired`, `insufficient_stock`;
 * {@link MandateRefusedError} when the mandate no longer authorises the
 * purchase; and the rail errors from `pay.ts` when the payment does not go
 * through.
 */
export async function confirmOrder(
  state: MerchantState,
  args: ConfirmOrderArgs,
): Promise<ConfirmOrderResult> {
  const { policy } = state;
  if (policy === undefined) {
    throw new MerchantError(
      'merchant_misconfigured',
      'this merchant has no trusted mandate issuer configured, so it cannot complete orders',
    );
  }

  const held = state.orders.requireConfirmable(args.confirmation_token);
  assertStockAvailable(state.catalogue, held.items, 'the order was held');

  // The same check `place_order` made, against the clock and the ledger as
  // they are now. The signature half of it cannot fail — this is the
  // merchant's own stored copy, which no caller has touched — but the window,
  // the caps and the remaining budget can all have moved since the hold, and
  // those are the half worth re-asking (D83).
  const decision = checkMandate(policy, {
    mandate: held.mandate,
    agent: held.agent,
    merchant: held.merchant,
    amount_minor: held.amount_minor,
    currency: held.currency,
  });

  if (decision.outcome === 'refuse') {
    throw new MandateRefusedError(decision.refusals);
  }

  // `confirm_required` is the expected answer: the amount is above the
  // threshold, which is why there is a token in the first place. Treating it
  // as a refusal would make every held order unconfirmable.
  return settle({ rail: state.rail, orders: state.orders, policy }, held);
}
