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
 * 3. **Has this quote already been ordered?** A quote is single use (D64).
 * 4. **Is the stock still there?** Nothing was reserved when the cart was
 *    filled (D17), so it is re-checked here against the catalogue as it is
 *    now.
 * 5. **Does the mandate authorise it?** `checkMandate()` last, so that the
 *    audit log records a decision the merchant actually acted on (D65).
 *
 * What this tool does *not* do is pay. An approved order is approved, not
 * paid: the rail call and `recordSpend()` belong to `confirm_order` and the
 * paid path in T07b. Nothing here consumes mandate budget, which is why a
 * refused order leaves the ledger exactly as it was (D45).
 */

import * as z from 'zod';

import { checkMandate } from '../mandate/index.js';

import { findProduct, type Product } from './catalogue.js';
import { MandateRefusedError, MerchantError } from './errors.js';
import { mandateWireSchema } from './mandate-wire.js';
import { ORDER_STATUSES, type OrderFacts, type OrderLine } from './order.js';
import { totalOf, type Quote } from './quote.js';

import type { Mandate } from '../mandate/index.js';
import type { MerchantState } from './tools.js';

export const placeOrderInput = z.object({
  quote_id: z
    .string()
    .describe('Quote id returned by get_quote. The cart is found through it.'),
  agent: z
    .string()
    .describe('The agent placing the order. Must match the mandate’s agent.'),
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
    .enum(ORDER_STATUSES)
    .describe(
      'approved: the mandate covered it and the order will be paid by confirm_order. awaiting_confirmation: the amount is above the mandate’s human-confirm threshold and a human must present the token.',
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
 * stock, and {@link MandateRefusedError} — which is a `MerchantError` carrying
 * every failed policy check — when the mandate does not authorise the
 * purchase.
 */
export function placeOrder(state: MerchantState, args: PlaceOrderArgs): PlaceOrderResult {
  const { policy } = state;
  if (policy === undefined) {
    throw new MerchantError(
      'merchant_misconfigured',
      'this merchant has no trusted mandate issuer configured, so it cannot take orders',
    );
  }

  const quote = state.quotes.current(args.quote_id);
  state.orders.assertQuoteUnused(quote.id);
  assertStockAvailable(state.catalogue, quote);

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
    const held = state.orders.holdForConfirmation(
      facts,
      decision.human_confirm_above_minor,
    );
    return {
      status: held.status,
      order_id: held.order_id,
      confirmation_token: held.confirmation_token,
    };
  }

  const approved = state.orders.approve(facts);
  return { status: 'approved', order_id: approved.order_id };
}

/**
 * Re-checks every line against the catalogue as it is now.
 *
 * D17 decided that stock is checked and never reserved, and named this as the
 * consequence: a cart can pass the check in `add_to_cart` and still be
 * unfulfillable by the time the order is placed. Every short line is named in
 * one refusal, for the same reason the policy reports every failed check at
 * once (D42): the agent can act on the whole answer.
 */
function assertStockAvailable(catalogue: readonly Product[], quote: Quote): void {
  const short: string[] = [];

  for (const line of quote.line_items) {
    const product = findProduct(catalogue, line.product_id);
    if (product === undefined) {
      throw new MerchantError(
        'product_not_found',
        `the quote names ${line.product_id}, which is no longer in the catalogue`,
      );
    }
    if (product.stock < line.quantity) {
      short.push(
        `${line.product_id} (${String(product.stock)} left, ${String(line.quantity)} ordered)`,
      );
    }
  }

  if (short.length > 0) {
    throw new MerchantError(
      'insufficient_stock',
      `stock has gone since the quote was made: ${short.join('; ')}`,
    );
  }
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
