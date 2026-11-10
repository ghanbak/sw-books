# Owner digest, PR review guides and device previews

Status: approved 2026-11-10. Step 1 (digest) is live; steps 2–5 land as separate PRs.

## Today
- No daily or weekly update exists. The only scheduled item for you is the one-time X-post reminder on Fri 2026-11-13.
- Owner-review PRs say what changed but not how to test it. Device checks fall back to "please look on a device".
- EAS: `eas.json` has `development` (simulator), `development-device`, `preview` (internal) and `production` profiles. Runtime is `fingerprint`, there's one EAS workflow (`ota-production.yml`), and the GitHub repo isn't linked in expo.dev yet (open owner step). Agents never run EAS write commands.

## 1. Weekday digest at 9:00

New scheduled task `sw-books-daily-digest`, cron `0 9 * * 1-5` (Pacific).
- Window: Tue–Fri covers the last 24 h. Monday covers Fri 17:00 → Mon 09:00.
- Read-only: `gh` queries plus the loop run history. It changes nothing.
- Delivered as a session in this app with a push notification (open: Duet, see questions).

Sections, in order:
1. **TL;DR**: 2–3 lines with what merged, what's waiting on you, and anything broken.
2. **Review today**: every PR assigned to you, ranked, one line each, with:
   - what to decide
   - where to test (phone preview, simulator, browser or code only)
   - estimated minutes
   - link
