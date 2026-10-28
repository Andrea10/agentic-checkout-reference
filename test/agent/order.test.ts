/**
 * The `place_order` step, against the real merchant tool.
 *
 * T07a shipped `merchant/place-order.ts`, so this suite drives the agent's
 * order step against the tool it will meet in the demo: the real policy
 * check, the real order store, the real refusal envelope. The merchant runs
 * with a frozen clock and sequential ids (`harness.ts`), so an order is
 * `order_000001` and a decision is the same on any day.
 *
 * The three answers get a group each, and
 * `the exact combination the merchant ships` at the end pins all three side
 * by side in one assertion, so the shape of the whole contract is readable in
 * one place:
 *
 * - **approved** — status `approved`, an `order_id`, and no token (D62).
 * - **awaiting_confirmation** — status `awaiting_confirmation`, an
 *   `order_id` *and* a `confirmation_token`. The agent stops (D74).
 * - **mandate_refused** — `isError`, code `mandate_refused`, and
 *   `error.reasons` naming every check that failed (D66).
 *
 * The amounts come from the real catalogue and the README mandate. The two
 * cheapest products total 2045 pence, which is above that mandate's
 * `human_confirm_above_minor` of 2000 — so the default plan trips the
 * human-confirm path, and the approved path needs a mandate with a higher
 * threshold. That is the catalogue doing what T06a built it to do.
 *
 * The stub server appears only at the end, for the two bodies a
 * well-behaved merchant never sends.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { APPROVED, AWAITING_CONFIRMATION, placeOrder, runPlan, scriptedPlanner } from '../../agent/index.js';
import { verify } from '../../mandate/index.js';
import { connectInMemory, connectMerchant, routeTools } from './harness.js';
import { TEST_AGENT, TEST_PUBLIC_KEY, testIdentity } from './identity-fixture.js';
import { createStubOrderServer, type StubAnswer, type StubOrderServer } from './stub-server.js';

import type { AgentIdentity, MerchantConnection, ToolCaller } from '../../agent/index.js';

/** The two cheapest products in the shipped catalogue, together. */
const TWO_ITEM_TOTAL = 2045;

/** A mandate that allows 2045 outright: the README one with a higher threshold. */
function permissive(): AgentIdentity {
  return testIdentity({ human_confirm_above_minor: 3000 });
}

const open: MerchantConnection[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map(async (connection) => connection.close()));
});

/** Shops to a quote against the real merchant and returns the quote id. */
async function quoteFor(
  caller: ToolCaller,
  identity: AgentIdentity,
): Promise<{ quote_id: string; total_minor: number }> {
  const result = await runPlan({
    planner: scriptedPlanner(),
    caller,
    identity,
    // Five steps is list, create_cart, two adds and get_quote: the budget
    // stops the run on the doorstep of place_order, which is what this
    // helper wants. The identity is still required and still unused — a
    // reminder that only the sixth step ever reads it (D72).
    maxSteps: 5,
  });
  const quote = result.memory.quote;
  if (quote === undefined) {
    throw new Error(`no quote: run ended ${JSON.stringify(result.outcome)}`);
  }
  return {
    quote_id: quote.id,
    total_minor: quote.totals.find((entry) => entry.type === 'total')?.amount ?? 0,
  };
}

/** A merchant connection with a quote already on it. */
async function merchantWithQuote(
  identity: AgentIdentity = permissive(),
): Promise<{ connection: MerchantConnection; quote_id: string; total_minor: number }> {
  const connection = await connectMerchant();
  open.push(connection);
  const quote = await quoteFor(connection, identity);
  return { connection, ...quote };
}

async function stubAnswering(answer: StubAnswer): Promise<{
  connection: MerchantConnection;
  stub: StubOrderServer;
}> {
  const stub = createStubOrderServer({ answer });
  const connection = await connectInMemory(stub.server);
  open.push(connection);
  return { connection, stub };
}

describe('the quote the agent orders against', () => {
  it('is the two cheapest products, totalling 2045 pence', async () => {
    const { total_minor, quote_id } = await merchantWithQuote();

    expect(total_minor).toBe(TWO_ITEM_TOTAL);
    expect(quote_id).toBe('quote_000001');
  });
});

describe('approved: the mandate covered it (D62)', () => {
  it('comes back as approved, with the order id and the status word the merchant uses', async () => {
    const { connection, quote_id } = await merchantWithQuote();

    const outcome = await placeOrder(connection, permissive(), quote_id);

    expect(outcome).toEqual({
      status: 'approved',
      order: {
        order_id: 'order_000001',
        status: APPROVED,
        body: { order_id: 'order_000001', status: 'approved' },
      },
    });
  });

  it('carries no confirmation token, because none was needed', async () => {
    const { connection, quote_id } = await merchantWithQuote();

    const outcome = await placeOrder(connection, permissive(), quote_id);

    expect(outcome.status === 'approved' && 'confirmation_token' in outcome.order.body).toBe(
      false,
    );
  });

  it('ends the whole run as ordered', async () => {
    const connection = await connectMerchant();
    open.push(connection);

    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: connection,
      identity: permissive(),
    });

    expect(result.steps.map((step) => step.kind)).toEqual([
      'list_products',
      'create_cart',
      'add_to_cart',
      'add_to_cart',
      'get_quote',
      'place_order',
    ]);
    expect(result.outcome).toMatchObject({ kind: 'ordered' });
    if (result.outcome.kind !== 'ordered') return;
    expect(result.outcome.order.order_id).toBe('order_000001');
    expect(result.outcome.order.status).toBe(APPROVED);
  });
});

