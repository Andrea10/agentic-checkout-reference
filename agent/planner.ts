/**
 * The Planner: the half of the agent that decides, and never acts.
 *
 * ## The separation (D70)
 *
 * A {@link Planner} is handed everything the run has learned so far
 * ({@link PlanMemory}) and returns the one thing to do next ({@link PlanStep}).
 * It is synchronous, it returns a description of a tool call rather than
 * making one, and it is given no way to make one: a `Planner` receives no
 * connection, no client and no credentials. Every `await`, every tool call
 * and every refusal lives in the runner (`run.ts`).
 *
 * The reason is testability, and it is not theoretical. "Which product does
 * the agent buy, and does it stop when it is told to stop?" is the part of an
 * agentic checkout worth arguing about, and with this seam those arguments
 * are settled by calling a pure function with a literal. There is no server,
 * no transport, no clock and no mandate in a planner test. The reverse is
 * also true: the runner's tests can drive a planner that returns a fixed
 * step, so the plumbing is checked without any shopping logic in the way.
 *
 * ## Why memory rather than a script (D71)
 *
 * `next()` takes the accumulated state, not a step index, so a planner is a
 * state machine over observations rather than a tape to replay. That is what
 * lets the same `ScriptedPlanner` re-quote after the cart changed, or stop
 * early, without the runner knowing anything about shopping. A fixed list of
 * steps cannot react at all — and an agent that cannot react to a stale quote
 * is an agent that pays a price it was not quoted.
 *
 * ## Determinism (D79)
 *
 * A planner must be a pure function of its memory. No randomness, no reads of
 * the system clock, no I/O. Everything in `agent/` obeys that: the one time
 * the agent needs the time, it is the merchant's `expires_at` that it reads,
 * off the quote.
 */

import type { AgentCart, AgentProduct, AgentQuote } from './wire.js';

/** A product and how many of it to add. */
export interface ProductPick {
  readonly product_id: string;
  readonly quantity: number;
}

/**
 * The next thing to do, as a description rather than a call.
 *
 * `kind` names the merchant tool, except for `stop`, which is how a planner
 * says the plan is over. Each step carries exactly the arguments that tool
 * takes — including the `cart_id`, because the merchant is stateless and
 * wants it on every call (D11), and a runner that inferred it from memory
 * would be deciding. The one thing the runner adds is the mandate and the
 * agent id for `place_order`, because a planner never holds either (D72).
 */
export type PlanStep =
  | { readonly kind: 'list_products' }
  | { readonly kind: 'create_cart' }
  | { readonly kind: 'add_to_cart'; readonly cart_id: string; readonly pick: ProductPick }
  | { readonly kind: 'get_quote'; readonly cart_id: string }
  | { readonly kind: 'place_order'; readonly quote_id: string }
  | { readonly kind: 'stop'; readonly why: string };

/** The tool names a {@link PlanStep} can name. */
export type PlanStepKind = PlanStep['kind'];

/**
 * Everything the run has learned, in one object.
 *
 * `undefined` means "not asked yet", which is what a planner tests against to
 * decide the next step. The fields are `| undefined` rather than optional so
 * that a planner cannot forget a case: under `exactOptionalPropertyTypes`
 * every slot must be named when the memory is built.
 */
export interface PlanMemory {
  /** The catalogue, once listed. */
  readonly products: readonly AgentProduct[] | undefined;
  /** The cart, as the merchant last returned it. */
  readonly cart: AgentCart | undefined;
  /** The most recent quote. */
  readonly quote: AgentQuote | undefined;
}

/** The memory a run starts from: nothing known. */
export const EMPTY_MEMORY: PlanMemory = {
  products: undefined,
  cart: undefined,
  quote: undefined,
};

/**
 * Decides; does not act.
 *
 * @param memory everything observed so far. Never mutated by the planner.
 * @returns the next step, or `{ kind: 'stop' }` to end the run.
 */
export interface Planner {
  /** A name for logs and for the demo transcript. */
  readonly name: string;
  next(memory: PlanMemory): PlanStep;
}
