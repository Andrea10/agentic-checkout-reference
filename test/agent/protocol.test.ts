/**
 * What the v2 client and the merchant actually agree on.
 *
 * T06a could not add `@modelcontextprotocol/client`, so its protocol tests
 * drove the server with hand-written JSON-RPC and pinned `2025-11-25` — the
 * revision `serveStdio` serves to a 2025-era opening. TASKS.md recorded the
 * 2026-07-28 opening exchange as UNVERIFIED until a real v2 client ran it.
 *
 * This suite is that test. It opens the connection with the v2 client
 * against the real `merchant/stdio.ts` over a pipe and records the revision
 * the two ends settled on.
 *
 * The answer, on `@modelcontextprotocol/client` 2.4.0 against
 * `@modelcontextprotocol/server` 2.4.0: **2026-07-28**, era `modern`, reached
 * through the `server/discover` probe rather than the legacy `initialize`
 * handshake (D75). The SDK's default posture is still the 2025 handshake, and
 * the second suite below pins that down too, so the difference is the agent's
 * choice and not an accident.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectStdio, NEGOTIATE_NEWEST } from '../../agent/index.js';
import { SERVER_INFO } from '../../merchant/index.js';
import { MERCHANT_TOOL_NAMES, spawnMerchant } from './harness.js';

import type { MerchantConnection } from '../../agent/index.js';

/** The revision the agent negotiates with the merchant. The recorded answer. */
const MODERN_REVISION = '2026-07-28';

/** The revision `serveStdio` serves to a 2025-era opening (T06a's tests). */
const LEGACY_REVISION = '2025-11-25';

/** The seven tools on main, including T07a's `place_order` and T07b's `confirm_order`. */
const TOOL_NAMES = MERCHANT_TOOL_NAMES;

describe('the v2 client opening a connection to merchant/stdio.ts', () => {
  let merchant: MerchantConnection;

  beforeAll(async () => {
    merchant = await spawnMerchant();
  }, 60_000);

  afterAll(async () => {
    await merchant.close();
  });

  it('negotiates MCP revision 2026-07-28', () => {
    expect(merchant.protocolVersion).toBe(MODERN_REVISION);
  });

  it('reaches it through the modern era, not the 2025 handshake', () => {
    expect(merchant.protocolEra).toBe('modern');
  });

  it('identifies the merchant it connected to', () => {
    expect(merchant.serverInfo).toEqual(SERVER_INFO);
  });

  it('reads the tool list over the negotiated connection', async () => {
    expect(await merchant.listToolNames()).toEqual(TOOL_NAMES);
  });

  it('calls a tool over the negotiated connection', async () => {
    const outcome = await merchant.callTool('list_products', {});

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(Object.keys(outcome.body)).toEqual(['products']);
  });
});

describe('the SDK default posture, for contrast', () => {
  it('falls back to the 2025-era handshake when negotiation is left alone', async () => {
    const merchant = await connectStdio(
      {
        command: process.execPath,
        args: [
          new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url).pathname,
          new URL('../../merchant/stdio.ts', import.meta.url).pathname,
        ],
      },
      { versionNegotiation: { mode: 'legacy' } },
    );

    try {
      expect(merchant.protocolVersion).toBe(LEGACY_REVISION);
      expect(merchant.protocolEra).toBe('legacy');
    } finally {
      await merchant.close();
    }
  }, 60_000);

  it('the agent asks for the newest revision both ends know', () => {
    expect(NEGOTIATE_NEWEST).toEqual({ mode: 'auto' });
  });
});
