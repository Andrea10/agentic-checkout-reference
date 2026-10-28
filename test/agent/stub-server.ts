/**
 * A test-local stub MCP server that registers `place_order`.
 *
 * `place_order` is T07a's tool and was not on main when T08 was written, so
 * the agent's order step (`agent/order.ts`) is tested against this stub
 * instead. The stub is deliberately thin: it does no mandate checking of its
 * own. Its whole job is to answer the three shapes the agreed contract
 * defines, from arguments the test chooses, and to record what it was called
 * with so the test can assert the agent sent the right thing:
 *
 *     input   { quote_id: string, agent: string, mandate: Mandate }
 *     output  an approved order
 *          |  { status: 'awaiting_confirmation', confirmation_token, order_id }
 *          |  a structured tool error listing the policy refusal reasons
 *
 * The refusal body is built from `mandate/decision.ts`'s `PolicyRefusal`
 * shape and the merchant's `{ error: { code, message } }` envelope (D13), so
 * the field names here are the ones T07a is expected to ship. The agent reads
 * them tolerantly either way (see `agent/refusal.ts`); T09 is where this gets
 * checked against the real tool.
 *
 * This file lives in `test/agent/` and is never shipped. Nothing in
 * `merchant/` was touched to build it.
 */

import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod';

import type { Mandate, PolicyRefusal } from '../../mandate/index.js';

/** Name and version the stub reports, so a test cannot mistake it for the merchant. */
export const STUB_SERVER_INFO = {
  name: 'agentic-checkout-reference-place-order-stub',
  version: '0.0.0',
} as const;

/** What the stub was called with. */
export interface RecordedCall {
  readonly quote_id: string;
  readonly agent: string;
  readonly mandate: Mandate;
}

/** One of the three answers the stub can give, chosen per quote id. */
export type StubResponse =
  | {
      readonly kind: 'approved';
      readonly order_id: string;
      /** Defaults to `paid`. */
      readonly status?: string;
      readonly total_minor?: number;
    }
  | {
      readonly kind: 'awaiting_confirmation';
      readonly order_id: string;
      readonly confirmation_token: string;
    }
  | {
      readonly kind: 'refused';
      readonly code: string;
      readonly message: string;
      readonly refusals?: readonly PolicyRefusal[];
    };

/** How to build the stub. */
export interface StubOptions {
  /** Answer keyed by `quote_id`. */
  readonly responses: Readonly<Record<string, StubResponse>>;
  /**
   * The answer for a `quote_id` that is not in {@link responses}. Defaults to
   * a `quote_not_found` refusal, which is what the real merchant does.
   */
  readonly fallback?: StubResponse;
}

/** The stub, plus the log of what it was asked. */
export interface StubOrderServer {
  readonly server: McpServer;
  /** Every `place_order` call, in order. */
  readonly calls: readonly RecordedCall[];
}

const placeOrderInput = z.object({
  quote_id: z.string(),
  agent: z.string(),
  // The mandate travels whole. The stub does not verify it (that is T07a's
  // job through `mandate.checkMandate`); it only checks that it arrived.
  mandate: z.looseObject({
    mandate_id: z.string(),
    agent: z.string(),
    merchant: z.string(),
    currency: z.string(),
    amount_cap_minor: z.int(),
    per_transaction_cap_minor: z.int(),
    valid_from: z.string(),
    valid_until: z.string(),
    human_confirm_above_minor: z.int(),
    signature: z.string(),
  }),
});

/** Shapes one {@link StubResponse} as an MCP tool result. */
function resultFor(response: StubResponse): CallToolResult {
  if (response.kind === 'refused') {
    const body = {
      error: {
        code: response.code,
        message: response.message,
        ...(response.refusals === undefined ? {} : { refusals: response.refusals }),
      },
    };
    return { content: [{ type: 'text', text: JSON.stringify(body) }], isError: true };
  }

  const body =
    response.kind === 'awaiting_confirmation'
      ? {
          order_id: response.order_id,
          status: 'awaiting_confirmation',
          confirmation_token: response.confirmation_token,
        }
      : {
          order_id: response.order_id,
          status: response.status ?? 'paid',
          ...(response.total_minor === undefined ? {} : { total_minor: response.total_minor }),
        };

  return {
    content: [{ type: 'text', text: JSON.stringify(body) }],
    structuredContent: body,
  };
}

/** The default answer for an unknown quote: what the real merchant would say. */
const QUOTE_NOT_FOUND: StubResponse = {
  kind: 'refused',
  code: 'quote_not_found',
  message: 'no quote with that id',
};

/** Builds a stub server that answers `place_order` and nothing else. */
export function createStubOrderServer(options: StubOptions): StubOrderServer {
  const calls: RecordedCall[] = [];
  const server = new McpServer(STUB_SERVER_INFO, { capabilities: { tools: {} } });

  server.registerTool(
    'place_order',
    {
      title: 'Place order (stub)',
      description:
        'Stub of T07a’s place_order: takes a quote_id, an agent id and a mandate, and answers with a fixed outcome chosen by the test.',
      inputSchema: placeOrderInput,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    (args) => {
      calls.push({
        quote_id: args.quote_id,
        agent: args.agent,
        mandate: args.mandate as unknown as Mandate,
      });
      return resultFor(options.responses[args.quote_id] ?? options.fallback ?? QUOTE_NOT_FOUND);
    },
  );

  return { server, calls };
}
