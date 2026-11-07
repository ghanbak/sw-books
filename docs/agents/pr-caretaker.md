# PR caretaker

Goal: no open PR sits stuck. Keep PRs green and conflict-free, address review comments, and make sure anything that needs the owner is assigned to them.

Follow [README.md](README.md) shared rules first (lock, worktrees, never-list, assignment rules). Never run `gh pr merge` and never unassign the owner. The auto-merge workflow and the review-gate check handle merging.

## Steps

1. List open PRs: `gh pr list --repo ghanbak/sw-books --state open --json number,title,author,headRefName,labels,assignees,mergeable,autoMergeRequest,statusCheckRollup,updatedAt`.
2. For each PR, by author:

**Dependabot**
- No CI or `review-gate` run on the current head (opened before those workflows existed): comment `@dependabot rebase` once per head and move on.
- Unassigned (the workflow judged it safe by name): create a worktree on the PR head, `npm ci`, and check each bumped package in `node_modules/<pkg>` for `ios/`, `android/` or `expo-module.config.json`. Run the independent reviewer on the diff plus each package's release notes between the old and new version (`gh api repos/<owner>/<repo>/releases` or the changelog). Found native code, breaking changes, or `BLOCK`: assign the owner (`gh pr edit <n> --add-assignee ghanbak`) and comment once with what changed and what to test. Otherwise comment one line on why it's safe and leave it to auto-merge.
- Assigned to the owner: comment once with what changed, breaking changes from the release notes, and what to test on a device. Don't repeat it unless the head changed.
- CI failing: comment the failing check and its first error. Don't fix Dependabot branches.
- Auto-merge not on (`autoMergeRequest` empty) and the PR predates the auto-merge workflow: mention it in the summary for the owner; don't enable it yourself.
- Two Dependabot PRs bumping the same package: comment on the older one that it's superseded.

**Agent PRs** (branch `agent/*`, into `main` or a feature branch)
- Merge conflict: rebase the branch on `origin/main` in a worktree, re-run verify, push.
- CI failing: fix in a worktree on the branch, verify, push. After two failed fix attempts, assign the owner, comment what's failing, and stop.
- Owner review comments: address each one in a commit, verify, push, and reply to the comment with the commit SHA. If a comment asks for something out of scope, reply with a new issue number instead of growing the PR. Once all of them are addressed, comment once: "Ready for another look."
- Unassigned PR whose diff turns out to need review (see README "When to assign the owner"): assign the owner with a one-line reason.
- Merged: set the linked issue's Roadmap Status to `Done`.

**Owner PRs** (author `ghanbak`, not `agent/*` or `feature/*`)
- Never push. Comment only if CI fails or there's a conflict, once per head SHA.

3. **Features** (each open parent issue with sub-issues; see README "Feature branches"):
   - Sub-issue PR merged into the feature branch → set that sub-issue's Roadmap Status to `Done` (it stays open; it closes when the feature merges).
   - Feature branch behind `main` or conflicting with it → open `agent/sync-<parent>` from the feature branch, merge `origin/main` into it, resolve conflicts, verify, and PR it into the feature branch (it auto-merges). If the conflict needs a product call, assign the owner on the parent issue instead.
   - Every sub-issue `Done` and no open PRs into the feature branch → open the feature PR: `gh pr create --base main --head feature/<...> --assignee ghanbak`, title in conventional-commit style, body with `Closes #<parent>` plus `Closes #<n>` for each sub-issue, a "What to look at" list (screens, flows, decisions), and links to each sub-issue PR. Run the independent reviewer on the full feature diff first and put its verdict in the body. Set the parent's Status to `In Review`.
   - Open feature PR: treat it like an agent PR (keep it green, address the owner's comments with `agent/*` PRs into the feature branch, comment "Ready for another look" when done). Never unassign the owner.

4. **Releases** (releases.md): for the open release issue (label `release`), rewrite its "What's new" and "Why it needs a build" sections from PRs merged to `main` since the last store build (`eas build:list --platform ios --profile production --status finished --limit 1 --json --non-interactive` gives its commit). Keep the owner's edits to the other sections. Add held native Dependabot PRs and open `needs-build` PRs to its milestone. A release issue is a feature parent: its release PR follows step 3.
5. Any PR with no activity for 14 days: comment once asking whether to keep it. Never close PRs.
6. Summary: what's merging on its own, what's assigned to the owner (with numbers), rebased, fixed, and anything stuck.
