/**
 * Protocol-level tests.
 *
 * T06a may not add `@modelcontextprotocol/client` (that is T08's dependency),
 * so both suites below drive the server with raw JSON-RPC messages written by
 * hand: once over the SDK's in-memory transport pair, and once over a real
 * spawned `merchant/stdio.ts` process. The second is the one that proves the
 * stdio entry point works; the first is fast enough to assert against every
 * tool.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { InMemoryTransport, type JSONRPCMessage } from '@modelcontextprotocol/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMerchantServer, SERVER_INFO } from '../../merchant/server.js';

/**
 * The protocol revision used for the opening exchange.
 *
 * `serveStdio` defaults to `legacy: 'serve'`, which serves a 2025-era
 * `initialize` from the same factory. This is one of the revisions the
 * installed SDK lists in `SUPPORTED_PROTOCOL_VERSIONS`.
 */
const PROTOCOL_VERSION = '2025-11-25';

const CLIENT_INFO = { name: 'merchant-raw-test-client', version: '0.1.0' };

/** The tools the merchant advertises, in sorted order. */
const TOOL_NAMES = [
  'add_to_cart',
  'create_cart',
  'get_product',
  'get_quote',
  'list_products',
];

/** A JSON-RPC response as the tests read it. */
interface RpcResponse {
  readonly id: number;
  readonly result?: Record<string, unknown>;
  readonly error?: { code: number; message: string };
}

/** The `tools/call` result shape the merchant returns. */
interface ToolCallResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Sends requests and resolves them by id. */
interface RawClient {
  request(method: string, params?: Record<string, unknown>): Promise<RpcResponse>;
  notify(method: string, params?: Record<string, unknown>): void;
  close(): Promise<void>;
}

function isResponseFor(message: unknown, id: number): message is RpcResponse {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { id?: unknown }).id === id
  );
}

/** Parses the single text block of a tool result as JSON. */
function bodyOf(result: ToolCallResult): Record<string, unknown> {
  const first = result.content[0];
  expect(first?.type).toBe('text');
  return JSON.parse(first?.text ?? '{}') as Record<string, unknown>;
}

function asToolResult(response: RpcResponse): ToolCallResult {
  expect(response.error).toBeUndefined();
  return response.result as unknown as ToolCallResult;
}

/** Drives a server over the SDK's linked in-memory transport pair. */
async function inMemoryClient(): Promise<RawClient> {
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
  await createMerchantServer().connect(serverTransport);

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
async function handshake(client: RawClient): Promise<Record<string, unknown>> {
  const response = await client.request('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: CLIENT_INFO,
  });
  expect(response.error).toBeUndefined();
  client.notify('notifications/initialized');
  return response.result ?? {};
}

