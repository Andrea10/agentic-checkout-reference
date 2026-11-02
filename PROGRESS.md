# PROGRESS.md

Workers append one line per event. Newest at the bottom.

T01 claimed 2026-10-26T23:47:50Z
T01 PR #2 opened 2026-10-26T23:52:13Z
T01 CODEOWNERS added at Andrea's request 2026-10-27T00:21:37Z
T02 claimed 2026-10-27T00:27:54Z
T02 PR #4 opened 2026-10-27T00:30:59Z
T01 review round 1 fixed 2026-10-27T00:33:52Z
T03 claimed 2026-10-27T08:00:01Z
T06a claimed 2026-10-27T08:01:38Z
T03 PR #5 opened 2026-10-27T08:05:59Z
T06a PR #6 opened 2026-10-27T08:13:45Z
T02 review round 1 fixed 2026-10-27T08:53:40Z
T04 claimed 2026-10-28T08:28:16Z
T05 claimed 2026-10-28T08:29:42Z
T06b claimed 2026-10-28T08:31:38Z
T05 PR #10 opened 2026-10-28T08:39:43Z
T04 PR #11 opened 2026-10-28T08:39:46Z
T06b PR #12 opened 2026-10-28T08:42:14Z
T08 claimed 2026-10-28T11:43:34Z
T07a claimed 2026-10-28T11:47:04Z
T08 PR #15 opened 2026-10-28T12:02:01Z
T08 VERIFIED: the v2 client negotiates MCP revision 2026-07-28 (era modern) against merchant/stdio.ts; the SDK default posture and an McpServer mounted without serveStdio both give 2025-11-25 2026-10-28T12:02:01Z
T07a PR #16 opened 2026-10-28T12:04:30Z
T08 review round 1 fixed (merged T07a; order step now runs against the real place_order; 5 collisions fixed) 2026-10-28T13:14:34Z
T07b claimed 2026-10-28T16:01:43Z
T07b PR #17 opened 2026-10-28T16:18:58Z
T07b merged main (T08, chores); T08 collision fixed in test/agent/ only; 514 tests 2026-10-28T16:33:18Z
T07c claimed 2026-10-28T20:18:30Z
T09 claimed 2026-10-28T20:27:49Z
T07c PR #20 opened 2026-10-28T20:30:00Z
T09 PR #21 opened 2026-10-28T20:31:28Z
T09 VERIFIED: one McpServer refuses a second transport, so the demo runs two server instances over one shared MerchantState; the in-memory transport negotiates MCP 2025-11-25 where the spawned merchant/stdio.ts negotiates 2026-07-28 2026-10-28T20:31:28Z
T09 fresh clone of task/T09: npm ci, test (533), lint, build, typecheck and demo all exit 0; two demo runs byte-identical 2026-10-28T20:31:28Z
T09 merged main (T07c); audit heading, run-2 tally and D100/D103 corrected for settlement entries; 573 tests 2026-10-28T21:01:32Z
T09 fresh clone of task/T09 at bc8ef12: npm ci, test (573), lint, build, typecheck and demo all exit 0; two demo runs byte-identical 2026-10-28T21:01:32Z
T10 claimed 2026-10-28T21:29:47Z
T10 VERIFIED: AP2 pages opened 2026-10-28 for the mapping — specification, checkout_mandate, payment_mandate, agent_authorization, implementation_considerations; the last three are not in SOURCES.md. Nothing read contradicts SOURCES.md; three refinements recorded in docs/MANDATE.md 7 2026-10-28T21:55:00Z
T10 VERIFIED: MCP Logging deprecation re-read at /specification/2026-07-28/deprecated — SEP-2577, deprecated in 2026-07-28, migration "Log to stderr for stdio transports; use OpenTelemetry for observability", earliest removal first revision on or after 2027-07-28 2026-10-28T21:55:00Z
T10 VERIFIED: both SEQUENCE.md diagrams and the corrected PRD section 10 diagram render under @mermaid-js/mermaid-cli 11.17.1 (not added to the repo) 2026-10-28T21:55:00Z
T10 UNVERIFIED: whether AP2 defines an amount-ceiling constraint type; whether any AP2 mandate field names the User; which vct form is normative (versioned values against unversioned "MUST be" prose on the same pages) 2026-10-28T21:55:00Z
T10 fresh clone of task/T10 at 27fcd8a: npm ci, npm install, test (573), lint, build, typecheck and demo all exit 0; two demo runs byte-identical 2026-10-28T21:55:00Z
T10 PR #23 opened 2026-10-28T21:57:57Z
T10 review round 1 fixed: 7 reviewer findings confirmed against the AP2 pages and the code, plus 3 more found by sweep; D116 PROPOSED amends D106 (two mandate fields differ, not one); UNVERIFIED down from 3 to 1 2026-10-28T23:42:43Z
T10 fresh clone of task/T10 at f8d4d70: npm ci, npm install, test (573), lint, build, typecheck and demo all exit 0; two invocations byte-identical; index 116 rows cross-checked; all 3 diagrams re-render 2026-10-28T23:42:43Z
chore post-T10 PR #24 opened 2026-10-29T23:57:38Z
T10b claimed 2026-10-30T00:09:23Z
T10b PR #25 opened 2026-10-30T00:12:21Z
chore add-T10c PR #26 opened 2026-10-30T01:34:09Z
T10c claimed 2026-10-30T01:39:58Z
T10c PR #27 opened 2026-10-30T01:42:08Z
chore stage2-rows PR #28 opened 2026-10-30T11:12:59Z
T11 claimed 2026-10-30T12:12:31Z
T11 VERIFIED: Stripe docs opened 2026-10-30 — place-a-hold-on-a-payment-method, api/payment_intents/create (and ?query=automatic_payment_methods), api/payment_intents/capture, api/errors, error-handling?lang=node, error-codes, testing, api/idempotent_requests, payments/paymentintents/lifecycle; claims ledger in the PR 2026-10-30T12:31:36Z
T11 VERIFIED: npm view stripe — 23.1.0 latest, MIT, engines node >=20, no dependencies, ships ESM types; typechecks and lints under the repo's strict nodenext config; changelog: pins API 2026-10-28.endive 2026-10-30T12:31:36Z
T11 VERIFIED: stripe@23.1.0 writes a claude-code-hint line to stderr on module load when CLAUDECODE or CLAUDE_CODE_CHILD_SESSION is set (esm/stripe.esm.node.js); the rail loads the SDK lazily so stub runs never print it (D123) 2026-10-30T12:31:36Z
T11 UNVERIFIED: whether confirm=true with pm_card_authenticationRequired returns status requires_action or throws a card_error (testing page does not say); both are mapped (D119) 2026-10-30T12:31:36Z
T11 UNVERIFIED: which error code a second capture of a PaymentIntent returns, and whether the error carries the PaymentIntent; the rail assumes payment_intent_unexpected_state with the PaymentIntent attached (D120) 2026-10-30T12:31:36Z
T11 UNVERIFIED: that capture of an unknown PaymentIntent id returns resource_missing (the error-code table defines it generically) 2026-10-30T12:31:36Z
T11 UNVERIFIED: the SDK's default maxNetworkRetries (README says 1, esm/platform/PlatformFunctions.js returns 2); not relied on or asserted 2026-10-30T12:31:36Z
T11 UNVERIFIED: that a full ACR_RAIL=stripe demo run completes against a Stripe test account in GBP; no key here, no live call made (D125) 2026-10-30T12:31:36Z
T11 fresh demo check: npm run demo twice on main and twice on task/T11, stdout sha256 308761f0…f9b for all four, stderr empty for all four 2026-10-30T12:31:36Z
T11 PR #29 opened 2026-10-30T12:33:35Z
T12a claimed 2026-10-30T15:03:08Z
T12a NEEDS-ANDREA: PRD R10 and the T12a row say replay "appears in the audit log" like the other cases; D65 and D99 (ACCEPTED) rule that a refusal before the mandate check writes no entry, and every replay is refused there (quote_already_ordered, order_already_paid, order_not_awaiting_confirmation, confirmation_token_spent). Built to D65/D99: the tests assert a replay leaves the printed log exactly as the first call left it. Logging replays needs a third entry kind (D99's alternative) — rule which reading holds 2026-10-30T15:22:07Z
T12a gap closed (D126 PROPOSED): confirm_order replayed after authorise threw reached the rail a second time (D85 left the token live); the token is now spent on that path, order status and ledger unchanged 2026-10-30T15:22:07Z
T12a mutations: 12 applied and restored, each failed at least one new test (list in the PR) 2026-10-30T15:22:07Z
T12a demo check: npm run demo twice on origin/main and twice on task/T12a, stdout sha256 308761f0…6f9b for all four, stderr empty for all four 2026-10-30T15:22:07Z
T12a load note: test/agent/protocol.test.ts "reads the tool list over the negotiated connection" (spawns merchant/stdio.ts, 5 s timeout) timed out locally three times at load average ~635; see the fresh-clone line for the result at lower load 2026-10-30T15:22:07Z
T12a fresh clone of task/T12a at 96078bc: npm ci, lint, build, typecheck, test (667 passed, 1 skipped) all exit 0 at load ~130 2026-10-30T15:27:43Z
T12a PR #30 opened 2026-10-30T15:27:43Z
chore post-T12a PR #31 opened 2026-10-30T23:53:24Z
T12b claimed 2026-10-31T01:17:06Z
T12b failing first: 5 of the new tests failed on main for the reason named (two authorise calls; internal_error with the order paid; three cart re-quotes accepted); the D98 and D126 pins passed on main, and each failed under its mutation while the old suite stayed at 667 passed 2026-10-31T01:33:01Z
T12b mutations: 11 applied and restored, each failed at least one new test (list in the PR) 2026-10-31T01:33:01Z
T12b demo check: npm run demo twice on a fresh clone of main and twice on a fresh clone of task/T12b, stdout sha256 308761f0…6f9b for all four, stderr empty for all four 2026-10-31T01:33:01Z
T12b fresh clone of task/T12b at 4e28f22: npm ci, lint, build, typecheck, test (676 passed, 1 skipped) all exit 0 2026-10-31T01:33:01Z
T12b PR #32 opened 2026-10-31T01:33:55Z
chore t12c-row PR #33 opened 2026-11-01T00:03:43Z
T12c claimed 2026-11-01T11:39:50Z
T12c failing first: on origin/main with the new tests copied in, 9 of the new tests fail (the 4 direct-path and 4 held-path hold cases are paid instead of refused; the settle() cause test gets no throw); the cart-closed-on-decline, negative-capture and zero-capture tests pass on main and are pinned by mutation instead 2026-11-01T11:51:26Z
T12c mutations: 11 applied and restored, each failed at least one new test (list in the PR) 2026-11-01T11:51:26Z
T12c audit lines: main's 676 tests, with AuditLog.print instrumented, print 151 lines (58 settlement lines) against main's code and against this branch's code, sorted byte-identical 2026-11-01T11:51:26Z
T12c agent/order.ts comment commit 876d647: tsc -p tsconfig.build.json --removeComments --sourceMap false --declarationMap false, output of the parent and of the commit diff -r identical, 98 files (with source maps on, only agent/order.js.map differs, by line offsets) 2026-11-01T11:51:26Z
T12c PR #34 opened 2026-11-01T11:54:07Z
T12c UNVERIFIED: that a full Stripe capture always reports amount_received equal to the held amount. Stripe's capture reference says amount_to_capture "Defaults to the full `amount_capturable` if it's not provided" (StripeRail sends none), and the PaymentIntent object reference describes amount_received only as "Amount that this PaymentIntent collects"; neither says the two are equal. Not asserted; D131 refuses a capture that differs 2026-11-02
T12c D131 option B pushed at head cb97b55: fresh clone npm ci, lint, build, typecheck, test (690 passed, 1 skipped) exit 0; demo twice on main and twice on branch sha256 308761f0a2cc2e66… stderr empty; main's tests print 151 audit lines on main and branch code, sorted identical; main's 3 D87 partial-capture tests fail on branch code, as ruled; mutation E1 (equality removed) fails all 7 new or changed tests, restored 2026-11-02
T12c fix round 2 at bb8acac: D131 heading and text say it amends D87 and D129 and record Andrea's option B ruling (2 Nov 2026, R2 chat session); pointer line under D129; docs/DECISIONS.md only; npm ci, lint, build, typecheck, test (690 passed, 1 skipped) exit 0 2026-11-02T10:17:17Z
T13 claimed 2026-11-01T11:40:05Z
T13 plan 1/5: run 3 in scripts/demo.ts, one mandate (run 1's limits, its own id), a fresh merchant, the frozen clock; agent attempts go through runPlan and the agent's placeOrder, not hand-built tool calls 2026-11-01T11:40:05Z
T13 plan 2/5: five attempts in the row's order (per-order cap, remaining budget, wrong merchant, replay, field added after signing); two paid orders before attempt 2 so the budget is nearly spent; each attempt run against the code first and recorded here before it is printed 2026-11-01T11:40:05Z
T13 plan 3/5: each attempt prints its refusal code, reasons and the audit lines it added (or none); a closing line computed from both merchants' ledgers and rail logs before and after the attempts, asserted by a test 2026-11-01T11:40:05Z
T13 plan 4/5: tests in scripts/demo.test.ts, one per attempt plus the invariant line, each mutated to fail and restored; runs 1 and 2 output byte-identical to main's 2026-11-01T11:40:05Z
T13 plan 5/5: flake check (full suite x5, protocol.test.ts x10), raise one timeout in test/agent/protocol.test.ts, D140+ PROPOSED only for real choices, fresh-clone proof, PR 2026-11-01T11:40:05Z
T13 probe (real code, stub rail, frozen clock, mandate caps 5000 total / 2500 per order / threshold 3000): attempt 1 cafetiere 2750 on an empty ledger: mandate_refused [per_transaction_cap_exceeded], one refuse line, no rail call, ledger 0 -> 0, no order, cart left open 2026-11-01T11:41:40Z
T13 probe: two paid orders of 2045 first (allow+paid lines, authorise+capture each), ledger 4090, both carts closed (D130) 2026-11-01T11:41:40Z
T13 probe: attempt 2 notebook+socks 2045 with 910 left: mandate_refused [budget_exceeded], one refuse line, no rail call, ledger 4090 -> 4090, no order, cart open 2026-11-01T11:41:40Z
T13 probe: attempt 3 same mandate at a second merchant with id merchant-other (same issuer key): mandate_refused [merchant_mismatch], one refuse line in that merchant's log, no rail call, its ledger 0 -> 0, no order, cart open 2026-11-01T11:41:40Z
T13 probe: attempt 4 place_order resent with the second paid order's quote: quote_already_ordered, no audit line (D65, D127), no rail call, ledger 4090 -> 4090, order_000002 still paid, its cart still closed 2026-11-01T11:41:40Z
T13 probe: attempt 5 the mandate plus one unsigned field (extra_budget_minor) on a notebook basket of 895: mandate_refused [signature_invalid], one refuse line, no rail call, ledger 4090 -> 4090, no order, cart open 2026-11-01T11:41:40Z
T13 differs from the row: the row says every attempt is printed "with its refusal code and audit line"; the replay has none, because D65, D99 and D127 (ACCEPTED) rule that a refusal before the mandate check writes nothing. Run 3 prints "none" for it and says why; T12a's NEEDS-ANDREA on the same point is still open 2026-11-01T11:41:40Z
T13 tests: 8 new in scripts/demo.test.ts (order of attempts, the two paid orders, one per attempt, the invariant line); the file went from 20 to 28 2026-11-01T11:49:27Z
T13 mutations, each applied and restored, scripts/demo.test.ts run under each: M1 per-order cap check off in mandate/policy.ts (6 failed); M2 budget check off (3 failed); M3 merchant check off (3 failed); M4 assertQuoteUnused removed from merchant/place-order.ts (1 failed: the replay test; the replay is then refused as cart_closed by D130, so no money moves and the invariant still holds); M5 mandate-wire looseObject -> object, so the added field is stripped and the mandate verifies (2 failed); M6 a mandate-refused place_order calls rail.authorise before throwing (5 failed); M7 the printed refusal line drops its reasons (4 failed) 2026-11-01T11:49:27Z
T13 mutation survived: M8 hardcoding "5 refused" in the invariant line passes, because all five are refused and the text is the same; the line is now cross-checked against the report's own count, and with M1 the same mutation fails 6 tests 2026-11-01T11:49:27Z
T13 flake check, full suite x5 on task/T13 before the timeout change: 5 of 5 exit 0, 684 passed 1 skipped each, wall 6.8 to 8.4 s; "reads the tool list over the negotiated connection" took 941 to 1623 ms; load average 8.7 to 19.4 2026-11-01T11:52:06Z
T13 flake check, test/agent/protocol.test.ts alone x10: 10 of 10 exit 0, 7 passed each, wall 3.7 to 5.7 s; the target test took 640 to 1182 ms; load average 12.8 to 20.4 2026-11-01T11:52:06Z
T13 timeout: raised from Vitest's default 5000 ms to 15000 ms. Differs from the brief: its rule (lowest value that passed all 10 runs, with 3x margin) gives 3 x 1182 = 3546 ms (3 x 1623 = 4869 ms over all 15 runs), which is below the default, so it would not raise anything; the row says raise. 15000 is 3x the 5000 ms the test overran at load ~635 in T12a (PR #30). The overrun was not reproduced here (D145) 2026-11-01T11:52:06Z
T13 claims audit, changed: runThree's comment said the closing line measured the attempts "from after" the two paid orders; it sums per-attempt windows, so the comment now says so. The printed "These are the only payments in run 3" was unconditional and is now "Run 3 means to pay nothing else" (the test asserts what was paid). The run 3 intro said every attempt presents "this mandate"; attempt 5 presents a copy with a field added, and the line says so. The replay's "audit line none: refused before the mandate check" printed whenever no line was added; it now gives that reason only when the attempt was refused 2026-11-01T11:54:26Z
T13 claims audit, changed in DECISIONS: D140 said an allowed order "is paid" in place_order and that a refusal "comes from the policy or the quote guard and nothing else"; now it says the order goes to the rail in that call (D88) and that no attempt waits on a human. D144 said no code "reads" the added field; the canonicaliser does serialise it, so now it says no code gives it a meaning. D145 called both 60_000 timeouts "hooks"; one is a test 2026-11-01T11:54:26Z
T13 claims audit, checked and kept: README caps 5000/2500/GBP/window (README.md lines 75-80); the planner has no confirm_order step (agent/planner.ts PlanStep); policy.ts returns at the signature gate before the budget; place_order compares the mandate with state.merchant_id; no file in mandate/ merchant/ agent/ rail/ names extra_budget_minor; PR #30 and load ~635 from the T12a lines above 2026-11-01T11:54:26Z
T13 fresh clone of task/T13 at c7d2b3c: npm ci, lint, build, typecheck, test (684 passed, 1 skipped) all exit 0; fresh clone of main at fb56264: the same five exit 0, test 676 passed, 1 skipped 2026-11-01T11:59:16Z
T13 demo check, fresh clones: npm run demo twice on each, exit 0, stderr 0 bytes for all four; main's two runs identical (sha256 77bd1c29…9eee3, npm's two header lines included); task/T13's two identical (48b26f1f…0cded); task/T13 with the run 3 block removed is byte-identical to main, header and footer included; the run 3 block identical across the two (206b08e0…ef610) 2026-11-01T11:59:16Z
T13 audit-line check: a temporary vitest setup file (not committed) teed every AuditLog.print to a file keyed by test, in both clones. Main: 35 tests printed 151 lines. task/T13: the same 35 tests printed identical lines in the same order; the only extra keys are the 8 new run 3 tests (40 lines, runs 1 and 2's logs, which runDemo prints) 2026-11-01T11:59:16Z
T13 PR #35 opened 2026-11-01T12:00:01Z
T13 merged origin/main (a4e8784, T12c squash) at e69e108, no rebase, no force push: TASKS.md and PROGRESS.md conflicts additive, both kept; docs/DECISIONS.md resolved as main's file unchanged (its edited D130 tail and D131) followed by D140 to D145 unchanged, the base lines in conflict being D130's tail that main rewrote; fresh clone of e69e108: npm ci, lint, build, typecheck pass, 698 passed 1 skipped (main a4e8784: 690 passed 1 skipped); demo x2: stderr empty, with run 3 (lines 149-232) removed byte-identical to main's, run 3 byte-identical across runs and to 692e5b2's run 3, since the stub captures the amount it authorised and D131's check passes 2026-11-02T10:39:33Z
