# MANDATE

The mandate field by field, how it is signed, what the merchant checks, and
how all of it lines up against AP2's two-mandate model.

Everything about this repository's own mandate is tied to the file that
implements it or the decision that ruled it. Everything about AP2 is tied to a
page on `ap2-protocol.org` that was opened and read for this document on
**2026-10-28**; §7 says which pages, and what could not be established is
marked UNVERIFIED rather than guessed.

## 1. The object

A mandate is flat: ten claims and a signature over them
(`mandate/types.ts`). It is kept flat for Stage 1 deliberately — the gap to
AP2 is better described than half-implemented, and this document is where the
description was always going to live (D10).

```json
{
  "mandate_id": "11111111-1111-4111-8111-111111111111",
  "principal": "principal-demo",
  "agent": "agent-buyer-1",
  "merchant": "merchant-demo",
  "currency": "GBP",
  "amount_cap_minor": 5000,
  "per_transaction_cap_minor": 2500,
  "valid_from": "2026-10-25T00:00:00Z",
  "valid_until": "2026-10-26T00:00:00Z",
  "human_confirm_above_minor": 3000,
  "signature": "<Ed25519 over the ten fields above, base64url — not printed>"
}
```

That is copied from `npm run demo`, which prints the mandate JSON **once**, in
run 1 (`scripts/demo.ts`, `printMandateJson` is called from `runOne` only). The
signature placeholder is the demo's own: the key pair is generated fresh in
memory every run and nothing derived from it is printed, which is what keeps
two invocations byte-identical (D103). Run 2's mandate differs in two fields
and is described rather than printed — see §1a.

| Field | Type | Holds | Checked by |
| --- | --- | --- | --- |
| `mandate_id` | string (a UUID) | the identity of this authority. The key the spend ledger is keyed on, and the only identifier the issuer and the merchant both already hold (D44) | nothing checks it; it is the ledger key and appears on every audit entry |
| `principal` | string | the human who granted the authority | nothing. It is recorded, not verified: Stage 1 has no notion of a principal identity |
| `agent` | string | the agent the authority was granted *to* | compared with the `agent` argument of `place_order` → `agent_mismatch` |
| `merchant` | string | the single merchant the authority is good at | compared with the merchant's own configured id → `merchant_mismatch` |
| `currency` | string (ISO 4217) | the currency every cap below is denominated in | compared with the quote's currency → `currency_mismatch` |
| `amount_cap_minor` | integer, minor units | the total the agent may spend under this mandate, ever | compared with the amount plus what the ledger says is spent → `budget_exceeded` |
| `per_transaction_cap_minor` | integer, minor units | the ceiling for any one order | compared with the amount → `per_transaction_cap_exceeded` |
| `valid_from` | ISO 8601 instant, UTC | not valid before this | compared with the clock → `mandate_not_yet_valid` |
| `valid_until` | ISO 8601 instant, UTC | not valid after this | compared with the clock → `mandate_expired` |
| `human_confirm_above_minor` | integer, minor units | above this amount a purchase pauses for a human | compared with the amount → the outcome `confirm_required`, which is not a refusal (D41) |
| `signature` | string, base64url | Ed25519 over the canonical form of the ten claims above | `verify()`, the second gate → `signature_invalid` or `mandate_malformed` |

Two structural notes. `MandateClaims` is declared first and `Mandate extends
MandateClaims`, so the signed fields appear once, in reading order, with their
units (`mandate/types.ts`, D25). And `signature` is the one field the signature
does not cover — `SIGNATURE_FIELD` names it, and the canonicaliser strips it
(D23).

Money is always an integer count of minor units: 2500 is £25.00, never 25.0
(D16). `MinorUnits` is an unbranded `number`, so the check happens at run time
at every boundary money crosses (`mandate/ledger.ts`).

### 1a. The demo's two mandates

The demo issues two, and they differ in **two** fields
(`scripts/demo.ts`, `RUN_ONE` and `RUN_TWO`):

| Field | Run 1 | Run 2 |
| --- | --- | --- |
| `mandate_id` | `11111111-1111-4111-8111-111111111111` | `22222222-2222-4222-8222-222222222222` |
| `human_confirm_above_minor` | 3000 | 2000 |

