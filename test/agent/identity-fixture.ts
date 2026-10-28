/**
 * One mandate, signed with a throwaway key, for the agent suites.
 *
 * The claims are the README's mandate: GBP, a 5000 total cap, a 2500
 * per-transaction cap and a 2000 human-confirm threshold. The key pair is
 * generated once per process and never leaves it.
 */

import { generateMandateKeyPair, issue } from '../../mandate/index.js';

import type { AgentIdentity } from '../../agent/index.js';
import type { MandateClaims } from '../../mandate/index.js';

/** The agent id the suites use. */
export const TEST_AGENT = 'agent-buyer-1';

/** The merchant id the mandate is good at. */
export const TEST_MERCHANT = 'merchant-demo';

const keys = generateMandateKeyPair();

/** The public half, for a test that wants to verify what the agent sent. */
export const TEST_PUBLIC_KEY = keys.publicKey;

/** The README mandate's claims. */
export const TEST_CLAIMS: MandateClaims = {
  mandate_id: '11111111-2222-4333-8444-555555555555',
  principal: 'user-andrea',
  agent: TEST_AGENT,
  merchant: TEST_MERCHANT,
  currency: 'GBP',
  amount_cap_minor: 5000,
  per_transaction_cap_minor: 2500,
  valid_from: '2026-10-25T00:00:00Z',
  valid_until: '2026-10-30T00:00:00Z',
  human_confirm_above_minor: 2000,
};

/** The identity the agent runs under: an agent id and a signed mandate (D72). */
export function testIdentity(over: Partial<MandateClaims> = {}): AgentIdentity {
  const claims = { ...TEST_CLAIMS, ...over };
  return { agent: claims.agent, mandate: issue(claims, keys.privateKey) };
}
