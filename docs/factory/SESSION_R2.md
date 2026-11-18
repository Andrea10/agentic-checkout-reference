# Session R2: 2026-10-29 to 2026-11-07

## State at close
- main at 7ee2c32 (#44, T14 demo recording). Stages 1 and 2 done; Stage 3 design decisions, divergence notes and demo recording done.
- 715 tests passed, 1 skipped. 141 decisions (D01-D131, D140-D145, D150-D152, D160); D150-D152 PROPOSED until #45 merges, all others ACCEPTED.
- `npm run demo`: three runs; run 3 is five refused attempts, "Money moved by them: £0.00 (0 pence)". `npm run demo:record` writes docs/demo.cast, docs/demo-run3.cast, docs/demo-run3.svg, byte-identical across invocations.
- README opens Run it with the run-3 recording; Andrea checked it renders and plays on GitHub (4 Nov).
- Open at close: PR #45 (D150-D152 to ACCEPTED), head 8d3bf98, READY FOR ANDREA.

## PRs merged this session
#23 T10, #24 chore post-T10, #25 T10b, #26 chore T10c row, #27 T10c, #28 chore Stage 2 rows, #29 T11, #30 T12a, #31 chore post-T12a, #32 T12b, #33 chore T12c row, #34 T12c, #35 T13, #36 chore post-T13, #37 chore T14a row and run-3 cast, #38 T14a, #39 chore three-runs docs, #40 T14b, #41 chore readme-polish, #42 chore comment-fixes, #43 chore final-docs, #44 T14.

## Rulings (Andrea)
- 29 Oct: 7 (D110-D116). 30 Oct: 11 (D117-D127, replay audit line: option A). 31 Oct: D129 B. 2 Nov: D128-D131 (D131 B), D140-D145. 3 Nov: D160. 4 Nov: D150-D152.
- scripts/demo.test.ts "two runs print the same text": leave as printed. T14a and the run-3 cast: as recommended. LinkedIn asset parked.

## Tasks moved
- Done: T10, T10b, T10c, T11, T12a, T12b, T12c, T13, T14a, T14b, T14. Queue after T14: empty. T14c (phone-readable cut) not created.

## Open decisions
- None PROPOSED after #45. For Andrea: next stage (A stop at a finished, honest repo; B one live Stripe test-mode run; C Stage 3 build), LinkedIn cut, issue #9 reply.

## Process findings
- Merged ahead of review twice (#32, #35). Rule: merge only on READY FOR ANDREA for the exact head, CI green on it.
- Self-review is not a gate (T13 first pre-review).
- Stale and duplicate agent reports pasted repeatedly; identify every report by head SHA.
- Prose and decision text describe intent, not code (D-entries, ARCHITECTURE, comments); verify against the code.
- Parallel PRs collide in the tails of TASKS.md, PROGRESS.md, DECISIONS_INDEX.md; fixed by merge-main (no rebase, no force), checked by a narrow diff instead of a full re-review.
- Two chores in one Orca workspace switched each other's branch. Rule: one workspace per task; never paste a prompt into an old session. A closed worker left a stale worktree (cf).
- Pre-reviewer scripts had their own bugs (checker, \b in git grep); verdicts are cross-checked.
- One unrequested package run (npx -y json) by a worker; disclosed, no repo change.
- GitHub's rendering of the animated SVG was the one check no agent could do.

## Carry over
- Notion "Factory learnings (R1)" tally; PRD Notion mirror (repo v0.11); Orca cleanup and `git worktree prune` of cf; TASKS.md Claimed merge dates after T10; README author line and Substack link (external, unverifiable from the repo); issue #9; LinkedIn cut.