Every other field is identical, including the 5000 total cap, the 2500
per-transaction cap and the 25-to-26 October window. The basket is 2045 pence
both times, so **the threshold is the field that decides the path** — under it
in run 1, over it in run 2.

The `mandate_id` differs for a different reason, and not to isolate the
budgets: each run calls `startMerchant()`, which builds its own
`createMandatePolicy(...)`, so each run already has its own spend ledger and
its own audit log (`scripts/demo.ts`). The ids are distinct because they have
to be **literals** rather than `randomUUID()` for the output to be
reproducible (D103), and giving each run its own makes the audit lines say
which authority they belong to — run 1's log names `1111…`, run 2's names
`2222…`. D106 describes the two runs as differing by exactly one field; it is
ruled, so D116 records the correction rather than editing it.

## 2. How it is signed

Ed25519 over a canonical serialisation of the claims, via `node:crypto`, with
no dependency and the whole signing path readable in about thirty lines
(`mandate/sign.ts`, D22).

### The canonical bytes (D23)

`canonicalise()` in `mandate/canonical.ts`, in full:

1. `signature` is removed.
2. Every remaining key whose value is not `undefined` is kept — **every field
   present is signed**, not a fixed allowlist, so a field added later (a nonce
   in T12, say) is covered without touching the canonicaliser.
3. Keys are sorted by UTF-16 code unit, so key order in the incoming object
   cannot change the bytes.
4. The result is JSON with no insignificant whitespace, signed as UTF-8.

A value that cannot be serialised, or a number that is not finite, raises
`CanonicalisationError` rather than producing bytes.

Two consequences are worth stating. First, this is **our own rule, not a cited
standard**: a non-TypeScript verifier has to reimplement it from the doc
comment. The mandate is flat and holds only strings and integers, which is the
subset where these rules and JCS (RFC 8785) agree — but that is coincidence on
this field set, not conformance, and it would not survive nested objects or
floats unchanged (D23). Second, because every field present is signed, a field
added to a mandate *after* it was signed must reach `verify()` to break the
signature. That is why the merchant's wire schema is a `looseObject` that
passes unknown fields through rather than stripping them
(`merchant/mandate-wire.ts`, D67).

### Encoding (D24)

`signature` is the 64 raw bytes as unpadded base64url, 86 characters. Public
keys move as DER SPKI, base64url, 59 characters, written by `exportPublicKey()`
and read by `importPublicKey()`, which rejects anything that is not Ed25519.
SPKI rather than the bare 32 bytes because it carries the algorithm with the
key: a verifier cannot be handed 32 bytes and talked into reading them as the
wrong curve.

### What `verify()` does, and does not (D25, D26, D40)

`verify(mandate, publicKey)` returns `{ ok: true }` or
`{ ok: false, reason }`, never a boolean and never a throw for a bad mandate.
The two reasons are deliberately distinct:

- `signature_invalid` — a signature check was possible and it failed.
- `mandate_malformed` — the object could not be reduced to canonical bytes at
  all, or the signature is absent or empty, so **no check was possible**.

The audit log should be able to tell a forged mandate from a broken caller;
they want different responses from the merchant (D26).

`verify()` throws only on a caller error — a key that is not Ed25519. And it
answers the narrow question only: whether the mandate is the issuer's and
unchanged since. Whether it is in date, names the right agent, or has budget
left is `checkMandate()`'s job (D40).

### Where the key comes from

The merchant reads the issuer's public key from `ACR_MANDATE_PUBLIC_KEY` in its
environment, once, at startup (`merchant/config.ts`, D60). It is never a tool
argument: a caller that supplied the public key could sign a mandate itself and
hand over the matching key, and `signature_invalid` could never fire. A key that
cannot be read throws at startup; a merchant started with no key still serves
its catalogue and refuses `place_order` with `merchant_misconfigured`.

Nothing secret is read there — a public key is not a secret — and no key
material is ever logged or printed (D60, D103).

## 3. The policy checks, in the order they run

`checkMandate(policy, request)` in `mandate/policy.ts`. **Two gates, then
seven checks** (D42, D43).

### The two gates

