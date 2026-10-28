/**
 * The merchant MCP server.
 *
 * Built on the MCP TypeScript SDK v2 (`@modelcontextprotocol/server`, 2.x,
 * implementing MCP revision 2026-07-28; ruled D09). The five tools here are
 * the catalogue, cart and quote surface. `place_order` and `confirm_order`
 * are T07.
 *
 * Products and quotes are advertised in the ACP vocabulary (see `acp.ts`), so
 * the `outputSchema` a client reads off `tools/list` is an ACP feed product
 * and an ACP checkout session.
 */

import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';

import { toErrorBody } from './errors.js';
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
 */
function run<T extends Record<string, unknown>>(produce: () => T): CallToolResult {
  try {
    const body = produce();
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
    (args) => run(() => listProducts(state, args)),
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
    (args) => run(() => getProduct(state, args)),
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
    (args) => run(() => createCart(state, args)),
  );

  server.registerTool(
    'add_to_cart',
    {
      title: 'Add to cart',
      description:
        'Add units of a product to an existing cart and return the whole cart. Adding a product already in the cart merges the lines.',
      inputSchema: addToCartInput,
      outputSchema: cartOutput,
      annotations: { readOnlyHint: false },
    },
    (args) => run(() => addToCart(state, args)),
  );

  server.registerTool(
    'get_quote',
    {
      title: 'Get quote',
      description:
        'Price a cart and return a quote, shaped to the Agentic Commerce Protocol checkout session: line items, totals, status and an expiry. The quote is tied to the cart version it priced, so changing the cart makes it stale. Refuses an empty cart.',
      inputSchema: getQuoteInput,
      outputSchema: getQuoteOutput,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    (args) => run(() => getQuote(state, args)),
  );

  return server;
}
