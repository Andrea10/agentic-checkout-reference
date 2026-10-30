# DECISIONS — index

`docs/DECISIONS.md` is over 2,800 lines and append-only. This is the way in.

The table below is generated from its `## D..` headings: every id, every title
and every status, verbatim. **116 decisions, D01 to D116, with no gaps.** The
116 are all ACCEPTED — ruled by Andrea, 25 on 27 October, 84 on 28 October
and 7 on 29 October, with none outstanding. The last seven, D110 to D116, are
T10's own.

Counts, which a reviewer can check against the file with
`grep -c '^## D' docs/DECISIONS.md`:

| Status, as the heading writes it | Count |
| --- | --- |
| `ACCEPTED (Andrea, 27 Oct)` | 24 |
| `ACCEPTED (Andrea, 27 Oct, amended)` | 1 |
| `ACCEPTED (Andrea, 28 Oct)` | 81 |
| `ACCEPTED (Andrea, 28 Oct, as corrected)` | 1 |
| `ACCEPTED (Andrea, 28 Oct; the audit gap it records is closed by T07c)` | 1 |
| `ACCEPTED (Andrea, 28 Oct; the write order is pinned by a test added to T12)` | 1 |
| `ACCEPTED (Andrea, 29 Oct)` | 7 |
| **Total** | **116** |

If you have five minutes, read §3 and nothing else.

## 1. How this file relates to DECISIONS.md

T10 was briefed to "consolidate" `docs/DECISIONS.md`. It does not, and this
index is what it does instead. The reason is D110 at the end of
`docs/DECISIONS.md`: consolidating would mean rewriting entries Andrea has
ruled on, and several of them — D21, D59, D86, D90 to D93 — are *about* the
fact that an earlier entry went stale and was amended rather than edited. A
file that folded those together would delete its own evidence. An index is
additive, carries no authority of its own, and can be regenerated.

So the amendment chains stay where they are. They are the one thing a reader
genuinely needs navigating:

| Amended | By | What moved |
| --- | --- | --- |
| D06 | D21 | D06's cost cites an SDK D09 replaced |
| D42, D58 | D59 | the reason code was renamed to `amount_invalid` |
| D48, D65, D86 | D94 to D99 | settlements now go in the audit log; D65's stock-refusal rule is unchanged |
| D70 | D93 | one builder for the merchant's stores in the agent's tests |
| D76 | D90, D91 | the stub no longer stands in for `place_order`; the refusal list is `error.reasons` |
| D77 | D91, D92 | `error.reasons` only; money off the wire reads as `number` |
| D62 | D88 | `approved` left the wire; `place_order` answers `paid` |
| D63 | D82 | a held order got a fifteen-minute expiry |
| D106 | D116 | the two demo runs differ in two mandate fields, not one |

Ranges, and the task that proposed each, as `docs/DECISIONS.md` itself records
in the prose above each group:

| Range | Task | Subject |
| --- | --- | --- |
| D01–D08 | T01 | repo plumbing |
| D09–D10 | T06a (seeded) | the SDK line, and keeping the mandate flat |
| D11–D21 | T06a | merchant server, catalogue, cart |
| D22–D26 | T03 | mandate types and signing |
| D27–D39 | T06b | quoting and ACP shaping |
| D40–D49, D58–D59 | T04 | policy, ledger, audit log |
| D50–D57 | T05 | the stub rail |
| D60–D69 | T07a | `place_order` |
| D70–D79 | T08 | the buyer agent |
| D80–D89 | T07b | `confirm_order` and the rail call |
| D90–D93 | T08, round 2 | amendments after `place_order` landed |
| D94–D99 | T07c | payment events in the audit log |
| D100–D109 | T09 | the demo |
| D110–D116 | T10 | these docs |

The file is ordered by task and not by number, which is why D58 and D59 sit
before D50, and D90 to D93 before D80. It is append-only: a range was allotted
while another task was in review.