Fail either and the pass stops. An amount that is not a number cannot be
compared to a cap, and claims under a broken signature are not the issuer's to
answer for. Both are reported if both failed.

| | Gate | Refusal reason |
| --- | --- | --- |
| 1 | the amount is a whole number of minor units **above zero** | `amount_invalid` |
| 2 | the signature holds under the configured public key | `signature_invalid` or `mandate_malformed` |

Gate 1 refuses zero as well as fractions (D58). A zero-value purchase has
nothing to authorise, and `StubRail` already refuses one — with the mandate
layer allowing what the rail would then reject, an order could pass every
policy check and die at the rail, which is the one outcome a reference
implementation should not demonstrate. The reason code is `amount_invalid`,
the name the rail already uses for the same case (D59).

### The seven checks

Past the gates, **all seven run** and every failure is named, in check order.
An agent developer with a misconfigured mandate learns everything wrong with it
in one call instead of one round trip per problem (D42).

| | Check | Refusal reason |
| --- | --- | --- |
| 1 | `mandate.agent` is the agent making the purchase | `agent_mismatch` |
| 2 | `mandate.merchant` is this merchant | `merchant_mismatch` |
| 3 | `valid_from` and `valid_until` are readable, and now is inside them | `mandate_window_invalid`, `mandate_not_yet_valid`, `mandate_expired` |
| 4 | `mandate.currency` is the currency of the amount | `currency_mismatch` |
| 5 | the mandate's own two caps and its threshold are usable amounts | `mandate_limits_invalid` |
| 6 | the amount is within `per_transaction_cap_minor` | `per_transaction_cap_exceeded` |
| 7 | the amount is within `amount_cap_minor` less what the ledger has recorded | `budget_exceeded` |

Check 3 is one check with three outcomes: an unreadable window suppresses the
two comparisons that depend on it.

Currency comes **before** the caps (D43), and a currency mismatch or an
unusable limit suppresses checks 6 and 7. A cap denominated in GBP says nothing
about an amount in USD: comparing them anyway would either refuse with a reason
that is not the real one — "over cap" when the answer is "wrong currency" — or,
worse, allow a purchase because 2500 of one currency is under a cap of 5000 of
another. PRD R2 originally listed the caps before the currency; the code is
right and the PRD has been corrected.

A mandate whose own limits or window are unusable is **refused and logged**,
not thrown (D47). The mandate arrives over the wire from outside the merchant,
and a merchant should refuse what it cannot evaluate and write that down rather
than crash a tool call.

### The twelve reason codes

`PolicyRefusalReason` in `mandate/decision.ts`:
`signature_invalid`, `mandate_malformed`, `amount_invalid`, `agent_mismatch`,
`merchant_mismatch`, `mandate_window_invalid`, `mandate_not_yet_valid`,
`mandate_expired`, `currency_mismatch`, `mandate_limits_invalid`,
`per_transaction_cap_exceeded`, `budget_exceeded`.

Eleven of the twelve are reachable through `place_order`. `amount_invalid` is
not, and is left unreached on purpose: the amount comes from a stored quote,
and every quote is issued for a cart with at least one line (D37), at a whole
quantity of at least one (D19), at an integer unit price (D16), so the total is
always a positive integer. A test pins that invariant rather than faking an
impossible quote (D68).

## 4. The three outcomes

`PolicyDecision` is a union discriminated on `outcome`, not a boolean
(`mandate/decision.ts`, D41).

| Outcome | Means | Carries | What `place_order` does |
| --- | --- | --- | --- |
| `allow` | the mandate covers this purchase | `remaining_budget_minor` | authorise, capture, record — answers `paid` (D88) |
| `confirm_required` | the mandate covers it, and the amount is above the threshold the person set | `remaining_budget_minor`, `human_confirm_above_minor` | holds the order, answers `awaiting_confirmation` with a token |
| `refuse` | one or more checks failed | `refusals`, never empty, in check order | throws `MandateRefusedError`, code `mandate_refused` |

The middle one is the reason this is a union. Above `human_confirm_above_minor`
**nothing is wrong**: the mandate covers the purchase and the user asked to be
consulted at that size. Calling it a refusal would make every caller
special-case one reason code out of twelve (D41).

