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
T13 ruling: T12a's NEEDS-ANDREA on the replay audit line was ruled option A by Andrea on 30 Oct 2026 (R2 chat session: D65 and D99 stand, a replay leaves no audit entry, PRD R10 reworded in chore PR #31), so the T13 line above saying it "is still open" is superseded; D143's Cost now records the ruling 2026-11-02T12:04:13Z
T13 correction to the M8 line above, checked at 7ac4058 in a scratch clone with no test changed: M8 alone (closing line hardcoded) passes 28 of 28, so no assertion catches a hardcoded closing line while it happens to be true; M1 alone fails 6 tests and M8+M1 fails the same 6, no more; in the invariant test both fail first at scripts/demo.test.ts:290 (every attempt refused), and the per-attempt expectNoMoneyMoved checks would fail next; the regex cross-check at scripts/demo.test.ts:314 is an additional guard that those earlier assertions reach first, and it did not run in either case 2026-11-02T12:04:13Z
T13 fix round after pre-review of 7ac4058, pushed at head 7f3b35b: c1cfb74 comment only in scripts/demo.ts (AttemptReport spend is summed over both merchants; git diff -w one comment line; npm run demo byte-identical before and after); 7f3b35b D143 Cost records the 30 Oct ruling and two PROGRESS lines; git diff --stat 7ac4058..7f3b35b is scripts/demo.ts, docs/DECISIONS.md, PROGRESS.md only; fresh clone of 7f3b35b: npm ci, lint, build, typecheck, test (698 passed, 1 skipped) exit 0; npm run demo twice byte-identical to 7ac4058's output, stderr empty; PR description's open-question lines updated to the ruling 2026-11-02T12:06:57Z
chore post-T13 PR #36 opened 2026-11-02T12:23:42Z
chore post-T13 PR #36 round 2: ARCHITECTURE.md stale passages fixed at b177b18 (add_to_cart codes, place_order cart_closed step, D128 concurrent confirm, rail_answer, three demo runs, 137 decisions); ci, lint, build, typecheck exit 0, test 698 passed 1 skipped 2026-11-02T12:35:01Z
chore post-T13 PR #36 round 3: pre-review findings fixed at b15ea30 (spent set shared by servers on one merchant state, second concurrent confirm refused in requireConfirmable, amendment rows D84/D85 by D126, sixteen rows); fresh clone: npm ci, lint, build, typecheck exit 0, test 698 passed 1 skipped; index 137/137/0; demo sha256 58bdd3f6… on head and main 2026-11-02T16:23:45Z
chore t14-rows PR #37 opened 2026-11-02T16:48:10Z
T14a claimed 2026-11-02T16:55:53Z
T14a preflight: no open halt issue; origin/main 3bf9605 contains PR #36 (eb14b46) and PR #37 (3bf9605); TASKS.md:33 is the T14a row; npm ci, lint, build, typecheck exit 0, test 698 passed 1 skipped (31 files, 1 skipped) 2026-11-02T16:55:53Z
T14a inventory of README.md at 3bf9605, before any edit (T true, S stale, U unverifiable) 2026-11-02T16:55:53Z

| README line | Claim | Source | Mark |
| --- | --- | --- | --- |
| 3 | an agent discovers, carts and buys inside limits set in advance | docs/PRD.md §0, §2 | T |
| 5 | public specifications only; no employer code | SOURCES.md:3-7 | T |
| 9 | the hard problem is authorisation; SCA under PSD2, soon PSD3/PSR | docs/PRD.md:13 (echoes the README; external regulation) | U |
| 11-14 | three pieces; merchant tools over MCP shaped to ACP; buyer agent | merchant/server.ts:91-143, agent/, docs/PRD.md §8 | T |
| 15 | mandate: signed, scoped, checked on every money-out, human confirm above the cap, audit log | mandate/types.ts, mandate/policy.ts, mandate/audit.ts, docs/ARCHITECTURE.md §4 | T |
| 17 | rail: a stub in Stage 1, Stripe test mode in Stage 2 | rail/select.ts:20-48 (stub default, ACR_RAIL=stripe), PR #29 | S |
| 23 | Stage 1 done | TASKS.md Claimed, T01-T10 merged | T |
| 24 | Stage 2 planned | PRs #29 (T11), #30 (T12a), #32 (T12b), #34 (T12c), #35 (T13) merged | S |
| 25 | Stage 3 planned (recording, decisions, divergence notes) | recording: T14 not merged; decisions: docs/DECISIONS.md + docs/DECISIONS_INDEX.md; divergences: docs/MANDATE.md §5.2 (AP2), docs/DECISIONS.md D27-D39 (ACP), docs/PRD.md §8 | S (2 of 3 items exist) |
| 30-31 | npm install, npm test | package.json scripts | T |
| 32 | demo has two runs | scripts/demo.ts runDemo (one, two, three); output has RUN 1, 2, 3 | S |
| 35-37 | demo prints order, rail transcript, audit log "twice" | demo output (three runs) | S |
| 37-38 | the second run trips the threshold; agent stops with a token; principal confirms | demo output run 2; docs/ARCHITECTURE.md §2 scripts/ | T |
| 38-39 | two invocations print identical text | true for `npx tsx scripts/demo.ts` on this machine (cmp equal, sha1 82b7976c…); npm header lines vary with npm version (TASKS.md:34) | S (wording) |
| 40 | the two runs inside one invocation differ | three runs now | S |
| 42 | Node 22+ | package.json engines `>=22.13.0` | S |
| 42 | no keys needed for Stage 1 | rail/stripe.ts:31-33 (stripe needs sk_test_), test/rail/stripe.live.test.ts:6-8 (skipped without key) | S |
| 42-43 | lint, build, typecheck are the other three scripts | package.json scripts | T |
| 49 | PRD: what it is for and is not | docs/PRD.md §2, §6 | T |
| 50 | ARCHITECTURE: "what Stage 1 does not do" | docs/ARCHITECTURE.md §6 is "Known limits" | S |
| 51 | SEQUENCE: both paths the demo shows | docs/SEQUENCE.md §1, §2 cover runs 1 and 2 only; demo has three runs | S |
| 52 | MANDATE: field by field, signing, AP2 mapping | docs/MANDATE.md §1, §2, §5 | T |
| 53 | "all 116 decisions"; the ten that matter | `grep -c '^## D' docs/DECISIONS.md` = 137; docs/DECISIONS_INDEX.md §3 | S (count) |
| 54 | DECISIONS: every decision in full | docs/DECISIONS.md | T |
| 59-61 | merchant, agent, mandate dirs | merchant/server.ts tools, agent/, mandate/ | T |
| 62 | rail/: stub (Stage 1), Stripe test mode (Stage 2) | rail/stub.ts, rail/stripe.ts, rail/select.ts | S |
| 63-64 | docs/, test/ | ls | T |
| 58-65 | layout lists what exists | scripts/ (demo.ts, demo.test.ts, stdio-smoke.test.ts) is missing | S |
| 69-83 | mandate JSON | mandate/types.ts:23-49, eleven fields, same names | T |
| 85 | merchant verifies signature, scope, budget before the rail; above threshold pauses; every check and payment outcome audited | docs/ARCHITECTURE.md §4, §5; mandate/policy.ts | T |
| 89 | not a product | docs/PRD.md §6 | T |
| 90 | not a conformance claim; divergences in docs/DECISIONS.md | ACP: D27-D39; AP2 divergences are in docs/MANDATE.md §5.2, not DECISIONS.md | S (incomplete) |
| 91 | not employer-derived; sources in SOURCES.md | SOURCES.md | T |
| 95 | SOURCES.md has dates | SOURCES.md:3-4 | T |
| 99 | author line, Substack link | external | U |
| 101 | MIT licence | LICENSE | T |

