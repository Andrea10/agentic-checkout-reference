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
