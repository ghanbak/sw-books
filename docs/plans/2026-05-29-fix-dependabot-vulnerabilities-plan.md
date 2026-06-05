---
title: Fix 9 open Dependabot vulnerabilities via npm overrides
type: fix
date: 2026-05-29
---

# 🐛 Fix 9 open Dependabot vulnerabilities (no Expo SDK bump)

## Overview

Dependabot has **9 open alerts**, all **transitive**, across the root Expo app and the
local-only `admin/` Next.js tool. `npm audit fix --force` would "fix" them by installing
`expo@56.0.8` (a two-major SDK migration) and downgrading `next` — unacceptable for a
security patch. Instead we pin the patched **leaf** versions with npm `overrides`,
regenerate both lockfiles, and verify. We stay on **Expo SDK 54**.

The actual change is ~7 lines of JSON across two `package.json` files plus two regenerated
lockfiles. No source code changes.

## Confirmed alerts (ground truth)

Source: `gh api repos/:owner/:repo/dependabot/alerts` + `npm audit` (2026-05-29). These
GHSA IDs and version ranges are authoritative — they drive every override.

| # | Sev | Package | Installed | Vuln range | Patch | GHSA | Manifest | Parent chain |
|---|-----|---------|-----------|------------|-------|------|----------|--------------|
| 1 | HIGH | @xmldom/xmldom | 0.8.12 | <0.8.13 | 0.8.13 | GHSA-x6wf-f3px-wcqx | root | `plist`/`@expo/plist` (`^0.8.8`) |
| 2 | HIGH | @xmldom/xmldom | 0.8.12 | <0.8.13 | 0.8.13 | GHSA-j759-j44w-7fr8 | root | ↑ same |
| 3 | HIGH | @xmldom/xmldom | 0.8.12 | <0.8.13 | 0.8.13 | GHSA-2v35-w6hq-6mfw | root | ↑ same |
| 4 | HIGH | @xmldom/xmldom | 0.8.12 | <0.8.13 | 0.8.13 | GHSA-f6ww-3ggp-fr8h | root | ↑ same |
| 6 | MED | postcss | 8.4.49 | <8.5.10 | 8.5.10 | GHSA-qx2v-qp2m-jg93 | root | `@expo/metro-config` (`~8.4.32`) |
| 7 | MED | brace-expansion | 5.0.5 | 5.0.0–5.0.5 | 5.0.6 | GHSA-jxxr-4gwj-5jf2 | root | `glob` → `minimatch` (`^5.0.5`) |
| 8 | MED | uuid | 7.0.3 | <11.1.1 | 11.1.1 | GHSA-w5hq-g745-h8pq | root | `xcode` (`^7.0.3`) → `@expo/config-plugins` |
| 9 | MED | ws | 8.20.0 | 8.0.0–8.20.0 | 8.20.1 | GHSA-58qx-3vcg-4xpx | root | `@expo/cli` **and** `@supabase/realtime-js` |
| 10 | MED | postcss | 8.4.31 | <8.5.10 | 8.5.10 | GHSA-qx2v-qp2m-jg93 | admin | `next` (bundled) |

> Alert #5 is already closed — 9 open total. **Do not** re-match #7/#9 to the older
> already-patched advisories (GHSA-v6h2-p8h4-qcjw, GHSA-3h5v-q93c-6h6q); the live alerts
> cite the GHSAs above, confirmed by `npm audit`. An earlier research pass made exactly
> that mistake and wrongly concluded they were patched.

## Proposed Solution

Add `overrides` to **both** `package.json` files, then `npm install` in each. `admin/` is
**not** an npm workspace and has its own lockfile, so root overrides do not reach it — it
needs its own block. All pins are **exact** (not `^ranges`) for reproducibility.

### Root `package.json`

```jsonc
{
  "overrides": {
    "@xmldom/xmldom": "0.8.13",   // #1-4  in-range patch (plist allows ^0.8.8); single instance
    "postcss": "8.5.10",           // #6    minor within major 8, no API change
    "brace-expansion@5": "5.0.6",  // #7    scoped: only 5.x; leaves 1.1.x and 2.1.0 untouched
    "uuid": "11.1.1",              // #8    single instance; bare key is sufficient
    "ws@8": "8.20.1"               // #9    scoped: only 8.x; leaves 6.2.3 and 7.5.10 untouched
  }
}
```

### Admin `admin/package.json`

```jsonc
{
  "overrides": {
    "postcss": "8.5.10"            // #10   forces next's bundled 8.4.31 → 8.5.10
  }
}
```

## Why scoped `name@major` for ws and brace-expansion (only)

npm 10.x supports version-selector keys at the top level of `overrides` (RFC 0036, verified
against npm 10.9.2). They are load-bearing for two packages with **coexisting safe majors**
that a blanket override would wrongly drag up a major:

- **ws**: top-level `node_modules/ws` is `7.5.10`; `6.2.3` sits under both `react-native`
  and `@react-native/dev-middleware`; the vulnerable `8.20.0` is under `@expo/cli` and
  `@supabase/realtime-js`. `"ws@8"` touches only the 8.x instances; a bare `"ws"` would
  force the 6/7 dev-server instances to 8.x.
- **brace-expansion**: four majors coexist — `1.1.13`, `1.1.14` (under various `minimatch`),
  `2.1.0`, and the vulnerable `5.0.5` (under `glob`→`minimatch`). `"brace-expansion@5"`
  touches only 5.x.

