# ARCHITECTURE

How the pieces fit, what each one checks, and what Stage 1 does not do.

Every statement below is tied to the file that implements it or the decision
that ruled it, in brackets. Where the two disagree, the file wins and the
disagreement is listed in the pull request for this document.

## 1. The one idea

This repository is about **authorisation, not the cart** (README, PRD §0).
The shopping half is five tools over a synthetic catalogue
(`merchant/tools.ts`). The hard part is the question a merchant has to answer
before it takes money that no human clicked for:

> This software says it may spend £20.45 of someone's money here. Says who?

Stage 1 answers it with a **mandate**: a flat object naming the principal, the
agent, the one merchant, the currency, a total cap, a per-transaction cap, a
validity window and a threshold above which a human must be asked, signed
Ed25519 over a canonical serialisation of its own fields (`mandate/types.ts`,
`mandate/sign.ts`, D22, D23). The merchant verifies the signature against a key
it decided to trust in advance, checks the claims against the purchase in front
of it, and writes down what it decided — whichever way it went
(`mandate/policy.ts`, `mandate/audit.ts`, D40, D48).

Three properties follow, and they are the argument of the whole repository:

1. **The agent cannot authorise itself.** The amount and currency checked
   against the mandate are read from the merchant's own stored quote, never
   from the call (`merchant/place-order.ts`, D39). The merchant's id and the
   trusted issuer key come from the environment, never from an argument
   (`merchant/config.ts`, D60) — if the caller supplied either,
   `merchant_mismatch` and `signature_invalid` could never fire.
2. **Above a figure the person chose, software stops.** The policy's middle
   answer is `confirm_required`, not a refusal (`mandate/decision.ts`, D41),
   and the agent is given no way to act on it: it hands the token back and
   stops (`agent/run.ts`, `agent/order.ts`, D74).
3. **Everything decided is written down.** One append-only log holds both the
   decisions and what the rail then did about the money
   (`mandate/audit.ts`, D94, PRD R5).

## 2. The pieces

Four packages, one script, no framework. Nothing is injected by a container;
every dependency is an argument.

```
mandate/     issue, sign, verify; the policy check; the spend ledger; the audit log
merchant/    MCP server: catalogue, cart, quote, place_order, confirm_order
agent/       buyer agent: MCP client, planner, runner
rail/        payment interface; StubRail for Stage 1
scripts/     npm run demo — the whole thing twice, in one terminal
```

### `mandate/` — the authority

The part a reader could lift on its own, which is why it imports nothing from
the other three and declares its own `Clock` rather than borrowing the
merchant's (`mandate/clock.ts`, D49) and its own `{ code, origin }` decline
shape rather than importing `rail/`'s (`mandate/audit.ts`, D96).

| File | What it holds |
| --- | --- |
| `types.ts` | `MandateClaims` (the ten signed fields) and `Mandate` (claims plus `signature`) |
| `canonical.ts` | the exact bytes that get signed: `signature` stripped, keys sorted by UTF-16 code unit, compact JSON, UTF-8 (D23) |
| `sign.ts` | `generateMandateKeyPair`, `issue`, `verify`, `exportPublicKey`, `importPublicKey` |
| `decision.ts` | the three outcomes and the twelve refusal reason codes |
| `policy.ts` | `createMandatePolicy`, `checkMandate`, `recordSpend` |
| `ledger.ts` | `SpendLedger` and `createMemoryLedger` |
| `audit.ts` | `AuditLog`, its two entry kinds, and `formatEntry` |
| `clock.ts` | `Clock`, `systemClock`, `fixedClock` |

`verify()` answers one question — is this mandate the issuer's, and unchanged
since — and `checkMandate()` answers the other, does it authorise *this*
purchase. They are deliberately two calls, and `verify()` is the second of
`checkMandate()`'s two gates (`mandate/policy.ts`, D40).

### `merchant/` — the verifier