3. **Your issues today**: the top 3 issues assigned to you, picked by these rules, then a short "can wait" list.
   1. Expiring or security items (for example, #29, the Apple Sign-in key).
   2. Items blocking the agents: owner-review backpressure, ruleset steps (#113), and issues gating Todo items.
   3. Launch or release milestone items (#111, #95, #49).
   4. Production data steps, batched into one sitting (#99, #127, #142, #158, #170, #230).
   5. Everything else, by Roadmap priority, then age.
4. **Merged since last digest**: grouped by app, web/admin, data and harness, with counts per agent.
5. **Loop health**: runs since last digest, zero-work runs and why, failures.

## 2. "How to review" section on owner-review PRs

Required on every PR assigned to you. The reviewer subagent blocks without it. The caretaker backfills the open ones (#141, #191, #215, #216, #218, #226, #227).

```markdown
## How to review (~5 min)
**Where:** Phone preview · Simulator · Browser · Code only
**Check:**
1. <behaviour to confirm, in user terms>
2. <edge case worth a look>
**Steps:**
- Phone (added in step 3): open the "Expo preview" comment on this PR and scan its QR with the Camera. It opens in the development build, signed in as you, on production data.
- Simulator: `npm run review -- <PR#>`, then <deep link or taps>.
- Browser: <Vercel preview URL>/<path>.
**Approve:** unassign yourself; auto-merge takes it from there.
**Request changes:** comment; the caretaker picks it up on its next run.
```

Supporting script `scripts/review-pr.sh <PR#>` (`npm run review`), with no EAS involved:
1. Creates a worktree for the PR head.
2. Copies `.env.local` and runs `npm ci`.
3. Starts Metro with the worktree's own expo binary.
4. Boots the iPhone 17 Pro simulator and opens the dev client.
5. Prints the deep links.
6. Cleans up on Ctrl-C.

## 3. Device previews (the Vercel-style part)

Recommendation: yes. Use EAS Workflows, which run in Expo's CI, so agents still never run `eas` themselves.

**One-time owner setup**
1. Link the GitHub repo in expo.dev. This is already needed for OTA.
2. Register your iPhone. Either use an `apple-device-registration-request` job (scan a QR, install a profile) or run `eas device:create`.
3. Install one `development-device` build on your phone (one EAS build, about 20 min).

**Phase A: JS-only PRs.** These are most PRs: cheap and fast.
- New `.eas/workflows/pr-preview.yml`, triggered by the `device-review` label (`pull_request_labeled`) and re-run on new commits to labeled PRs.
- Jobs:
  1. `fingerprint`
  2. if it matches the installed dev build: `update` on an update branch named after the PR's git branch
  3. `github-comment`, which posts a QR that opens the update in your dev build
- When the git branch is deleted (GitHub deletes it on merge): `branch-delete`, in `pr-preview-cleanup.yml`.
- Who adds the label: execute and the caretaker, when they assign you a PR that changes `app/`, `components/`, `hooks/`, `constants/` or `assets/`.

**Phase B: native changes.** These ride the weekly train (section 4), so there are no per-PR builds.
- Native PRs merge into the week's release branch. When that branch's fingerprint changes, the workflow builds one `development-device` build of the release branch, at most once a day, and posts an install QR on the release issue. You test the whole week's native work on one build.
- After a release merges to main, the same workflow rebuilds your dev build so Phase A previews keep matching.

**Caveats**
- Previews use the build's env, so they run against production Supabase with your real account, like TestFlight. A PR that needs an unapplied migration can't be previewed on a device; its guide says "Simulator" instead.
- Previews publish to PR-named update branches, never the `production` channel, so store users never get them. (With the `fingerprint` policy a dev build shares its runtime with a store build of the same native state.)
- The `development-device` build uses the store app's bundle ID, so installing it replaces the App Store/TestFlight app on the phone (open decision below).
- Cost: updates are negligible at one device. Native builds count against the EAS build quota, so they sit behind approval.
- Previews don't replace the agents' own simulator proof. They're for your review only.

## 4. Weekly native release train

Builds on `docs/agents/releases.md`, which already batches native work into `feature/<release-issue>-ios-x-y-z`. What's new is a fixed cadence.

| Change type | Lane | Version |
|---|---|---|
| JS-only feature or fix | OTA on merge to `main`, same day | none; stays on the current store version |
| Native feature | this week's release branch | weekly minor: 1.4.0, then 1.5.0, then 1.6.0 |
| Native bugfix | its own patch release branch off `main`, cut when ready | patch: 1.4.1 |

Weekly rhythm:
- **Mon–Tue:** native PRs land on the release branch. Phone previews come from the release-branch dev build.
- **Wed 9:00:** the cut. The digest flags it, and the caretaker opens the release PR (release branch → `main`) with the release issue filled in (what's new, why it needs a build, checklist, notes draft). Anything not finished moves to next week's milestone, not the cut.
- **Wed:** you unassign the release PR to merge it, run `eas build --profile production` and check TestFlight.
- **Thu:** submit. App Review usually lands before the weekend.
- **Right after the cut:** triage opens next week's milestone and release issue (`iOS 1.(y+1).0`) and its branch.
- **Empty week** (no native work): no build and no version bump. OTA covers everything.

First train: finish the open `Release iOS 1.4.0` (#111) this week, then 1.5.0 starts the following Monday.

## Rollout (one PR each)
1. Digest scheduled task. Local only; no repo change.
2. `scripts/review-pr.sh` plus the "How to review" rule in `docs/agents/execute.md`, `pr-caretaker.md` and the reviewer brief. Docs and harness change; merges on its own.
3. `pr-preview.yml` (Phase A), after your one-time setup. You review this one because it touches EAS and release infra.
4. Weekly train: cadence rules in `releases.md`, `pr-caretaker.md` and the scout-triage brief (Wednesday cut, milestone rollover, patch lanes). Docs and harness change.
5. Phase B: release-branch dev build in `pr-preview.yml`, after a week of Phase A. You review this one.

## Decisions (2026-11-10)
- Digest: this app only, 9:00 on weekdays.
- iPhone: register it and install one dev build.
- Native builds: weekly train, with one release-branch dev build per change day; no per-PR builds.
- Previews on production data and your account: OK.
- Cut day: Wednesday 9:00.
- Open: the phone dev build's bundle ID. As is, it replaces the App Store/TestFlight app on the phone. A separate dev variant (`app.config.ts` with `APP_VARIANT`, its own bundle ID) lets both coexist but is a native change and needs Apple/Google sign-in set up for the new bundle ID.
