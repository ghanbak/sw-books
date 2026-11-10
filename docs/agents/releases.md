# Releases

A change reaches iPhones one of two ways. The app's `runtimeVersion` policy is `fingerprint`, so the iOS native fingerprint decides which one.

| Lane | When | How | Owner |
|---|---|---|---|
| **OTA update** | The fingerprint matches a finished store build | `.eas/workflows/ota-production.yml` publishes to the `production` channel on every push to `main` | Not involved |
| **Store build** | The fingerprint changed: a new native module or config plugin, native fields in `app.json`, icons or splash, patched native packages, an Expo SDK upgrade, and some dependency bumps (#101's `@xmldom/xmldom` bump changed it) | EAS build, TestFlight, then App Store review | Writes the notes, runs the build, submits |

## The fingerprint check
- The `fingerprint` CI job (`.github/workflows/fingerprint.yml`) compares the iOS fingerprint of each PR into `main` with its base. If it changed, the job labels the PR `needs-build`, comments the changed sources, assigns the owner once, and fails while anyone is assigned. Unassigning approves landing it.
- Every app PR body ends with `OTA-safe: yes` or `OTA-safe: no (<what changed>)`. Check it in the worktree: `npx expo-updates fingerprint:generate --platform ios` on the branch and on `origin/main`, then compare `hash`.
- Prefer JS-only solutions. Adding a native dependency or config plugin is a deliberate choice; say why in the PR body.

## Where native work goes
Once a fingerprint change lands on `main`, nothing merged after it can reach the store build until the next build ships. So native work batches on the next release instead of trickling into `main`:
- Each iOS release has a milestone, `iOS <version>`, and a **release issue**, `Release iOS <version>` (label `release`, assigned to the owner, in that milestone).
- The release issue is a feature parent (README "Feature branches"). Native work is a sub-issue of it, and its PRs go into `feature/<release-issue>-ios-<major>-<minor>-<patch>`. JS-only work keeps going straight to `main` and ships OTA.
- At the Wednesday cut (Weekly train below), the caretaker opens the release PR (`feature/...` → `main`), assigned to the owner. Unassigning it means "cut the build".
- Held native Dependabot PRs and any `needs-build` PR into `main` get the next release's milestone so they show up in its rundown.
- The next version is a minor bump of the open milestone (`1.4.0` → `1.5.0`) unless the owner says otherwise. If triage finds native work and no release issue is open, it creates the milestone and release issue.

## Weekly train (owner's rule, 2026-11-10)
Native features ship on a fixed weekly cadence, one minor version per week. Native bugfixes ship as patches whenever they're ready.

| Change | Lane | Version |
|---|---|---|
| JS-only feature or fix | PR into `main`, OTA the same day | none |
| Native feature | sub-issue of this week's release issue, PR into its branch | weekly minor: `1.5.0`, `1.6.0`, … |
| Native bugfix (crash or broken flow in the live store build) | sub-issue of its own patch release issue, `Release iOS 1.5.1`, branch `feature/<issue>-ios-1-5-1` | patch, cut when its sub-issues are done |

**Cut dates live on the milestone.** Every weekly milestone (`iOS x.y.0`) has `due_on` set to its Wednesday. Whoever creates one sets it (`gh api -X PATCH repos/ghanbak/sw-books/milestones/<n> -f due_on=<YYYY-MM-DD>T17:00:00Z`). A release is due for its cut when the local time is at or after 9:00 on its due date (the date part of `due_on`, not converted to local time) and it has no release PR yet. That makes the cut idempotent: a later run that day finds the release PR and does nothing.

**The week** (local time)
- **Mon–Tue:** native PRs land on the release branch.
- **Wed 9:00, the cut:** the first caretaker run that finds a weekly release due cuts it:
  1. Next week first: create the next milestone (`iOS x.(y+1).0`, `due_on` the following Wednesday) and its `Release iOS x.(y+1).0` issue if they don't exist yet.
  2. Carry over: sub-issues not `Done` move to the next milestone and are re-attached to the next release issue. Their open PRs go back to draft (`gh pr ready <n> --undo`) with a comment, so nothing more merges into the release under review.
  3. Version bump: `npm version <x.y.0> --no-git-tag-version` (syncs `app.json`) on an `agent/release-<x-y-0>` PR into the release branch. It auto-merges.
  4. Open the release PR (`feature/...` → `main`, assigned to the owner) per pr-caretaker.md step 3, even if the release issue still has open owner-only checklist items. Its `## How to review` covers the week's native changes.
- **Wed:** the owner unassigns the release PR to merge it, runs the build and checks TestFlight.
- **Thu:** the owner submits. App Review usually lands before the weekend.
- **After the release PR merges:** the caretaker creates the next release branch from `origin/main` (`feature/<next-issue>-ios-x-<y+1>-0`), retargets the carried-over PRs to it (`gh pr edit <n> --base ...`), rebases them if needed, and marks them ready again.
- **Empty week:** no native sub-issues `Done` at the cut → skip steps 1–4 (no next milestone, no release PR, no bump, no build). Only move the milestone's `due_on` to the next Wednesday; open work stays on it.

Triage only checks that the next milestone and release issue exist; the caretaker creates them at the cut.

**Patches** don't wait for Wednesday. If a weekly release is merged to `main` but not shipped yet, fold the fix into it instead (it ships with that build). Otherwise the caretaker creates the patch branch (execute never creates it from `main`), from the commit of the live store build (`eas build:list --platform ios --profile production --status finished --limit 1 --json --non-interactive` gives `gitCommitHash`), not from `main`, which may already carry an unshipped weekly release. When every sub-issue is `Done`, the caretaker bumps the patch version and opens its release PR the same way. Afterwards the weekly release branch syncs from `main` (the `agent/sync-<parent>` PR) before its own cut.

## The release issue
Its body has four sections. The caretaker keeps the first two current every run:
1. **What's new since <last store version>**: every user-facing PR merged to `main` since the last store build, OTA'd ones included (App Store notes cover everything since the last store version). One plain-language line each, with the PR number. Skip internal work (CI, agents, admin, catalog tooling) unless users can see it.
2. **Why it needs a build**: the fingerprint-changing PRs and what each one changed.
3. **Owner checklist**: production steps agents can't take (secrets, Edge Function deploys, console changes), then build, TestFlight check, notes, submit.
4. **Release notes**: a short suggested draft, for the owner to rewrite.

Builds and submissions stay with the owner:
```bash
eas build --platform ios --profile production
```
```bash
eas submit --platform ios --profile production --latest
```
After the version ships: close the milestone and the release issue, tag `v<version>` on the release commit, and from then on matching pushes to `main` ship OTA again.

## Agents and EAS
- Read-only EAS commands are fine: `eas build:list`, `eas build:view`, `eas fingerprint:compare`, `eas update:list`.
- Agents never run `eas build`, `eas submit`, `eas update`, `eas metadata:push`, `eas env:create|update|delete` or `eas credentials`. OTA publishing belongs to the EAS workflow, not to an agent session.
