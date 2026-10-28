/**
 * The runner: the half of the agent that acts, and never decides.
 *
 * It owns the loop. Ask the planner for a step, make the call, fold what came
 * back into the memory, ask again. It knows the shape of every tool and none
 * of the reasons for calling them (D70).
 *
 * ## Stopping
 *
 * The loop ends in exactly four ways, and {@link RunOutcome} names them:
 *
 * - `ordered` — `place_order` was approved.
 * - `awaiting_confirmation` — the merchant is holding the order for a human.
 *   The token is handed back and **nothing else happens** (D74).
 * - `refused` — a tool said no. The run stops at the first refusal, naming
 *   the step that earned it (D73). It is returned, not thrown: a refusal is
 *   the mandate layer working, which is the thing this repository is about.
 * - `stopped` — the planner said to stop, or the step budget ran out.
 *
 * `place_order` is terminal whichever way it answers: the runner never asks
 * for a step after it. That is what keeps the planner free of the question
 * "have I already paid?", and it is why {@link PlanMemory} has no `order`
 * slot.
 *
 * A broken connection, a missing tool or an unreadable body still throws.
 * None of those is an answer about this purchase (D73).
 *
 * ## The step budget
 *
 * {@link RunOptions.maxSteps} bounds the loop. A planner is ordinary code and
 * can have a bug that never reaches `stop`; an agent with a mandate and an
 * unbounded loop is an agent that spends until the cap stops it. The budget
 * is generous and the overrun is reported as a `stopped` outcome with the
 * reason, not swallowed.
 */

import { placeOrder, type HeldOrder, type PlacedOrder } from './order.js';
import { EMPTY_MEMORY, type PlanMemory, type PlanStep, type PlanStepKind, type Planner } from './planner.js';
import { cartSchema, parseBody, productsResponseSchema, quoteSchema } from './wire.js';

import type { ToolCaller } from './client.js';
import type { AgentIdentity } from './identity.js';
import type { MerchantRefusal } from './refusal.js';

/** Steps a run may take before it is declared stuck. */
export const DEFAULT_MAX_STEPS = 24;

/** How a run ended. */
export type RunOutcome =
  | { readonly kind: 'ordered'; readonly order: PlacedOrder }
  | { readonly kind: 'awaiting_confirmation'; readonly held: HeldOrder }
  | {
      readonly kind: 'refused';
      /** The step that was refused. */
      readonly step: PlanStepKind;
      readonly refusal: MerchantRefusal;
    }
  | { readonly kind: 'stopped'; readonly why: string };

/** What a run produced: the outcome, the steps it took, and what it learned. */
export interface RunResult {
  readonly outcome: RunOutcome;
  /** Every step the planner asked for, in order. The demo prints this. */
  readonly steps: readonly PlanStep[];
  readonly memory: PlanMemory;
}

/** Everything a run needs. */
export interface RunOptions {
  readonly planner: Planner;
  readonly caller: ToolCaller;
  /** The agent id and mandate. Only `place_order` reads them (D72). */
  readonly identity: AgentIdentity;
  /** Step budget. Defaults to {@link DEFAULT_MAX_STEPS}. */
  readonly maxSteps?: number;
}

/** A tool call that was refused, carried back out of the step runner. */
interface Refused {
  readonly refused: MerchantRefusal;
}

function isRefused(value: unknown): value is Refused {
  return typeof value === 'object' && value !== null && 'refused' in value;
}

/**
 * Runs one plan to its end.
 *
 * Deterministic given a deterministic planner and a deterministic merchant:
 * nothing here reads a clock or a random source (D79).
 */
export async function runPlan(options: RunOptions): Promise<RunResult> {
  const { planner, caller, identity } = options;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;

  const steps: PlanStep[] = [];
  let memory: PlanMemory = EMPTY_MEMORY;

  const done = (outcome: RunOutcome): RunResult => ({ outcome, steps, memory });

  for (let taken = 0; taken < maxSteps; taken += 1) {
    const step = planner.next(memory);
    steps.push(step);

    if (step.kind === 'stop') {
      return done({ kind: 'stopped', why: step.why });
    }

    if (step.kind === 'place_order') {
      const outcome = await placeOrder(caller, identity, step.quote_id);
      switch (outcome.status) {
        case 'approved':
          return done({ kind: 'ordered', order: outcome.order });
        case 'awaiting_confirmation':
          // Stop. Never confirm on the agent's own authority (D74).
          return done({ kind: 'awaiting_confirmation', held: outcome.held });
        case 'refused':
          return done({ kind: 'refused', step: step.kind, refusal: outcome.refusal });
      }
    }

    const observed = await observe(caller, step, memory);
    if (isRefused(observed)) {
      return done({ kind: 'refused', step: step.kind, refusal: observed.refused });
    }
    memory = observed;
  }

  return done({
    kind: 'stopped',
    why: `the planner did not finish within ${String(maxSteps)} steps`,
  });
}

/** Makes one call and folds the answer into the memory. */
async function observe(
  caller: ToolCaller,
  step: Exclude<PlanStep, { kind: 'stop' } | { kind: 'place_order' }>,
  memory: PlanMemory,
): Promise<PlanMemory | Refused> {
  switch (step.kind) {
    case 'list_products': {
      const outcome = await caller.callTool('list_products', {});
      if (!outcome.ok) return { refused: outcome.refusal };
      const { products } = parseBody(productsResponseSchema, outcome.body, 'list_products');
      return { ...memory, products };
    }

    case 'create_cart': {
      const outcome = await caller.callTool('create_cart', {});
      if (!outcome.ok) return { refused: outcome.refusal };
      const { cart } = parseBody(cartSchema, outcome.body, 'create_cart');
      return { ...memory, cart };
    }

    case 'add_to_cart': {
      const outcome = await caller.callTool('add_to_cart', {
        cart_id: step.cart_id,
        product_id: step.pick.product_id,
        quantity: step.pick.quantity,
      });
      if (!outcome.ok) return { refused: outcome.refusal };
      const { cart } = parseBody(cartSchema, outcome.body, 'add_to_cart');
      return { ...memory, cart };
    }

    case 'get_quote': {
      const outcome = await caller.callTool('get_quote', { cart_id: step.cart_id });
      if (!outcome.ok) return { refused: outcome.refusal };
      const { quote } = parseBody(quoteSchema, outcome.body, 'get_quote');
      return { ...memory, quote };
    }
  }
}
