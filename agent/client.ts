/**
 * The agent's MCP client: one seam, two transports, one recorded revision.
 *
 * Built on the MCP TypeScript SDK v2 (`@modelcontextprotocol/client`, 2.x,
 * pinned to the same exact version as `@modelcontextprotocol/server`; ruled
 * D09).
 *
 * ## The seam
 *
 * Everything above this file talks to the merchant through one method:
 * {@link ToolCaller.callTool}, which takes a tool name and arguments and
 * hands back either a body or a {@link MerchantRefusal} (D78). That is the
 * whole surface. The planner never sees it (D70), and the steps that do see
 * it can be tested against anything that implements the interface — a stub
 * MCP server, or a hand-written object.
 *
 * A refusal is a value. A broken connection, a tool the server does not have,
 * or a timeout still throws, because none of those is an answer the merchant
 * gave (D73).
 *
 * ## The protocol revision
 *
 * The v2 client's default posture is `versionNegotiation: 'legacy'`, which
 * runs the 2025-era `initialize` handshake. This client asks for `'auto'`
 * instead, which probes with `server/discover` first and settles on the
 * newest revision both ends know (D75). Against `merchant/stdio.ts` that is
 * **2026-07-28**, era `modern`. The connection records what it got, so a
 * caller — and the test suite — can read it back rather than assume it:
 * {@link MerchantConnection.protocolVersion}.
 */

import {
  Client,
  type CallToolResult,
  type Implementation,
  type Transport,
  type VersionNegotiationOptions,
} from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { readRefusal, type MerchantRefusal } from './refusal.js';

/** The agent's own name and version, as it introduces itself over MCP. */
export const AGENT_CLIENT_INFO: Implementation = {
  name: 'agentic-checkout-reference-agent',
  version: '0.1.0',
};

/**
 * Negotiate the newest revision both ends know, rather than the 2025 default.
 *
 * `'auto'` is the SDK's probing mode: it sends `server/discover` before the
 * handshake and falls back to the legacy `initialize` when the server does
 * not answer it. Nothing here pins a revision, so this agent keeps working
 * against a 2025-era server as well (D75).
 */
export const NEGOTIATE_NEWEST: VersionNegotiationOptions = { mode: 'auto' };

/** What one tool call came back as: a body, or a merchant "no" (D73). */
export type ToolOutcome =
  | { readonly ok: true; readonly body: Record<string, unknown> }
  | { readonly ok: false; readonly refusal: MerchantRefusal };

/**
 * The one thing the plan steps need from a connection.
 *
 * Narrow on purpose: a step that can only call tools cannot reconnect, change
 * the protocol revision, or read another client's state.
 */
export interface ToolCaller {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolOutcome>;
}

/** A live connection to the merchant. */
export interface MerchantConnection extends ToolCaller {
  /** The protocol revision the opening exchange settled on, e.g. `2026-07-28`. */
  readonly protocolVersion: string | undefined;
  /** `modern` for a 2026-07-28+ connection, `legacy` for the 2025-era handshake. */
  readonly protocolEra: 'legacy' | 'modern' | undefined;
  /** Name and version the merchant reported for itself. */
  readonly serverInfo: Implementation | undefined;
  /** The tool names the merchant advertises, sorted. */
  listToolNames(): Promise<readonly string[]>;
  close(): Promise<void>;
}

/**
 * Reads the body out of a tool result.
 *
 * The merchant sends it twice: as a JSON text block, and as
 * `structuredContent` matching the tool's advertised `outputSchema`. The text
 * block is the one read here, because it is the one a refusal also uses — the
 * refusal body deliberately does not match the output schema, so a successful
 * call and a refused call are parsed by the same two lines.
 */
function textOf(result: CallToolResult): string {
  const first = result.content[0];
  if (first?.type !== 'text') {
    throw new Error(
      `the merchant returned no text block (first block: ${first?.type ?? 'none'})`,
    );
  }
  return first.text;
}

function bodyOf(text: string, name: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${name} returned a text block that is not JSON: ${text}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${name} returned ${text}, which is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/** Wraps an already-constructed {@link Client} as a {@link MerchantConnection}. */
function wrap(client: Client): MerchantConnection {
  return {
    protocolVersion: client.getNegotiatedProtocolVersion(),
    protocolEra: client.getProtocolEra(),
    serverInfo: client.getServerVersion(),

    async callTool(name, args) {
      const result = await client.callTool({ name, arguments: args });
      const text = textOf(result);
      return result.isError === true
        ? { ok: false, refusal: readRefusal(text) }
        : { ok: true, body: bodyOf(text, name) };
    },

    async listToolNames() {
      const { tools } = await client.listTools();
      return tools.map((tool) => tool.name).sort();
    },

    async close() {
      await client.close();
    },
  };
}

/** How to reach a merchant server. */
export interface ConnectOptions {
  /** How the agent introduces itself. Defaults to {@link AGENT_CLIENT_INFO}. */
  readonly clientInfo?: Implementation;
  /** Revision negotiation. Defaults to {@link NEGOTIATE_NEWEST}. */
  readonly versionNegotiation?: VersionNegotiationOptions;
}

/**
 * Connects over an already-built transport.
 *
 * The in-memory transport pair the SDK ships makes a server reachable without
 * a process, which is what the tests use for the stub `place_order` server.
 */
export async function connect(
  transport: Transport,
  options: ConnectOptions = {},
): Promise<MerchantConnection> {
  const client = new Client(options.clientInfo ?? AGENT_CLIENT_INFO, {
    versionNegotiation: options.versionNegotiation ?? NEGOTIATE_NEWEST,
  });
  await client.connect(transport);
  return wrap(client);
}

/** A command that speaks MCP over stdio. */
export interface StdioServerCommand {
  readonly command: string;
  readonly args?: readonly string[];
}

/**
 * Spawns a stdio MCP server and connects to it.
 *
 * `merchant/stdio.ts` is such a command, but this helper passes the child no
 * environment beyond the SDK's default allowlist, so a merchant started this
 * way has no `ACR_MANDATE_PUBLIC_KEY` and refuses to take orders (D105).
 * The tests in `test/agent/` use it to read a spawned merchant's tool list,
 * catalogue and protocol revision, and never to place an order. T09's demo
 * does not use it — it hosts the merchant in its own process over the
 * in-memory transport (D100) — and `scripts/stdio-smoke.test.ts`, which
 * places an order against a spawned merchant, builds its own transport and
 * calls {@link connect}.
 */
export async function connectStdio(
  server: StdioServerCommand,
  options: ConnectOptions = {},
): Promise<MerchantConnection> {
  return connect(
    new StdioClientTransport({
      command: server.command,
      args: [...(server.args ?? [])],
    }),
    options,
  );
}
