---
title: Native-first migration — expo-router primitives + @expo/ui
type: refactor
date: 2026-06-29
---

# ♻️ Native-first migration: expo-router native primitives + `@expo/ui`

## Overview

Move OssusArchives off vanilla React Native UI toward **native** rendering: expo-router's native
navigation primitives and `@expo/ui` (real SwiftUI on iOS). The trigger is the large-title-collapse
regression, but the direction is broader — replace hand-rolled RN controls/forms/menus with native
ones where they genuinely fit. Done as **independent, shippable phases**, each device-verified, not a
big-bang rewrite (`@expo/ui` is pre-1.0 and changes between SDKs).

## Guiding principle — native where it fits, not everywhere

"Native-first" means the *right* native tool per surface — not forcing `@expo/ui` onto everything.

| Goes native | Tool | Why |
|---|---|---|
| Data lists (Archives, Library, Search, Timeline) | **RN `FlatList`** | `@expo/ui` `List` is documented **"not suitable for large lists"** (each `ListItem` is JS-thread work). FlatList *is* the correct native list for a bounded catalog and gives native large-title collapse for free. |
| Nav, search, modals, tabs, header toolbar | **expo-router native** (`NativeTabs`, native Stack, `headerSearchBarOptions`, `Stack.Toolbar`, `formSheet`/`fullScreenModal`) | First-party, already partly adopted. |
| Settings/forms, switches, pickers, menus, sheets | **`@expo/ui`** universal (`List`/`ListItem`, `Switch`, `Picker`, `BottomSheet`, `FieldGroup`, `Button`) | Small, native-feel surfaces — exactly what `@expo/ui` is for. |
| **Stays custom RN** | HoloCover, glass buttons, skeuomorphic BookCard/Card, projector/gyro | Bespoke visual identity + Reanimated/Skia/glass-effect; `@expo/ui` can't express these and shouldn't. |

> The honest boundary: the catalog lists stay `FlatList`. That's the native-correct choice, not RN
> clinging — Expo's own docs rule `@expo/ui` `List` out for large data.

## Phases

### Phase 1 — Large-title collapse fix (ship first) ⭐
The urgent regression. Per `docs/plans/2026-06-29-fix-large-title-collapse-on-scroll-plan.md`:
- Archives/Library/Search: `FlashList` → **`FlatList`** as the screen's direct first child +
  `contentInsetAdjustmentBehavior="automatic"`; drop the manual-inset wrappers + dead `useSafeAreaInsets`.
- Search: adopt **`headerSearchBarOptions`** (native header search, set from the screen's own
  `<Stack.Screen>`); delete the custom bottom bar + `KeyboardAvoidingView`.
- About: restore the inset.
- Render lists immediately (no placeholder early-return) to avoid the collapse stall (rn-screens#2871).
This phase uses **zero `@expo/ui`** by design — and is independently shippable.

### Phase 2 — Lean further into expo-router native primitives
- **Book-detail bottom toolbar → `Stack.Toolbar`** (`placement="bottom"`): replace the custom
  `components/book-detail-toolbar.tsx` (Add to library / Wishlist / Read) with native toolbar buttons.
  iOS 26; gate behind a version check with the current toolbar as fallback.
- **Sort menu:** the funnel currently opens `ActionSheetIOS` (already native) — optionally upgrade to a
  native pull-down menu in the header. Low priority (it's already native); revisit after Phase 3 lands
  `@expo/ui`'s menu/`Picker`.
- Keep `NativeTabs` + native `formSheet`/`fullScreenModal` (already in place).

### Phase 3 — `@expo/ui` for controls, forms & menus
`npx expo install @expo/ui` (works in Expo Go on SDK 56). Migrate the small native-feel surfaces;
**verify each component's API against the installed `.d.ts`** (it's SDK-versioned). Wrap every tree in `Host`.
- **Profile/Account sheet → the showcase:** rebuild the settings rows with `@expo/ui` `List`/`ListItem`
  + native `Switch` (Aurebesh) + `FieldGroup`; account row + About row + Logout as native rows. Small
  list → `@expo/ui` `List` *is* appropriate here. Native `BottomSheet` is an option vs the current
  `formSheet` route.
- **Scan mode switcher → native `Picker`** (segmented) replacing `components/scan-mode-switcher.tsx`.
- **Filter pills → native `Picker` (segmented control)?** Design call — a segmented control is more
  native but changes the pill look; decide per Figma before doing it. Low priority.
- **Buttons:** login / CTA `Pressable`s → `@expo/ui` `Button` where it matches the design.
- Note: `@expo/ui` `TextInput` binds to `useNativeState` (not a string) — only adopt it where synchronous
  native input matters; the Search field is the native *header* bar (Phase 1), not an `@expo/ui` TextInput.

### Phase 4 — Platform-specific SwiftUI (only if universal falls short)
Drop to `@expo/ui/swift-ui` (`.ios.tsx`) only for a component/modifier the universal layer lacks.
Default: avoid — it doubles the tree. No planned work; reserved.

## What explicitly does NOT migrate
- The data lists (FlatList, per the boundary above).
- HoloCover, GlassIconButton, Card/Notch, BookCard visuals, projector/gyro — custom RN by design.

## Acceptance & staging
- [ ] Each phase lands, builds, and is **device-verified** independently before the next starts.
- [ ] Phase 1 fixes collapse (its plan's criteria) with no `@expo/ui` dependency.
- [ ] After Phase 3: Profile renders as native rows; Aurebesh toggle is a native `Switch`; scan switcher
      is a native `Picker`; data lists unchanged (still FlatList).
- [ ] `npx tsc --noEmit`, `npm run lint`, `npx vitest run` green at every phase. Builds are the user's
      (sandbox can't run `expo run:ios`); each native surface verified on a dev build / Expo Go.

## Risks
- **`@expo/ui` is pre-1.0** — API churn between SDKs; pin to the SDK-matched version and verify against
  the installed `.d.ts`. Keep RN fallbacks until a surface is device-verified.
- **Per-surface device testing is mandatory** — native components can render differently than the
  simulator/Expo Go suggests; never ship a migrated surface unverified.
- **Design drift** — segmented controls ≠ pills, native rows ≠ the custom Card look; confirm against
  Figma before swapping any surface where the look changes.
- **Scope** — this is a roadmap; phases are opt-in. Phase 1 is the only one that's urgent.
- `npm ci` not `npm install`; `@expo/ui` may need a config-plugin/rebuild on a dev client for some
  components (Expo Go covers most on SDK 56) — confirm per component.

## References
- Phase 1 detail: `docs/plans/2026-06-29-fix-large-title-collapse-on-scroll-plan.md`
- `@expo/ui` universal components + "List not suitable for large lists": https://docs.expo.dev/versions/latest/sdk/ui/
- expo-router Stack (`headerSearchBarOptions`, `Stack.Toolbar`): https://docs.expo.dev/router/advanced/stack/
- Candidate surfaces: `app/profile.tsx` (Switch/rows), `components/scan-mode-switcher.tsx`, `components/book-detail-toolbar.tsx`, `hooks/useCatalogSort.ts` (ActionSheetIOS)