`@xmldom/xmldom`, `postcss`, and `uuid` each have **no risky coexisting major** (uuid has a
single 7.0.3 instance; postcss instances are all major 8), so bare keys are correct and
simpler.

## Risk & the one cross-major bump (uuid 7 → 11.1.1)

All overrides are LOW risk: in-range or same-major patches — **except uuid**, a 4-major
jump that is *outside* `xcode`'s declared `uuid@^7.0.3`. npm overrides bypass declared
ranges by design, so the install succeeds, but this is the single riskiest action and the
plan must prove it safe rather than assert it:

- **Pre-flight check (do before committing):** grep the installed `xcode` source for its
  `uuid` usage — confirm it only calls `require('uuid').v1()/.v4()` (still exported in v11)
  and uses no removed v8-era default export / no `uuid.v8`/`parse`/`stringify` API drift.
  ```bash
  npm ls xcode    # find the path, then:
  grep -rn "uuid" node_modules/xcode/lib node_modules/xcode/*.js
  ```
- **Blast radius:** `xcode` (pbxproj parser) is reached only via `@expo/config-plugins`,
  exercised during `npx expo prebuild` / EAS native builds — **never** at app runtime, in
  Metro bundling, or in `expo start`. For this managed app, prebuild is rarely run locally.

## Acceptance Criteria

- [x] Both `package.json` files have the `overrides` above; both lockfiles regenerated and
      committed (root + `admin/`).
- [x] uuid pre-flight check above passes — `xcode/lib/pbxProject.js` only calls `uuid.v4()`
      (line 90), a named export present in v11; no default-export / `v8` / `parse` usage.
- [x] `npm audit` (root) and `npm --prefix admin audit` both report **0 vulnerabilities**.
- [x] `git diff` shows **only** intended packages changed: root → 2×ws, xmldom,
      brace-expansion, postcss, uuid (24+/8−); admin → only postcss version lines.
- [x] `npm ls` confirms bumps **and** untouched coexisting majors: ws `6.2.3`/`7.5.10` intact
      + `8.x`=`8.20.1`; brace-expansion `1.1.13`/`1.1.14`/`2.1.0` intact + `5.x`=`5.0.6`;
      xmldom=`0.8.13`; uuid=`11.1.1`; postcss=`8.5.10`.
- [x] `npx expo-doctor` introduces **no new transitive mismatch** (16/18; the 2 failures —
      custom Metro config + 5 Expo packages a patch behind SDK 54.0.35 — are pre-existing and
      unrelated to the overrides). Vitest: 35/35 pass. Lint: 33 errors are pre-existing
      (identical with changes stashed); this change adds none.
- [x] Local smoke against the running Supabase stack: `npx expo start` boots (Metro listens
      on the `ws@8` dev server) and `npx expo export` bundles all 3,372 modules to a Hermes
      bundle with no errors; `npm --prefix admin run build` completes all routes (postcss
      8.5.10). (Requires `admin/.env.local` — gitignored — pointed at local Supabase.)
- [ ] After merge to `main`, all 9 alerts move to **Fixed** automatically.

## Verification (run locally)

> Per project memory: the sandbox can't reliably run the DB/app — run these on the local
> machine. Always `npx`-prefix expo commands.

```bash
# --- Root ---
npm install
grep -rn "uuid" node_modules/xcode/lib node_modules/xcode/*.js   # uuid pre-flight
npm audit
git --no-pager diff package-lock.json | head -200                # confirm scoped churn only
npm ls ws uuid postcss brace-expansion @xmldom/xmldom
npx expo-doctor
npm run lint            # Biome + scripts/check-admin-bundle.sh
npx expo start          # smoke: dev server + ws@8 HMR

# --- Admin (separate package + lockfile) ---
npm --prefix admin install
npm --prefix admin audit
npm --prefix admin ls postcss
npm --prefix admin run build
```

Then commit **both** lockfiles to `main`.

## Dependencies & Risks

- **Dependabot auto-close:** once the patched versions leave the dependency graph on the
  **default branch**, Dependabot re-scans on push and moves alerts open → Fixed — no manual
  dismissal. Both lockfiles must land in the same merge. **Fallback:** if any alert is still
  open ~24h post-merge, manually re-trigger the Dependabot graph scan before assuming failure.
- **Silent pins:** overrides never warn when they go stale, and there is **no CI** in this
  repo to catch it. Re-audit after each Expo SDK patch and drop any override the tree has
  caught up to. (Follow-up, not this PR: a trivial `npm audit` GitHub Action.)

## PR strategy — single PR

All changes are lockfile + `package.json` with no source changes, so per-severity or
per-package PRs buy nothing. One PR; list all 9 GHSA IDs in the body so GitHub links and
auto-closes them. Branch: current `dar-es-salaam` → PR to `main`.

## References

- npm overrides + selector syntax (RFC 0036): https://github.com/npm/rfcs/blob/main/accepted/0036-overrides.md
- npm overrides docs: https://docs.npmjs.com/cli/v10/configuring-npm/package-json#overrides
- Dependabot alert lifecycle: https://docs.github.com/en/code-security/dependabot/dependabot-alerts/viewing-and-updating-dependabot-alerts
- uuid v8–v11 breaking changes: https://github.com/uuidjs/uuid/blob/main/CHANGELOG.md
- Lint gate: `package.json` `scripts.lint` → `biome check . && bash scripts/check-admin-bundle.sh`