An MCP server on the TypeScript SDK v2 (`@modelcontextprotocol/server` 2.4.0,
D09), registering **seven** tools (`merchant/server.ts`):

| Tool | Does | Refuses with |
| --- | --- | --- |
| `list_products` | the catalogue as ACP feed products | — |
| `get_product` | one product | `product_not_found` |
| `create_cart` | a cart, returning `cart_id` | `invalid_quantity`, `insufficient_stock` |
| `add_to_cart` | merges a line into a cart | `cart_not_found`, `invalid_quantity`, `insufficient_stock` |
| `get_quote` | prices a cart as an ACP checkout session | `cart_not_found`, `cart_empty` |
| `place_order` | the money-out gate | `merchant_misconfigured`, `quote_not_found`, `quote_expired`, `quote_stale`, `quote_already_ordered`, `product_not_found`, `insufficient_stock`, `mandate_refused`, `payment_declined`, `capture_failed`, `rail_unavailable` |
| `confirm_order` | a human's yes, turned into a payment | `merchant_misconfigured`, `confirmation_token_unknown`, `order_already_paid`, `order_not_awaiting_confirmation`, `order_expired`, `product_not_found`, `insufficient_stock`, `mandate_refused`, `payment_declined`, `capture_failed`, `rail_unavailable` |

Three in-process stores hold the state MCP will not: carts, quotes and orders
(`merchant/cart.ts`, `merchant/quote.ts`, `merchant/order.ts`). Each is
addressed by an explicit id passed back on every call, because MCP revision
2026-07-28 is stateless — nothing survives between calls unless the client
hands it back (D11, D39, D63). Ids are unguessable by default and sequential
only when a factory is injected, which is how the tests and the demo get a
stable transcript (D12).

Tool logic sits in plain functions over a `MerchantState`; `server.ts` only
registers them (`merchant/tools.ts`, D14). The one tool long enough to deserve
its own file has one (`merchant/place-order.ts`), as does the confirmation
(`merchant/confirm-order.ts`) and the three steps that move money
(`merchant/pay.ts`).

Refusals are one envelope throughout: `isError: true`, one text block holding
`{"error":{"code","message"}}`, and no `structuredContent` — because an error
body deliberately does not match the tool's advertised `outputSchema`
(`merchant/errors.ts`, D13). Two fields appear on some codes only: `reasons`
on `mandate_refused`, carrying every failed policy check in check order
(D66), and `decline` on `payment_declined` and `capture_failed`, carrying the
rail's own code, message and origin (D86).

Products and quotes go on the wire in the Agentic Commerce Protocol
vocabulary, spec version 2026-04-17 (`merchant/acp.ts`, D27). The internal
types keep their `_minor` suffixes, and the translation happens at the wire
boundary and nowhere else (D28). This is not a conformance claim: the merchant
speaks MCP, not ACP's HTTP endpoints, and the thirteen entries D27 to D39 are
the list of places the two part company.

### `agent/` — the buyer

Two halves with one interface between them (`agent/planner.ts`,
`agent/run.ts`, D70). A `Planner` is handed everything the run has learned and
returns a *description* of the next tool call; it is synchronous, pure, and is
given no connection, no client and no credentials, so it cannot make a call
even by accident. `runPlan()` owns the loop, makes every call, and folds each
answer back into the memory; it holds no shopping logic.

`ScriptedPlanner` answers the first question still open rather than replaying a
tape, so a cart that moved under the agent produces a fresh `get_quote` rather
than an order against a stale price (`agent/scripted.ts`, D71). Which products
get bought is a pure `ProductChoice`; the default, `twoCheapest`, takes the two
lowest-priced products and breaks ties on product id (D79). Against the shipped
catalogue of ten products that is a basket of 2045 pence
(`merchant/catalogue.ts`: 895 + 1150).

