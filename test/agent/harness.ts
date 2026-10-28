/**
 * Test plumbing shared by the agent suites.
 *
 * Two ways to reach a server, and one way to put two of them behind a single
 * {@link ToolCaller}:
 *
 * - {@link connectInMemory} links the v2 client to an `McpServer` through the
 *   SDK's in-memory transport pair. No process, so it is fast enough to use
 *   in every test.
 * - {@link spawnMerchant} runs the real `merchant/stdio.ts` as a child
 *   process over a pipe. That is the one that proves the opening exchange,
 *   so `protocol.test.ts` uses it.
 * - {@link routeTools} sends `place_order` to one connection and everything
 *   else to another, which is how the full plan is run with only the one
 *   missing tool stubbed.
 */

import { InMemoryTransport, type McpServer } from '@modelcontextprotocol/server';
import { fileURLToPath } from 'node:url';

import { connect, connectStdio, type MerchantConnection, type ToolCaller, type ToolOutcome } from '../../agent/index.js';

/** `merchant/stdio.ts`, as a path this machine can spawn. */
const MERCHANT_ENTRY = fileURLToPath(new URL('../../merchant/stdio.ts', import.meta.url));

/** The `tsx` CLI, so a `.ts` entry point can be run without a build step. */
const TSX_CLI = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));

/** Connects the agent's client to a server in this process. */
export async function connectInMemory(server: McpServer): Promise<MerchantConnection> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  return connect(clientTransport);
}

/** Spawns the real merchant over stdio and connects the agent's client to it. */
export async function spawnMerchant(): Promise<MerchantConnection> {
  return connectStdio({ command: process.execPath, args: [TSX_CLI, MERCHANT_ENTRY] });
}

/**
 * One caller over two connections.
 *
 * `place_order` goes to `orders`, every other tool to `merchant`. The agent
 * cannot tell the difference, which is the point: the plan runs end to end
 * against the real merchant with exactly one tool supplied by the stub.
 */
export function routeTools(merchant: ToolCaller, orders: ToolCaller): ToolCaller {
  return {
    callTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
      return name === 'place_order' ? orders.callTool(name, args) : merchant.callTool(name, args);
    },
  };
}
