# Agent loops

Three scheduled loops keep sw-books moving: PR caretaker and scout + triage every 4 hours, execute every 2 hours, staggered, as a fresh Claude Code session in the desktop app.

| Loop | Playbook | Writes code? |
|---|---|---|
| PR caretaker | [pr-caretaker.md](pr-caretaker.md) | Only on agent branches |
| Scout + triage | [scout-triage.md](scout-triage.md) | No, files, labels and assigns issues |
| Execute | [execute.md](execute.md) | Yes, on `agent/*` branches |

Every loop follows the shared rules below, then its own playbook. [releases.md](releases.md) covers OTA updates and store builds; [screenshots.md](screenshots.md) covers PR screenshots and diagrams. The weekly retro (owner-approved) is the only thing that edits these playbooks, the agent definitions or CLAUDE.md.

## Shared rules

**Where to work**
- Repo: `/Users/ethan/Github/sw-books` (GitHub `ghanbak/sw-books`). Use absolute paths.
- Never `git switch`, `checkout`, `reset` or `stash` in the main checkout; the owner works there. Do all git work in a worktree: `git -C /Users/ethan/Github/sw-books fetch origin && git -C /Users/ethan/Github/sw-books worktree add .claude/worktrees/loop-<loop>-<yyyymmdd-hhmm> <ref>`. Remove it when done (`git worktree remove --force`).
- Read `/Users/ethan/Github/sw-books/CLAUDE.md` first. Read `CLAUDE.local.md` if present (experiment-log instructions).

**One loop at a time**
- Take the lock first: `mkdir /tmp/sw-books-loop.lock` (write the loop name and start time into `/tmp/sw-books-loop.lock/owner`). If the lock exists and is younger than 3 hours, stop: report "skipped, <owner> running". If older, remove it and continue. Remove the lock at the end, including after a failure.

**Verify like CI**
- In the worktree: `npm ci --no-audit --no-fund && npm run verify`.
- If `admin/` changed: `npm --prefix admin ci --no-audit --no-fund`, then `npm run verify:admin` with the placeholder env from `.github/workflows/ci.yml` exported (never real keys).
- A change is verified only when these pass in a fresh worktree. Stale `.expo/` types in the main checkout can produce false typecheck errors; ignore results from there.

**Never**
- Push to `main`, force-push a branch you didn't create, or edit a PR branch owned by the owner.
- Run Supabase commands against a hosted project: no `--remote`, no `--linked`, never `--yes`. No `db:seed:prod`, `catalog:*:prod`, `catalog:apply`, or anything that writes production data.
- Edit `lib/types.ts` by hand, hand-edit `data/books.csv`, touch `.env*` files or secrets. (Copying the local `.env.local` files into a worktree for screenshots is fine; screenshots.md.)
- Delete, skip or weaken a test to get green. A reviewer who sees a test change must justify it.
- Change the design direction in CLAUDE.md. Restoring it is fine; changing it needs the owner's review.
- Unassign the owner (`ghanbak`) from anything, run `gh pr merge`, or touch the review-gate, auto-merge or fingerprint workflows or `.eas/workflows/`. Only the owner removes themselves.
- Run `eas build`, `eas submit`, `eas update`, `eas metadata:push`, `eas env:*` writes or `eas credentials`. Read-only EAS commands are fine (releases.md).

**Labels** describe the work, nothing else: type (`bug`, `enhancement`, `perf`, `a11y`, `design-drift`, `tech-debt`, `documentation`, `dependencies`), owner agent (`agent:tregg|luis|dylan|brandon`), product (`product:app|web|admin`, `area:data`), plus `source:scout` and `launch` where they apply. `release` marks a release issue; `needs-build` is set by the fingerprint check only.

**Assigned to `ghanbak` = the owner's turn** (owner's rule, 2026-11-06). Agents start any triaged work without approval, and every change lands as a PR with auto-merge on.
- **Issues** assigned to the owner: don't start work. They're waiting on a keep-or-close decision, a question, or a step only Ethan can do (consoles, secrets, accounts, a physical device, production data, licences). Say which in a comment. When the owner unassigns, the issue goes back to triage.
- **PRs** assigned to the owner can't merge: the required `review-gate` check fails while anyone is assigned. The caretaker still addresses review comments. When the owner unassigns, GitHub merges once CI is green.
- The `auto-merge` workflow turns on auto-merge for every `agent/*` and Dependabot PR when it opens. Agents never run `gh pr merge`.

