# PR caretaker

Goal: no open PR sits stuck. Keep PRs green and conflict-free, address review comments, and make sure anything that needs the owner is assigned to them.

Follow [README.md](README.md) shared rules first (lock, worktrees, never-list, assignment rules). Never run `gh pr merge` and never unassign the owner. The auto-merge workflow and the review-gate check handle merging.

## Steps

1. List open PRs: `gh pr list --repo ghanbak/sw-books --state open --json number,title,author,headRefName,labels,assignees,mergeable,autoMergeRequest,statusCheckRollup,updatedAt`.
2. For each PR, by author:

**Dependabot**
- No CI or `review-gate` run on the current head (opened before those workflows existed): comment `@dependabot rebase` once per head and move on.
- Unassigned (the workflow judged it safe by name): create a worktree on the PR head, `npm ci`, and check each bumped package in `node_modules/<pkg>` for `ios/`, `android/` or `expo-module.config.json`. Run the independent reviewer on the diff plus each package's release notes between the old and new version (`gh api repos/<owner>/<repo>/releases` or the changelog). Found native code, breaking changes, or `BLOCK`: assign the owner (`gh pr edit <n> --add-assignee ghanbak`) and comment once with what changed and what to test. Otherwise comment one line on why it's safe and leave it to auto-merge.
- Assigned to the owner: comment once with what changed, breaking changes from the release notes, and a `## How to review` section (README). Don't repeat it unless the head changed.
- CI failing: comment the failing check and its first error. Don't fix Dependabot branches.
- Auto-merge not on (`autoMergeRequest` empty) and the PR predates the auto-merge workflow: mention it in the summary for the owner; don't enable it yourself.
- Two Dependabot PRs bumping the same package: comment on the older one that it's superseded.

**Agent PRs** (branch `agent/*`, into `main` or a feature branch)
- Merge conflict: rebase the branch on its base (`origin/main` or the feature branch) in a worktree, re-run verify, push.
- CI failing: fix in a worktree on the branch, verify, push. After two failed fix attempts, comment what's failing and stop: assign the owner on a PR into `main`; for a PR into a feature branch, ask on the main issue instead (README "Feature branches").
- Owner review comments: address each one in a commit, verify, push, and reply to the comment with the commit SHA. If a comment asks for something out of scope, reply with a new issue number instead of growing the PR. Once all of them are addressed, comment once: "Ready for another look."
- Draft labeled `needs-proof`: produce the missing proof (`scripts/verify-db.sh`, simulator, browser; README "Verify like CI"). Passes → add it to the PR body, remove the label, `gh pr ready <n>` (auto-merge turns on). Fails → comment what failed (`needs-proof attempt <k>/3`); on the 3rd failure, assign the owner.
- Unassigned PR whose diff turns out to need review (see README "When to assign the owner"): assign the owner with a one-line reason.
- Assigned to the owner with no `## How to review` section, or one that no longer matches the diff: write it into the top of the body (`gh pr edit <n> --body-file`), keeping everything else. Check the steps with `npm run review -- <n> --check --out <dir>` (never without `--check`; it holds the simulator until Ctrl-C). Add `device-review` if it qualifies (README) and it's missing; merge `origin/main` into the branch first if it has no `.eas/workflows/pr-preview.yml`.
- Merged: set the linked issue's Roadmap Status to `Done`. `.github/workflows/close-linked-issues.yml` closes it within 30 minutes (auto-merge's `GITHUB_TOKEN` merges skip `Closes #n`); close it yourself only if it's still open after that.

**Owner PRs** (author `ghanbak`, not `agent/*` or `feature/*`)
- Never push. Comment only if CI fails or there's a conflict, once per head SHA.

