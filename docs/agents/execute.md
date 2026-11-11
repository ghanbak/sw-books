# Execute

Goal: turn up to 4 `Todo` items per run into verified, reviewed PRs, worked in parallel (one worktree and subagent per item). The loop runs every 2 hours.

Follow [README.md](README.md) shared rules first. Check backpressure before starting: 6 or more `agent/*` or `feature/*` PRs assigned to the owner → take only work that won't need the owner's review (bugs, perf, maintenance, feature sub-issues) this run, and say so.

## Pick work
- From the Roadmap project (project 4), items with Status `Todo`. Skip any issue assigned to the owner and any issue that has sub-issues (`gh api repos/ghanbak/sw-books/issues/<n>/sub_issues --jq length` > 0: it's a feature main issue, never implemented directly; its sub-issues are fair game), and any sub-issue whose `Blocked by #<n>` issue isn't done yet. No approval is needed to start.
- Take up to 4: first the highest-priority item for each agent (`agent:tregg`, `agent:luis`, `agent:dylan`, `agent:brandon`), then fill any remaining slots by priority (then oldest). So every agent with queued work gets something each run.
- Set each to `In Progress` before starting. Too large for one run (Effort L, or useless without the owner's secrets or console work)? Land what can land in a PR, list the rest in the body, and file a follow-up issue.

## Do the work (per item, in parallel)
1. Pick the base:
   - Sub-issue of a feature (it has a parent issue): base is `feature/<parent-number>-<slug>`. If that branch doesn't exist on origin yet, create it from `origin/main` and push it (`git push origin origin/main:refs/heads/feature/<...>`).
   - Anything else: base is `main`.
2. Worktree on a new branch from the base: `agent/<issue-number>-<short-slug>`.
3. Delegate the implementation to the owning subagent from the `agent:*` label (Tregg, Luis, Dylan, Brandon). Give it the issue body, the parent issue's contract if it's a sub-issue, the owner's comments on the issue (the owner's latest instructions override the body), acceptance criteria, the worktree path, and the README never-list. Ask it to end its report with a "Lessons / corrections" section.
4. Requirements:
   - Bugs: a regression test that fails before the fix and passes after.
   - Perf: a before/after measurement in the PR body.
   - Design drift: cite the rule restored.
   - Migrations and SQL: `scripts/verify-db.sh` output (the PASS lines) and a fail-before run with the new migration removed, in the PR body.
   - Missing proof never means assigning the owner; see README "When to assign the owner" (draft + `needs-proof`).
   - Visual changes (Tregg, Luis, Dylan): before/after screenshots per [screenshots.md](screenshots.md), in a `## Screenshots` section, or `Screenshots: not captured (<reason>)`. Schema, data-flow or API changes (Brandon): a Mermaid diagram when it's easier to see than read. Tell the subagent this in the brief. Parallel items share one simulator, so app captures take turns via its lock.
   - App changes: prefer JS-only. Compare the iOS fingerprint against the base (releases.md) and end the PR body with `OTA-safe: yes` or `OTA-safe: no (<what changed>)`. A fingerprint change on an issue that isn't part of a feature: open the PR into `main` anyway; the `fingerprint` check holds it for the owner.
   - Sub-issues: stay inside the parent's contract. If the contract is wrong, say so on the parent issue instead of quietly diverging.
   - Keep the diff to what the issue asks for. Unrelated problems found along the way become new issues (labels plus `source:scout`, added to the Roadmap with Status `Triage`).
5. Verify per the README. Failing after two attempts → push nothing, set Status `Backlog`, and move on: for a feature sub-issue, ask on the main issue (README "Feature branches": comment, checklist line, `needs-owner`); otherwise assign the issue to the owner with a comment on what's blocking.
6. Independent reviewer on the diff. `BLOCK` → fix and re-review once; still blocked → for a `main` PR, open it assigned to the owner with the objection in the body; for a feature sub-issue, open the PR anyway with the objection in its body and add an owner checklist item marked "possible bug" (README "Feature branches").

## Open the PR
- **Into a feature branch:** `gh pr create --base feature/<...> --head agent/<...>`, never assigned to the owner and never a draft. If something needs the owner, ask on the main issue (README "Feature branches": comment, checklist line, `needs-owner`); the PR still merges. Body: `Part of #<parent>`, `Implements #<n>` (not `Closes`, since issues only auto-close on merges to `main`), what changed, how it was verified, the reviewer verdict, the subagent's lessons. It auto-merges into the feature branch once CI passes. Set the sub-issue's Roadmap Status to `In Review`.
- **Into `main`:** decide first whether the owner must review it (README "When to assign the owner"). `gh pr create --base main --head agent/<...>` with `--assignee ghanbak` if review is needed. Body: `Closes #<n>`, what changed, how it was verified, the reviewer verdict, and the subagent's lessons. For review PRs, start the body with a `## How to review` section (README) and add `device-review` where it applies; the `## Screenshots` section goes right after it. Find the deep links in the worktree's `app/` routes. Once the PR is open, run `npm run review -- <n> --check --out <dir>` and look at the screenshots; fix the steps if they don't reach the screen. Set the issue's Roadmap Status to `In Review`.
- Either way: the issue's type, agent and product labels go on the PR, title in conventional-commit style. The auto-merge workflow turns on auto-merge when the PR opens; don't run `gh pr merge`.

## Summary
PRs opened (numbers, base branch, which are assigned to the owner), items blocked and why.
