# Launch plan: iOS App Store and Android closed testing

Agreed 2026-11-19; dates moved 2026-11-24 because no launch step had started.

## Goals
- **iOS:** on the App Store. Submit by **Fri Nov 27**, live around **Mon Nov 30**. Release issue #111, milestone "iOS 1.4.1".
- **Android:** by **Dec 1**, the polished build in Play **closed testing** with the listing done. Main issue #55, branch `feature/55-android-launch`, milestone "Android launch".

## Decisions
- Launch build is 1.4.1 **build 16 cut from `main`**, not build 15. The store build and `main` then share a fingerprint, so hotfixes after launch can go out as OTA.
- **No iPad at launch** (#410). iPad can be added later; once an app ships with it, it can't be removed.
- **Free EAS plan.** CI/CD minutes ran out around Nov 18 and reset Dec 1, so EAS workflows (OTA on merge, PR previews, the release dev build) fail at start. CLI builds and `eas update` don't use those minutes. Until Dec 1: no `device-review` labels, and the owner or Claude runs the builds from the CLI.
- **The Play account is personal**, so production access needs 12+ opted-in testers for 14 days. A rough build from `main` goes to closed testing first (Nov 25–26) to start the clock; the polished build replaces it after the owner approves #55. Production access around Dec 10.
- Scanner V2 (#74) and Archives browse (#61) keep going on their branches and don't gate either launch.

## iOS timeline
| When | Owner | Agents / Claude |
|---|---|---|
| Tue 24 – Wed 25 | #95 (JWT keys, Apple revoke secrets, deploy `delete-account`); Google OAuth to In production (#49); unassign #410 | Screenshots (#411), listing copy and privacy answers (#412); build 16 once #410 merges |
| Wed 25 – Thu 26 | TestFlight pass on build 16; App Store Connect listing; prod ISBN fixes #142, #127, #99 | Fix anything the TestFlight pass finds |
| Fri 27 | Submit for review, manual release | |
| Sat 28 – Mon 30 | Review, then release | Fix and resubmit if rejected |

## Android timeline
| When | Owner | Agents / Claude |
|---|---|---|
| Tue 24 – Wed 25 | Play Console verification, create the app, line up 12+ testers | Sub-issues #413–#417 on the feature branch |
| Wed 25 – Thu 26 | Upload the rough AAB to closed testing by hand; Android OAuth client with both SHA-1s | Rough production AAB from `main` |
| Fri 27 – Sat 28 | Review the feature on your phone, unassign #55 | Feature → `main` PR (fingerprint check) |
| Sun 29 – Dec 1 | Data safety, content rating, listing; polished build to closed testing | Polished AAB, `eas submit` to the track |
| ~Dec 10 | Apply for production access | |