describe('merchant server over raw JSON-RPC (in-memory transport)', () => {
  let client: RawClient;

  beforeAll(async () => {
    client = await inMemoryClient();
    await handshake(client);
  });

  afterAll(async () => {
    await client.close();
  });

  it('reports its name and version on initialize', async () => {
    const fresh = await inMemoryClient();
    const result = await handshake(fresh);

    expect(result['serverInfo']).toEqual(SERVER_INFO);
    expect(result['protocolVersion']).toBe(PROTOCOL_VERSION);
    await fresh.close();
  });

  it('advertises exactly the five catalogue, cart and quote tools', async () => {
    const response = await client.request('tools/list');
    const tools = (response.result?.['tools'] ?? []) as { name: string }[];

    expect(tools.map((tool) => tool.name).sort()).toEqual(TOOL_NAMES);
  });

  it('advertises an input and an output schema for every tool', async () => {
    const response = await client.request('tools/list');
    const tools = (response.result?.['tools'] ?? []) as Record<string, unknown>[];

    for (const tool of tools) {
      expect(tool['inputSchema']).toBeDefined();
      expect(tool['outputSchema']).toBeDefined();
      expect(tool['description']).toBeTruthy();
    }
  });

  it('lists products through tools/call, in the ACP feed shape', async () => {
    const result = asToolResult(
      await client.request('tools/call', { name: 'list_products', arguments: {} }),
    );
    const body = bodyOf(result) as {
      products: { id: string; variants: { price: { amount: number; currency: string } }[] }[];
    };

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(body);
    expect(Object.keys(body)).toEqual(['products']);
    expect(body.products.length).toBeGreaterThanOrEqual(8);
    expect(body.products[0]?.variants[0]?.price.currency).toBe('GBP');
  });

  it('gets one product through tools/call, priced on the ACP variant', async () => {
    const result = asToolResult(
      await client.request('tools/call', {
        name: 'get_product',
        arguments: { product_id: 'prod_aurora_desk_lamp' },
      }),
    );
    const body = bodyOf(result) as {
      product: { title: string; variants: { price: { amount: number } }[] };
    };

    expect(body.product.title).toBe('Aurora Desk Lamp');
    expect(body.product.variants[0]?.price.amount).toBe(4250);
  });

  it('carries the cart across calls by cart_id alone', async () => {
    const created = asToolResult(
      await client.request('tools/call', { name: 'create_cart', arguments: {} }),
    );
    const { cart } = bodyOf(created) as { cart: { cart_id: string } };

    const added = asToolResult(
      await client.request('tools/call', {
        name: 'add_to_cart',
        arguments: {
          cart_id: cart.cart_id,
          product_id: 'prod_fernlow_watering_can',
          quantity: 2,
        },
      }),
    );
    const body = bodyOf(added) as {
      cart: { cart_id: string; subtotal_minor: number; items: unknown[] };
    };

    expect(body.cart.cart_id).toBe(cart.cart_id);
    expect(body.cart.items).toHaveLength(1);
    expect(body.cart.subtotal_minor).toBe(4798);
  });

  it('quotes a cart through tools/call', async () => {
    const created = asToolResult(
      await client.request('tools/call', {
        name: 'create_cart',
        arguments: { items: [{ product_id: 'prod_cobbleford_mug', quantity: 2 }] },
      }),
    );
    const { cart } = bodyOf(created) as { cart: { cart_id: string } };

    const quoted = asToolResult(
      await client.request('tools/call', {
        name: 'get_quote',
        arguments: { cart_id: cart.cart_id },
      }),
    );
    const { quote } = bodyOf(quoted) as {
      quote: {
        id: string;
        status: string;
        currency: string;
        line_items: { product_id: string; totals: { type: string; amount: number }[] }[];
        totals: { type: string; amount: number }[];
        expires_at: string;
        cart_id: string;
        cart_version: number;
      };
    };

    expect(quoted.isError).toBeFalsy();
    expect(quoted.structuredContent).toEqual(bodyOf(quoted));
    expect(quote.id).toMatch(/^quote_/);
    expect(quote.status).toBe('ready_for_payment');
    expect(quote.currency).toBe('GBP');
    expect(quote.cart_id).toBe(cart.cart_id);
    expect(quote.cart_version).toBe(2);
    expect(quote.line_items).toHaveLength(1);
    expect(quote.line_items[0]?.product_id).toBe('prod_cobbleford_mug');
    expect(quote.totals.find((entry) => entry.type === 'total')?.amount).toBe(2900);
    expect(Date.parse(quote.expires_at)).toBeGreaterThan(Date.now());
  });

  it('refuses a quote for an empty cart over the wire', async () => {
    const created = asToolResult(
      await client.request('tools/call', { name: 'create_cart', arguments: {} }),
    );
    const { cart } = bodyOf(created) as { cart: { cart_id: string } };

    const result = asToolResult(
      await client.request('tools/call', {
        name: 'get_quote',
        arguments: { cart_id: cart.cart_id },
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect((bodyOf(result) as { error: { code: string } }).error.code).toBe('cart_empty');
  });

  it('advertises the ACP checkout vocabulary in get_quote\u2019s output schema', async () => {
    const response = await client.request('tools/list');
    const tools = (response.result?.['tools'] ?? []) as {
      name: string;
      outputSchema?: unknown;
    }[];
    const quoteTool = tools.find((tool) => tool.name === 'get_quote');
    const advertised = JSON.stringify(quoteTool?.outputSchema ?? {});

    for (const field of ['line_items', 'totals', 'ready_for_payment', 'expires_at']) {
      expect(advertised).toContain(field);
    }
  });

  it('returns a refusal as isError with a structured code', async () => {
    const result = asToolResult(
      await client.request('tools/call', {
        name: 'get_product',
        arguments: { product_id: 'prod_nonexistent' },
      }),
    );
    const body = bodyOf(result) as { error: { code: string; message: string } };

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(body.error.code).toBe('product_not_found');
    expect(body.error.message).toContain('prod_nonexistent');
  });

  it('refuses an unknown cart_id', async () => {
    const result = asToolResult(
      await client.request('tools/call', {
        name: 'add_to_cart',
        arguments: {
          cart_id: 'cart_999999',
          product_id: 'prod_cobbleford_mug',
          quantity: 1,
        },
      }),
    );

    expect(result.isError).toBe(true);
    expect((bodyOf(result) as { error: { code: string } }).error.code).toBe(
      'cart_not_found',
    );
  });

  it('rejects arguments that fail the advertised input schema', async () => {
    const response = await client.request('tools/call', {
      name: 'add_to_cart',
      arguments: { cart_id: 'cart_000001', product_id: 'prod_cobbleford_mug', quantity: 0 },
    });
    const failed =
      response.error !== undefined ||
      (response.result as unknown as ToolCallResult).isError === true;

    expect(failed).toBe(true);
  });
});

describe('merchant server over a spawned stdio process', () => {
  const serverEntry = fileURLToPath(new URL('../../merchant/stdio.ts', import.meta.url));
  const tsxCli = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));

  let child: ChildProcessWithoutNullStreams;
  let client: RawClient;

  beforeAll(async () => {
    child = spawn(process.execPath, [tsxCli, serverEntry], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const waiting = new Map<number, (response: RpcResponse) => void>();
    let buffer = '';
    let nextId = 0;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) {
          const message: unknown = JSON.parse(line);
          for (const [id, resolve] of waiting) {
            if (isResponseFor(message, id)) {
              resolve(message);
              waiting.delete(id);
              break;
            }
          }
        }
        newline = buffer.indexOf('\n');
      }
    });

    const write = (payload: Record<string, unknown>): void => {
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    };

    client = {
      request(method, params = {}) {
        nextId += 1;
        const id = nextId;
        const settled = new Promise<RpcResponse>((resolve, reject) => {
          waiting.set(id, resolve);
          setTimeout(() => {
            reject(new Error(`timed out waiting for ${method}`));
          }, 20_000).unref();
        });
        write({ jsonrpc: '2.0', id, method, params });
        return settled;
      },
      notify(method, params = {}) {
        write({ jsonrpc: '2.0', method, params });
      },
      close() {
        child.kill();
        return Promise.resolve();
      },
    };

    await handshake(client);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('completes the opening exchange on stdin and stdout', async () => {
    const response = await client.request('tools/list');
    const tools = (response.result?.['tools'] ?? []) as { name: string }[];

    expect(tools.map((tool) => tool.name).sort()).toEqual(TOOL_NAMES);
  });

  it('runs a catalogue-to-cart-to-quote round trip over the pipe', async () => {
    const listed = asToolResult(
      await client.request('tools/call', {
        name: 'list_products',
        arguments: { category: 'kitchen' },
      }),
    );
    const { products } = bodyOf(listed) as {
      products: { id: string; variants: { price: { amount: number } }[] }[];
    };
    const first = products[0];
    expect(first).toBeDefined();
    const unitAmount = first?.variants[0]?.price.amount ?? 0;
    expect(unitAmount).toBeGreaterThan(0);

    const created = asToolResult(
      await client.request('tools/call', {
        name: 'create_cart',
        arguments: { items: [{ product_id: first?.id ?? '', quantity: 1 }] },
      }),
    );
    const { cart } = bodyOf(created) as {
      cart: { cart_id: string; items: unknown[]; subtotal_minor: number };
    };

    // The spawned server uses the default factory, so the id is a random UUID.
    expect(cart.cart_id).toMatch(
      /^cart_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(cart.items).toHaveLength(1);
    expect(cart.subtotal_minor).toBe(unitAmount);

    const quoted = asToolResult(
      await client.request('tools/call', {
        name: 'get_quote',
        arguments: { cart_id: cart.cart_id },
      }),
    );
    const { quote } = bodyOf(quoted) as {
      quote: { id: string; totals: { type: string; amount: number }[] };
    };

    expect(quote.id).toMatch(
      /^quote_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(quote.totals.find((entry) => entry.type === 'total')?.amount).toBe(unitAmount);
  });

  it('re-quotes a changed cart with the next cart_version and the new total, over the pipe', async () => {
    // What this asserts is the *fresh* quote, not the refusal: `get_quote`
    // always prices the cart as it is now. The `quote_stale` refusal that the
    // old quote earns is asserted in test/merchant/quote.test.ts, under
    // 'a changed cart invalidates the quote (D38)' — 'refuses the old quote
    // after the cart changes' for the code, and 'names both versions in the
    // refusal, so an agent can see what happened' for the message.
    const created = asToolResult(
      await client.request('tools/call', {
        name: 'create_cart',
        arguments: { items: [{ product_id: 'prod_elderflint_notebook', quantity: 1 }] },
      }),
    );
    const { cart } = bodyOf(created) as { cart: { cart_id: string; version: number } };

    const before = bodyOf(
      asToolResult(
        await client.request('tools/call', {
          name: 'get_quote',
          arguments: { cart_id: cart.cart_id },
        }),
      ),
    ) as { quote: { cart_version: number; totals: { type: string; amount: number }[] } };

    await client.request('tools/call', {
      name: 'add_to_cart',
      arguments: {
        cart_id: cart.cart_id,
        product_id: 'prod_elderflint_notebook',
        quantity: 1,
      },
    });

    const after = bodyOf(
      asToolResult(
        await client.request('tools/call', {
          name: 'get_quote',
          arguments: { cart_id: cart.cart_id },
        }),
      ),
    ) as { quote: { cart_version: number; totals: { type: string; amount: number }[] } };

    // The old quote still prices the old version; the new one has moved on.
    expect(after.quote.cart_version).toBe(before.quote.cart_version + 1);
    expect(after.quote.totals.find((entry) => entry.type === 'total')?.amount).toBe(
      (before.quote.totals.find((entry) => entry.type === 'total')?.amount ?? 0) * 2,
    );
  });

  it('refuses an unknown product over the pipe', async () => {
    const result = asToolResult(
      await client.request('tools/call', {
        name: 'get_product',
        arguments: { product_id: 'prod_nonexistent' },
      }),
    );

    expect(result.isError).toBe(true);
    expect((bodyOf(result) as { error: { code: string } }).error.code).toBe(
      'product_not_found',
    );
  });
});