Nothing under `agent/` reads a clock or a random source (D79), and the mandate
is in scope in exactly one file, `agent/order.ts` (D72). The agent id travels
both inside the mandate's `agent` claim and as its own `place_order` argument,
on purpose: the claim says who the authority was granted *to*, the argument
says who is *using* it, and the merchant compares them (`agent/identity.ts`,
D72).

The client asks for `versionNegotiation: { mode: 'auto' }` rather than the
SDK's 2025-era default, and records what it got on
`MerchantConnection.protocolVersion` (`agent/client.ts`, D75).

### `rail/` — the money

Two calls in one order: `authorise` puts a hold on funds, `capture` takes them
(`rail/types.ts`). A decline is a **result**; only a broken rail throws (D50) —
the distinction that matters in payments, because a timeout is not a decline:
the payment may have gone through, and code that catches both in one `catch`
records a successful charge as a refused card.

`capture` takes the authorisation id and no amount: it settles the hold in
full, which is what Stripe does and all this repo needs (D52). There is no
cancel, no void and no refund anywhere on the interface — out of scope by the
PRD, and the reason an uncaptured hold here simply sits there (D57, D81).

`StubRail` always grants a well-formed authorisation and never pretends to be a
bank refusing a card, so every decline it produces has `origin: 'rail'`
(`rail/stub.ts`). It is deterministic by construction: `auth_000001` onwards,
and a clock starting at a deliberately round synthetic epoch,
`2026-01-01T00:00:00.000Z`, stepping one second per call (D55). It is also
silent by default — its log is an injected callback defaulting to
`discardRailLog` — because the merchant's stdout is a protocol channel (D54).

Eight decline codes are declared now, including three the stub never
produces — `card_declined`, `insufficient_funds`, `authentication_required` —
so that Stage 2's Stripe rail widens nothing (D53). The third of those is
where SCA under PSD2 lands.

### `scripts/` — the demo

`npm run demo` runs the whole repository twice and prints both runs
(`scripts/demo.ts`). The two mandates differ in **two** fields, one of them
deliberate and one of them the point (`scripts/demo.ts`, `RUN_ONE` and
`RUN_TWO`):

- `human_confirm_above_minor` — 3000 in run 1, the README's 2000 in run 2,
  against a basket of 2045 pence. **This is the field that decides the path**,
  and everything else about the two runs is held still so that it is.
- `mandate_id` — `1111…` and `2222…`. Not for budget isolation: each run calls
  `startMerchant()` and so gets its own policy, ledger and audit log. The ids
  are literals rather than `randomUUID()` because the output has to be
  reproducible (D103), and one each makes every audit line say which authority
  it belongs to.

D106 says the two runs differ by exactly one mandate field. The code says two,
so the code wins (see the rule at the top of this document) and D116 records
the correction.

The demo hosts the merchant **in its own process**, over the SDK's in-memory
transport, because the audit log lives inside the merchant's policy and
printing it is half of what the demo is for (D100). It therefore negotiates MCP
`2025-11-25` rather than the `2026-07-28` a spawned merchant gives, and says so
in its own output, reading the revision off the connection rather than stating
it (D100, D75). The real process path stays covered by
`scripts/stdio-smoke.test.ts`.

Run 2 opens a second MCP client over a second server instance sharing one
merchant state, and calls `confirm_order` on it after closing the agent's
connection, because the confirmation is the principal's step and not the
agent's (D101).

## 3. Order states and transitions

An order is one of five states (`merchant/order.ts`, `ORDER_STATUSES`, D80):

| State | Means | Terminal |
| --- | --- | --- |
| `approved` | the merchant and the mandate agreed; the rail has not been called | no |
| `awaiting_confirmation` | above the threshold, held for a human, with a token | no |
| `authorised` | the rail is holding the funds | only when the capture was refused |
| `paid` | the rail took the funds | yes |
| `declined` | the rail would not hold the funds; nothing was taken | yes |

