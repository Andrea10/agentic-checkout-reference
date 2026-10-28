/**
 * The one seam the plan steps see: {@link ToolCaller}.
 *
 * Everything here runs against the real merchant server in this process, so
 * the bodies are the merchant's own and not a fixture.
 *
 * It also records the other half of the protocol answer. `merchant/stdio.ts`
 * negotiates 2026-07-28 (see `protocol.test.ts`) because `serveStdio` owns
 * the era decision for the connection. An `McpServer` connected straight to a
 * transport, as these tests do, has no such entry point and serves the
 * 2025-era handshake instead — so the revision a v2 client ends up on depends
 * on how the server is mounted, not only on the SDK version (D75).
 */

import { describe, expect, it } from 'vitest';

import { AGENT_CLIENT_INFO } from '../../agent/index.js';
import { SERVER_INFO, createMerchantServer } from '../../merchant/index.js';
import { MERCHANT_TOOL_NAMES, connectInMemory } from './harness.js';

describe('connecting in process', () => {
  it('serves the 2025-era handshake when the server is mounted without serveStdio', async () => {
    const merchant = await connectInMemory(createMerchantServer());

    expect(merchant.protocolVersion).toBe('2025-11-25');
    expect(merchant.protocolEra).toBe('legacy');
    await merchant.close();
  });

  it('introduces the agent by name', () => {
    expect(AGENT_CLIENT_INFO).toEqual({
      name: 'agentic-checkout-reference-agent',
      version: '0.1.0',
    });
  });

  it('reads the merchant back', async () => {
    const merchant = await connectInMemory(createMerchantServer());

    expect(merchant.serverInfo).toEqual(SERVER_INFO);
    await merchant.close();
  });

  it('lists all six tool names, sorted', async () => {
    const merchant = await connectInMemory(createMerchantServer());

    expect(await merchant.listToolNames()).toEqual(MERCHANT_TOOL_NAMES);
    await merchant.close();
  });
});

describe('callTool', () => {
  it('returns the body of a successful call', async () => {
    const merchant = await connectInMemory(createMerchantServer());

    const outcome = await merchant.callTool('get_product', {
      product_id: 'prod_cobbleford_mug',
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.body).toMatchObject({ product: { title: 'Cobbleford Stoneware Mug' } });
    await merchant.close();
  });

  it('returns a refusal, with the merchant’s code, rather than throwing', async () => {
    const merchant = await connectInMemory(createMerchantServer());

    const outcome = await merchant.callTool('get_product', { product_id: 'prod_nope' });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusal.code).toBe('product_not_found');
    expect(outcome.refusal.message).toContain('prod_nope');
    await merchant.close();
  });

  it('turns the SDK’s input-schema rejection into tool_error (D78)', async () => {
    const merchant = await connectInMemory(createMerchantServer());

    const outcome = await merchant.callTool('add_to_cart', {
      cart_id: 'cart_000001',
      product_id: 'prod_cobbleford_mug',
      quantity: 0,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusal.code).toBe('tool_error');
    expect(outcome.refusal.message).toContain('quantity');
    await merchant.close();
  });

  it('throws for a tool the merchant does not have (D73)', async () => {
    // `place_order` used to stand in here, before T07a shipped it.
    // `confirm_order` is T07b's and is genuinely not on main yet, which is
    // the condition this test is about: a missing tool is not a refusal.
    const merchant = await connectInMemory(createMerchantServer());

    await expect(merchant.callTool('confirm_order', {})).rejects.toThrow(/confirm_order/);
    await merchant.close();
  });

  it('refuses place_order on an unconfigured merchant, rather than throwing', async () => {
    // The default `createMerchantServer()` has no issuer key, so it serves
    // the tool and refuses the order (D60). A refusal, not a throw (D73).
    const merchant = await connectInMemory(createMerchantServer());

    const outcome = await merchant.callTool('place_order', {
      quote_id: 'quote_000001',
      agent: 'agent-buyer-1',
      mandate: {
        mandate_id: '11111111-2222-4333-8444-555555555555',
        principal: 'user-andrea',
        agent: 'agent-buyer-1',
        merchant: 'merchant-demo',
        currency: 'GBP',
        amount_cap_minor: 5000,
        per_transaction_cap_minor: 2500,
        valid_from: '2026-10-25T00:00:00Z',
        valid_until: '2026-10-30T00:00:00Z',
        human_confirm_above_minor: 2000,
        signature: 'not-checked-because-there-is-no-key',
      },
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusal.code).toBe('merchant_misconfigured');
    await merchant.close();
  });

  it('carries the cart across calls by cart_id alone', async () => {
    const merchant = await connectInMemory(createMerchantServer());

    const created = await merchant.callTool('create_cart', {});
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const cartId = (created.body as { cart: { cart_id: string } }).cart.cart_id;

    const added = await merchant.callTool('add_to_cart', {
      cart_id: cartId,
      product_id: 'prod_cobbleford_mug',
      quantity: 2,
    });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.body).toMatchObject({ cart: { cart_id: cartId, subtotal_minor: 2900 } });
    await merchant.close();
  });
});