3. **Features** (each open main issue with sub-issues; see README "Feature branches"):
   - Sub-issue PR merged into the feature branch → set that sub-issue's Roadmap Status to `Done` (it stays open; it closes when the feature merges).
   - Feature branch behind `main` or conflicting with it → open `agent/sync-<parent>` from the feature branch, merge `origin/main` into it, resolve conflicts, verify, and PR it into the feature branch (it auto-merges). If the conflict needs a product call, ask on the main issue (comment, checklist line, `needs-owner`).
   - **Owner checklist:** every box checked → remove `needs-owner`. For each checked item whose linked request has no `🤖 pr-caretaker: noted` reply yet, read the owner's comments after the request (`ghanbak` comments not starting with `🤖`): an override or new work → make sure a sub-issue covers it (create one if not); nothing → the recommendation stands. Then reply once, `🤖 pr-caretaker: noted` plus what happens next.
   - **Proof:** before opening the feature PR, produce any proof the sub-issue PRs left as `Not run` (`needs-proof`) on the feature branch, and add it to the feature PR body.
   - **Every sub-issue `Done`, no open PRs into the feature branch, no feature PR yet** → run the independent reviewer on the full feature diff, then open the feature PR as a draft: `gh pr create --draft --base main --head feature/<...>`, title in conventional-commit style, body with `Closes #<parent>` plus `Closes #<n>` for each sub-issue, a `## How to review` section (README) covering the screens, flows and decisions, the sub-issue PRs' "after" screenshots and diagrams, links to each sub-issue PR, and the reviewer's verdict. Add `device-review` per README "How to review" (app code, no `supabase/` changes, no `needs-build`). Native features need the feature branch's dev build first (releases.md "Phone builds"); once it's built, remove and re-add the label so the preview re-runs. Then comment on the main issue (`🤖 pr-caretaker: @ghanbak` ready for review, with the PR link), add the checklist line `- [ ] Review the feature: preview and How to review — [PR](<url>)`, add `needs-owner`, and set the main issue's Status to `In Review`.
   - **Approved:** the main issue has no assignees now, an `unassigned` event (`gh api repos/ghanbak/sw-books/issues/<n>/timeline`) comes after your "ready for review" comment, and the feature PR is a draft. An unassign before that comment doesn't count; re-assign the owner and say so on the issue. Then:
     - Any production-step issue linked from the checklist still open → don't ready the PR; comment on the main issue which steps remain.
     - JS-only (fingerprint matches `main`; releases.md): `gh pr ready <n>`. Auto-merge takes it and it ships OTA.
     - Native (fingerprint differs): first a version bump on an `agent/release-<x-y-z>` PR into the feature branch (releases.md "Releases follow features"); once that's merged, `gh pr ready <n>`, then comment on the PR asking the owner to unassign it as the store-build go-ahead (the `fingerprint` check assigned them when the draft opened). Don't mark a native feature ready while an earlier release issue is still open (one store release at a time); say so on the main issue instead.
     - Other unchecked checklist items → still go ahead (unassigning is the approval), but list them in the summary.
     - `gh pr ready` denied or failing → don't retry it; add the checklist line `- [ ] Mark #<n> ready for review (approved; I couldn't) — [PR](<url>)` and keep `needs-owner`.
   - Open feature PR: keep it green and conflict-free. Owner comments on the PR are handled like checklist answers: `agent/*` PRs into the feature branch, then "Ready for another look". Never unassign the owner.

4. **Releases** (releases.md "Releases follow features"):
   - **A native change just merged to `main` without a version bump** (an owner-approved Dependabot bump, a native fix) → open an `agent/release-<x-y-z>` PR into `main` with a patch bump (`npm version patch --no-git-tag-version`) and the `release` label; it's held by the `fingerprint` check like any native change.
   - **A native change just merged to `main`** (a native feature PR, or a standalone `needs-build` PR) and there's no open release issue for the version now on `main` → create the milestone `iOS <version>` and the release issue `Release iOS <version>` (label `release`, assigned to `ghanbak`, the four body sections below), and comment on it that a store build is due.
   - **Open release issue:** rewrite its "What's new" and "Why it needs a build" sections from PRs merged to `main` since the last store build (`eas build:list --platform ios --profile production --status finished --limit 1 --json --non-interactive` gives its commit). Keep the owner's edits to the other sections. Keep the `Phone build:` line current.
   - Add held native Dependabot PRs and open `needs-build` PRs to the open release's milestone, or to the next one if it's already built.

5. Any PR with no activity for 14 days: comment once asking whether to keep it. Never close PRs.
6. Summary: what's merging on its own, what's assigned to the owner (with numbers), rebased, fixed, and anything stuck.