Every decision, whichever way it went, is recorded in the audit log before
`checkMandate()` returns, so a caller cannot forget to log one (D48). Nothing
in the policy moves money or consumes budget — `recordSpend()` does that, after
the rail has succeeded (D45).

Refusals reach the agent as `{"error":{"code":"mandate_refused","message":…,
"reasons":[{"reason","message"},…]}}` — the policy's own `PolicyRefusal`
objects passed through unchanged, in check order (`merchant/errors.ts`, D66).
The messages travel with the codes because the policy writes them for exactly
this reader and they carry specifics a code cannot.

## 5. Mapping the flat mandate to AP2

AP2 — the Agent Payments Protocol, published by Google — is the specification
this repository's core idea is taken from: a cryptographically signed, scoped
authorisation that a verifier checks before any money moves (SOURCES.md). D10
requires this mapping, and the honest summary is that the **idea** transfers
and almost none of the **shape** does.

AP2 defines **two** mandate types, each with an open and a closed stage, both
as SD-JWTs:

- **Checkout Mandate** — created by the Shopping Agent, rendered to the User by
  the Trusted Surface, verified by the Merchant.
- **Payment Mandate** — created by the Shopping Agent, rendered to the User by
  the Trusted Surface, and "verified by the Credential Provider, Network, and
  Merchant Payment Processor".

This repository has **one** mandate doing part of both jobs. That is D10's
ruling, and the reason it is defensible is in its cost line: a stub rail has no
payment processor to hold a Payment Mandate.

### 5.1 Field by field

AP2 column shows the nearest AP2 field and which mandate it sits on. "—" means
the concept has no field in AP2 as read.

