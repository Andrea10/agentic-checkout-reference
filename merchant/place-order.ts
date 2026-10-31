/**
 * `place_order`: the money-out gate.
 *
 * Everything before this tool is shopping. This is the one call where the
 * merchant has to decide whether software is allowed to spend a person's
 * money, so the order of what it does matters more than anything else in the
 * file:
 *
 * 1. **Is this merchant able to take orders at all?** No trusted issuer key,
 *    no order (D60).
 * 2. **Is the quote still good?** `quote_not_found`, `quote_expired`,
 *    `quote_stale` come from the quote store (D38, D39). The amount and the
 *    currency the mandate is checked against are read from the *stored* quote
 *    and never from the caller: the agent is the party the mandate exists to
 *    bound, so a price it hands back is an input to be distrusted (D39).
 * 3. **Has this quote already been ordered, or its cart?** A quote is single
 *    use (D64), and an order closes its cart, so another quote of that cart
 *    is refused too (D130).
 * 4. **Is the stock still there?** Nothing was reserved when the cart was
 *    filled (D17), so it is re-checked here against the catalogue as it is
 *    now.
 * 5. **Does the mandate authorise it?** `checkMandate()` last, so that the
 *    audit log records a decision the merchant actually acted on (D65).
 * 6. **Pay.** An order the mandate covers goes straight to the rail —
 *    authorise, capture, then `recordSpend()` — and comes back `paid` (D88).
 *    An order above the threshold is held instead, and `confirm_order` does
 *    that same payment step when a human presents the token. Either way the
 *    cart is closed as the order is created (D130).
 *
 * Nothing before step 6 consumes mandate budget, which is why a refused order
 * and a declined payment both leave the ledger exactly as it was (D45).
 */

import * as z from 'zod';

import { checkMandate } from '../mandate/index.js';

import { MandateRefusedError, MerchantError } from './errors.js';
import { mandateWireSchema } from './mandate-wire.js';
import { type OrderFacts, type OrderLine } from './order.js';
import { settle } from './pay.js';
import { totalOf, type Quote } from './quote.js';
import { assertStockAvailable } from './stock.js';

import type { Mandate } from '../mandate/index.js';
import type { MerchantState } from './tools.js';

/**
 * The two statuses `place_order` can answer with.
 *
 * `approved` is not among them: it is a state an order passes through while
 * the rail is being called, and never a body the merchant sends (D88). The
 * stored statuses are {@link ORDER_STATUSES} in `order.ts`.
 */
export const PLACE_ORDER_STATUSES = ['paid', 'awaiting_confirmation'] as const;

export const placeOrderInput = z.object({
  quote_id: z
    .string()
    .describe('Quote id returned by get_quote. The cart is found through it.'),
  agent: z
    .string()
    .describe(
      'The agent placing the order. Must match the agent the mandate names. Not authenticated: the merchant compares this with the mandate but cannot prove the caller is that agent (D61).',
    ),
  mandate: mandateWireSchema.describe(
    'The signed spending mandate authorising this purchase.',
  ),
});

/**
 * The success body: a status word and an order id, plus the confirmation token
 * when there is one (D62).
 *
 * One object with an optional token rather than a union of two bodies, because
 * a tool's `outputSchema` is advertised as JSON Schema and has to describe an
 * object. The union lives on the stored {@link Order} instead, where the type
 * system can enforce it.
 */
export const placeOrderOutput = z.object({
  status: z
    .enum(PLACE_ORDER_STATUSES)
    .describe(
      'paid: the mandate covered it and the rail has taken the money. awaiting_confirmation: the amount is above the mandate’s human-confirm threshold, so the order is held and a human must present the token to confirm_order.',
    ),
  order_id: z.string().describe('The order placed.'),
  confirmation_token: z
    .string()
    .optional()
    .describe('Present only when the status is awaiting_confirmation.'),
});

