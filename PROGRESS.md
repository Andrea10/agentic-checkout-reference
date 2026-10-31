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
