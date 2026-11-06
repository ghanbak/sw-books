# Execute

Goal: turn up to 2 `Todo` items per run into verified, reviewed PRs.

Follow [README.md](README.md) shared rules first. Check backpressure before starting: 6 or more open `agent/*` PRs waiting on the owner → stop and say so.

## Pick work
- From the Roadmap project (project 4), items with Status `Todo`, highest Priority first, then oldest.
- Eligible only if the issue has `tier:auto-merge` or `tier:auto-pr`, or `tier:needs-approval` plus `approved`. Skip anything labeled `needs-info`, `owner-only` or `owner-review`.
- Take at most 2. Set each to `In Progress` before starting.

## Do the work (per item)
1. Worktree on a new branch from `origin/main`: `agent/<issue-number>-<short-slug>`.
2. Delegate the implementation to the owning subagent from the `agent:*` label (Tregg, Luis, Dylan, Brandon). Give it the issue body, acceptance criteria, the worktree path, and the README never-list. Ask it to end its report with a "Lessons / corrections" section.
3. Requirements:
   - Bugs: a regression test that fails before the fix and passes after.
   - Perf: a before/after measurement in the PR body.
   - Design drift: cite the rule restored; screenshots if a simulator or browser is available.
   - Keep the diff to what the issue asks for. Unrelated problems found along the way become new issues with `triage`.
4. Verify per the README. Failing after two attempts → push nothing, add `needs-info` with what's blocking, set Status `Backlog`, move on.
5. Independent reviewer on the diff. `BLOCK` → fix and re-review once; still blocked → open the PR as `tier:auto-pr` with the reviewer's objection in the body, or stop with `needs-info` if it's a correctness problem.

## Open the PR
- `gh pr create --repo ghanbak/sw-books --base main --head agent/<...>` with a title in the repo's conventional-commit style and a body containing: `Closes #<n>`, what changed, how it was verified, the reviewer verdict, and the subagent's lessons.
- Copy the issue's tier, agent and product labels onto the PR. Set the issue's Roadmap Status to `In Review`.
- `tier:auto-merge` with reviewer `APPROVE`: `gh pr merge <n> --squash --auto`. CI decides the rest.

## Summary
PRs opened (numbers and tiers), auto-merge enabled on which, items blocked and why.