describe('awaiting_confirmation: the agent stops (D74)', () => {
  it('returns the token and the order id rather than an order', async () => {
    // The README mandate: 2045 is above its 2000 threshold.
    const { connection, quote_id } = await merchantWithQuote(testIdentity());

    const outcome = await placeOrder(connection, testIdentity(), quote_id);

    expect(outcome.status).toBe(AWAITING_CONFIRMATION);
    if (outcome.status !== AWAITING_CONFIRMATION) return;
    expect(outcome.held.order_id).toBe('order_000001');
    expect(outcome.held.confirmation_token).toMatch(/^confirm_/);
    expect(outcome.held.body['status']).toBe('awaiting_confirmation');
  });

  it('never calls confirm_order, or anything else, on its own authority', async () => {
    const connection = await connectMerchant();
    open.push(connection);

    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: connection,
      identity: testIdentity(),
    });

    expect(result.outcome.kind).toBe('awaiting_confirmation');
    // The merchant has no confirm_order on main, and the agent did not reach
    // for one: place_order is the last step, and it was taken once.
    expect(result.steps.at(-1)?.kind).toBe('place_order');
    expect(result.steps.filter((step) => step.kind === 'place_order')).toHaveLength(1);
    expect(await connection.listToolNames()).not.toContain('confirm_order');
  });

  it('leaves the order held, not approved, in the merchant’s own store', async () => {
    const connection = await connectMerchant();
    open.push(connection);

    await runPlan({ planner: scriptedPlanner(), caller: connection, identity: testIdentity() });

    expect(connection.merchant.orders.size).toBe(1);
  });
});

describe('a refusal, with every mandate check that failed (D66, D73)', () => {
  /** A mandate wrong in three ways at once, still correctly signed. */
  function tripleFault(): AgentIdentity {
    return {
      ...testIdentity({ currency: 'USD', valid_until: '2026-10-26T00:00:00Z' }),
      agent: 'agent-impostor',
    };
  }

  it('lists all three reasons, not just the first', async () => {
    const { connection, quote_id } = await merchantWithQuote();

    const outcome = await placeOrder(connection, tripleFault(), quote_id);

    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.refusal.code).toBe('mandate_refused');
    expect(outcome.refusal.reasons.map((entry) => entry.reason)).toEqual([
      'agent_mismatch',
      'mandate_expired',
      'currency_mismatch',
    ]);
  });

  it('carries a message with each reason, for a person reading a transcript', async () => {
    const { connection, quote_id } = await merchantWithQuote();

    const outcome = await placeOrder(connection, tripleFault(), quote_id);

    if (outcome.status !== 'refused') return;
    for (const reason of outcome.refusal.reasons) {
      expect(reason.message.length).toBeGreaterThan(0);
      expect(reason.message).not.toBe(reason.reason);
    }
  });

  it('refuses a mandate whose signature does not hold, at the gate', async () => {
    const { connection, quote_id } = await merchantWithQuote();
    const identity = testIdentity();
    const tampered: AgentIdentity = {
      agent: identity.agent,
      mandate: { ...identity.mandate, amount_cap_minor: 999_999 },
    };

    const outcome = await placeOrder(connection, tampered, quote_id);

    if (outcome.status !== 'refused') return;
    expect(outcome.refusal.reasons.map((entry) => entry.reason)).toEqual(['signature_invalid']);
  });

  it('is a value, not a throw, and stops the run naming place_order', async () => {
    const connection = await connectMerchant();
    open.push(connection);

    const result = await runPlan({
      planner: scriptedPlanner(),
      caller: connection,
      identity: tripleFault(),
    });

    expect(result.outcome).toMatchObject({ kind: 'refused', step: 'place_order' });
    if (result.outcome.kind !== 'refused') return;
    expect(result.outcome.refusal.reasons.length).toBe(3);
  });

  it('refuses a quote that has already been ordered (D64)', async () => {
    const { connection, quote_id } = await merchantWithQuote();
    await placeOrder(connection, permissive(), quote_id);

    const second = await placeOrder(connection, permissive(), quote_id);

    expect(second.status).toBe('refused');
    if (second.status !== 'refused') return;
    expect(second.refusal.code).toBe('quote_already_ordered');
    expect(second.refusal.reasons).toEqual([]);
  });

  it('refuses when the merchant has no trusted issuer configured (D60)', async () => {
    const connection = await connectMerchant({ policy: null });
    open.push(connection);
    const { quote_id } = await quoteFor(connection, permissive());

    const outcome = await placeOrder(connection, permissive(), quote_id);

    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.refusal.code).toBe('merchant_misconfigured');
  });
});

