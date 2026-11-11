# Agent loops

Three scheduled loops keep sw-books moving: execute every 2 hours (:45 on even hours), PR caretaker every 2 hours (:15 on odd hours, so it picks up execute's PRs), and scout + triage every 4 hours, staggered, as a fresh Claude Code session in the desktop app.

| Loop | Playbook | Writes code? |
|---|---|---|
| PR caretaker | [pr-caretaker.md](pr-caretaker.md) | Only on agent branches |
| Scout + triage | [scout-triage.md](scout-triage.md) | No, files, labels and assigns issues |
| Execute | [execute.md](execute.md) | Yes, on `agent/*` branches |

Every loop follows the shared rules below, then its own playbook. Where a skill disagrees with a playbook, the playbook wins. [releases.md](releases.md) covers OTA updates and store builds; [screenshots.md](screenshots.md) covers PR screenshots and diagrams. The weekly retro (owner-approved) is the only thing that edits these playbooks, the agent definitions or CLAUDE.md.

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
- If `supabase/` changed (migrations, SQL tests, functions): `scripts/verify-db.sh`. It applies every migration to a throwaway local stack (separate project id and ports, so the owner's local DB is never touched) and runs `supabase/tests/*.sql`; it starts Docker if needed. For a fail-before check, run it with the new migration removed.
- UI and device checks are yours too: the simulator and a browser per [screenshots.md](screenshots.md).
- A change is verified only when these pass in a fresh worktree. Stale `.expo/` types in the main checkout can produce false typecheck errors; ignore results from there.

**Never**
- Push to `main`, force-push a branch you didn't create, or edit a PR branch owned by the owner.
- Run Supabase commands against a hosted project: no `--remote`, no `--linked`, never `--yes`. No `db:seed:prod`, `catalog:*:prod`, `catalog:apply`, or anything that writes production data.
- Edit `lib/types.ts` by hand, hand-edit `data/books.csv`, touch `.env*` files or secrets. (Copying the local `.env.local` files into a worktree for screenshots is fine; screenshots.md.)
- Delete, skip or weaken a test to get green. A reviewer who sees a test change must justify it.
- Change the design direction in CLAUDE.md. Restoring it is fine; changing it needs the owner's review.
- Unassign the owner (`ghanbak`) from anything, run `gh pr merge`, or touch the review-gate, auto-merge or fingerprint workflows or `.eas/workflows/`. Only the owner removes themselves.
- Run `eas build`, `eas submit`, `eas update`, `eas metadata:push`, `eas env:*` writes or `eas credentials`. Read-only EAS commands are fine (releases.md).

**Labels** describe the work, nothing else: type (`bug`, `enhancement`, `perf`, `a11y`, `design-drift`, `tech-debt`, `documentation`, `dependencies`), owner agent (`agent:tregg|luis|dylan|brandon`), product (`product:app|web|admin`, `area:data`), plus `source:scout` and `launch` where they apply. `release` marks a release issue; `needs-build` is set by the fingerprint check only. `needs-proof` marks a draft agent PR still waiting on a check (see below). `device-review` asks for a phone preview ("How to review"). `needs-owner` marks a feature main issue with unchecked owner checklist items.

**Assigned to `ghanbak` = the owner's turn** (owner's rule, 2026-11-06). Agents start any triaged work without approval, and every change lands as a PR with auto-merge on.
- **Issues** assigned to the owner: don't start work. They're waiting on a keep-or-close decision, a question, or a step only Ethan can do (consoles, secrets, accounts, a physical device, production data, licences). Say which in a comment. When the owner unassigns, the issue goes back to triage. Exception: a feature's **main issue** (a parent with sub-issues) is assigned to the owner for the life of the feature. Agents work its sub-issues as usual, and the owner unassigning the main issue means "approved, open the feature PR" (Feature branches).
- **PRs** assigned to the owner can't merge: the required `review-gate` check fails while anyone is assigned. The caretaker still addresses review comments. When the owner unassigns, GitHub merges once CI is green.
- The `auto-merge` workflow turns on auto-merge for every `agent/*`, `feature/*` and Dependabot PR when it opens or leaves draft. Agents never run `gh pr merge`.

**When to assign the owner** (assign at creation: `gh pr create --assignee ghanbak` / `gh issue create --assignee ghanbak`, so the gate holds from the first check)
Owner's rule, 2026-11-07: the owner reviews product decisions, not proof agents could have gotten themselves. Of 6 PRs once waiting on the owner, only 2 needed them (a new website page, a native menu change); the rest were waiting on checks an agent never ran.
- PRs that change what people using the app or website see or do (except work inside a feature: its PRs never wait on the owner, who reviews the whole feature on its main issue): new features, visual or UX changes (including design-drift fixes), user-facing copy or flows, and changes to the design direction.
- Schema migrations that drop or rename a table or column, or rewrite existing user data. Additive and hardening migrations (new tables, columns, indexes, functions, grants, `search_path`) merge on their own once `scripts/verify-db.sh` passes.
- Anything the independent reviewer still blocks after one fix. Inside a feature, add an owner checklist item instead (Feature branches).
- PRs into `main` that change the iOS native fingerprint, even bug fixes: they need a store build (releases.md). The `fingerprint` check assigns the owner automatically. Native work belongs inside a feature, or is a standalone fix held by this check (releases.md).
- Unsafe dependency bumps. The auto-merge workflow already holds major and native/Expo-coupled Dependabot bumps by name. The caretaker also assigns the owner if a bumped package ships `ios/`, `android/` or `expo-module.config.json`, or if its release notes list breaking changes.
- Issues, rarely. The goal is maximum automation with the owner keeping creative and product-roadmap control. Assign an issue only when it's a roadmap call (a new feature or product direction an agent is proposing, not one the owner filed) or needs the owner's hands, or when an agent is truly blocked. Bugs, perf, a11y, maintenance and tech debt never wait on the owner at the issue stage. If you can decide it under these rules, decide it.
- Everything else stays unassigned and merges on its own: bug fixes with a regression test, perf wins with a measurement, lint/type fixes, a11y fixes, refactors and tech debt with no behavior change, tests (including SQL tests), docs, safe dependency bumps, and the local admin tool (`admin/`, with screenshots).
- Never assign the owner because a check didn't run. "No Docker", "no simulator" and "not checked in a browser" are the agent's job: run `scripts/verify-db.sh`, the simulator or the browser. A simulator walkthrough is a bonus on a fix that already has a regression test, not a gate.
- If the proof truly can't be produced this run (the script or simulator errors out), open the PR as a **draft** with the `needs-proof` label and a `Not run` section saying what's missing. Drafts don't auto-merge. Inside a feature, don't draft: the sub-issue PR merges with the label and the `Not run` section, and the caretaker produces the proof on the feature branch before it opens the feature PR. The caretaker retries the proof each run and runs `gh pr ready` once it passes. Assign the owner only after 3 failed caretaker attempts, with what failed.
- If a bug or maintenance fix also needs a production step (data write, secret, console), let the code merge and open a separate issue assigned to the owner for that step.

**"How to review" section** (owner's rule, 2026-11-10: every PR waiting on the owner says what to check and how)
- Every PR assigned to the owner starts with this section, before `## Screenshots`. It replaces the old "What to look at" list. The same goes for comments that assign the owner on a Dependabot PR.
- Write checks in user terms ("the list scrolls back to the top after a new search"), not code terms. Give the least setup that proves it: Code only beats Browser, and Browser beats Simulator.

  ```markdown
  ## How to review (~<minutes> min)
  **Where:** Phone preview | Simulator | Browser | Code only
  **Check:**
  1. <behaviour to confirm, in user terms>
  2. <edge case worth a look>
  **Steps:**
  - Phone: scan the QR in this PR's "Expo preview" comment with the Camera, then <taps>.
  - Simulator: `npm run review -- <PR#>` (or a branch name, e.g. the feature branch), then <deep link `ossusarchives://<route>` or taps>.
  - Browser: <Vercel preview URL>/<path>. Admin: `npm run admin` in a worktree on the branch.
  - Code only: <files to read and what to look for>.
  **Decide:** <the product call, if any>
  **Approve:** unassign yourself; auto-merge takes it from there.
  **Request changes:** comment; the caretaker picks it up on its next run.
  ```

- Keep only the **Steps** lines that apply. Put deep links in full (`ossusarchives://book/<slug>`); `npm run review` prints them.
- **Phone previews:** when you assign the owner a PR into `main` that changes `app/`, `components/`, `hooks/`, `constants/`, `lib/` or `assets/`, add the `device-review` label, unless it's `needs-build` or touches `supabase/` (previews run on production data, which doesn't have the PR's schema yet). `.eas/workflows/pr-preview.yml` then publishes the head as an EAS update and comments a QR, re-publishing on each push. Lead **Where** with Phone preview for anything touch, motion, haptics or camera related. PRs branched before the workflow landed need a sync with `main` first; EAS runs the workflow file from the PR head.
- `needs-build` PRs: the installed dev client can't run them. Say so; **Where** is Code only plus the PR's screenshots.
- Agents never leave `npm run review` running (it holds the simulator lock until Ctrl-C). Use `npm run review -- <PR#> --check --out <dir>`: it screenshots each deep link in the PR body, cleans up and exits. Run it in the background (it can wait 15 min for the simulator lock).

**Independent reviewer**
- Before opening a PR (or before the caretaker clears a Dependabot PR), spawn a separate reviewer subagent (`general-purpose`) that gets only the diff, the issue or PR description and these rules, not your reasoning. Ask it to find reasons not to ship and end with `APPROVE` or `BLOCK: <reason>`. On `BLOCK`, fix it, or assign the owner with the reason in a comment. Inside a feature, open the PR anyway with the objection in its body and add an owner checklist item marked "possible bug".
- Visual changes (screenshots.md): the reviewer blocks a PR with no `## Screenshots` section and no `Screenshots: not captured (<reason>)` line, and any image showing data that isn't local seed data.
- PRs that will be assigned to the owner: give the reviewer the draft PR body too. It blocks one with no `## How to review` section, or one whose deep links don't match a route changed in the diff (`app/` files).

**Feature branches** (owner's rules, 2026-11-06 and 2026-11-11: nothing half-built reaches `main`; the owner reviews features, not PRs)
- Work that needs more than one agent, or several issues that only make sense together, is a **feature**: a **main issue** with one sub-issue per piece of work (GitHub sub-issues), usually one per agent (e.g. Tregg design, Brandon backend, Luis mobile).
- The main issue is assigned to the owner from creation. Its body holds the shared contract (data shape or API, screens and states, which sub-issue owns what) and an `## Owner checklist` section. A sub-issue that truly can't start until another lands says `Blocked by #<n>` and stays out of `Todo` until that one is closed.
- Each feature has one branch, `feature/<main-issue>-<slug>`, created from `origin/main` by the first execute run that picks up one of its sub-issues. A ruleset on `feature/*` requires CI and blocks direct pushes, so all changes arrive by PR.
- Sub-issue PRs (`agent/<n>-<slug>` → `feature/...`) auto-merge once CI passes. They're never assigned to the owner, never left as drafts, and never wait on the owner, design and UX work included. The independent reviewer still runs; an objection left after one fix goes in the PR body and on the checklist, and the PR merges anyway. Nothing reaches `main` until the owner approves the feature.
- **When an agent needs the owner** (a product call, a choice between options, a phone check, a destructive migration):
  1. Comment on the main issue, starting `🤖 <loop>: @ghanbak`, with the context, screenshots, a `## How to review` section where it applies, the options and your recommendation.
  2. Add one line under `## Owner checklist`: `- [ ] <one-line question or action> — [details](<comment URL>)`. Re-read the issue body right before editing it, and only add lines to that section; never rewrite other lines (the owner may have just checked one).
  3. Add the `needs-owner` label to the main issue. Then keep working; don't wait for an answer.
  The owner's queue is `is:open label:needs-owner` and the daily digest. Agents post as the owner's account, so the `@ghanbak` mention doesn't notify them; it's there to make requests searchable. In parallel execute runs, the orchestrator makes the issue-body edits, one at a time, not the subagents.
- **The owner answers by checking the box.** An owner comment is a `ghanbak` comment that doesn't start with `🤖`. Checked with no owner comment after the request → go with the recommendation. An owner comment after the request overrides it. Work that comes out of an answer becomes a new sub-issue.
- **When every sub-issue is done**, the caretaker opens the feature PR as a draft, adds a "Review the feature" checklist item and asks for the owner's review (pr-caretaker.md step 3). Production steps the merge needs (migrations, Edge Functions, secrets) become issues assigned to the owner and checklist items. The feature PR doesn't leave draft while any of those issues is open, because a JS-only feature reaches users as soon as it merges.
- **The owner approves by unassigning the main issue.** The caretaker then marks the feature PR ready and auto-merge takes it. A JS-only feature ships OTA on merge, with no version bump. A feature that changes the native fingerprint gets a version bump first. The `fingerprint` check assigns the owner to its PR when the draft opens; the owner leaves that assignment until the caretaker marks the PR ready, then unassigns it as the final "yes, do a store build". The release flow follows the merge (releases.md).
- Keep the feature branch current: when it falls behind `main` or conflicts, open an `agent/sync-<parent>` PR that merges `origin/main` into it.
- Single-agent bugs, perf and maintenance work skip all this and PR straight to `main` as before.

**Backpressure**
- If 6 or more `agent/*` or `feature/*` PRs are assigned to the owner, the execute loop only takes work that won't need the owner's review (bugs, perf, maintenance) until the owner catches up.

**Talking to the owner**
- Start every PR or issue comment with `🤖 <loop name>:`. Be terse.
- Update the Roadmap project (`gh project ... --owner ghanbak`, project 4): Status `In Review` when a PR opens, `Done` when merged.
- End every run with a 3–6 line summary: what you merged, opened, filed or skipped, and anything blocked. Append notable items to the experiment log per `CLAUDE.local.md`.