| Ours | AP2 | Verdict |
| --- | --- | --- |
| `mandate_id` | — (AP2 identifies the *transaction*: `checkout_hash` on the closed Checkout Mandate, `transaction_id` on the closed Payment Mandate, both base64url hashes of the merchant-signed `checkout_jwt`) | **Divergence.** Ours names the *authority* and is chosen by the issuer; AP2's names the *transaction* and is derived by hashing. Ours has to be issuer-chosen because it is the spend ledger's key across many purchases (D44) — AP2's cannot do that job, since a per-transaction hash is different every time. |
| `principal` | — | **Divergence.** No AP2 mandate field names the user as read; the User is the party the Trusted Surface renders to and who authorises the open mandate. Ours records a principal string that nothing verifies. |
| `agent` | `cnf` on an open mandate, which carries the agent's public key as a JWK for key binding. The specification says open mandates "MUST include the agent's public key as a `cnf` claim" | **The most important row.** AP2 binds the agent **cryptographically**; we bind it **by name only**. Our `agent_mismatch` compares a signed name with a caller-supplied string and nothing proves the caller is that agent (D61). AP2's `cnf` is exactly the mechanism that gap is missing. |
| `merchant` | open Checkout Mandate: an entry in `constraints` of type `checkout.allowed_merchants`, whose `allowed` is a list of Merchant objects `{id, name, website?}`. Closed Payment Mandate: `payee`, one Merchant object | **Partial.** The concept matches and is the closest thing to a direct hit. AP2 allows a **list** of merchants and a structured object; ours is exactly one merchant as a bare string. |
| `currency` | `payment_amount.currency` on the Payment Mandate — "ISO-4217 3-letter alphabetic currency code" | **Match in vocabulary, divergence in placement.** Both are ISO 4217. AP2's sits on the amount of *one* payment; ours denominates a standing set of caps. |
| `amount_cap_minor` | the `payment.budget` constraint on an open Payment Mandate: `max` (number, required, "Maximum amount for the budget.") and `currency` (required). Its Evaluation reads: "the requested amount plus the total sum of amounts from previously closed Payment Mandates MUST be less than or equal to `max`. After approval, the amount MUST be added to the accumulated total for future evaluation." | **The closest thing in AP2 to anything in this repo, and a match in semantics.** That paragraph is our spend ledger, specified: check the request against the accumulated total, then add to it. We do the same in `mandate/policy.ts` (`amount_cap_minor` less `ledger.spent(mandate_id)`) and `mandate/ledger.ts`. The divergence is **where the accumulated total lives and how long it lasts**: AP2 leaves it with whoever verifies the mandate, and ours is an in-memory `Map` in one merchant process, so a restart honours the full cap again and two merchant processes under one mandate would each allow all of it (D44). One unit note: AP2 types `budget.max` as `number` and does not say minor units, where its `payment.amount_range.max` does; ours is always an integer of minor units (D16). |
| `per_transaction_cap_minor` | the `payment.amount_range` constraint on an open Payment Mandate: `max` (integer, required, "Maximum allowed amount in minor (cents) unit of currency"), `min` (integer, optional, "Minimal amount in minor (cents) unit of currency. If absent, there is no minimum") and `currency` (string, required, "ISO4217 Alpha-3 currency code") | **Near-match, and the closest of any row on units.** AP2's `max` is a per-payment ceiling in minor units with the currency carried beside it, which is exactly what `per_transaction_cap_minor` plus `currency` is. Its Evaluation — "The `payment_amount` property of the Payment Mandate MUST be within the range defined by `min` and `max`. The `currency` property of the Payment Mandate MUST match the `currency` property of this constraint" — is `per_transaction_cap_exceeded` and `currency_mismatch` together, and in the same order the policy runs them (D43). Two differences: AP2 also offers a floor (`min`), which we have no use for, and its constraint carries its own currency where ours is denominated once for the whole mandate. |
| `valid_from` | — for the mandate's own validity (`iat` is issuance, which is not the same claim). The nearest named field is `not_before` ("Earliest valid execution date") on the `payment.execution_date` constraint, which bounds *when the payment may execute*, not when the authority opens | **Divergence.** Ours states an explicit instant before which the authority is not usable, and refuses `mandate_not_yet_valid` against it. AP2 has no such claim on either mandate: a mandate is usable from issuance until `exp`. `execution_date.not_before` is a different question asked about the payment. |
| `valid_until` | `exp` | **Match.** The nearest thing to a clean one. AP2's is an integer Unix epoch and ours an ISO 8601 string. AP2 additionally recommends setting `exp` on open mandates "to the smallest value that will allow the Shopping Agent to complete the assigned task" — advice this repo does not follow, since a demo mandate runs for a day. |
| `human_confirm_above_minor` | — | **Divergence, and ours is the addition.** AP2 draws the human line structurally — Direct mode versus Autonomous mode, with the Trusted Surface rendering the mandate to the User — rather than with a per-amount threshold inside the credential. A number above which software must stop and ask is this repository's own idea, and it is the one the demo is built to show. |
| `signature` | the SD-JWT itself: a JWS with selective-disclosure salted claim digests | **Divergence, ruled.** Ours is a raw Ed25519 signature over canonical JSON carried in the object's own `signature` member (D22, D23, D24). No selective disclosure, no JWT header to negotiate algorithms with, and **no interoperability with an AP2 verifier** — if Stage 2 needs one, the signing format changes, not just the encoding. |

AP2 fields with no counterpart here at all, because there is no Payment
Mandate: `payment_instrument` (`{id, type, description?}`), `pisp`,
`execution_date`, `risk_data`, and on the Checkout Mandate `checkout_jwt` and
`checkout_hash`.

### 5.1a AP2's ten constraint types, and which of ours each answers

An open mandate's `constraints` array is where AP2 puts everything our flat
mandate puts in named fields, so the inventory is the fairest way to see how
much of our mandate AP2 already has. There are **ten** constraint types, each
with its own heading, property table and Evaluation paragraph — eight on the
Payment Mandate page and two on the Checkout Mandate page, all read
2026-10-28.