T14a inventory result: 36 rows; 19 true, 15 stale, 2 unverifiable (the two U rows are left as they are) 2026-11-02T16:55:53Z
T14a README edited at 40393ca: the 15 stale rows fixed, the 19 true and 2 unverifiable rows left as written; a first-screen paragraph added (what it shows, one command, limits) 2026-11-02T16:58:30Z
T14a UNVERIFIED: live Stripe call. None has been made from this repo (no test key here; T11's UNVERIFIED line and D125 stand). The README says so. The only ACR_RAIL=stripe runs here were two refusals before any client existed: an empty key and a sk_live_-shaped dummy, each refused with one stderr line by rail/stripe.ts readStripeTestKey; no network call 2026-11-02T16:58:30Z
T14a Stage 3: "design decisions" marked done on docs/DECISIONS.md and docs/DECISIONS_INDEX.md; "protocol divergence notes" marked done on docs/MANDATE.md §5.2 (AP2, structural divergences) and docs/DECISIONS.md D27 to D39 (ACP, each divergence a decision, as docs/PRD.md §8 says); there is no single standalone divergence note covering both protocols, so this is the call I most want ruled; the recording (T14) is left planned 2026-11-02T16:58:30Z
T14a brief vs row: the brief asks that the recording be called T14 in the status table; the README's stage numbering follows docs/PRD.md §4 (recording in Stage 3) while TASKS.md lists T14 under Stage 2; the README keeps PRD's numbering and does not name task ids 2026-11-02T16:58:30Z
NEEDS-ANDREA (T14a, not fixed, outside the row): docs/PRD.md:77 S2 says "The demo has two runs"; it has three since T13 2026-11-02T16:58:30Z
NEEDS-ANDREA (T14a, not fixed, outside the row): docs/SEQUENCE.md:177-181 says "Neither run shows a refusal" and calls the refusal suite Stage 2's future T12; run 3 shows five refusals and T12a is merged. Also docs/SEQUENCE.md:3 "The two paths npm run demo shows" 2026-11-02T16:58:30Z
NEEDS-ANDREA (T14a, not fixed, outside the row): scripts/demo.ts:1271 title "an agent buys something, twice" and :1273-1275 intro name runs 1 and 2 only, while the demo has three runs (code; output pinned by tests) 2026-11-02T16:58:30Z
T14a proof: npm ci, lint, build, typecheck exit 0; test 698 passed 1 skipped, the same as main 3bf9605; npx tsx scripts/demo.ts x3 byte-identical (sha1 82b7976c…); throwaway link/number check (scratchpad, not committed) ALL PASS 2026-11-02T16:58:30Z
T14a PR #38 opened 2026-11-02T16:59:29Z
chore three-runs-docs PR #39 opened 2026-11-02T17:52:00Z
chore three-runs-docs PR #39 round 2: fixes at e373089 (T14b decisions D160 to D169, SEQUENCE three mandates and cart_closed step, PRD §9 revocation 'a later stage'); npm ci, lint, build, typecheck exit 0, test 698 passed 1 skipped 2026-11-02T18:05:44Z
chore three-runs-docs PR #39 round 3: merged origin/main 5e1fa59 (PR #38) at f57aadf; PROGRESS.md conflict resolved by keeping main's lines then this branch's, unchanged; TASKS.md auto-merged (T14a Claimed line only); npm ci, lint, build, typecheck exit 0, test 698 passed 1 skipped 2026-11-02T21:35:27Z
T14b claimed 2026-11-02T21:50:29Z