`approved` and `authorised` are one word apart in a skim and worlds apart in
meaning: `approved` is what the *merchant* decided, `authorised` is what the
*rail* did to money (D62, D80). `approved` is never a body the merchant sends —
on the direct path the order passes through it inside a single `place_order`
call, so only a test with a paused rail can observe it (D88, D80).

### The transition table

Six transitions exist; every other pairing of a state and a transition throws a
plain `Error`, reported on the wire as `internal_error`
(`merchant/order.ts`, `#requireStatus`, D80).

| From | Transition | To | Written by |
| --- | --- | --- | --- |
| `approved` | `markAuthorised` | `authorised` | `settle()` after `rail.authorise` succeeded |
| `approved` | `markDeclined` | `declined` | `settle()` after `rail.authorise` declined |
| `awaiting_confirmation` | `markAuthorised` | `authorised` | `settle()` after `rail.authorise` succeeded |
| `awaiting_confirmation` | `markDeclined` | `declined` | `settle()` after `rail.authorise` declined |
| `authorised` | `markPaid` | `paid` | `settle()` after `rail.capture` succeeded |
| `authorised` | `markCaptureDeclined` | `authorised` | `settle()` after `rail.capture` declined |

The last row is not a typo. A refused capture leaves the order exactly where it
was, because that is what is true — the rail has the money and the merchant has
not taken it — and writes the decline onto the order as `capture_decline` so
whoever reconciles it can see which attempt failed (D81). Calling it `declined`
would erase an outstanding hold from the merchant's own record; the error code
is `capture_failed`, distinct from `payment_declined`, so an agent does not
retry and double-authorise.

Five states and four transition functions make twenty pairings. Six are legal
above; `test/merchant/order.test.ts` walks the whole matrix and asserts that
each of the other fourteen throws (D80).

Two states are left off the table on purpose. A lapsed hold is **computed on
read**, not stored and not swept: `requireConfirmable` compares the clock with
the order's `expires_at` and refuses `order_expired`, naming the instant it ran
out (`merchant/order.ts`, D82) — the same way an expired quote is handled
(D38, D39). And there is no `payment_unknown`: a rail that throws leaves the
order in the state it was in, because a status word must never be written on a
guess (D85).

## 4. Where each check runs

Four layers check, and they check different things. Reading them in order is
the point: the cheap questions come first, and the money question comes last.
`place_order` and `confirm_order` each run their own sequence; both call into
the policy, and both end at the rail.

### `place_order`, in order (`merchant/place-order.ts`, D65)

| # | Check | Refusal | Why here |
| --- | --- | --- | --- |
| 1 | the merchant has a trusted issuer configured | `merchant_misconfigured` | no key, no orders (D60) |
| 2 | the quote exists, has not expired, is not stale | `quote_not_found`, `quote_expired`, `quote_stale` | the amount comes from the *stored* quote, never from the caller (D38, D39) |
| 3 | the quote has not already been ordered | `quote_already_ordered` | a quote is a priced promise for one purchase (D64) |
| 4 | the stock is still there | `insufficient_stock`, `product_not_found` | nothing was reserved when the cart was filled (D17) |
| 5 | the mandate authorises it | `mandate_refused` | **last**, so the audit log records a decision the merchant acted on (D65) |
| 6 | pay, or hold | `payment_declined`, `capture_failed`, `rail_unavailable` | `settle()` on the direct path; a hold above the threshold (D88) |

Step 5 is last for a reason worth stating plainly: an `allow` entry written for
an order then refused for want of stock would be a lie told to the one reader
who matters. The cost is that steps 1 to 4 leave **no audit entry at all** —
see the known limits below (D65).

### `confirm_order`, in order (`merchant/confirm-order.ts`)

