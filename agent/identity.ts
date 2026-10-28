/**
 * Who the agent is, and the authority it is carrying.
 *
 * An agent that spends money has two pieces of identity: the name the
 * merchant knows it by, and the signed mandate that says what it may spend.
 * They are held together, in one object, handed in by whoever started the
 * agent (D72). Nothing in `agent/` reads them from the environment, from a
 * file or from a module-level variable, for three reasons:
 *
 * 1. A mandate is a credential. Code that can reach it from anywhere is code
 *    that can leak it from anywhere.
 * 2. The demo (T09) runs the same agent twice with two different mandates to
 *    show the human-confirm path. That is a parameter, not a reconfiguration.
 * 3. Only one step of the plan — `place_order` — needs it, so the rest of the
 *    agent never has it in scope.
 *
 * The `agent` field is passed to `place_order` explicitly as well as being
 * inside the mandate's `agent` claim. That is not redundant: the mandate says
 * who the authority was *granted to*, and the argument says who is *using
 * it*. The merchant's policy check compares the two and refuses
 * `agent_mismatch` when they disagree, which is the check that stops one
 * agent presenting another's mandate.
 */

import type { Mandate } from '../mandate/index.js';

/** The agent's name and the mandate it holds. Injected, never ambient (D72). */
export interface AgentIdentity {
  /** The agent id the merchant knows this agent by. */
  readonly agent: string;
  /** The signed, scoped spending authority. */
  readonly mandate: Mandate;
}
