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

## Releases follow features (owner's rule, 2026-11-11)
There's no fixed release schedule. A store release happens when native code reaches `main`:
- **Native work lives inside a feature** (README "Feature branches") and reaches `main` only when the owner approves the feature. A standalone native change (an SDK upgrade, a native bugfix, a held Dependabot bump) is a PR into `main` that the `fingerprint` check holds for the owner.
- **JS-only features and fixes** ship OTA as soon as they merge. No version bump, no release issue.
- **Before a native feature merges**, the caretaker bumps the version on the feature branch (`npm version minor --no-git-tag-version`, which syncs `app.json`, on an `agent/release-<x-y-0>` PR into it). A standalone native bugfix gets a patch bump in its own PR. The merged code is then ready to build.
- **After native code merges**, the caretaker opens the milestone `iOS <version>` and the release issue `Release iOS <version>` (below). The owner builds, checks TestFlight and submits. Until that build ships, OTA publishes nothing (no store build matches `main`), so everything merged in between rides the store build.
- **One store release at a time:** a second native feature waits to merge until the open release ships. JS-only features can merge anytime, but while a release is pending they ride its store build instead of OTA.
- **Forcing a store release** for a JS-only feature (for App Store "What's New", say): the owner asks on the main issue, and the caretaker bumps the version on the feature branch. The version is part of the fingerprint, so the feature then takes the native path.

## The release issue
Assigned to the owner, label `release`, in its milestone. Its body has four sections. The caretaker keeps the first two current every run:
1. **What's new since <last store version>**: every user-facing PR merged to `main` since the last store build, OTA'd ones included (App Store notes cover everything since the last store version). One plain-language line each, with the PR number. Skip internal work (CI, agents, admin, catalog tooling) unless users can see it.
2. **Why it needs a build**: the fingerprint-changing PRs and what each one changed.
3. **Owner checklist**: production steps agents can't take (secrets, Edge Function deploys, console changes), then build, TestFlight check, notes, submit.
4. **Release notes**: a short suggested draft, for the owner to rewrite.

The caretaker also keeps a `Phone build:` line at the top of the body: the newest finished `development-device` build of the release branch (`eas build:list --platform ios --profile development-device --status finished --limit 5 --json --non-interactive`, matched by `gitCommitHash` on the branch) with its expo.dev link. If `eas fingerprint:compare` shows the branch head's iOS fingerprint differs from that build's, add "native changes newer than this build; approve the rebuild in expo.dev".

## Phone builds for native work
`.eas/workflows/release-dev-build.yml` runs on every push to `main` and to `feature/*` branches. When the iOS fingerprint has no matching `development-device` build, it waits for the owner's approval in expo.dev, then builds one. The owner installs it from expo.dev and previews the feature's native work on it before approving the feature. After a release merges, the same workflow offers a rebuild from `main`, so phone previews (`pr-preview.yml`) match again. JS-only pushes build nothing, and a running build is never cancelled. The phone holds one dev build: while the release-branch build is installed, previews of PRs into `main` won't open until `main`'s build is reinstalled from expo.dev.

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