| AP2 constraint type | What it bounds | Our nearest field |
| --- | --- | --- |
| `payment.amount_range` | `max`, optional `min`, `currency` — the amount of one payment, in minor units | `per_transaction_cap_minor` plus `currency` |
| `payment.budget` | `max`, `currency` — the accumulated total across previously closed Payment Mandates | `amount_cap_minor`, against the spend ledger |
| `payment.allowed_payees` | `allowed`, an array of Merchant objects | `merchant` (ours is one, not a list) |
| `payment.agent_recurrence` | `frequency` (`ON_DEMAND`, `DAILY`, `WEEKLY`, `BIWEEKLY`, `MONTHLY`, `QUARTERLY`, `ANNUALLY`) and optional `max_occurrences` | **nothing.** We have no order-rate limit; PRD §6 names it as out of scope |
| `payment.execution_date` | optional `not_before` and `not_after` on when the payment may execute | **nothing** |
| `payment.allowed_payment_instruments` | `allowed`, an array of PaymentInstrument | **nothing** — there is no instrument in this repo, only a rail |
| `payment.allowed_pisps` | `allowed`, an array of Pisp | **nothing** |
| `payment.reference` | `conditional_transaction_id`, the digest of the associated open Checkout Mandate | **nothing** — our binding is the stored quote, not a digest (D39) |
| `checkout.allowed_merchants` | `allowed`, an array of Merchant `{id, name, website?}` | `merchant` |
| `checkout.line_items` | `items`, an array of LineItemRequirements `{id, acceptable_items, quantity}` | **nothing.** We bound the total, never the basket's contents |

Read down the right-hand column and the shape of the divergence is clear:
**AP2 bounds mostly content and cadence, and we bound mostly money.** Three of
ours have a close AP2 counterpart (`per_transaction_cap_minor`,
`amount_cap_minor`, `merchant`), and the three AP2 constraints with no
counterpart here that a reviewer should notice are `agent_recurrence` (a rate
limit), `checkout.line_items` (what may be bought) and
`allowed_payment_instruments` (what it may be bought with). Of ours,
`human_confirm_above_minor` is the one with no AP2 constraint at all.

### 5.2 Structural divergences

Five, and they matter more than any row above.

**One mandate, not two.** AP2 separates the authorisation a *merchant* verifies
from the one a *payment processor* verifies, and shares them with different
parties — the Payment Mandate reaches the Credential Provider, the Network and
the Merchant Payment Processor, parties that never see the checkout. Our single
object is presented to the merchant and to nobody else, and the rail is
explicitly forbidden to see it: `rail/` imports nothing from `mandate/`, and a
rail that could read the caps would invite a second, divergent copy of the
policy (D51).

**No open/closed stage.** In AP2 an *open* mandate carries constraints and the
agent's key and is not yet bound to a transaction; a *closed* one is bound to a
specific checkout by hash, and the verifier confirms the closed mandate matches
the open one's constraints. Our mandate is permanently open in that sense: it
carries constraints and is never narrowed to a particular cart. The binding to
one specific purchase happens on the **merchant's** side instead — the stored,
expiring, cart-version-tied quote (D38, D39) — not in a second credential. That
is a real difference in where trust sits: AP2 makes the agent produce a signed
artefact naming the exact purchase, and we make the merchant remember it.

**Who signs what.** AP2: the User or Trusted Surface authorises open mandates,
and the Shopping Agent signs closed ones with its own Agent Key. Here there is
one issuer key, the agent signs nothing, and the agent has no key at all —
which is the same gap as the `agent` row above, seen from the other end.

**Nothing to disclose selectively.** The README mandate is flat and every field
of it is something the merchant needs in order to decide, so there is nothing
to withhold and SD-JWT's central feature would be carrying no weight (D22). In
AP2 it carries real weight: `checkout_jwt` is selectively disclosable while
`checkout_hash` is not, so a verifier can be given the binding without the
basket.