| # | Check | Refusal |
| --- | --- | --- |
| 1 | the merchant has a trusted issuer configured | `merchant_misconfigured` |
| 2 | the token names a held order still awaiting confirmation | `confirmation_token_unknown`, `order_already_paid`, `order_not_awaiting_confirmation` |
| 3 | the hold has not lapsed (fifteen minutes) | `order_expired` |
| 4 | the stock is still there | `insufficient_stock` |
| 5 | the mandate **still** authorises it | `mandate_refused` |
| 6 | pay | `payment_declined`, `capture_failed`, `rail_unavailable` |

Step 5 is the whole reason this tool is interesting. The time between the hold
and the token coming back is the window in which the facts the mandate depends
on go stale, and two of them bite in practice: the mandate's `valid_until` can
pass while a human is deciding, and another order under the same mandate can
eat the budget in between. So the mandate stored with the held order is checked
again against the clock and the ledger as they are *now* (D83). A
`confirm_required` answer is not a refusal here — being above the threshold is
the reason the token exists.

The quote is deliberately **not** re-read: the order carries its own priced
snapshot, and that snapshot is what the human was asked about (D82).

### The policy check (`mandate/policy.ts`, D42, D43)

**Two gates, then seven checks.** The two gates are the amount's shape and the
signature. Fail either and the pass stops — an amount that is not a number
cannot be compared to a cap, and claims under a broken signature are not the
issuer's to answer for — and both are reported if both failed.

| | Gate | Refusal |
| --- | --- | --- |
| 1 | the amount is a whole number of minor units above zero | `amount_invalid` |
| 2 | the signature holds under the configured public key | `signature_invalid`, `mandate_malformed` |

Past the gates, all seven scope and limit checks run and **every** failure is
named, in check order, so an agent developer learns everything wrong with a
mandate in one call instead of one round trip per problem.

| | Check | Refusal |
| --- | --- | --- |
| 1 | the mandate names this agent | `agent_mismatch` |
| 2 | the mandate names this merchant | `merchant_mismatch` |
| 3 | the validity window is readable, open, and not closed | `mandate_window_invalid`, `mandate_not_yet_valid`, `mandate_expired` |
| 4 | the currency matches | `currency_mismatch` |
| 5 | the mandate's own caps and threshold are usable amounts | `mandate_limits_invalid` |
| 6 | the amount is within the per-transaction cap | `per_transaction_cap_exceeded` |
| 7 | the amount is within what is left of the total cap | `budget_exceeded` |

Currency is checked before the caps, and a mismatch or an unusable limit
suppresses the amount comparisons that depend on it (D43). A cap denominated in
GBP says nothing about an amount in USD: comparing them anyway would either
refuse with a reason that is not the real one, or — worse — allow a purchase
because 2500 of one currency is under a cap of 5000 of another. PRD R2 lists
the caps before the currency; the code is right and the PRD has been corrected
to match.

Only when nothing has failed does the threshold come up, and being above it is
not a refusal: the outcome is `confirm_required` (D41).

### The rail (`rail/stub.ts`, D50, D57)

`authorise` refuses `amount_invalid` for anything that is not a whole number of
minor units above zero, `currency_unsupported` for a currency it does not
handle, and `order_ref_invalid` for an empty reference. `capture` refuses
`authorisation_not_found` for an id it has never seen and
`authorisation_already_captured` for one it has settled — the rail enforces
single capture, not the merchant, because a real rail does and a stub that did
not would let a double-capture bug ship (D57).

`amount_invalid` is unreachable through `place_order`, and left unreached: the
amount comes from a stored quote, every quote is issued for a cart with at
least one line (D37), at a whole quantity of at least one (D19), at an integer
unit price (D16). A test pins that invariant rather than faking an impossible
quote (D68).

## 5. What the audit log holds

One append-only log, in the merchant's policy, in the merchant's process
(`mandate/audit.ts`). It answers a narrower question than "did the order go
through?": **why was this purchase allowed, or refused, and by which rule?**

