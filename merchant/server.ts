/**
 * The merchant MCP server.
 *
 * Built on the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, 2.x,
 * implementing MCP revision 2026-07-28; ruled D09). Seven tools: the
 * catalogue, cart and quote surface, and the two that spend — `place_order`,
 * which pays outright when the mandate covers the amount, and `confirm_order`,
 * which pays a held order once a human presents its token.
 *
 * Products and quotes are advertised in the ACP vocabulary (see `acp.ts`), so
 * the `outputSchema` a client reads off `tools/list` is an ACP feed product
 * and an ACP checkout session.
 */

import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';

import {
  confirmOrder,
  confirmOrderInput,
  confirmOrderOutput,
} from './confirm-order.js';
import { toErrorBody } from './errors.js';
import { placeOrder, placeOrderInput, placeOrderOutput } from './place-order.js';
import {
  addToCart,
  addToCartInput,
  cartOutput,
  createCart,
  createCartInput,
  createMerchantState,
  getProduct,
  getProductInput,
  getProductOutput,
  getQuote,
  getQuoteInput,
  getQuoteOutput,
  listProducts,
  listProductsInput,
  listProductsOutput,
  type MerchantState,
} from './tools.js';

/** Name and version this server reports in `initialize`. */
export const SERVER_INFO = {
  name: 'agentic-checkout-reference-merchant',
  version: '0.1.0',
} as const;

/**
 * Runs a handler and shapes the outcome.
 *
 * Success carries the body twice: as JSON text, for a client that only reads
 * text, and as `structuredContent` matching the tool's advertised
 * `outputSchema`. A refusal carries the `{ error: { code, message } }` body
 * as JSON text with `isError: true` and no `structuredContent`, because that
 * body deliberately does not match the output schema.
 *
 * The handler may be synchronous or not: the two tools that call the rail are
 * async, and the SDK's `ToolCallback` accepts a promise either way, so one
 * wrapper serves all seven rather than two wrappers serving a split.
 */
async function run<T extends Record<string, unknown>>(
  produce: () => T | Promise<T>,
): Promise<CallToolResult> {
  try {
    const body = await produce();
    return {
      content: [{ type: 'text', text: JSON.stringify(body) }],
      structuredContent: body,
    };
  } catch (thrown) {
    return {
      content: [{ type: 'text', text: JSON.stringify(toErrorBody(thrown)) }],
      isError: true,
    };
  }
}

/**
 * Builds a merchant server over the given state.
 *
 * One state per server instance. The stdio entry calls this once per
 * connection, so two clients never share a cart store.
 */
export function createMerchantServer(
  state: MerchantState = createMerchantState(),
): McpServer {
  const server = new McpServer(SERVER_INFO, { capabilities: { tools: {} } });

  server.registerTool(
    'list_products',
    {
      title: 'List products',
      description:
    'List the merchant catalogue as Agentic Commerce Protocol feed products. Optionally filter by category or by a maximum price in GBP minor units (pence).',
      inputSchema: listProductsInput,
      outputSchema: listProductsOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => run(() => listProducts(state, args)),
  );

  server.registerTool(
    'get_product',
    {
      title: 'Get product',
      description:
        'Read one product by its catalogue id, as an Agentic Commerce Protocol feed product.',
      inputSchema: getProductInput,
      outputSchema: getProductOutput,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async (args) => run(() => getProduct(state, args)),
  );

  server.registerTool(
    'create_cart',
    {
      title: 'Create cart',
      description:
        'Create a cart and return its cart_id. Pass the cart_id on every later cart call: the server keeps no session.',
      inputSchema: createCartInput,
      outputSchema: cartOutput,
      annotations: { readOnlyHint: false },
    },
    async (args) => run(() => createCart(state, args)),
  );

  server.registerTool(
    'add_to_cart',
    {
      title: 'Add to cart',
      description:
        'Add units of a product to an existing cart and return the whole cart. Adding a product already in the cart merges the lines. Refuses "cart_closed" once an order has been placed from the cart.',
      inputSchema: addToCartInput,
      outputSchema: cartOutput,
      annotations: { readOnlyHint: false },
    },
    async (args) => run(() => addToCart(state, args)),
  );

  server.registerTool(
    'get_quote',
    {
      title: 'Get quote',
      description:
        'Price a cart and return a quote, shaped to the Agentic Commerce Protocol checkout session: line items, totals, status and an expiry. The quote is tied to the cart version it priced, so changing the cart makes it stale. Refuses an empty cart, and "cart_closed" for a cart an order has been placed from.',
      inputSchema: getQuoteInput,
      outputSchema: getQuoteOutput,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async (args) => run(() => getQuote(state, args)),
  );

  server.registerTool(
    'place_order',
    {
      title: 'Place order',
      description:
        'Place an order against a quote, presenting a signed spending mandate. The amount and currency checked against the mandate are read from the stored quote, never from this call. Returns status "paid" when the mandate covers the purchase, the rail having authorised and captured it, or "awaiting_confirmation" with a confirmation_token when the amount is above the mandate\u2019s human-confirm threshold, in which case confirm_order completes the payment. Refuses with code "mandate_refused" and a reasons list naming every failed check, or with "quote_expired", "quote_stale", "quote_already_ordered", "cart_closed" (another quote of the same cart was already ordered) or "insufficient_stock". A payment that does not go through refuses with "payment_declined", "capture_failed" or "rail_unavailable", and no order is paid and no budget consumed.',
      inputSchema: placeOrderInput,
      outputSchema: placeOrderOutput,
      // Not idempotent and not read-only: a second call with the same quote is
      // refused rather than answered again (D64).
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async (args) => run(() => placeOrder(state, args)),
  );

  server.registerTool(
    'confirm_order',
    {
      title: 'Confirm order',
      description:
        'Complete an order that place_order held for a human, by presenting its confirmation_token. Everything that can have changed since the hold is checked again — the stock, the hold\u2019s own fifteen-minute window, and the mandate against the clock and the budget as they are now — and then the rail is charged. Returns status "paid". The token completes one payment: a second call is refused with "order_already_paid". Also refuses "confirmation_token_unknown", "order_expired", "order_not_awaiting_confirmation", "confirmation_token_spent" (an earlier confirmation of this token was already sent to the rail, and its outcome is not known), "insufficient_stock", "mandate_refused", and the payment refusals "payment_declined", "capture_failed" and "rail_unavailable".',
      inputSchema: confirmOrderInput,
      outputSchema: confirmOrderOutput,
      // Not idempotent: the token is spent by the first call that reaches the
      // rail, and a second call is refused rather than answered again (D84).
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    async (args) => run(() => confirmOrder(state, args)),
  );

  return server;
}
