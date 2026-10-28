/**
 * The `place_order` step, against a stub MCP server.
 *
 * `place_order` belongs to T07a and is not on main, so the server here is
 * `test/agent/stub-server.ts`: a real MCP server, reached through the real v2
 * client, that registers one tool with the agreed contract and answers it
 * from a table the test writes. What is under test is the agent's side —
 * whether it sends the right arguments and reads all three answers — not the
 * merchant's policy. T09 runs this against the shipped tool.
 *
 * The test that matters most is the middle one: on `awaiting_confirmation`
 * the agent stops, hands back the token and calls nothing else (D74).
 */

import { afterEach, describe, expect, it } from 'vitest';

import { AWAITING_CONFIRMATION, placeOrder, runPlan, scriptedPlanner } from '../../agent/index.js';
import { verify } from '../../mandate/index.js';
import { connectInMemory, routeTools } from './harness.js';
import { TEST_AGENT, TEST_PUBLIC_KEY, testIdentity } from './identity-fixture.js';
import { createStubOrderServer, type StubOptions, type StubOrderServer } from './stub-server.js';
import { CATALOGUE, CartStore, QuoteStore, createMerchantServer, createMerchantState, sequentialCartIds, sequentialQuoteIds } from '../../merchant/index.js';

import type { MerchantConnection } from '../../agent/index.js';

const open: MerchantConnection[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map(async (connection) => connection.close()));
});

async function stubFor(options: StubOptions): Promise<{
  connection: MerchantConnection;
  stub: StubOrderServer;
}> {
  const stub = createStubOrderServer(options);
  const connection = await connectInMemory(stub.server);
  open.push(connection);
  return { connection, stub };
}

describe('the arguments the agent sends', () => {
  it('sends the quote id, the agent id and the whole signed mandate', async () => {
    const { connection, stub } = await stubFor({
      responses: { quote_000001: { kind: 'approved', order_id: 'order_1' } },
    });
    const identity = testIdentity();

    await placeOrder(connection, identity, 'quote_000001');

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.quote_id).toBe('quote_000001');
    expect(stub.calls[0]?.agent).toBe(TEST_AGENT);
    expect(stub.calls[0]?.mandate).toEqual(identity.mandate);
  });

  it('sends a mandate that still verifies after the round trip', async () => {
    const { connection, stub } = await stubFor({
      responses: { quote_000001: { kind: 'approved', order_id: 'order_1' } },
    });

    await placeOrder(connection, testIdentity(), 'quote_000001');
    const received = stub.calls[0]?.mandate;

    expect(received).toBeDefined();
    expect(received === undefined ? undefined : verify(received, TEST_PUBLIC_KEY)).toEqual({
      ok: true,
    });
  });

  it('sends the agent id from the identity, not from inside the mandate', async () => {
    // The two are compared by the merchant's policy check; the agent must not
    // paper over a mismatch by reading the id off the mandate (D72).
    const { connection, stub } = await stubFor({
      responses: { quote_000001: { kind: 'approved', order_id: 'order_1' } },
    });
    const identity = { ...testIdentity(), agent: 'agent-impostor' };

    await placeOrder(connection, identity, 'quote_000001');

    expect(stub.calls[0]?.agent).toBe('agent-impostor');
    expect(stub.calls[0]?.mandate.agent).toBe(TEST_AGENT);
  });
});

describe('an approved order', () => {
  it('comes back as approved, with the order id and the whole body', async () => {
    const { connection } = await stubFor({
      responses: {
        quote_000001: { kind: 'approved', order_id: 'order_42', total_minor: 2045 },
      },
    });

    const outcome = await placeOrder(connection, testIdentity(), 'quote_000001');

    expect(outcome).toEqual({
      status: 'approved',
      order: {
        order_id: 'order_42',
        status: 'paid',
        body: { order_id: 'order_42', status: 'paid', total_minor: 2045 },
      },
    });
  });

  it('keeps whatever status the merchant used', async () => {
    const { connection } = await stubFor({
      responses: { quote_000001: { kind: 'approved', order_id: 'order_42', status: 'completed' } },
    });

    const outcome = await placeOrder(connection, testIdentity(), 'quote_000001');

    expect(outcome.status === 'approved' && outcome.order.status).toBe('completed');
  });
});

