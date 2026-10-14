---
title: Inline large title — local patch now, upstream so we can delete it
type: feat
date: 2026-10-14
branch: feat/timeline-improvements
status: patch shipped locally; upstream issues/PRs not yet filed
---

# Inline large title: local patch + upstream plan

## Goal

Timeline's large "Timeline" title sits **in the same row as the header's bar buttons**
(scan / profile) instead of on its own row below them — reclaiming a full row of
vertical space on a screen that never collapses its title (it's a horizontal pager).

## Findings

- **The UIKit API is not new in iOS 27.** It's `UINavigationItem.LargeTitleDisplayMode.inline`
  (`UINavigationItemLargeTitleDisplayModeInline`), available since **iOS 17**. Verified in
  the Xcode 27 SDK headers (`UIKit.framework/Headers/UINavigationItem.h`). Apple's note:
  *"If there is a back button present, this will revert to `Always`. Leading & center items
  will move to the overflow menu if present."* Timeline has neither, so it's unaffected.
- **iOS 27's only new navigation-item API** is `navigationBarMinimization`
  (`UIBarMinimization`) — the bar shrinking on scroll. Unrelated to inline titles.
- **react-native-screens can't express it.** Both header implementations hardcode the mode
  from the `largeTitle` boolean:
  - Stack v4 / legacy — `ios/RNSScreenStackHeaderConfig.mm`
    (`ios/legacy/RNSScreenStackHeaderConfig.mm` on `main`):
    `navitem.largeTitleDisplayMode = config.largeTitle ? …Always : …Never;`
  - Stack v5 — `ios/stack/screen/RNSStackScreenHeaderCoordinator.mm`:
    `navItem.largeTitleDisplayMode = _configDataProvider.largeTitleEnabled ? …Always : …Never;`
  - Checked against the latest releases as of 2026-10-14: **4.30.0** and **5.0.0-alpha.4**.
    Neither mentions it; iOS 27 work so far is header-minimization / `useHeaderHeight`.
- **Expo Router exposes nothing either.** SDK 58 `Stack.Title` has `large` / `largeStyle`
  only; the options API has `headerLargeTitle` / `headerLargeTitleStyle`. Expo Router vendors
  React Navigation's native stack (`build/react-navigation/native-stack`), which maps
  `headerLargeTitleEnabled → largeTitle` and has no display-mode option.

## What we shipped (local patch)

Applied with `patch-package` (devDependency, pinned `8.0.1`) via `"postinstall": "patch-package"`,
so `npm ci` — locally and on EAS — reapplies the patches.

| Patch | Change |
|---|---|
| `patches/react-native-screens+4.25.2.patch` | New `largeTitleInline` prop on `RNSScreenStackHeaderConfig`: codegen spec (`src/fabric/ScreenStackHeaderConfigNativeComponent.ts`), `.h` property, Fabric `updateProps`, and the apply step — `largeTitle && largeTitleInline` → `…Inline` on iOS 17+ (falls back to `Always`). TS types updated. |
| `patches/expo-router+56.2.11.patch` | New `headerLargeTitleInline` native-stack option (types) passed through `useHeaderConfigProps` as `largeTitleInline`. |

Usage — `app/(tabs)/timeline/_layout.tsx`:

```tsx
screenOptions={{ headerLargeTitle: true, headerLargeTitleInline: true, … }}
```

### Maintenance rules

- **Native change → native rebuild.** Changing these patches needs `pod install` (codegen
  regenerates the props struct) and a new dev-client / EAS build, not just a JS reload.
- **Every Expo SDK / react-native-screens bump:** `patch-package` keys patches by exact
  version (`+4.25.2`). If the version changes, `npm ci` fails loudly on the postinstall —
  re-apply the edits to the new version and regenerate the patch
  (`npx patch-package react-native-screens expo-router`), or delete the patches if upstream
  has shipped the feature.
- **Precompiled native modules skip source patches.** SDK 56 can link prebuilt
  xcframeworks (`EXPO_USE_PRECOMPILED_MODULES=1`), which would silently ignore our `.mm`
  edit. It's **off** for this project today (not set in `eas.json` / `app.json`; pod install
  logs `RNScreens: prebuilt xcframework unavailable; building from source`). If it's ever
  turned on, force `RNScreens` to build from source (the precompiled-modules
  `build_from_source` patterns) or the inline title quietly reverts to `Always`.

