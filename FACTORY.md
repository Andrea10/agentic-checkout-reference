# FACTORY.md: build model for agentic-checkout-reference (level B)

Agents take tasks from TASKS.md, build on branches, open PRs. A pre-reviewer agent comments on every PR. A supervisor watches for stalls and writes a daily digest. **Andrea is the only merger.** Nothing reaches main without his click.

## Roles

| Role | Count | Does | Must not |
| --- | --- | --- | --- |
| Worker | 1 to 3 in parallel | Takes the next unblocked task, builds on `task/<id>`, opens a PR, writes PROGRESS.md | Edit `.github/`, `prompts/`, FACTORY.md, TASKS.md beyond the Claimed section, SOURCES.md; touch secrets; merge; force-push |
| Pre-reviewer | 1, every 20 minutes | Reviews open PRs against the task's definition of done and the checklist; leaves a comment with a verdict (READY FOR ANDREA / CHANGES NEEDED) and specifics | Approve in GitHub's sense, push commits, merge |
| Supervisor | 1, hourly; digest 07:30 | Lists branches, PRs, CI, stale agents; restarts a dead worker once; posts status and the digest to issue #1 | Merge, change tasks, write code, commit or push (main is protected; it writes only to issues) |
| Andrea | 1 | Reads the digest, merges READY PRs, rules on PROPOSED decisions and `needs-andrea` items | Nothing; this is his repo |

## GitHub settings (apply once)

1. Settings → Branches → rule for `main`: require a pull request; block force pushes; restrict deletions; include administrators. No approval requirement needed (Andrea merges by hand), no auto-merge. Add the required status check `ci` after T01's workflow has run once (GitHub only lists checks it has seen).
2. Settings → General → Pull Requests: allow squash merging only; automatically delete head branches.
3. `CODEOWNERS`: `* @Andrea10` (documentation of intent; merge is manual anyway).
4. Tracking issue #1 "Factory digest" (exists) where the supervisor posts hourly status and the daily digest. Create the label `halt` (Issues → Labels) for the supervisor's halt signal.

## Flow of a task

1. Worker claims the lowest unblocked task (branch `task/<id>` on origin is the claim), appends the claim to TASKS.md Claimed section and PROGRESS.md.
2. Worker builds inside the task's allowed directories, with tests, verifying every package and spec it relies on.
3. Worker opens a PR with the template: what was built, test count before and after, UNVERIFIED items, PROPOSED decisions, anything to overrule.
4. Pre-reviewer comments within 20 minutes. CHANGES NEEDED: worker fixes once; on a second CHANGES NEEDED the worker stops and labels `needs-andrea`.
5. READY FOR ANDREA plus CI green: the PR waits for Andrea. He merges (squash) or comments.
6. Supervisor moves the task to done in the digest once merged.

## Parallelism

Tasks list their allowed directories. Two workers may run at once only on tasks with disjoint directories (T03 and T06, for example). The demo (T09) and docs (T10) run alone.

## Guards and stop rules

- No commit for 45 minutes on a claimed task: supervisor comments and restarts the worker once with the same prompt. Second stall: label `stalled`, stop.
- CI red on main: supervisor opens an issue labelled `halt`; workers run `gh issue list --label halt --state open` before claiming and stop if any is open; Andrea fixes main and closes the issue.
- Any agent that cannot verify a spec URL or package writes `UNVERIFIED:` in PROGRESS.md and proceeds without the claim.
- Spend: Orca budget cap per worker run; supervisor reports tokens per task.
- Stop rule for the whole factory: Stage 1 not merged one week after the first worker run means the factory is costing more than it returns; collapse to one brief and finish by hand.

## Daily digest (supervisor, 07:30, posted as a comment on issue #1; nothing written to the repo)

- Tasks: done / in progress / blocked / stalled.
- PRs waiting for Andrea: number, title, pre-reviewer verdict, CI.
- `needs-andrea` items with the question in one line.
- Main: CI status, test count and delta.
- `UNVERIFIED:` lines added.
- PROPOSED decisions not yet ruled.
- Token spend per task.
- One recommendation, if any.

## What never runs unsupervised

Merges, secrets and keys, deploys, dependency additions a task did not name, changes to this file or `prompts/`, design decisions (PROPOSED until Andrea rules).