The amendment table has nine rows, not eight, because review round 1 of this
task found a ninth: D106's claim about the demo's two mandates. That is a
fifth instance of the class D115 reports — a ruled decision the shipped code
no longer matches — and the fourth entry in this file to be corrected by
appending rather than editing.

## 2. Every decision

| ID | Title | Status | Topic | In one line |
| --- | --- | --- | --- | --- |
| D01 | TypeScript pinned to 6.0.3, not npm `latest` 7.0.2 | ACCEPTED 27 Oct | Tooling | typescript-eslint caps TypeScript below 6.1, so TS 7 would break type-aware linting. |
| D02 | Exact versions, no caret ranges, lockfile committed | ACCEPTED 27 Oct | Tooling | A reference implementation should build the same way in a year. |
| D03 | Placeholder files sit at the repo root | ACCEPTED 27 Oct | Tooling | T01 may only touch root and `.github/`, so `demo.ts` and `smoke.test.ts` start there and later tasks move them. |
| D04 | `engines.node` is `>=22.13.0` | ACCEPTED 27 Oct | Tooling | eslint 10.13.0 sets the highest floor in the dependency set, and CI would hide the gap. |
| D05 | Strict is stricter than `strict` | ACCEPTED 27 Oct | Tooling | Seven extra compiler flags, worth it for a repo whose whole subject is checking things. |
| D06 | ESM throughout | ACCEPTED 27 Oct | Tooling | `type: module` and `nodenext`, so every relative import carries a `.js` extension — amended by D21. |
| D07 | No `@eslint/js` dependency | ACCEPTED 27 Oct | Tooling | T01 named six dependencies and a seventh would have been one the task did not name. |
| D08 | CI runs on every push to every branch | ACCEPTED 27 Oct | Tooling | A worker sees red before it opens a pull request. |
| D09 | MCP TypeScript SDK v2, not v1.x | ACCEPTED 27 Oct | SDK | v2 is the current line for the current protocol revision; writing against the superseded package would teach the old shape on publication day. |
| D10 | Keep the flat mandate for Stage 1 | ACCEPTED 27 Oct | Mandate | The gap to AP2 is better described than half-implemented — `docs/MANDATE.md` owes the mapping. |
| D11 | A cart is addressed only by an explicit `cart_id` | ACCEPTED 27 Oct | Merchant | MCP 2026-07-28 is stateless, so the identifier has to be in the arguments. |
| D12 | Cart ids are random by default, sequential only when injected | ACCEPTED 27 Oct, amended | Merchant | A cart id is all that stands between a caller and someone else's cart, so the default must be unguessable. |
| D13 | Refusals are `isError` with a JSON body, and no `structuredContent` | ACCEPTED 27 Oct | Errors | An error body does not match the advertised `outputSchema`, so sending it as structured content would contradict the tool. |
| D14 | Tool logic sits in plain functions, apart from MCP registration | ACCEPTED 27 Oct | Merchant | A refusal can then be tested without a transport. |
| D15 | The catalogue shape is internal, not ACP, in T06a | ACCEPTED 27 Oct | ACP | T06b owns ACP shaping and must open the spec files first; guessing would be an unverified claim. |
| D16 | Money is an integer of minor units in one hard-coded currency | ACCEPTED 27 Oct | Money | GBP pence, no float anywhere, so totals never round. |
| D17 | Stock is checked but never reserved | ACCEPTED 27 Oct | Merchant | A reservation needs an expiry, a release path and a sweeper, with no payoff at Stage 1 — so `place_order` re-checks. |
| D18 | `zod` is a direct dependency | ACCEPTED 27 Oct | Tooling | The merchant imports it directly to describe tool schemas, and a package the code imports belongs in `package.json`. |
| D19 | Line quantity is capped at 99 and defaults to 1 | ACCEPTED 27 Oct | Merchant | It bounds the subtotal so the mandate cap tests mean something. |
| D20 | Protocol tests drive raw JSON-RPC, not the MCP client | ACCEPTED 27 Oct | Testing | The client package is T08's named dependency, which T06a may not add. |
| D21 | D06's cost cites an SDK that D09 replaced | ACCEPTED 28 Oct | Decisions | Records the staleness in a new entry rather than editing a ruled one. |
| D22 | Signing format: Ed25519 over a canonical serialisation of the flat mandate | ACCEPTED 27 Oct | Signing | The mandate is flat and every field is needed, so there is nothing to selectively disclose — AP2's SD-JWT is the alternative not taken. |
| D23 | Canonical serialisation: sorted keys, `signature` excluded, compact JSON, UTF-8 | ACCEPTED 27 Oct | Signing | Every field *present* is signed, so a field added later is covered without editing the canonicaliser. |
| D24 | Encoding: signatures base64url unpadded; public keys DER SPKI, base64url | ACCEPTED 27 Oct | Signing | SPKI carries the algorithm with the key, so a verifier cannot be talked into reading 32 bytes as the wrong curve. |
| D25 | `verify()` returns a result union, not a boolean, and does not throw on a bad mandate | ACCEPTED 27 Oct | Signing | A boolean cannot carry the reason the audit log has to record. |
| D26 | `mandate_malformed` as a distinct reason from `signature_invalid` | ACCEPTED 27 Oct | Signing | The log should distinguish a forged mandate from a broken caller; they want different responses. |
| D27 | ACP spec version 2026-04-17, not `unreleased` | ACCEPTED 28 Oct | ACP | A reader should be able to open and check what the code was shaped to. |
| D28 | ACP vocabulary on the wire only; the internal types keep `*_minor` | ACCEPTED 28 Oct | ACP | The `_minor` suffix says at every use that the number is pence, which ACP's `amount` does not. |
| D29 | One ACP variant per catalogue product, with the same id | ACCEPTED 28 Oct | ACP | ACP makes the variant the purchasable thing, and our catalogue has one price per product. |
| D30 | `stock` leaves the product object; the quote line carries the number | ACCEPTED 28 Oct | ACP | The feed schema is closed and has nowhere to put a count; the checkout `LineItem` has `available_quantity`. |
| D31 | The two ACP files disagree on the low-stock word, and each object keeps its own | ACCEPTED 28 Oct | ACP | A real divergence inside ACP 2026-04-17: `limited_stock` in the feed, `low_stock` in the closed checkout enum. |
| D32 | The currency code stays upper case | ACCEPTED 28 Oct | ACP | The feed schema enforces `^[A-Z]{3}$`; the checkout schema's lower-case examples constrain nothing. |
| D33 | `list_products` returns the ACP `ProductsResponse` exactly: no `count`, no `currency` | ACCEPTED 28 Oct | ACP | The schema sets `additionalProperties: false`, so a convenience superset is a body the schema rejects. |
| D34 | The cart keeps its own shape; the quote is the ACP checkout object | ACCEPTED 28 Oct | ACP | ACP has no unpriced cart: a session is created already priced. |
| D35 | Money in a quote is ACP `Total` entries, with the currency stated once | ACCEPTED 28 Oct | ACP | It is the checkout schema's own shape, and it survives a merchant that does have tax and shipping. |
| D36 | No `tax` and no `fulfillment` lines at all, rather than zeros | ACCEPTED 28 Oct | ACP | A zero tax line is a claim a synthetic catalogue cannot support; an absent line says "not computed", which is true. |
| D37 | A quote is `ready_for_payment`, and an empty cart is refused | ACCEPTED 28 Oct | Quoting | This merchant collects no address and no payment method, so the only honest answers are a price or a refusal. |
| D38 | A quote expires after fifteen minutes and is tied to one cart version | ACCEPTED 28 Oct | Quoting | Without the version tie a quote is decoration: an agent could be shown £14.50 and charged for whatever is in the cart now. |
| D39 | Quotes are held server-side and addressed by `quote_id` | ACCEPTED 28 Oct | Quoting | A quote handed back by the agent is an input to distrust, not a record — the agent is the party the mandate bounds. |
| D40 | Policy is a separate call; `verify()` keeps its signature-only contract | ACCEPTED 28 Oct | Policy | Two questions at different trust levels: can these claims be believed, and do they authorise this purchase. |
| D41 | Three outcomes, not a boolean | ACCEPTED 28 Oct | Policy | Above the threshold nothing is wrong, so `confirm_required` is not a refusal. |
| D42 | Two gates, then every remaining check reported at once | ACCEPTED 28 Oct | Policy | All the bad news in one answer — but only for a correctly signed mandate, which bounds who can probe. |
| D43 | Currency is checked before the caps, not after as PRD R2 lists them | ACCEPTED 28 Oct | Policy | A cap in GBP says nothing about an amount in USD; comparing them could allow a purchase outright. |
| D44 | Remaining budget lives in an injected `SpendLedger`, in memory for Stage 1 | ACCEPTED 28 Oct | Ledger | Remaining budget is a fact about history, so it cannot live on a signed object. |
| D45 | Recording a spend is a separate call, made after the rail succeeds | ACCEPTED 28 Oct | Ledger | Budget consumed by a payment that then failed is budget the user never gets back. |
| D46 | `print()` takes its stream, and the lines are text, not JSON | ACCEPTED 28 Oct | Audit | The merchant's stdout carries protocol frames, so the safe default is no default — and MCP Logging is deprecated under SEP-2577. |
| D47 | A mandate whose own limits or window are unusable is refused, not thrown | ACCEPTED 28 Oct | Policy | A merchant should refuse what it cannot evaluate and write that down, not crash a tool call. |
| D48 | The audit log records checks, not settlements | ACCEPTED 28 Oct | Audit | One entrance means a check cannot go unlogged — later widened by D94 to D99. |
| D49 | `mandate/` declares its own clock | ACCEPTED 28 Oct | Policy | The mandate layer is the part a reader might lift on its own, so it must not depend on the merchant to know the time. |
| D58 | The amount must be positive, not merely non-negative | ACCEPTED 28 Oct | Policy | A zero-value purchase has nothing to authorise, and the stub rail already refuses one. |
| D59 | The amount refusal is named `amount_invalid` | ACCEPTED 28 Oct | Policy | Zero is an integer, so `amount_not_integer_minor_units` had stopped describing what the check does. |
| D50 | A decline is a result; only a broken rail throws | ACCEPTED 28 Oct | Rail | A timeout is not a decline: the payment may have gone through, and one `catch` would book a charge as a refused card. |
| D51 | One request object per call, and no knowledge of the mandate | ACCEPTED 28 Oct | Rail | A rail that could read the caps would invite a second, divergent copy of the policy. |
| D52 | `capture` takes the authorisation id and takes the lot | ACCEPTED 28 Oct | Rail | It is what Stripe does, and full capture is all this repo needs. |
| D53 | A decline carries a code, a message and an origin | ACCEPTED 28 Oct | Rail | `origin` separates an issuer refusing a cardholder from the payment system rejecting a request. |
| D54 | The stub logs through an injected sink, and is silent by default | ACCEPTED 28 Oct | Rail | A rail must never pick a destination for itself when stdout is a protocol channel. |
| D55 | The stub is deterministic by construction | ACCEPTED 28 Oct | Rail | A stub holds no money, so a repeatable transcript is worth more than an unguessable id. |
| D56 | `order_ref` is a reference, not an idempotency key | ACCEPTED 28 Oct | Rail | Stripe's idempotency is a request header, not a field, and replay belongs in the mandate layer. |
| D57 | The rail refuses the second capture, not the merchant | ACCEPTED 28 Oct | Rail | A real rail enforces single capture, so a stub that did not would let a double-capture bug ship. |
| D60 | The merchant's own id and its trusted issuer are configuration, read from the environment | ACCEPTED 28 Oct | Config | If the caller supplied either, `merchant_mismatch` and `signature_invalid` could never fire. |
| D61 | The agent id is a caller-supplied argument, and is not authenticated | ACCEPTED 28 Oct | Ordering | **The weakest link**: the mandate binds the agent's name, and nothing binds the caller to that name. |
| D62 | The approved status word is `approved`, and the success body is two fields | ACCEPTED 28 Oct | Ordering | `authorised` is the one word this status must not use — that is what the rail does to money. |
| D63 | Orders are held server-side, and the confirmation token is not the order id | ACCEPTED 28 Oct | Ordering | An order id is a name and a token is a capability; one value doing both jobs is the mistake not to teach. |
| D64 | A quote is single use; the cart is left alone | ACCEPTED 28 Oct | Ordering | The double-submit is the oldest failure in checkout, and held orders have to count too. |
| D65 | The mandate check is the last gate, so refusals before it leave no audit entry | ACCEPTED 28 Oct | Audit | An `allow` written for an order then refused for want of stock would be a lie told to the one reader who matters. |
| D66 | The refusal envelope carries the policy reasons, in a list, under the existing shape | ACCEPTED 28 Oct | Errors | One code per reason cannot express two failures in one answer. |
| D67 | The mandate's wire schema describes shape, not validity | ACCEPTED 28 Oct | Ordering | A strict schema would turn policy refusals into SDK protocol errors and strip the unknown field a tamper test needs. |
| D68 | `amount_invalid` is unreachable through `place_order`, and is left unreached | ACCEPTED 28 Oct | Testing | Reaching it would need an impossible quote, which would imply a path the merchant does not have. |
| D69 | The audit log is reachable from the server state, and from no tool | ACCEPTED 28 Oct | Audit | A readable log would be a generous oracle for the party the mandate exists to bound. |
| D70 | The planner decides, the runner calls, and neither can do the other's job | ACCEPTED 28 Oct | Agent | A planner is handed no connection and no credentials, so it cannot call a tool even by accident. |
| D71 | A plan is a state machine over what came back, not a list of steps to replay | ACCEPTED 28 Oct | Agent | A tape cannot notice a stale quote or a merged cart line. |
| D72 | The agent id and the mandate travel together, injected, and one step reads them | ACCEPTED 28 Oct | Agent | A credential reachable from anywhere can leak from anywhere; here it is in scope in one file. |
| D73 | A refusal is a returned value; a broken connection still throws | ACCEPTED 28 Oct | Agent | A refusal is the mandate layer working; a throw means nobody decided anything. |
| D74 | On `awaiting_confirmation` the agent stops and hands back the token | ACCEPTED 28 Oct | Agent | An agent that *can* confirm is one mis-wired host away from doing so, so the capability is absent rather than guarded. |
| D75 | The client negotiates the newest revision both ends know: 2026-07-28, verified | ACCEPTED 28 Oct | SDK | And the sharper finding: the revision depends on how the server is mounted, not only on the SDK version. |
| D76 | `place_order` is one isolated function over the tool-calling seam | ACCEPTED 28 Oct | Agent | Code that can spend should be short enough to read in one sitting — amended by D90, D91. |
| D77 | The agent validates only the fields it reads, and type-checks the rest against the merchant | ACCEPTED 28 Oct | Agent | A buyer agent in the world does not ship with the merchant's source — amended by D91, D92. |
| D78 | One `ToolCaller` seam, and a refusal that is not the envelope becomes `tool_error` | ACCEPTED 28 Oct | Agent | A plan step cannot reconnect, change the revision or reach another client's state; it can only call tools. |
| D79 | Everything in `agent/` is deterministic: no randomness, no clock reads | ACCEPTED 28 Oct | Agent | The agent is not the verifier — the merchant re-checks the quote's expiry, and its answer is the one that counts. |
| D90 | Amends D76: the stub no longer stands in for `place_order`, and is kept for two bodies only | ACCEPTED 28 Oct, as corrected | Agent | The stub survives for the one job the real merchant cannot do: answering with a body a well-behaved merchant never sends. |
| D91 | Amends D76 and D77: the refusal list is `error.reasons`, and only that | ACCEPTED 28 Oct | Agent | Tolerance for a field no merchant has ever sent was a test pinning fiction. |
| D92 | Amends D77: money off the wire is read as `number`, not `int` | ACCEPTED 28 Oct | Agent | With `int`, a fractional amount made the agent say it could not read the body, losing the amount and the quote id. |
| D93 | Amends D70: one builder for the merchant's stores, with the ids asserted by name | ACCEPTED 28 Oct | Testing | An all-optional options object hides a dropped factory from the compiler, so the test must assert the *effect*. |
| D80 | Five order states, and a store that refuses any other transition | ACCEPTED 28 Oct | Payment | `authorised` is the state the repo exists to make visible: money held for something not sold. |
| D81 | A refused capture leaves the order `authorised`, with its own error code | ACCEPTED 28 Oct | Payment | After a declined capture the rail holds funds this interface cannot release, so somebody must reconcile by hand. |
| D82 | A hold lasts fifteen minutes, and the quote behind it is never re-read | ACCEPTED 28 Oct | Payment | The order stored its own price, so what can drift is the stock and the mandate — and those are re-checked. |
| D83 | `confirm_order` re-runs the whole mandate check, against the mandate it stored | ACCEPTED 28 Oct | Payment | The hold is exactly the window in which the facts the mandate depends on go stale. |
| D84 | The token is spent by the attempt that reaches the rail | ACCEPTED 28 Oct | Payment | "Spent at the rail" is the line that cannot be crossed twice, because `order_ref` is not an idempotency key. |
| D85 | A rail that throws is `rail_unavailable`, and its message does not travel | ACCEPTED 28 Oct | Payment | A status word is never written on a guess, and a real rail's internal errors carry hosts, URLs and sometimes credentials. |
| D86 | The decline rides on the error body; the audit log is left alone | ACCEPTED 28 Oct ¹ | Payment | Records the gap that an auditor needed three sources to see one purchase through — closed by T07c. |
| D87 | The ledger records the amount the rail took | ACCEPTED 28 Oct | Ledger | A budget is a record of money that left, so it is written from the thing that reports money leaving. |
| D88 | `place_order` pays on the direct path, and `approved` leaves the wire | ACCEPTED 28 Oct | Payment | A second call to finish a purchase the mandate already authorised would exist for nobody's benefit — there is nobody to ask. |
| D89 | The rail is configuration, and never absent | ACCEPTED 28 Oct | Config | A merchant with no issuer can still be browsed; a merchant with no rail has no degraded mode to offer. |
| D94 | Settlements go in the audit log, as a second kind of entry | ACCEPTED 28 Oct | Audit | Order is the thing an auditor cannot reconstruct afterwards, so the decision and the payment go in one list. |
| D95 | One log, two entrances, and the check lines do not move | ACCEPTED 28 Oct | Audit | A caller cannot write an entry the log did not build; the merchant's own words happen to fit the existing column. |
| D96 | The audit line carries the decline's code and origin, and not its message | ACCEPTED 28 Oct | Audit | Nothing in `mandate/` imports `rail/`, and the message is prose that already travels elsewhere. |
| D97 | The settlement line is stamped from the policy's clock, and carries the amount the rail took | ACCEPTED 28 Oct | Audit | A log whose lines come from two clocks cannot be read in order, which is the whole point of one log. |
| D98 | `settle()` is the one writer, and it writes before the ledger | ACCEPTED 28 Oct ² | Audit | Once the capture succeeded the money has moved, so the auditor's line is true from that instant. |
| D99 | A refusal that never reached the rail settles nothing, and logs nothing | ACCEPTED 28 Oct | Audit | A settlement written where no rail was called would be D65's lie, told about the money. |
| D100 | The demo hosts the merchant in its own process | ACCEPTED 28 Oct | Demo | The audit log lives in the merchant's process and printing it is half of what the demo is for. |
| D101 | Two MCP clients, two server instances, one merchant state | ACCEPTED 28 Oct | Demo | Confirming down the agent's own channel would print the right words over the wrong wiring. |
| D102 | The whole demo, audit log included, goes to stdout | ACCEPTED 28 Oct | Demo | No part of the demo's stdout is a protocol channel, and splitting streams loses the log on redirect. |
| D103 | Determinism: fixed clock, fixed ids, and no key material printed | ACCEPTED 28 Oct | Demo | A committed private key trains the reader's eye to accept one, so the pair is generated and nothing from it is printed. |
| D104 | The rail's transcript is collected, not written to stderr | ACCEPTED 28 Oct | Demo | A stream sink puts its lines in the middle of a tool call; collecting them lets the demo print them under a heading. |
| D105 | The stdio smoke test builds its own transport | ACCEPTED 28 Oct | Demo | `StdioServerCommand` has no `env` field, and the merchant needs an issuer key in its environment to accept an order. |
| D106 | The two runs differ by exactly one mandate field | ACCEPTED 28 Oct | Demo | Changing both the basket and the mandate would leave a reader unsure which one mattered. |
| D107 | Money is printed as pounds and pence beside the minor units | ACCEPTED 28 Oct | Demo | Pounds are what a person checks against the mandate they signed; pence are what every field actually holds. |
| D108 | The demo configures its merchant through `configFromEnvironment` | ACCEPTED 28 Oct | Demo | The export-and-import round trip is the one the shipped entry point makes, so it is worth exercising. |
| D109 | `scripts/demo.ts` is a module with an entry guard | ACCEPTED 28 Oct | Demo | The demo is a success criterion, so it needs tests that fail when it breaks rather than prose matching. |
| D110 | An index, not a consolidation | ACCEPTED 29 Oct | Decisions | Rewriting ruled entries would delete the evidence that several of them are *about* an earlier entry going stale. |
| D111 | Every claim is tied to a file or a decision, in brackets | ACCEPTED 29 Oct | Docs | Past tasks failed on confident statements about code that were wrong; a citation is cheap and checkable. |
| D112 | AP2 was re-opened for the mapping, not taken from SOURCES.md | ACCEPTED 29 Oct | Docs | SOURCES.md's AP2 notes came from the specification page, and the Payment Mandate's fields live on a page it does not list. |
| D113 | The docs count the policy checks as two gates and then seven | ACCEPTED 29 Oct | Docs | The demo already says "the seven checks", and two counts of the same function would be worse than either. |
| D114 | Known limits are one list in ARCHITECTURE.md, not scattered | ACCEPTED 29 Oct | Docs | A reader judging the authorisation story should be able to find everything it does not do in one place. |
| D115 | Code and comments that disagree with a decision are reported, not fixed | ACCEPTED 29 Oct | Docs | T10's directories are `docs/` and the README; a docs task editing `agent/` would be the drift it is meant to catch. |
| D116 | Amends D106: the two demo runs differ in two mandate fields, not one | ACCEPTED 29 Oct | Demo | `mandate_id` differs as well as the threshold, and only the threshold decides the path. |