## Upstream plan (so we can delete the patch)

Order matters: screens first (it owns the native API), then React Navigation (option),
then Expo Router picks it up when it re-vendors React Navigation.

### 1. react-native-screens — issue + PR

API proposal: mirror UIKit instead of adding another boolean, and keep `largeTitle`
working for back-compat:

```ts
// ScreenStackHeaderConfigProps (v4) and the v5 Stack header config
largeTitleDisplayMode?: 'always' | 'inline'; // default 'always'; only read when largeTitle is true
```

- v4: `ios/legacy/RNSScreenStackHeaderConfig.mm` — map `'inline'` →
  `UINavigationItemLargeTitleDisplayModeInline` behind `@available(iOS 17.0, *)`.
- v5: `ios/stack/screen/RNSStackScreenHeaderCoordinator.mm` — same, from the config data
  provider.
- Codegen spec: `CT.WithDefault<'always' | 'inline', 'always'>`.
- Android: no-op (no equivalent); document as iOS-only.

**Draft issue** (react-native-screens):

> **Title:** iOS: support `UINavigationItem.LargeTitleDisplayMode.inline` (large title inline with bar buttons)
>
> **Description:** UIKit has had an `.inline` large-title display mode since iOS 17 — the
> large title renders in the navigation bar's own row, alongside the trailing bar button
> items, instead of on a separate row beneath them. It's what Apple's own apps use on
> screens whose content doesn't scroll vertically (so the large title would never collapse
> and permanently costs a row).
>
> Today both header implementations derive the mode from `largeTitle` only
> (`largeTitle ? Always : Never` in `RNSScreenStackHeaderConfig.mm` and
> `RNSStackScreenHeaderCoordinator.mm`), so there's no way to request `.inline`.
>
> **Proposal:** a `largeTitleDisplayMode?: 'always' | 'inline'` prop (default `'always'`,
> read only when `largeTitle` is true), mapped to `UINavigationItemLargeTitleDisplayModeInline`
> on iOS 17+ and falling back to `Always` below. We're running a ~20-line patch of exactly
> this (boolean flavor) via patch-package and are happy to open the PR.
>
> **Notes from UIKit's header:** with a back button present, `.inline` reverts to `Always`,
> and leading/center items move to the overflow menu — worth documenting.

### 2. React Navigation — native-stack option

Once screens ships the prop, add `headerLargeTitleDisplayMode?: 'always' | 'inline'` to
`NativeStackNavigationOptions` and pass it through in `useHeaderConfigProps`
(`largeTitleDisplayMode: headerLargeTitleDisplayMode`). Small PR to `react-navigation/react-navigation`.

### 3. Expo Router

Expo Router vendors React Navigation, so it gets the option on its next re-vendor. Optionally
propose a component-API surface: `<Stack.Title large="inline">` (today `large` is a boolean).

## Tasks

- [x] Patch react-native-screens + expo-router locally; `patch-package` + `postinstall`.
- [x] Verify a clean `npm ci` reapplies both patches.
- [x] Enable `headerLargeTitleInline` on Timeline.
- [x] Verify on the iPhone 17 Pro (iOS 26.4) simulator.
- [ ] Verify on a physical device.
- [ ] File the react-native-screens issue (draft above) and offer the PR.
- [ ] Follow-up PR to React Navigation once screens merges.
- [ ] When an Expo SDK ships both: switch `headerLargeTitleInline` to the official option,
      delete `patches/*`, and drop `patch-package` + the `postinstall` script if no other
      patches remain.
