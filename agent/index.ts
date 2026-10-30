/**
 * The buyer agent: an MCP client, a planner that decides, and a runner that
 * calls.
 *
 * ```ts
 * // The merchant takes orders only with an issuer key in its environment
 * // (D60), and `connectStdio` passes the child nothing beyond the SDK's
 * // default allowlist (D105), so the transport is built here with the key
 * // that verifies `mandate`.
 * const merchant = await connect(new StdioClientTransport({
 *   command: 'npx',
 *   args: ['tsx', 'merchant/stdio.ts'],
 *   env: { ...getDefaultEnvironment(), ACR_MANDATE_PUBLIC_KEY: exportPublicKey(publicKey) },
 * }));
 * console.log(merchant.protocolVersion);   // '2026-07-28'
 *
 * const result = await runPlan({
 *   planner: scriptedPlanner(),            // list, pick two, cart, quote, order
 *   caller: merchant,
 *   identity: { agent: 'agent-buyer-1', mandate },
 * });
 *
 * switch (result.outcome.kind) {
 *   case 'ordered':                 // paid
 *   case 'awaiting_confirmation':   // a human has to say yes; the token is here
 *   case 'refused':                 // the merchant said no; a mandate refusal lists its reasons
 *   case 'stopped':                 // the plan ended without an order
 * }
 * ```
 *
 * `StdioClientTransport` and `getDefaultEnvironment` come from
 * `@modelcontextprotocol/client/stdio`, `exportPublicKey` from `mandate/`.
 * With `connectStdio({ command: 'npx', args: ['tsx', 'merchant/stdio.ts'] })`
 * instead, the same plan ends `refused` at `place_order` with
 * `merchant_misconfigured`.
 *
 * The three seams, and the reason for each:
 *
 * - {@link Planner} decides the next step and cannot make a call (D70).
 * - {@link ToolCaller} makes a call and cannot decide (D70).
 * - {@link AgentIdentity} carries the mandate and the agent id, injected, and
 *   is read by exactly one step (D72).
 *
 * T09 wires this into `npm run demo`.
 */

export {
  AGENT_CLIENT_INFO,
  NEGOTIATE_NEWEST,
  connect,
  connectStdio,
} from './client.js';
export type {
  ConnectOptions,
  MerchantConnection,
  StdioServerCommand,
  ToolCaller,
  ToolOutcome,
} from './client.js';

export type { AgentIdentity } from './identity.js';

export {
  APPROVED,
  AWAITING_CONFIRMATION,
  PLACE_ORDER_TOOL,
  placeOrder,
} from './order.js';
export type { HeldOrder, OrderOutcome, PlacedOrder } from './order.js';

export { EMPTY_MEMORY } from './planner.js';
export type { PlanMemory, PlanStep, PlanStepKind, Planner, ProductPick } from './planner.js';

export {
  MANDATE_REFUSED_CODE,
  UNSTRUCTURED_REFUSAL_CODE,
  describeRefusal,
  readRefusal,
} from './refusal.js';
export type { MerchantRefusal, RefusalReason } from './refusal.js';

export { DEFAULT_MAX_STEPS, runPlan } from './run.js';
export type { RunOptions, RunOutcome, RunResult } from './run.js';

export { PICK_COUNT, pickIds, scriptedPlanner, twoCheapest } from './scripted.js';
export type { ProductChoice, ScriptedPlannerOptions } from './scripted.js';

export { priceOf, totalOf } from './wire.js';
export type { AgentCart, AgentProduct, AgentQuote } from './wire.js';