Two kinds of entry, discriminated on `kind`, in **one** log rather than two
(D94) — because the order is the thing an auditor cannot reconstruct
afterwards. "Allowed at 12:00:00, declined at 12:00:01" is one story in one
list; the same two facts in two lists have to be interleaved by whoever reads
them, and a reader holding only one list cannot tell whether the other exists.

### `mandate_check` — what the policy decided

`at`, `mandate_id`, `agent`, `merchant`, `amount_minor`, `currency`, `outcome`
(`allow`, `confirm_required` or `refuse`), and `reasons`: the reason codes in
check order, empty unless the outcome is `refuse`.

`agent`, `merchant`, `amount_minor` and `currency` are what the caller *asked
for*, not what the mandate allows — that is what makes a refusal legible after
the fact. `mandate_id` is the id *presented*: on a `signature_invalid` refusal
nothing proves it is the issuer's (`mandate/decision.ts`).

### `settlement` — what the rail did

`at`, `mandate_id`, `order_id`, `amount_minor`, `currency`, `outcome` (`paid`,
`payment_declined`, `capture_failed` or `rail_unavailable`), plus `decline`
(`{ code, origin }`) on the two decline outcomes and `rail_call` on
`rail_unavailable`.

Three things about this entry are deliberate:

- **The words are the merchant's own.** An agent told `payment_declined` finds
  `payment_declined` in the log (D95). They also happen to fit:
  `confirm_required`, `payment_declined` and `rail_unavailable` are all exactly
  sixteen characters, which is why the settlement entries kept the merchant's
  spelling without moving a column, and why a check line is byte-for-byte what
  it was before T07c.
- **The decline's message does not travel**, only its code and origin (D96).
  `origin` is the field a reader must see named — an issuer refusing a
  cardholder's money is a different event from the payment system rejecting a
  request — and prose already travels on the error body and in the rail's log.
  For a rail that *threw*, nothing from it is copied at all: that entry carries
  only which call went unanswered, because a real rail's internal errors carry
  hosts, URLs and sometimes credentials (D85, D96).
- **The time comes from the policy's clock**, not the rail's (D97). The stub
  rail's clock starts in January (`STUB_RAIL_EPOCH`) where the merchant's demo
  clock reads October, so a rail-stamped settlement would sort above the
  decision that caused it. The rail's own
  `authorised_at` and `captured_at` stay on the order.

### Two entrances, no exits

`record()` for a decision and `recordSettlement()` for a settlement, each
building and freezing its own entry (D95). There is no way to amend or remove
one, and `entries()` hands back a copy. `checkMandate()` records before it
returns, so a caller cannot forget to log a check (D48).

Every settlement line is written inside `settle()` in `merchant/pay.ts`, at the
point each outcome becomes known — the tools write none of their own (D98).
On the paid path the log is written *before* `recordSpend()`: once the capture
succeeded the money has moved, so the auditor's line is true from that instant,
and a throw out of the ledger leaves a log that still says so.

### Printing it

`print(stream)` takes the stream as a parameter and has **no default** (D46),
because the merchant speaks MCP over stdio, where stdout carries protocol
frames and one stray line corrupts the conversation. Nothing here goes through
MCP's own Logging utility either: revision 2026-07-28 deprecates it under
SEP-2577, with the stated migration path "Log to `stderr` for stdio transports;
use OpenTelemetry for observability" and earliest removal at the first revision
released on or after 2027-07-28 (verified at
`modelcontextprotocol.io/specification/2026-07-28/deprecated`, read 2026-10-28;
SOURCES.md, D46).

Each entry prints as one line in six columns — time, outcome, amount, who or
what, mandate, detail — with a check naming the two parties and a settlement
naming the order it paid (`formatEntry`, D95). The printed form is not
machine-parseable by design; anything that wants to post-process reads
`entries()` (D46).

The log is reachable from the server state and from **no tool** (D69). A
`get_audit_log` tool would hand the party the mandate exists to bound a
readable record of every decision the server has made, including other
mandates' and other agents'.

