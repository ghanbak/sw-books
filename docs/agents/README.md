# Agent loops

Three scheduled loops keep sw-books moving. Each runs every 4 hours, staggered, as a fresh Claude Code session in the desktop app.

| Loop | Playbook | Writes code? |
|---|---|---|
| PR caretaker | [pr-caretaker.md](pr-caretaker.md) | Only on agent branches |
| Scout + triage | [scout-triage.md](scout-triage.md) | No, files and labels issues |
| Execute | [execute.md](execute.md) | Yes, on `agent/*` branches |

Every loop follows the shared rules below, then its own playbook. The weekly retro (owner-approved) is the only thing that edits these playbooks, the agent definitions or CLAUDE.md.

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
- Edit `lib/types.ts` by hand, hand-edit `data/books.csv`, touch `.env*` files or secrets.
- Delete, skip or weaken a test to get green. A reviewer who sees a test change must justify it.
- Change the design direction in CLAUDE.md. Restoring it is fine; changing it is `tier:review`.

**Tiers** (owner's rule, 2026-11-06: agents may start any triaged work without approval, and every change lands as a PR; the tier only decides how it merges)
- `tier:auto-merge` (bugs, performance, maintenance): bug fixes with a regression test, perf wins with a before/after measurement, lint/type fixes, a11y fixes, refactors and tech debt with no behavior change, tests, docs, and **safe dependency bumps**. Merge with `gh pr merge <n> --squash --auto` once CI passes and the independent reviewer approves.
- `tier:review` (features and improvements): new features, UX or visual changes (including design-drift fixes, since CI can't check visuals), user-facing copy or flows, schema migrations, unsafe dependency bumps, and any `auto-merge` change that's missing its regression test or measurement or that the reviewer blocked. Open the PR and never merge it. The owner reviews and comments, the caretaker addresses the comments, and the owner merges or turns on auto-merge.
- If a bug or maintenance fix needs a production step (data write, secret, console), the code still lands under its tier and the PR body lists the production step for the owner.
- `owner-only` issues need Ethan (consoles, secrets, accounts, a physical device, production data, licences). Agents never execute them; they may prepare a PR for any code part and leave the rest to the owner.
- `owner-review` issues are waiting on the owner's keep-or-close decision. Every loop ignores them.

**Safe dependency bump** (all must hold)
- Author is Dependabot, every bump is patch or minor semver.
- No bumped package is native or Expo-coupled: not `expo`, `expo-*`, `@expo/*`, `react`, `react-native`, `react-native-*`, `@react-native*`, `@shopify/*`, `react-native-webgpu`, `three`, and no bumped package ships `ios/`, `android/` or `expo-module.config.json` (check in `node_modules/<pkg>` after `npm ci`).
- Admin-only bumps (`/admin`) are safe when `verify:admin` passes, but they redeploy the website and admin on merge, so the reviewer reads the release notes.
- Anything else, or a grouped PR mixing safe and unsafe bumps → `tier:review`, with a comment saying what changed and what to test on a device.

**Independent reviewer**
- Before any merge or PR, spawn a separate reviewer subagent (`general-purpose`) that gets only the diff, the issue or PR description and the tier rules, not your reasoning. Ask it to find reasons not to ship and end with `APPROVE` or `BLOCK: <reason>`. `BLOCK` means no merge; fix it, or move the PR to `tier:review` with the reason in a comment.

**Backpressure**
- If 6 or more `tier:review` agent PRs (branch `agent/*`) are open and waiting on the owner, the execute loop only takes `tier:auto-merge` work until the owner catches up.

**Talking to the owner**
- Start every PR or issue comment with `🤖 <loop name>:`. Be terse.
- Update the Roadmap project (`gh project ... --owner ghanbak`, project 4): Status `In Review` when a PR opens, `Done` when merged.
- End every run with a 3–6 line summary: what you merged, opened, filed or skipped, and anything blocked. Append notable items to the experiment log per `CLAUDE.local.md`.