¹ D86's full status is `ACCEPTED (Andrea, 28 Oct; the audit gap it records is
closed by T07c)`.
² D98's full status is `ACCEPTED (Andrea, 28 Oct; the write order is pinned by
a test added to T12)`.

Statuses in the table are shortened — `ACCEPTED (Andrea, 27 Oct)` reads
`ACCEPTED 27 Oct` — because every ruling in the file is Andrea's. Nothing else
is abbreviated, and the two qualified statuses are reproduced in full above.

## 3. Ten decisions that matter

For a reader with five minutes. These are not the ten hardest decisions; they
are the ten that decide whether the authorisation story holds.

**D61 — the agent id is not authenticated.** Read this one first, because it is
the limit of everything else. `place_order` takes `agent` as a string and the
merchant does nothing to prove the caller is that agent, so `agent_mismatch`
catches a misconfiguration and not a stolen mandate. It matters because it is
the entry that is honest about what Stage 1 does not do, and because the fix —
bind the agent to a key, as AP2 does with `cnf` — is named rather than hidden.

**D42 — two gates, then every remaining check reported at once.** The amount's
shape and the signature are gates; past them all seven scope and limit checks
run and every failure is named. It matters because it is the whole refusal
contract in one decision, and because the gate/check split is a real argument:
a scope failure read off claims whose signature did not hold would be reporting
untrusted data as fact.

**D41 — three outcomes, not a boolean.** `allow`, `confirm_required`, `refuse`.
It matters because the middle one is the product idea: above a figure the
person chose, nothing is wrong and software still has to stop. A design that
treated it as a refusal would have buried the repository's whole point in a
reason code.

**D74 — on `awaiting_confirmation` the agent stops.** The agent hands the token
back and `agent/` contains no call to `confirm_order` at all. It matters
because the capability is *absent* rather than guarded: an agent that can
confirm its own order is one mis-wired host away from removing the control it
was built to respect.

**D45 — recording a spend is a separate call, after the rail succeeds.** Check,
authorise, then record. It matters for the reason given and for the one
admitted: budget consumed by a failed payment is budget the user never gets
back, and between check and record nothing holds the budget, so two concurrent
orders can exceed the cap. Naming the gap is the decision.

**D39 and D60 — the agent chooses neither the price nor the verifier.** D39
holds quotes server-side, so `place_order` takes a `quote_id` and reads the
amount from the merchant's own stored quote: a quote handed back by the agent
would be an input to distrust, not a record. D60 puts the merchant's own id and
its trusted issuer key in the environment rather than in the arguments. They
are one argument from two ends, which is why `ARCHITECTURE.md` §1 cites them
together, and together they are what stops the agent authorising itself — if
the caller supplied the merchant id, `merchant_mismatch` could never fire, and
if it supplied the public key, `signature_invalid` could never fire. Counted as
one of the ten because neither is worth reading without the other.

**D83 — `confirm_order` re-runs the whole mandate check.** Against the stored
mandate, the clock and the ledger as they are at confirmation time. It matters
because the hold is the window in which the facts go stale — the mandate can
expire while a human thinks, another order can eat the budget — and because of
what it costs: the merchant holds a credential in memory for fifteen minutes.

**D88 — `place_order` pays on the direct path.** One `settle()` for both paths:
authorise, capture, record, in that order and no other. It matters because
there is exactly one copy of the sequence where a mistake costs money, and
because the entry measures what the agent's seams were worth — the wire word
changed from `approved` to `paid` and no production code in `agent/` changed at
all.

**D94 — settlements go in the audit log, as a second kind of entry.** One log,
two kinds, in the order they happened. It matters because order is the thing an
auditor cannot reconstruct afterwards, and because it closes the gap D86 had
named honestly rather than quietly: before T07c a declined card left the log
reading `confirm_required, confirm_required` with no hint the card was refused.

**D10 — keep the flat mandate for Stage 1.** Document the gap to AP2's
Checkout Mandate and Payment Mandate rather than half-implementing it. It
matters because it is the decision that makes this repository honest about what
it is: not a conformance claim, with the divergences written down field by
field in `docs/MANDATE.md`.

**Runners-up**, if you have ten minutes rather than five: D22 and D23 (Ed25519
over a canonical JSON serialisation, every field present signed — the mechanism
the rest of it rests on, and the place the AP2 divergence starts), D50 (a
timeout is not a decline), D80 (five order states, and `authorised` is the one
that matters), D65 (the mandate check is last, so a stock refusal leaves no
entry), D75 (the protocol revision depends on how the server is mounted), D63
(an order id is a name, a confirmation token is a capability).