### What the demo shows

Run 1's log is two lines: `allow`, then `paid`. Run 2's is three:
`confirm_required` at the hold, `confirm_required` again when the token came
back, then `paid` — because the policy is asked twice (D83) and the settlement
is the payment those two checks authorised between them
(`scripts/demo.ts` output, verified by running `npm run demo`).

## 6. Known limits

Stage 1 is a reference implementation, not a product. Every gap below is
deliberate, ruled, and named here rather than left for a reader to find.

**The agent id is not authenticated (D61).** This is the weakest link in the
authorisation story and worth reading twice. `place_order` takes `agent` as a
string argument and the merchant does nothing to establish that the caller is
that agent (`merchant/place-order.ts`). Any caller holding a mandate can
present itself as the agent that mandate names, so `agent_mismatch` catches an
honest misconfiguration and nothing else: **it is not a defence against a
stolen mandate.** The signature binds the agent's *name*; nothing binds the
caller to that name — no agent key, no challenge, no proof of possession. A
real deployment needs the agent to authenticate and the merchant to derive the
id from that authentication, at which point the argument disappears. The gap is
stated in the tool's own schema as well as here.

**The spend ledger is in memory (D44).** `createMemoryLedger()` is a `Map` in
the server process, keyed by `mandate_id` (`mandate/ledger.ts`). A restarted
merchant honours the full cap again, two merchant processes under one mandate
would each allow the whole cap, and nothing is evicted, so the map grows with
every mandate the process sees. One policy is built per server instance, which
on the stdio entry point means one ledger and one audit log **per connection**
(`merchant/config.ts`, D60). A real deployment needs a durable, transactional
ledger. The cart, quote and order stores and the stub rail's authorisation map
have the same shape and the same cost (D11, D39, D63, D57).

**Check and record are not one step, so two concurrent orders can exceed the
cap (D45).** `checkMandate()` never writes to the ledger; `recordSpend()` is
called after the rail succeeds, because budget consumed by a payment that then
failed is budget the user never gets back (`mandate/policy.ts`,
`merchant/pay.ts`). Between the two, nothing holds the budget: two concurrent
orders under one mandate can both pass a check and both be recorded, together
exceeding the cap. Stage 1 is single-threaded and the demo is sequential, so it
cannot happen here, but it is a real gap. Closing it needs either a reservation
with an expiry and a sweeper, or a ledger that checks and records in one
transaction.

**A stock refusal leaves no audit entry (D65).** The mandate check is the last
gate, so an order refused for a stale quote, a used quote or missing stock
leaves no trace anywhere once the call has returned: the merchant has no
request log of its own. The same holds one level along for `confirm_order` — an
expired hold, a spent token or a sold-out line settles nothing and therefore
logs nothing (D99), so an auditor cannot tell a human who was asked and never
answered from one who was never asked. If every call should be logged, the fix
is a third entry kind in the one log, not a second log.

**The merchant holds a credential in memory for up to fifteen minutes (D83).**
A held order keeps the `Mandate` it was placed under, so `confirm_order` can
re-check it (`merchant/order.ts`, `HeldOrder.mandate`). That is a real widening
of what the merchant keeps, and D69's process-level isolation is all that
bounds it: anything in the server process can read a held order's mandate. The
alternative — passing the mandate back on `confirm_order` — moves the
credential onto the wire a second time and hands the confirming party a job
that is not theirs, since the person confirming is not the agent and may never
have held the mandate (D61, D74).

**A declined card ends the order (D84).** A confirmation token releases one
payment *attempt*. Once an attempt reaches `settle()` the token will not send
the order again, so a declined card means the agent must re-quote and the human
must be asked a second time. That is deliberate — a retry loop on a held order
is an agent spending against a decision a person made once — but it is friction
a real checkout would not accept. D84 names a `retry_order` tool with its own
rules as the alternative to loosening this.

