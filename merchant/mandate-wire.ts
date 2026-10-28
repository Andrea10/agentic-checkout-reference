/**
 * The mandate as it arrives on a `place_order` call.
 *
 * The mandate layer owns what a mandate *means*; this file owns only how one
 * is described to an MCP client, because the tool's advertised JSON Schema has
 * to come from somewhere and `mandate/` has no business importing zod.
 *
 * Two properties of the schema below are deliberate (D67):
 *
 * 1. **It describes shape, not validity.** The money fields are `number`, not
 *    `int`; the instants are `string`, not `datetime`. A mandate with a
 *    fractional cap or an unreadable window is therefore *accepted* here and
 *    refused by the policy, with the reason code `mandate_limits_invalid` or
 *    `mandate_window_invalid` and an entry in the audit log. Had the schema
 *    enforced the rules, those refusals would arrive as protocol errors from
 *    the SDK instead: nothing logged, no reason code, and the merchant's own
 *    policy never consulted.
 * 2. **Unknown fields pass through.** `looseObject` rather than `object`,
 *    because zod's `object` strips keys it does not know. T03 signs every
 *    field present, so a field added to a mandate after it was signed must
 *    reach `verify()` to break the signature; a schema that quietly removed it
 *    first would hand the policy a mandate that verifies. T12's replay and
 *    tampering suite depends on this.
 */

import * as z from 'zod';

import type { Mandate } from '../mandate/index.js';

/** The flat mandate of README.md, as an MCP tool argument. */
export const mandateWireSchema = z.looseObject({
  mandate_id: z.string().describe('Unique id of this mandate (a UUID).'),
  principal: z.string().describe('The person who granted the spending authority.'),
  agent: z.string().describe('The agent the authority was granted to.'),
  merchant: z.string().describe('The one merchant the authority is good at.'),
  currency: z
    .string()
    .describe('ISO 4217 code every cap below is denominated in, e.g. "GBP".'),
  amount_cap_minor: z
    .number()
    .describe('Total the agent may spend under this mandate, in minor units.'),
  per_transaction_cap_minor: z
    .number()
    .describe('Ceiling for any one order, in minor units.'),
  valid_from: z.string().describe('ISO 8601 UTC instant the mandate opens.'),
  valid_until: z.string().describe('ISO 8601 UTC instant the mandate closes.'),
  human_confirm_above_minor: z
    .number()
    .describe('Above this amount the order is held for a human to confirm.'),
  signature: z
    .string()
    .describe('Ed25519 signature over the canonical claims, base64url, unpadded.'),
});

export type MandateWire = z.infer<typeof mandateWireSchema>;

/**
 * The parsed argument, as the mandate layer wants it.
 *
 * A function rather than a cast: it compiles only while the schema above still
 * describes every field of {@link Mandate}, so adding a field to the mandate
 * without adding it here is a build error rather than a runtime surprise.
 */
export function asMandate(wire: MandateWire): Mandate {
  return wire;
}
