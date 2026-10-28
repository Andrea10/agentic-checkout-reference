/**
 * The path the demo does not take: the merchant as a separate process.
 *
 * `scripts/demo.ts` hosts the merchant in-process, because the audit log it
 * has to print lives inside the merchant's policy and a stdio child cannot
 * hand its log back (D100). That leaves the real deployment shape — a spawned
 * `merchant/stdio.ts`, configured from its environment, speaking MCP over a
 * pipe — covered by nothing the demo runs. This suite is that cover.
 *
 * It is one test and it asserts one thing worth asserting: the whole flow,
 * from an empty catalogue call to a **paid** order under a signed mandate,
 * works against the merchant as a process. If the demo's in-process shortcut
 * ever diverged from the real thing, this is the test that would say so.
 *
 * Two differences from the demo, both forced by the process boundary:
 *
 * - **The clock is the system clock.** `merchant/stdio.ts` builds its policy
 *   with `policyFor`, which takes no clock, so the mandate here is minted
 *   around the current instant rather than the demo's frozen one.
 * - **The transport is built here rather than by `connectStdio`.**
 *   `agent/connectStdio` takes a command and arguments and no environment
 *   (D105), and the merchant needs `ACR_MANDATE_PUBLIC_KEY` to accept an
 *   order at all. So the test constructs the SDK's `StdioClientTransport`
 *   itself and hands it to `agent/connect`, which is the seam that exists for
 *   exactly this.
 */

import { fileURLToPath } from 'node:url';

import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connect, runPlan, scriptedPlanner, totalOf } from '../agent/index.js';
import {
  exportPublicKey,
  generateMandateKeyPair,
  issue,
  type MandateClaims,
} from '../mandate/index.js';
import { DEFAULT_MERCHANT_ID, ISSUER_PUBLIC_KEY_ENV, MERCHANT_ID_ENV } from '../merchant/index.js';
import { AGENT } from './demo.js';

import type { MerchantConnection } from '../agent/index.js';

/** The real entry point, as a path this machine can spawn. */
const MERCHANT_ENTRY = fileURLToPath(new URL('../merchant/stdio.ts', import.meta.url));

/** The `tsx` CLI, so a `.ts` entry point runs without a build step. */
const TSX_CLI = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));

/** The revision the agent and `serveStdio` settle on (D75). */
const MODERN_REVISION = '2026-07-28';

/** The basket the scripted plan buys: the two cheapest products. */
const BASKET_MINOR = 2045;

/** Spawning `tsx` and opening the connection is slow on a cold cache. */
const SPAWN_TIMEOUT_MS = 60_000;

const keys = generateMandateKeyPair();

/**
 * A mandate valid now, with a threshold above the basket.
 *
 * The window is an hour either side of the current instant, because the
 * merchant in the child process reads the system clock. Everything else is
 * the README mandate's, except the threshold, which is lifted above 2045 so
 * this test exercises the paid path rather than the hold.
 */
function mandateValidNow(): MandateClaims {
  const now = Date.now();
  return {
    mandate_id: '33333333-3333-4333-8333-333333333333',
    principal: 'principal-demo',
    agent: AGENT,
    merchant: DEFAULT_MERCHANT_ID,
    currency: 'GBP',
    amount_cap_minor: 5000,
    per_transaction_cap_minor: 2500,
    valid_from: new Date(now - 3_600_000).toISOString(),
    valid_until: new Date(now + 3_600_000).toISOString(),
    human_confirm_above_minor: 3000,
  };
}

describe('the agent against merchant/stdio.ts, as a process', () => {
  let merchant: MerchantConnection;

  beforeAll(async () => {
    merchant = await connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [TSX_CLI, MERCHANT_ENTRY],
        env: {
          ...getDefaultEnvironment(),
          [MERCHANT_ID_ENV]: DEFAULT_MERCHANT_ID,
          [ISSUER_PUBLIC_KEY_ENV]: exportPublicKey(keys.publicKey),
        },
      }),
    );
  }, SPAWN_TIMEOUT_MS);

  afterAll(async () => {
    await merchant.close();
  });

  it('negotiates the modern revision over the pipe, as the demo says it does', () => {
    expect(merchant.protocolVersion).toBe(MODERN_REVISION);
    expect(merchant.protocolEra).toBe('modern');
  });

  it('shops and pays for the basket under a mandate read from the environment', async () => {
    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: merchant,
      identity: { agent: AGENT, mandate: issue(mandateValidNow(), keys.privateKey) },
    });

    expect(result.steps.map((step) => step.kind)).toEqual([
      'list_products',
      'create_cart',
      'add_to_cart',
      'add_to_cart',
      'get_quote',
      'place_order',
    ]);
    expect(result.outcome.kind).toBe('ordered');
    if (result.outcome.kind !== 'ordered') return;
    expect(result.outcome.order.status).toBe('paid');
    // The ids are random in the real entry point (D12, D63), so the order id
    // is a shape rather than a value.
    expect(result.outcome.order.order_id).toMatch(/^order_[0-9a-f-]{36}$/);

    const quote = result.memory.quote;
    expect(quote === undefined ? undefined : totalOf(quote)).toBe(BASKET_MINOR);
  }, SPAWN_TIMEOUT_MS);
});
