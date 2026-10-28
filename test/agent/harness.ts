/**
 * Test plumbing shared by the agent suites.
 *
 * Three ways to reach a server, and one way to put two of them behind a
 * single {@link ToolCaller}:
 *
 * - {@link connectInMemory} links the v2 client to an `McpServer` through the
 *   SDK's in-memory transport pair. No process, so it is fast enough to use
 *   in every test.
 * - {@link spawnMerchant} runs the real `merchant/stdio.ts` as a child
 *   process over a pipe. That is the one that proves the opening exchange,
 *   so `protocol.test.ts` uses it.
 * - {@link deterministicMerchant} builds the real merchant server with
 *   sequential ids and a mandate policy that trusts the test key, so a suite
 *   can name `cart_000001` and drive the real `place_order`.
 * - {@link routeTools} sends `place_order` to one connection and everything
 *   else to another, which is how one suite can hold the merchant's five
 *   shopping tools next to a stub order tool.
 *
 * Every call into `createMerchantState` goes through
 * {@link deterministicMerchant}: T07a turned its positional arguments into an
 * options object (D60), and one call site is one place to follow next time.
 */

import { InMemoryTransport, type McpServer } from '@modelcontextprotocol/server';
import { fileURLToPath } from 'node:url';

import { connect, connectStdio, type MerchantConnection, type ToolCaller, type ToolOutcome } from '../../agent/index.js';
import { createMandatePolicy, fixedClock, type MandatePolicy } from '../../mandate/index.js';
import {
  CATALOGUE,
  CartStore,
  OrderStore,
  QuoteStore,
  createMerchantServer,
  createMerchantState,
  sequentialCartIds,
  sequentialConfirmationTokens,
  sequentialOrderIds,
  sequentialQuoteIds,
} from '../../merchant/index.js';
import { TEST_MERCHANT, TEST_PUBLIC_KEY } from './identity-fixture.js';

import type { Product } from '../../merchant/index.js';

/** `merchant/stdio.ts`, as a path this machine can spawn. */
const MERCHANT_ENTRY = fileURLToPath(new URL('../../merchant/stdio.ts', import.meta.url));

/** The `tsx` CLI, so a `.ts` entry point can be run without a build step. */
const TSX_CLI = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));

/**
 * The instant the merchant's policy reads as "now".
 *
 * Inside the test mandate's window (`2026-10-25` to `2026-10-30`), frozen so
 * that a run on any day produces the same decision (D49, D79).
 */
export const MERCHANT_NOW = '2026-10-28T09:00:00.000Z';

/**
 * The seven tools the merchant advertises on main, sorted.
 *
 * `confirm_order` arrived with T07b, which also made `place_order` pay
 * outright on the direct path (D88). The agent calls neither: it stops on
 * `awaiting_confirmation` and hands the token back to whoever started it
 * (D74), so this list is the merchant's surface and not the agent's reach.
 */
export const MERCHANT_TOOL_NAMES = [
  'add_to_cart',
  'confirm_order',
  'create_cart',
  'get_product',
  'get_quote',
  'list_products',
  'place_order',
];

/** How to vary the merchant a suite builds. */
export interface MerchantOptions {
  /** A different catalogue, for a stock or short-catalogue test. */
  readonly catalogue?: readonly Product[];
  /**
   * The mandate policy. Defaults to one trusting {@link TEST_PUBLIC_KEY} at
   * {@link MERCHANT_NOW}. Pass `null` for a merchant with no issuer
   * configured, which refuses to take orders at all (D60).
   */
  readonly policy?: MandatePolicy | null;
}

/** A merchant server, with the pieces a test needs to look inside. */
export interface TestMerchant {
  readonly server: McpServer;
  readonly policy: MandatePolicy | undefined;
  readonly orders: OrderStore;
}

/** The policy the merchant runs with unless a test says otherwise. */
export function testPolicy(): MandatePolicy {
  return createMandatePolicy({
    publicKey: TEST_PUBLIC_KEY,
    clock: fixedClock(MERCHANT_NOW),
  });
}

/**
 * The real merchant server, with every id sequential.
 *
 * Carts are `cart_000001`, quotes `quote_000001`, orders `order_000001` and
 * confirmation tokens come from `sequentialConfirmationTokens()`, so a test
 * can assert the id rather than a pattern. `merchant_id` is
 * {@link TEST_MERCHANT}, which is the merchant the test mandate names.
 */
export function deterministicMerchant(options: MerchantOptions = {}): TestMerchant {
  const catalogue = options.catalogue ?? CATALOGUE;
  const carts = new CartStore(catalogue, { nextId: sequentialCartIds() });
  const quotes = new QuoteStore(catalogue, carts, { nextId: sequentialQuoteIds() });
  const orders = new OrderStore({
    nextId: sequentialOrderIds(),
    nextToken: sequentialConfirmationTokens(),
  });
  const policy = options.policy === null ? undefined : (options.policy ?? testPolicy());

  return {
    server: createMerchantServer(
      createMerchantState({
        catalogue,
        carts,
        quotes,
        orders,
        merchant_id: TEST_MERCHANT,
        policy,
      }),
    ),
    policy,
    orders,
  };
}

/** Connects the agent's client to a server in this process. */
export async function connectInMemory(server: McpServer): Promise<MerchantConnection> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  return connect(clientTransport);
}

/** Builds {@link deterministicMerchant} and connects to it in one step. */
export async function connectMerchant(
  options: MerchantOptions = {},
): Promise<MerchantConnection & { readonly merchant: TestMerchant }> {
  const merchant = deterministicMerchant(options);
  const connection = await connectInMemory(merchant.server);
  return Object.assign(connection, { merchant });
}

/** Spawns the real merchant over stdio and connects the agent's client to it. */
export async function spawnMerchant(): Promise<MerchantConnection> {
  return connectStdio({ command: process.execPath, args: [TSX_CLI, MERCHANT_ENTRY] });
}

/**
 * One caller over two connections.
 *
 * `place_order` goes to `orders`, every other tool to `merchant`. Now that
 * the real tool has shipped this is no longer how the plan is normally run —
 * `flow.test.ts` drives the merchant's own `place_order` — but it is still
 * what lets one suite hold the real shopping tools next to an order tool that
 * answers whatever a test needs.
 */
export function routeTools(merchant: ToolCaller, orders: ToolCaller): ToolCaller {
  return {
    callTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
      return name === 'place_order' ? orders.callTool(name, args) : merchant.callTool(name, args);
    },
  };
}
