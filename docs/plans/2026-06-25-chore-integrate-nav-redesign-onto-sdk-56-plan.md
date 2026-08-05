---
title: Integrate nav-redesign-phase1 onto Expo SDK 56
type: chore
date: 2026-06-25
---

# ♻️ Integrate `feat/nav-redesign-phase1` onto Expo SDK 56

## Overview

`main` was upgraded SDK 54 → 56 (`1fac7aa`). The 18-commit nav-redesign branch was written
against SDK 54 / expo-router 6 and never rebuilt against the new toolchain. This plan merges
`main` in, resolves **4 conflicts**, applies **2 mandatory code/import fixes**, and re-verifies
statically — then hands the simulator build to the user (the sandbox can't build iOS).

Divergence is tiny: `main` is 2 commits ahead of merge-base `f0c3ae0`. All facts below are
verified against the already-installed SDK 56 `node_modules` and an actual **dry-run merge**.

## What actually has to change (verified)

Only two code edits are required for a green build; everything else is merge + verify.

1. **`app/(tabs)/_layout.tsx` — NativeTabs API.** `unstable-native-tabs` no longer exports
   `Icon`/`Label`; they're compound members. Confirmed `NativeTabs.d.ts:19-24`.
   ```tsx
   import { NativeTabs } from "expo-router/unstable-native-tabs";
   // <NativeTabs.Trigger name="archives">
   //   <NativeTabs.Trigger.Icon sf={{ default: "pyramid", selected: "pyramid.fill" }} />
   //   <NativeTabs.Trigger.Label>Archives</NativeTabs.Trigger.Label>
   // </NativeTabs.Trigger>   — sf={...} and role="search" are unchanged
   ```
2. **`app/_layout.tsx` — import source.** Branch imports `{ DarkTheme, ThemeProvider }` from
   `@react-navigation/native` (absent from SDK 56 `node_modules`). Main moved it to
   **`expo-router/react-navigation`**. The merge resolution of this file MUST take main's
   import line (keeping the branch's added `scan`/`profile`/`about` routes + AuthGate).

Verified **no change needed**: `lib/glass.tsx` (GlassView / isLiquidGlassAvailable unchanged),
`components/holo-cover.tsx` (`useAnimatedSensor` unchanged; no `babel.config.js` so
`babel-preset-expo` wires worklets), `react-native-safe-area-context` usages, and
`package.json`/`package-lock.json` (branch never touched them → merge takes main's SDK 56).

## Merge conflict map (authoritative — from dry-run merge)

`git merge main` produces **exactly 4 conflicts**. Everything else auto-merges — do **not**
hand-edit the auto-merged files; that would revert main's SDK-56 fixes (e.g. `absoluteFill`).

| File | Type | Resolution |
| --- | --- | --- |
| `app/(tabs)/_layout.tsx` | edit/edit | Keep branch's 4-tab structure + icon set; then apply the NativeTabs compound-member fix (change #1). |
| `app/_layout.tsx` | edit/edit | Keep branch's `scan`/`profile`/`about` routes + AuthGate; **take main's import line** (`expo-router/react-navigation`) and main's splash/force-dark edits (change #2). |
| `components/Book3D.tsx` | delete/modify | **Keep deleted** (`git rm`). |
| `components/Book3DViewer.tsx` | delete/modify | **Keep deleted** (`git rm`). |

Auto-merged (no action): `app.json`, `app/scan.tsx` (rename+main edit reconciled),
`components/barcode-scan-panel.tsx`, `components/shelf-scan-capture.tsx`,
`components/shelf-scan-review.tsx`, `package.json`, `package-lock.json`.

If the live merge surprises you (conflicts beyond these 4), `git merge --abort` and reassess
against this map rather than hand-reconciling unpredicted files.

## Phases

### Phase 1 — Merge `main`

- [ ] `git fetch origin` (tree is clean; the only untracked file is this plan). Confirm on `feat/nav-redesign-phase1`.
- [ ] `git merge main`; resolve the 4 conflicts per the map (incl. both code/import fixes inline).
- [ ] `git rm components/Book3D.tsx components/Book3DViewer.tsx`; complete the merge commit. Do **not** push.

### Phase 2 — Static verification (runs here)

- [ ] `npm ci` (**never** `npm install` — drifts expo, de-hoists expo-asset → iOS build error 65).
- [ ] `npx tsc --noEmit` — expect clean.
- [ ] **Guards (cheap, catch both blocker classes):** `git grep -n "@react-navigation/native" app components lib` → 0 hits; `git grep -n "absoluteFillObject" app components` → 0 hits.
- [ ] `npm run lint` (Biome) — editor-reformatted files (`login.tsx`, `_layout.tsx`, `card.tsx`) show pre-existing format diffs, not from this work.
- [ ] `npx vitest run` — lib tests stay green.

### Phase 3 — Device build + verification (user — sandbox can't build)

- [ ] `npx expo run:ios`. On build error 65: `git checkout package-lock.json && rm -rf node_modules && npm ci && npx pod-install`.
- [ ] **Must pass:** all 4 tabs render with SF Symbol icons; Search shows the `role="search"` affordance; each tab's large-title header + `headerRight` actions render; **no `Element type is invalid` crash** (`tsc` can't catch NativeTabs child-arrangement errors — the simulator is the real gate).
- [ ] **Physical-device smoke test** (not simulator): holo-cover gyro tilt still animates — the only New-Arch/Reanimated-4 worklet path, and it doesn't run on the simulator.
- [ ] Smoke-test existing nav flows (scan modal, profile sheet, About, book detail toolbar) — unchanged by this migration but quick to confirm.

## Acceptance Criteria

- [ ] `main` merged; Book3D files stay deleted; both import fixes applied.
- [ ] `package.json` = SDK 56; `node_modules` synced via `npm ci`; the two grep guards return 0.
- [ ] `tsc`, `lint`, `vitest` green; app builds and launches with all 4 tabs + headers, no invalid-element crash; gyro verified on device.

## Follow-ups (out of scope — separate plans)

- **Native Search bar** — SDK 56 now offers `headerSearchBarOptions` (baseline) and
  `Stack.Toolbar.SearchBarSlot` (iOS 26+ bottom). Replaces the custom, tab-bar-clipped search
  bar. Carries two open upstream bugs (expo#40048 back-nav, expo#42707 modal jump) → its own plan.
- **Dead dep cleanup** — `@react-navigation/native ^7.1.6` is declared in `package.json` but
  absent from `node_modules` (main's lock dropped it). Remove it; nothing must import it.

## Risks & Gotchas

- **`npm install` forbidden** → use `npm ci` (`memory/project_npm_ci_not_install.md`).
- **`Podfile.lock` is gitignored; pods re-resolve every build** — builds can break with no code
  change (`memory/project_ios_pods_float.md`).
- **Sandbox can't build/run** — static gates run here; `run:ios` + device checks are the user's
  (`memory/project_sandbox_db_app_unrunnable.md`).
- **`tsc` green ≠ done** for NativeTabs (loose child typing) and gyro (device-only) — Phase 3 is mandatory.

## References

- Existing nav plan: `docs/plans/2026-06-22-feat-nav-redesign-new-tabs-and-holo-detail-plan.md`
- Mandatory edits: `app/(tabs)/_layout.tsx:1`, `app/_layout.tsx:1`
- Verified-safe: `lib/glass.tsx`, `components/holo-cover.tsx`
- Native tabs: https://docs.expo.dev/router/advanced/native-tabs/ · Stack Toolbar: https://docs.expo.dev/router/advanced/stack-toolbar/
- SDK upgrade commit: `1fac7aa` · Branch tip: `438ad5d`
