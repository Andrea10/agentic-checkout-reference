/**
 * A test-local MCP server that answers `place_order` with whatever a test
 * says, including bodies the shipped merchant cannot produce.
 *
 * When T08 was first written this stub stood in for `place_order` entirely,
 * because T07a was not on main. It has shipped, and `order.test.ts` now
 * drives the agent's order step against the **real** tool for all three of
 * its answers — approved, awaiting_confirmation, and a refusal carrying
 * several reasons. So the stub has lost its original job.
 *
 * It is kept, much smaller, for the one thing the real merchant cannot do:
 * **answer with a body the merchant on main never sends.** Two of those
 * matter to the agent:
 *
 * - an approved order carrying a status word the agent has no literal for and
 *   an unknown field beside it, both of which must travel through rather than
 *   be rejected (see `agent/order.ts`'s `approvedSchema`). T07b narrowed this
 *   one: `paid` itself is now what the real merchant answers on the direct
 *   path (D88) and `order.test.ts` pins it against the real tool, so what is
 *   left to the stub is the *undocumented* part of that body — the shipped
 *   merchant sends two fields and no timestamp of its own (D80);
 * - a success body that is neither of the two documented shapes, which must
 *   throw rather than become a refusal (D73).
 *
 * Both are claims about how the agent treats a merchant it was not compiled
 * against, and neither can be made against a merchant that is behaving.
 *
 * The input schema is the merchant's own `mandateWireSchema`, imported rather
 * than copied: this file exists to imitate the merchant, so sharing its wire
 * schema is the point — a field added to a mandate reaches this stub without
 * anyone remembering to update it. (The agent deliberately does the opposite;
 * see D77.) Nothing in `merchant/` was touched to build this.
 */

import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { mandateWireSchema } from '../../merchant/index.js';

import type { Mandate } from '../../mandate/index.js';

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

/** A body to answer with, and whether it is a refusal. */
export interface StubAnswer {
  /** The JSON body, verbatim. */
  readonly body: unknown;
  /** `true` to answer as a refused tool call. Defaults to `false`. */
  readonly isError?: boolean;
}

/** How to build the stub. */
export interface StubOptions {
  /** The answer for every call. */
  readonly answer: StubAnswer;
}

/** The stub, plus the log of what it was asked. */
export interface StubOrderServer {
  readonly server: McpServer;
  /** Every `place_order` call, in order. */
  readonly calls: readonly RecordedCall[];
}

/**
 * The input schema, built from the merchant's own mandate schema.
 *
 * `quote_id` and `agent` are restated because they are two strings; the
 * mandate is not, because it is eleven fields the merchant already describes
 * and T03 signs every one of them.
 */
const placeOrderInput = z.object({
  quote_id: z.string(),
  agent: z.string(),
  mandate: mandateWireSchema,
});

/** Builds a stub server that answers `place_order` and nothing else. */
export function createStubOrderServer(options: StubOptions): StubOrderServer {
  const calls: RecordedCall[] = [];
  const server = new McpServer(STUB_SERVER_INFO, { capabilities: { tools: {} } });

  server.registerTool(
    'place_order',
    {
      title: 'Place order (stub)',
      description:
        'Stub of place_order: records the call and answers with the body the test chose, including bodies the real merchant never sends.',
      inputSchema: placeOrderInput,
      annotations: { readOnlyHint: false, idempotentHint: false },
    },
    (args): CallToolResult => {
      calls.push({
        quote_id: args.quote_id,
        agent: args.agent,
        // No cast: the merchant's own `mandateWireSchema` already parses to
        // a `Mandate`, which is the alignment this import buys.
        mandate: args.mandate,
      });

      const text = JSON.stringify(options.answer.body);
      return options.answer.isError === true
        ? { content: [{ type: 'text', text }], isError: true }
        : { content: [{ type: 'text', text }] };
    },
  );

  return { server, calls };
}