**No Mandate Receipts, and the running total sits in one place only.** AP2
keeps the history on both sides: the verifier accumulates against
`payment.budget` ("After approval, the amount MUST be added to the accumulated
total for future evaluation") and the agent stores an open mandate, closed
mandate and receipt tuple and reduces the scope of its open mandate as it is
used (`/ap2/agent_authorization/`). We have only the verifier half — the spend
ledger — and it is the merchant's, not the agent's, is not a credential, and
does not survive the process (D44). So an agent here cannot tell what it has
left without asking, and no second party can check the merchant's arithmetic.

## 6. Revocation

This repository has none, by design: a mandate ends only at `valid_until`
(PRD §6, `mandate/policy.ts`). A revoked-id check in the policy step is the
likely design and a candidate for Stage 2.

That gap is not one AP2 closes either. On the pages read on 2026-10-28 —
specification, checkout_mandate, payment_mandate, agent_authorization,
implementation_considerations — **AP2 defines no verifier-checked revocation
mechanism**: no revocation list, no status endpoint, nothing a merchant or a
processor consults before accepting a mandate. What it offers instead is
advice. The specification recommends setting `exp` on open mandates "to the
smallest value that will allow the Shopping Agent to complete the assigned
task", and the implementation considerations say "As Mandates are long-lived,
the Shopping Agent SHOULD provide a mechanism to manage active Mandates (along
with the tasks they are being used in)" and that "Limiting the duration of
active Mandates, and providing notifications to the User, even when executing
autonomously, is important to keep the User in control of their Shopping
Agent."

So AP2 puts mandate management on the **agent**, and expiry does the rest. This
repository relies on expiry too. The difference is only that AP2 says so
explicitly and recommends short windows; the PRD's open question stands, and
is now answered to the extent the public pages answer it.

## 7. What was read, and what has moved

SOURCES.md records AP2 as read on **2026-10-27**, from
`https://ap2-protocol.org/ap2/specification/`,
`https://ap2-protocol.org/ap2/checkout_mandate/` and
`https://ap2-protocol.org/`.

For this document, on **2026-10-28**, those first two were opened again, plus
three pages SOURCES.md does not list:

- `https://ap2-protocol.org/ap2/payment_mandate/` — the Payment Mandate's own
  page, which is where its field list actually lives. SOURCES.md's Payment
  Mandate notes came from the specification page, which points at this one.
- `https://ap2-protocol.org/ap2/agent_authorization/`
- `https://ap2-protocol.org/ap2/implementation_considerations/`

**Has the specification changed since SOURCES.md was written? Nothing read
contradicts it.** The two mandate type names, the four `vct` values, the closed
Checkout Mandate's fields, the SD-JWT format, the open/closed split and the
`cnf` binding in autonomous mode are all as SOURCES.md records them, one day
later. Three things are *refinements* SOURCES.md did not carry, rather than
changes:

1. SOURCES.md says the open Checkout Mandate "carries constraints:
   `checkout.allowed_merchants` and `checkout.line_items`". More precisely,
   those two are **`type` values of entries in a `constraints` array**, not
   field names; the sub-fields are `allowed` and `items` respectively. They are
   also only two of **ten** constraint types across the two mandate pages: the
   other eight are on the Payment Mandate page and are listed in §5.1a.
2. SOURCES.md does not mention `cnf`, `iat` or `exp` on the **open** Checkout
   Mandate. The page lists all three.
3. SOURCES.md says the Payment Mandate is "Bound to the checkout by hash"
   without naming the field. It is `transaction_id`, described as the
   "Base64url-encoded hash of checkout_jwt".

SOURCES.md belongs to T02 and this task may not edit it; the three points above
are recorded here and in this task's pull request instead.

### The `vct` form: resolved, and one documentation slip

The versioned form is normative. The specification page has a **Mandate
Versioning** section stating that "Implementations MUST match the exact `vct`
string, including the version suffix", so `mandate.payment.1` and
`mandate.checkout.open.1` are the values an implementation uses.

The unversioned text that appears in the `vct` row of each schema table —
"MUST be 'mandate.checkout'" and "MUST be 'mandate.payment'" — is therefore a
slip in those two table cells rather than a second rule. Nothing in this
repository depends on either form.

### UNVERIFIED

One item, down from three. The other two were answerable from the pages §7
already cites and are resolved above and in §5.1a; they were wrong to mark.

- **Whether any AP2 mandate field names the User**, which is what `principal`
  would map to. None appears in the Checkout Mandate or Payment Mandate field
  tables, in any of the ten constraint types, or anywhere else on the five
  pages read: the User appears as a party in prose — the one the Trusted
  Surface renders a mandate to, and who authorises an open one — and the
  nearest thing to a user-facing string is
  `payment_instrument.description`, "Description of the instrument to be
  displayed to the user for informational purposes". So AP2 identifies the
  payee, the agent (by key), the instrument and the PISP, and not the person.
  Stated as UNVERIFIED rather than as a flat "AP2 has no such field" because
  it is an absence across five pages rather than something a page says.