/**
 * The arguments, as the handler wants them.
 *
 * Written out rather than inferred from {@link placeOrderInput}, so that
 * `mandate` is the mandate layer's own {@link Mandate} type and not a zod
 * shape with an index signature on it. The registration in `server.ts` is
 * where the two meet: it fails to compile if the schema stops describing a
 * mandate, which is the check `asMandate` used to make by hand.
 */
export interface PlaceOrderArgs {
  readonly quote_id: string;
  readonly agent: string;
  readonly mandate: Mandate;
}

export type PlaceOrderResult = z.infer<typeof placeOrderOutput>;

/**
 * Places an order against a quote, under a mandate.
 *
 * @throws MerchantError for anything wrong with the merchant, the quote or the
 * stock, {@link MandateRefusedError} — which is a `MerchantError` carrying
 * every failed policy check — when the mandate does not authorise the
 * purchase, and the rail errors from `pay.ts` when the payment does not go
 * through.
 */
export async function placeOrder(
  state: MerchantState,
  args: PlaceOrderArgs,
): Promise<PlaceOrderResult> {
  const { policy } = state;
  if (policy === undefined) {
    throw new MerchantError(
      'merchant_misconfigured',
      'this merchant has no trusted mandate issuer configured, so it cannot take orders',
    );
  }

  const quote = state.quotes.current(args.quote_id);
  state.orders.assertQuoteUnused(quote.id);
  // After the quote check, so a replayed quote still reads
  // `quote_already_ordered` (D127); a second quote of an ordered cart is
  // refused here (D130).
  state.carts.assertOpen(quote.cart_id);
  assertStockAvailable(state.catalogue, stockLinesOf(quote), 'the quote was made');

  const facts: OrderFacts = {
    quote_id: quote.id,
    cart_id: quote.cart_id,
    cart_version: quote.cart_version,
    items: linesOf(quote),
    amount_minor: amountOf(quote),
    currency: quote.currency,
    agent: args.agent,
    merchant: state.merchant_id,
    mandate_id: args.mandate.mandate_id,
  };

  const decision = checkMandate(policy, {
    mandate: args.mandate,
    agent: facts.agent,
    merchant: facts.merchant,
    amount_minor: facts.amount_minor,
    currency: facts.currency,
  });

  if (decision.outcome === 'refuse') {
    throw new MandateRefusedError(decision.refusals);
  }

  if (decision.outcome === 'confirm_required') {
    const held = state.orders.holdForConfirmation(facts, {
      human_confirm_above_minor: decision.human_confirm_above_minor,
      mandate: args.mandate,
    });
    state.carts.close(quote.cart_id, held.order_id);
    return {
      status: held.status,
      order_id: held.order_id,
      confirmation_token: held.confirmation_token,
    };
  }

  const approved = state.orders.approve(facts);
  state.carts.close(quote.cart_id, approved.order_id);
  return settle({ rail: state.rail, orders: state.orders, policy }, approved);
}

/** What the stock check needs from a quote: a product and a quantity. */
function stockLinesOf(quote: Quote): { product_id: string; quantity: number }[] {
  return quote.line_items.map((line) => ({
    product_id: line.product_id,
    quantity: line.quantity,
  }));
}

/** The quote's lines, in the merchant's internal vocabulary. */
function linesOf(quote: Quote): OrderLine[] {
  return quote.line_items.map((line) => ({
    product_id: line.product_id,
    name: line.name,
    quantity: line.quantity,
    unit_price_minor: line.unit_amount,
    line_total_minor: line.unit_amount * line.quantity,
  }));
}

/**
 * The amount the mandate is checked against: the quote's `total`.
 *
 * Every quote this merchant issues carries one (D35), so a quote without one
 * is a broken merchant rather than a refusal an agent could act on — hence a
 * plain `Error`, which the MCP layer reports as `internal_error`.
 */
function amountOf(quote: Quote): number {
  const amount = totalOf(quote.totals, 'total');
  if (amount === undefined) {
    throw new Error(`quote ${quote.id} has no total to charge`);
  }
  return amount;
}
