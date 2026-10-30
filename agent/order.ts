/**
 * The `place_order` step: the only place the agent presents its mandate.
 *
 * It is one function over the {@link ToolCaller} seam, in its own file (D76).
 * Every other step reads a catalogue or moves a cart; this one presents a
 * signed mandate and commits to a price. Code that can spend should be short
 * enough to read in one sitting and reachable from one place.
 *
 * It now runs against the real tool: `merchant/place-order.ts` shipped in
 * T07a, and `test/agent/order.test.ts` drives this function against it as
 * well as against a stub. An order the mandate covers outright is *paid*
 * inside this one call: since T07b the merchant authorises, captures and
 * records it before it answers, and its body says `paid` (D88). Only an order
 * held for a human waits for `confirm_order`, which this agent never calls
 * (D74).
 *
 * ## The three answers
 *
 * `place_order` has three, and the type says so:
 *
 * - **approved** — the mandate covered it, and the merchant took the money in
 *   the same call. The order is returned. `approved` is the agent's own
 *   outcome word, not the merchant's: the merchant's body says `paid`, and
 *   that word is carried through on the order's `status` (D88).
 * - **awaiting_confirmation** — the amount is above the mandate's
 *   `human_confirm_above_minor`, so the merchant is holding the order and has
 *   handed back a `confirmation_token`. **The agent stops here** (D74). It
 *   does not call `confirm_order`, it does not re-try under a different
 *   quote, and it does not decide that the amount is small enough after all.
 *   The whole point of the threshold is that a human says yes; an agent that
 *   confirms its own order has removed the control it was built to respect.
 *   The token is returned to whoever started the agent, and the decision is
 *   theirs.
 * - **refused** — the merchant said no, for any reason: every `isError`
 *   answer becomes a refusal (D73). From `place_order` that includes
 *   `mandate_refused`; `quote_not_found`, `quote_expired`, `quote_stale` and
 *   `quote_already_ordered`; `product_not_found` and `insufficient_stock`;
 *   `payment_declined`, `capture_failed` and `rail_unavailable`;
 *   `merchant_misconfigured` when the merchant has no trusted issuer (D60);
 *   and `internal_error`. A body that is not the merchant's envelope arrives
 *   as `tool_error` (D78). Only `mandate_refused` carries a list of reasons
 *   — every failed mandate check (D66) — so the caller reads them all at
 *   once rather than the first.
 */

import * as z from 'zod';

import { parseBody } from './wire.js';

import type { ToolCaller } from './client.js';
import type { AgentIdentity } from './identity.js';
import type { MerchantRefusal } from './refusal.js';

/** The name of the merchant tool this step calls. */
export const PLACE_ORDER_TOOL = 'place_order';

/** The status the merchant uses when it is holding an order for a human (D74). */
export const AWAITING_CONFIRMATION = 'awaiting_confirmation';

/**
 * The agent's outcome word when the mandate covered the order. Not a
 * merchant status: the merchant answers `paid` there, and `approved` left the
 * wire (D88).
 */
export const APPROVED = 'approved';

/**
 * An order the merchant accepted.
 *
 * `order_id` and `status` are what the shipped `placeOrderOutput` carries
 * besides the confirmation token. T07b added no field to the paid body (D88
 * keeps it at D62's two); the whole body travels with them anyway, so a
 * field a merchant adds reaches the caller without this file changing (D77).
 */
export interface PlacedOrder {
  readonly order_id: string;
  readonly status: string;
  /** The merchant's whole order object, unread. */
  readonly body: Record<string, unknown>;
}

/** An order the merchant is holding until a human says yes (D74). */
export interface HeldOrder {
  readonly order_id: string;
  readonly confirmation_token: string;
  readonly body: Record<string, unknown>;
}

/** What `place_order` came back with. */
export type OrderOutcome =
  | { readonly status: 'approved'; readonly order: PlacedOrder }
  | { readonly status: 'awaiting_confirmation'; readonly held: HeldOrder }
  | { readonly status: 'refused'; readonly refusal: MerchantRefusal };

/**
 * The held-order body: a status, a token and an order id.
 *
 * Checked before the approved shape, because an `awaiting_confirmation` body
 * also carries an `order_id` and would otherwise read as an approved order
 * whose status happened to say otherwise.
 */
const heldSchema = z.object({
  status: z.literal(AWAITING_CONFIRMATION),
  confirmation_token: z.string(),
  order_id: z.string(),
});

/**
 * The approved-order body.
 *
 * `status` is read as a plain string rather than a literal, so the merchant's
 * own word for a completed order arrives on the order as it was sent. Since
 * T07b that word is `paid` (D88), and this schema did not have to change when
 * it stopped being `approved`.
 */
const approvedSchema = z.object({
  order_id: z.string(),
  status: z.string(),
});

/**
 * Calls `place_order` with the quote, the agent id and the mandate.
 *
 * The mandate and the agent id come from the injected {@link AgentIdentity}
 * (D72) and are put on the wire here, in the one call that needs them.
 *
 * @throws if the connection breaks, if the merchant has no `place_order`
 * tool, or if it answers with a body that is neither of the two shapes. None
 * of those is a decision the merchant made about this purchase, so none of
 * them is a refusal (D73).
 */
export async function placeOrder(
  caller: ToolCaller,
  identity: AgentIdentity,
  quoteId: string,
): Promise<OrderOutcome> {
  const outcome = await caller.callTool(PLACE_ORDER_TOOL, {
    quote_id: quoteId,
    agent: identity.agent,
    mandate: identity.mandate,
  });

  if (!outcome.ok) {
    return { status: 'refused', refusal: outcome.refusal };
  }

  const body = outcome.body;

  const held = heldSchema.safeParse(body);
  if (held.success) {
    return {
      status: AWAITING_CONFIRMATION,
      held: {
        order_id: held.data.order_id,
        confirmation_token: held.data.confirmation_token,
        body,
      },
    };
  }

  const approved = parseBody(approvedSchema, body, PLACE_ORDER_TOOL);
  return {
    status: 'approved',
    order: { order_id: approved.order_id, status: approved.status, body },
  };
}
