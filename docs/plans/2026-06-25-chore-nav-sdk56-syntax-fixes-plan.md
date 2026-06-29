---
title: SDK 56 syntax fixes for the rebased nav branch
type: chore
date: 2026-06-25
---

# ♻️ SDK 56 syntax fixes — `feat/nav-redesign-sdk56`

Branch `feat/nav-redesign-sdk56` is rebased onto SDK 56 (expo-router 56.2.11, RN 0.85.3).
The rebase deferred all source syntax fixes to this pass. Verified against the installed SDK 56
`node_modules` and the rebased tree: the surface is **3 source edits**. Nothing else uses removed
APIs — `absoluteFillObject` already resolved to `absoluteFill` via the rebase; `@react-navigation/native`
is already gone from `package.json` + lockfile; glass / reanimated / safe-area are API-compatible.

## Import-path decision

`DarkTheme` / `ThemeProvider` / `useIsFocused` are available from **both** `expo-router` (root, the
clean path) **and** `expo-router/react-navigation` (subpath, what the symbols' JSDoc treats as
older). This plan uses **`expo-router/react-navigation`** — the rebased tree already imports from
there (`components/barcode-scan-panel.tsx:3`, inherited from main), so this keeps one path across
the tree. *Follow-up (separate, tree-wide):* migrate every `expo-router/react-navigation` import to
the `expo-router` root export. Don't split paths piecemeal here.

## Changes

### 1. `app/(tabs)/_layout.tsx` — NativeTabs compound members
`expo-router/unstable-native-tabs` no longer exports `Icon`/`Label` (v56 exports only `NativeTabs` +
`NativeTabTrigger`; confirmed `NativeTabs.d.ts:19-24`).

```tsx
// before
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
//   <NativeTabs.Trigger name="archives"><Icon sf={...}/><Label>Archives</Label></NativeTabs.Trigger>

// after
import { NativeTabs } from "expo-router/unstable-native-tabs";
//   <NativeTabs.Trigger name="archives">
//     <NativeTabs.Trigger.Icon sf={...} />
//     <NativeTabs.Trigger.Label>Archives</NativeTabs.Trigger.Label>
//   </NativeTabs.Trigger>
```
Keep the existing icons (`pyramid`, `lines.measurement.horizontal`, `rectangle.stack`), the `sf`
default/selected variants, and `role="search"`. Fix the stale header comment that references
`androidSrc` (v56 Android icon props are `drawable` | `md` | `src`).

### 2. `app/_layout.tsx` — theme import source
```tsx
// before: import { DarkTheme, ThemeProvider } from "@react-navigation/native";
// after:  import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
```
(`DarkTheme.colors` is spread into the custom theme at `app/_layout.tsx:17-26`; the resolved
`DarkTheme` still has `.colors`, so this is safe.)

### 3. `app/scan.tsx` — `useIsFocused` import source
```tsx
// before: import { useIsFocused } from "@react-navigation/native";
// after:  import { useIsFocused } from "expo-router/react-navigation";
```

> Already correct (out of scope): `package.json`/lockfile (no `@react-navigation/native`),
> `app.json` splash/force-dark (`2506a64` was app.json-only, absorbed by the rebase), the three
> scan components (rebased to main's `absoluteFill` versions).

## Acceptance Criteria / Verification gates

- [ ] `git grep -n "@react-navigation/native" app components lib` → **0 hits**.
- [ ] `git grep -n "import { Icon, Label" "app/(tabs)/_layout.tsx"` → **0 hits**.
- [ ] `npm ci` (hygiene — use ci, never install; nothing to resync), then `npx tsc --noEmit` clean,
      `npm run lint` (Biome) clean, `npx vitest run` green.
- [ ] **User (sandbox can't build):** `npx expo run:ios` launches; all 4 tabs render with SF Symbol
      icons; **no `Element type is invalid` crash** — `tsc` can't catch a wrong NativeTabs child
      arrangement (children are loosely typed), so the simulator launch is the real gate; holo gyro
      tilt confirmed on a physical device.
- [ ] Do **not** push to origin.

## References

- Rebased branch: `feat/nav-redesign-sdk56` (on `main` @ `2506a64`)
- Integration plan: `docs/plans/2026-06-25-chore-integrate-nav-redesign-onto-sdk-56-plan.md`
- `NativeTabs.d.ts:19-24` (compound members) · `expo-router/build/exports.d.ts` (clean root exports) ·
  `components/barcode-scan-panel.tsx:3` (existing subpath usage) · main `app/(tabs)/scan.tsx:4`
- Native tabs: https://docs.expo.dev/router/advanced/native-tabs/