**Concurrent `confirm_order` calls on one token can grant two authorisations.**
Nothing is written until `settle()` reaches `markAuthorised`, so two concurrent
confirmations both pass `requireConfirmable` while the order is still
`awaiting_confirmation`, and both call `rail.authorise`
(`merchant/order.ts`, `merchant/pay.ts`). The second `markAuthorised` then
throws, because `authorised` is not a state it may transition from (D80), and
the order ends up correct — but the second hold is never released, because
**the rail interface has no void and no cancel** (`rail/types.ts`, D52, D81).
A real card authorisation sits for about seven days (D57). Closing this is
T12's, and a cancel on the rail interface is the Stage 2 addition D51's request
objects make cheap.

**`markPaid` and `recordSpend` are not atomic.** `settle()` marks the order
`paid`, writes the settlement line, and only then records the spend
(`merchant/pay.ts`, D87, D98). The money has moved by then, so the order's own
record goes first — but a throw out of `recordSpend` leaves a paid order with
the budget unconsumed and the log already saying `paid`. The ordering picks
which record to trust rather than removing the window. T12 owns closing it, and
also owns the test that pins the write order, which is accepted and scheduled
(D98 — as the file records, swapping log and ledger passes every test today).

**`StdioServerCommand` has no `env` field (D105).** `agent/connectStdio` takes
a command and arguments and nothing else (`agent/client.ts`), and the SDK's
default child environment is a safe allowlist, so an `ACR_*` variable set in
the parent does not reach the child. But a merchant needs
`ACR_MANDATE_PUBLIC_KEY` in its environment to accept an order at all (D60).
So `scripts/stdio-smoke.test.ts` constructs its own `StdioClientTransport` with
`getDefaultEnvironment()` plus the two `ACR_*` variables and hands it to
`agent/connect`. The consequence: `connectStdio` — the one helper a reader
would reach for — is exercised only against a merchant with no issuer
configured, so the helper cannot actually buy anything as it stands. Giving
`StdioServerCommand` an optional `env` is a small, obvious change and a
candidate for Stage 2.

**Mandate revocation is a non-goal.** A mandate ends only at `valid_until`
(PRD §6). There is no revoked-id list, no status endpoint and no way to cancel
a mandate the principal has changed their mind about: the policy reads the
signed claims and the ledger, and nothing else (`mandate/policy.ts`). A
revoked-id check in the policy step is the likely design and a candidate task
for Stage 2. Nor is this a gap only on our side — AP2 as read on 2026-10-28
defines no verifier-checked revocation mechanism either; see
`docs/MANDATE.md` §6.

**Also absent, and named by their decisions:** no tax and no fulfilment lines,
absent rather than zero, so `total` always equals `subtotal` (D36); a single
hard-coded currency, GBP, with no `Money` type (D16); stock checked and never
reserved (D17); no `get_order` tool, so an agent that lost its quote cannot
read the amount back (D62); no way to cancel a hold — it lapses or it is
confirmed (D82); no release path for a quote whose held order was abandoned
(D64); and the single-use guard being per quote and not per cart, so a re-quote
of the same cart can buy the same basket again, bounded only by the mandate's
caps (D64 — T12 closes this).

## 7. Reading order

| Read | For |
| --- | --- |
| `mandate/policy.ts` | the two gates and the seven checks, in the order they run |
| `mandate/audit.ts` | the log, and why `print()` takes a stream |
| `merchant/place-order.ts` | the money-out gate, step by step |
| `merchant/confirm-order.ts` | what a human's yes re-checks |
| `merchant/pay.ts` | authorise, capture, log, record — the one copy of the sequence |
| `agent/order.ts` | the one place a mandate is presented |
| `docs/MANDATE.md` | the mandate field by field, and the AP2 mapping |
| `docs/SEQUENCE.md` | both paths as diagrams |
| `docs/DECISIONS_INDEX.md` | all 116 decisions, and the ten that matter |