**When to assign the owner** (assign at creation: `gh pr create --assignee ghanbak` / `gh issue create --assignee ghanbak`, so the gate holds from the first check)
- PRs with features or improvements (except sub-issue PRs into a feature branch; the feature → main PR is what gets reviewed): new features, UX or visual changes (including design-drift fixes, since CI can't check visuals), user-facing copy or flows, schema migrations, and changes to the design direction.
- PRs that would otherwise auto-merge but are missing their proof: a bug fix without a regression test, a perf change without a before/after measurement, or anything the independent reviewer blocked.
- PRs into `main` that change the iOS native fingerprint, even bug fixes: they need a store build (releases.md). The `fingerprint` check assigns the owner automatically; native work should go to the release branch instead.
- Unsafe dependency bumps. The auto-merge workflow already holds major and native/Expo-coupled Dependabot bumps by name. The caretaker also assigns the owner if a bumped package ships `ios/`, `android/` or `expo-module.config.json`, or if its release notes list breaking changes.
- Issues, rarely. The goal is maximum automation with the owner keeping creative and product-roadmap control. Assign an issue only when it's a roadmap call (a new feature or product direction an agent is proposing, not one the owner filed) or needs the owner's hands, or when an agent is truly blocked. Bugs, perf, a11y, maintenance and tech debt never wait on the owner at the issue stage. If you can decide it under these rules, decide it.
- Everything else stays unassigned and merges on its own: bug fixes with a regression test, perf wins with a measurement, lint/type fixes, a11y fixes, refactors and tech debt with no behavior change, tests, docs, and safe dependency bumps.
- If a bug or maintenance fix also needs a production step (data write, secret, console), let the code merge and open a separate issue assigned to the owner for that step.

**Independent reviewer**
- Before opening a PR (or before the caretaker clears a Dependabot PR), spawn a separate reviewer subagent (`general-purpose`) that gets only the diff, the issue or PR description and these rules, not your reasoning. Ask it to find reasons not to ship and end with `APPROVE` or `BLOCK: <reason>`. On `BLOCK`, fix it, or assign the owner with the reason in a comment.
- Visual changes (screenshots.md): the reviewer blocks a PR with no `## Screenshots` section and no `Screenshots: not captured (<reason>)` line, and any image showing data that isn't local seed data.

**Feature branches** (owner's rule, 2026-11-06: nothing half-built reaches `main`)
- Work that needs more than one agent, or several issues that only make sense together, is a **feature**: a parent issue with one sub-issue per piece of work (GitHub sub-issues), usually one per agent (e.g. Tregg design, Brandon backend, Luis mobile).
- The parent issue holds the shared contract so agents can work in parallel: the data shape or API, the screens and states, and which sub-issue owns what. A sub-issue that truly can't start until another lands says `Blocked by #<n>` in its body and stays out of `Todo` until that one is closed.
- Each feature has one branch, `feature/<parent-number>-<slug>`, created from `origin/main` by the first execute run that picks up one of its sub-issues. A ruleset on `feature/*` requires CI and blocks direct pushes, so all changes arrive by PR.
- Sub-issue PRs (`agent/<n>-<slug>` → `feature/...`) auto-merge into the feature branch once CI and the independent reviewer pass. Don't assign the owner on them, even for design or UX work; the owner reviews the feature as a whole.
- When every sub-issue is closed, the caretaker opens one PR `feature/...` → `main`, assigned to the owner, with `Closes #<parent>`, a "What to look at" list and links to each sub-issue PR. The review gate holds it until the owner unassigns.
- Keep the feature branch current: when it falls behind `main` or conflicts, open an `agent/sync-<parent>` PR that merges `origin/main` into it.
- Single-agent bugs, perf and maintenance work skip all this and PR straight to `main` as before.

**Backpressure**
- If 6 or more agent PRs (branch `agent/*`) are assigned to the owner, the execute loop only takes work that won't need the owner's review (bugs, perf, maintenance) until the owner catches up.

**Talking to the owner**
- Start every PR or issue comment with `🤖 <loop name>:`. Be terse.
- Update the Roadmap project (`gh project ... --owner ghanbak`, project 4): Status `In Review` when a PR opens, `Done` when merged.
- End every run with a 3–6 line summary: what you merged, opened, filed or skipped, and anything blocked. Append notable items to the experiment log per `CLAUDE.local.md`.
