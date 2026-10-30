# Session R1: 2026-10-26 to 2026-10-29

## State at close
- Stage 1 complete on main (ef0595b, T10 merged as #23). T01 to T10 merged, including T07a/b/c. 573 tests. `npm run demo` clean from a fresh clone, byte-identical across invocations.
- Open: none.

## PRs merged this session
#2 T01, #4 T02, #5 T03, #6 T06a, #10 T05, #11 T04, #12 T06b, #3/#7/#8/#13/#14/#18/#19/#22 chores, #15 T08, #16 T07a, #17 T07b, #20 T07c, #21 T09, #23 T10.

## Rulings
- D01 to D109 all ACCEPTED (D90 as corrected; D64, D65 as recommended; D100 to D109 as a block).
- D110 to D116: ACCEPTED (Andrea, 29 Oct).
- D86 -> B: audit settlement entries split out as T07c.
- T10: option A (index instead of consolidating DECISIONS.md). T10b: option A (comment-only fixes as a separate task).

## Tasks moved
- T07c added (13 Stage 1 tasks). T10b added. T12 loses the audit.ts comment fix (moved to T10b, with a fifth stale comment agent/order.ts:96-98).

## Open decisions
- "Run forever" mode: A continuous level B (recommended), B plus maintenance backlog after Stage 3, C level C. Not chosen.

## Process findings
- Parallel PRs against one contract produce collisions git cannot see; a merged-tree test by the pre-reviewer catches them.
- Worker decisions sometimes describe intent, not code (D90, D100, D106).
- CI did not type-check tests until #18.
- #23 review round 1: 7 of about 40 sampled prose claims false (third-party spec claims, "exactly N" statements); round 2: 0 of 15. A prose-claim verifier is needed before any unattended mode.
- Reviewers need the exact head SHA each time; heads moved mid-review twice.
- A pre-reviewer certified a preamble that the final round had made false (DECISIONS.md T10 preamble); the supervisor caught it, found by a diff, not by a claim check.
- AP2 pages were not fetchable from the build-lead session; AP2 claims rest on the T10 worker and the pre-reviewer.

## Carry over
- SOURCES.md AP2 block (read by the T10 worker and pre-reviewer 2026-10-28, not re-read by the build lead); one UNVERIFIED line in PROGRESS.md (whether any AP2 field names the User); Notion learnings page and PRD mirror (repo v0.8, mirror v0.4); Orca cleanup of merged workspaces and branches (Andrea); issue #9 (inbound Nano settlement proposal, untriaged).
- Next: T10b first, then T12 and T11 in parallel.
