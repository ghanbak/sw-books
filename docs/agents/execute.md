# Execute

Goal: turn up to 3 `Todo` items per run into verified, reviewed PRs, worked in parallel (one worktree and subagent per item). The loop runs every 2 hours.

Follow [README.md](README.md) shared rules first. Check backpressure before starting: 6 or more `agent/*` PRs assigned to the owner → take only bug, perf and maintenance items this run, and say so.

## Pick work
- From the Roadmap project (project 4), items with Status `Todo`, highest Priority first, then oldest.
- No approval is needed to start. Skip any issue assigned to the owner.
- Take at most 3. Set each to `In Progress` before starting. Too large for one run (Effort L, or useless without the owner's secrets or console work)? Land what can land in a PR, list the rest in the body, and file a follow-up issue.

## Do the work (per item)
1. Worktree on a new branch from `origin/main`: `agent/<issue-number>-<short-slug>`.
2. Delegate the implementation to the owning subagent from the `agent:*` label (Tregg, Luis, Dylan, Brandon). Give it the issue body, the owner's comments on the issue (the owner's latest instructions override the body), acceptance criteria, the worktree path, and the README never-list. Ask it to end its report with a "Lessons / corrections" section.
3. Requirements:
   - Bugs: a regression test that fails before the fix and passes after.
   - Perf: a before/after measurement in the PR body.
   - Design drift: cite the rule restored; screenshots if a simulator or browser is available.
   - Keep the diff to what the issue asks for. Unrelated problems found along the way become new issues (labels plus `source:scout`, added to the Roadmap with Status `Triage`).
4. Verify per the README. Failing after two attempts → push nothing, assign the issue to the owner with a comment on what's blocking, set Status `Backlog`, move on.
5. Independent reviewer on the diff. `BLOCK` → fix and re-review once; still blocked → open the PR assigned to the owner with the reviewer's objection in the body.

## Open the PR
- Decide first whether the owner must review it (README "When to assign the owner").
- `gh pr create --repo ghanbak/sw-books --base main --head agent/<...>` with a title in the repo's conventional-commit style, the issue's type, agent and product labels, and `--assignee ghanbak` if review is needed. Body: `Closes #<n>`, what changed, how it was verified, the reviewer verdict, and the subagent's lessons. For review PRs, put a short "What to look at" list at the top (screens, flows, decisions), with screenshots when a simulator or browser is available.
- The auto-merge workflow turns on auto-merge when the PR opens; don't run `gh pr merge`. Unassigned PRs merge once CI is green; assigned ones wait for the owner.
- Set the issue's Roadmap Status to `In Review`.

## Summary
PRs opened (numbers; which are assigned to the owner), items blocked and why.