describe('awaiting_confirmation: the agent stops (D74)', () => {
  const held: StubOptions = {
    responses: {
      quote_000001: {
        kind: 'awaiting_confirmation',
        order_id: 'order_held_1',
        confirmation_token: 'confirm_abc123',
      },
    },
  };

  it('returns the token and the order id rather than an order', async () => {
    const { connection } = await stubFor(held);

    const outcome = await placeOrder(connection, testIdentity(), 'quote_000001');

    expect(outcome).toEqual({
      status: AWAITING_CONFIRMATION,
      held: {
        order_id: 'order_held_1',
        confirmation_token: 'confirm_abc123',
        body: {
          order_id: 'order_held_1',
          status: 'awaiting_confirmation',
          confirmation_token: 'confirm_abc123',
        },
      },
    });
  });

  it('never calls confirm_order, or anything else, on its own authority', async () => {
    const { connection, stub } = await stubFor(held);

    await placeOrder(connection, testIdentity(), 'quote_000001');

    expect(stub.calls).toHaveLength(1);
    expect(await connection.listToolNames()).toEqual(['place_order']);
  });

  it('ends the whole run, with the token on the outcome', async () => {
    const { connection: orders } = await stubFor({
      responses: {},
      fallback: {
        kind: 'awaiting_confirmation',
        order_id: 'order_held_2',
        confirmation_token: 'confirm_xyz789',
      },
    });
    const carts = new CartStore(CATALOGUE, { nextId: sequentialCartIds() });
    const merchant = await connectInMemory(
      createMerchantServer(
        createMerchantState(
          CATALOGUE,
          carts,
          new QuoteStore(CATALOGUE, carts, { nextId: sequentialQuoteIds() }),
        ),
      ),
    );
    open.push(merchant);

    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: routeTools(merchant, orders),
      identity: testIdentity(),
    });

    expect(result.outcome).toEqual({
      kind: 'awaiting_confirmation',
      held: {
        order_id: 'order_held_2',
        confirmation_token: 'confirm_xyz789',
        body: {
          order_id: 'order_held_2',
          status: 'awaiting_confirmation',
          confirmation_token: 'confirm_xyz789',
        },
      },
    });
    // Six steps, the last of which is place_order, and then nothing.
    expect(result.steps.at(-1)?.kind).toBe('place_order');
    expect(result.steps.filter((step) => step.kind === 'place_order')).toHaveLength(1);
  });
});

describe('a refusal, with the mandate checks that failed (D73)', () => {
  it('comes back as refused and lists every reason', async () => {
    const { connection } = await stubFor({
      responses: {
        quote_000001: {
          kind: 'refused',
          code: 'mandate_refused',
          message: 'the mandate does not cover this purchase',
          refusals: [
            { reason: 'per_transaction_cap_exceeded', message: '4250 asked, 2500 allowed' },
            { reason: 'budget_exceeded', message: '4250 asked, 1000 left' },
          ],
        },
      },
    });

    const outcome = await placeOrder(connection, testIdentity(), 'quote_000001');

    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.refusal.code).toBe('mandate_refused');
    expect(outcome.refusal.reasons.map((entry) => entry.reason)).toEqual([
      'per_transaction_cap_exceeded',
      'budget_exceeded',
    ]);
  });

  it('is a value, not a throw', async () => {
    const { connection } = await stubFor({
      responses: {
        quote_000001: { kind: 'refused', code: 'signature_invalid', message: 'bad signature' },
      },
    });

    await expect(placeOrder(connection, testIdentity(), 'quote_000001')).resolves.toMatchObject({
      status: 'refused',
    });
  });

  it('refuses an unknown quote the way the merchant would', async () => {
    const { connection } = await stubFor({ responses: {} });

    const outcome = await placeOrder(connection, testIdentity(), 'quote_does_not_exist');

    expect(outcome.status === 'refused' && outcome.refusal.code).toBe('quote_not_found');
  });

  it('stops the run and names place_order as the step that was refused', async () => {
    const { connection: orders } = await stubFor({
      responses: {},
      fallback: { kind: 'refused', code: 'mandate_expired', message: 'the mandate has expired' },
    });
    const carts = new CartStore(CATALOGUE, { nextId: sequentialCartIds() });
    const merchant = await connectInMemory(
      createMerchantServer(
        createMerchantState(
          CATALOGUE,
          carts,
          new QuoteStore(CATALOGUE, carts, { nextId: sequentialQuoteIds() }),
        ),
      ),
    );
    open.push(merchant);

    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: routeTools(merchant, orders),
      identity: testIdentity(),
    });

    expect(result.outcome).toMatchObject({ kind: 'refused', step: 'place_order' });
    if (result.outcome.kind !== 'refused') return;
    expect(result.outcome.refusal.code).toBe('mandate_expired');
  });
});

describe('a broken merchant is not a refusal (D73)', () => {
  it('throws when the tool is not there at all', async () => {
    const { connection } = await stubFor({ responses: {} });

    await expect(connection.callTool('confirm_order', {})).rejects.toThrow(/confirm_order/);
  });

  it('throws when the order body is neither shape', async () => {
    const { connection } = await stubFor({
      responses: {
        // No order_id at all: not an approved order and not a held one.
        quote_000001: { kind: 'approved', order_id: '' },
      },
    });
    const broken = {
      callTool: () =>
        Promise.resolve({ ok: true as const, body: { surprise: true } }),
    };

    await expect(placeOrder(broken, testIdentity(), 'quote_000001')).rejects.toThrow(
      /place_order returned a body the agent cannot read/,
    );
    expect(connection.protocolVersion).toBeDefined();
  });
});
