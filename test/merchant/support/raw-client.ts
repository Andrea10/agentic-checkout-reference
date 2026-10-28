/**
 * A hand-written JSON-RPC client for the merchant server.
 *
 * T06a may not add `@modelcontextprotocol/client` — that is T08's named
 * dependency — so the protocol tests drive the server with raw messages
 * instead (D20). This file holds the part two suites share: the in-memory
 * transport pair, the opening exchange, and the two readers that pull a tool
 * result apart. `test/merchant/protocol.test.ts` uses it for the catalogue,
 * cart and quote tools, `test/merchant/place-order.test.ts` for ordering.
 *
 * It is support code, not a suite: it holds no `it()` of its own.
 */

import { InMemoryTransport, type JSONRPCMessage } from '@modelcontextprotocol/server';
import { expect } from 'vitest';

import { createMerchantServer } from '../../../merchant/server.js';

import type { McpServer } from '@modelcontextprotocol/server';

/**
 * The protocol revision used for the opening exchange.
 *
 * `serveStdio` defaults to `legacy: 'serve'`, which serves a 2025-era
 * `initialize` from the same factory. This is one of the revisions the
 * installed SDK lists in `SUPPORTED_PROTOCOL_VERSIONS`. The modern
 * 2026-07-28 opening is T08's to exercise (D20).
 */
export const PROTOCOL_VERSION = '2025-11-25';

export const CLIENT_INFO = { name: 'merchant-raw-test-client', version: '0.1.0' };

/** A JSON-RPC response as the tests read it. */
export interface RpcResponse {
  readonly id: number;
  readonly result?: Record<string, unknown>;
  readonly error?: { code: number; message: string };
}

/** The `tools/call` result shape the merchant returns. */
export interface ToolCallResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Sends requests and resolves them by id. */
export interface RawClient {
  request(method: string, params?: Record<string, unknown>): Promise<RpcResponse>;
  notify(method: string, params?: Record<string, unknown>): void;
  close(): Promise<void>;
}

export function isResponseFor(message: unknown, id: number): message is RpcResponse {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { id?: unknown }).id === id
  );
}

/** Parses the single text block of a tool result as JSON. */
export function bodyOf(result: ToolCallResult): Record<string, unknown> {
  const first = result.content[0];
  expect(first?.type).toBe('text');
  return JSON.parse(first?.text ?? '{}') as Record<string, unknown>;
}

export function asToolResult(response: RpcResponse): ToolCallResult {
  expect(response.error).toBeUndefined();
  return response.result as unknown as ToolCallResult;
}

/**
 * Drives a server over the SDK's linked in-memory transport pair.
 *
 * The server comes from a factory so a suite can configure the state it needs
 * — a merchant that trusts a test issuer's key, sequential ids, a frozen
 * clock — instead of the default.
 */
export async function inMemoryClient(
  makeServer: () => McpServer = () => createMerchantServer(),
): Promise<RawClient> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const waiting = new Map<number, (response: RpcResponse) => void>();
  let nextId = 0;

  clientTransport.onmessage = (message: JSONRPCMessage): void => {
    const id = (message as { id?: unknown }).id;
    if (typeof id === 'number') {
      waiting.get(id)?.(message as unknown as RpcResponse);
      waiting.delete(id);
    }
  };

  await clientTransport.start();
  await makeServer().connect(serverTransport);

  return {
    async request(method, params = {}) {
      nextId += 1;
      const id = nextId;
      const settled = new Promise<RpcResponse>((resolve, reject) => {
        waiting.set(id, resolve);
        setTimeout(() => {
          reject(new Error(`timed out waiting for ${method}`));
        }, 5_000).unref();
      });
      await clientTransport.send({ jsonrpc: '2.0', id, method, params });
      return settled;
    },
    notify(method, params = {}) {
      void clientTransport.send({ jsonrpc: '2.0', method, params });
    },
    async close() {
      await clientTransport.close();
    },
  };
}

/** Runs the opening exchange and returns the `initialize` result. */
export async function handshake(client: RawClient): Promise<Record<string, unknown>> {
  const response = await client.request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT_INFO,
  });
  expect(response.error).toBeUndefined();
  client.notify('notifications/initialized');
  return response.result ?? {};
}
