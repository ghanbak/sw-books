# PR caretaker

Goal: no open PR sits stuck. Merge what's safe, unblock what's fixable, and hand the owner a clear decision on the rest.

Follow [README.md](README.md) shared rules first (lock, worktrees, never-list).

## Steps

1. List open PRs: `gh pr list --repo ghanbak/sw-books --state open --json number,title,author,headRefName,labels,mergeable,statusCheckRollup,updatedAt`.
2. For each PR, by author:

**Dependabot**
- No CI run on the current head (opened before CI existed) → comment `@dependabot rebase` and move on; next run picks it up.
- Classify with the safe-bump rules. To check for native code, create a worktree on the PR head, `npm ci`, and inspect `node_modules/<pkg>` for each bumped package.
- **Safe**, CI green: run the independent reviewer on the diff plus each package's release notes (`gh api repos/<owner>/<repo>/releases` or the changelog) between the old and new version. On `APPROVE`: add `tier:auto-merge`, comment one line on why it's safe, `gh pr merge <n> --squash --auto`.
- **Safe**, CI failing: comment the failing check and its first error. Don't fix Dependabot branches.
- **Unsafe** (native, Expo-coupled, major, or mixed group): add `tier:review` once, and comment once with what changed, the breaking changes from release notes, and what to test on a device. Don't repeat the comment on later runs unless the PR head changed.
- Two Dependabot PRs bumping the same package: keep the newer, comment on the older that it's superseded.

**Agent PRs** (branch `agent/*`)
- Merge conflict: rebase the branch on `origin/main` in a worktree, re-run verify, push.
- CI failing: fix in a worktree on the branch, verify, push. After two failed fix attempts, add `needs-info`, comment what's failing and stop.
- Owner review comments (on any tier): address each one in a commit, verify, push, and reply to the comment with the commit SHA. If a comment asks for something out of scope, reply with a new issue number instead of growing the PR.
- `tier:auto-merge`, CI green, no unresolved review comments: run the reviewer if it hasn't approved the current head, then `gh pr merge <n> --squash --auto`.
- `tier:review`: never merge. Keep it green and conflict-free, and once all owner comments are addressed, comment once: "Ready for another look."
- Merged: set the linked issue's Roadmap Status to `Done`.

**Owner PRs** (author `ghanbak`, not `agent/*`)
- Never push. Comment only if CI fails or there's a conflict, once per head SHA.

3. Any PR with no activity for 14 days: comment once asking whether to keep it. Never close PRs.
4. Summary: merged, labeled, rebased, fixed, waiting on owner (list numbers).