describe('the arguments the agent sends', () => {
  it('sends the quote id, the agent id and a mandate that still verifies', async () => {
    const { connection: stubConnection, stub } = await stubAnswering({
      body: { status: 'approved', order_id: 'order_stub' },
    });
    const merchant = await connectMerchant();
    open.push(merchant);
    const { quote_id } = await quoteFor(merchant, permissive());

    await placeOrder(routeTools(merchant, stubConnection), permissive(), quote_id);

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.quote_id).toBe(quote_id);
    expect(stub.calls[0]?.agent).toBe(TEST_AGENT);
    const received = stub.calls[0]?.mandate;
    expect(received === undefined ? undefined : verify(received, TEST_PUBLIC_KEY)).toEqual({
      ok: true,
    });
  });

  it('sends the agent id from the identity, not from inside the mandate', async () => {
    // The merchant compares the two and refuses `agent_mismatch` when they
    // differ; an agent that filled the argument in from the mandate would be
    // answering the question for the verifier (D72).
    const { connection, stub } = await stubAnswering({
      body: { status: 'approved', order_id: 'order_stub' },
    });

    await placeOrder(connection, { ...testIdentity(), agent: 'agent-impostor' }, 'quote_000001');

    expect(stub.calls[0]?.agent).toBe('agent-impostor');
    expect(stub.calls[0]?.mandate.agent).toBe(TEST_AGENT);
  });

  it('sends every signed field, including principal, through the merchant’s own schema', async () => {
    const { connection, stub } = await stubAnswering({
      body: { status: 'approved', order_id: 'order_stub' },
    });
    const identity = testIdentity();

    await placeOrder(connection, identity, 'quote_000001');

    expect(stub.calls[0]?.mandate).toEqual(identity.mandate);
    expect(stub.calls[0]?.mandate.principal).toBe('user-andrea');
  });
});

describe('the exact combination the merchant ships', () => {
  /** The three answers, side by side, from three runs against one merchant each. */
  it('answers approved, awaiting_confirmation with a token, or a refusal with reasons', async () => {
    const approved = await merchantWithQuote(permissive());
    const held = await merchantWithQuote(testIdentity());
    const refused = await merchantWithQuote(permissive());
    const tripleFault: AgentIdentity = {
      ...testIdentity({ currency: 'USD', valid_until: '2026-10-26T00:00:00Z' }),
      agent: 'agent-impostor',
    };

    const outcomes = [
      await placeOrder(approved.connection, permissive(), approved.quote_id),
      await placeOrder(held.connection, testIdentity(), held.quote_id),
      await placeOrder(refused.connection, tripleFault, refused.quote_id),
    ];

    expect(
      outcomes.map((outcome) => {
        switch (outcome.status) {
          case 'approved':
            return { status: outcome.status, body: outcome.order.body };
          case AWAITING_CONFIRMATION:
            return { status: outcome.status, body: outcome.held.body };
          case 'refused':
            return {
              status: outcome.status,
              code: outcome.refusal.code,
              reasons: outcome.refusal.reasons.map((entry) => entry.reason),
            };
        }
      }),
    ).toEqual([
      {
        status: 'approved',
        body: { status: 'approved', order_id: 'order_000001' },
      },
      {
        status: 'awaiting_confirmation',
        body: {
          status: 'awaiting_confirmation',
          order_id: 'order_000001',
          confirmation_token: 'confirm_000001',
        },
      },
      {
        status: 'refused',
        code: 'mandate_refused',
        reasons: ['agent_mismatch', 'mandate_expired', 'currency_mismatch'],
      },
    ]);
  });
});

describe('bodies the shipped merchant never sends', () => {
  it('carries through an approved order whose status word is not "approved"', async () => {
    // T07b's paid path. The agent must not reject a word it was not compiled
    // against; `approvedSchema` reads `status` as a string for this reason.
    const { connection } = await stubAnswering({
      body: { status: 'paid', order_id: 'order_future', paid_at: '2026-10-28T09:00:00.000Z' },
    });

    const outcome = await placeOrder(connection, permissive(), 'quote_000001');

    expect(outcome).toEqual({
      status: 'approved',
      order: {
        order_id: 'order_future',
        status: 'paid',
        body: { status: 'paid', order_id: 'order_future', paid_at: '2026-10-28T09:00:00.000Z' },
      },
    });
  });

  it('throws, rather than refusing, when a success body is neither shape (D73)', async () => {
    const { connection } = await stubAnswering({ body: { surprise: true } });

    await expect(placeOrder(connection, permissive(), 'quote_000001')).rejects.toThrow(
      /place_order returned a body the agent cannot read/,
    );
  });
});
