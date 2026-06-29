---
title: Fix iOS large-title headers collapsing on scroll
type: fix
date: 2026-06-29
---

# 🐛 Fix iOS large-title headers not collapsing on scroll

## Overview

The iOS large titles on the tab screens (Archives, Library, Search) stopped collapsing on scroll.
The fix restores the native scroll pattern Expo requires and, because **FlashList v2 doesn't reliably
participate in native large-title collapse**, moves those lists to RN `FlatList` (the custom `BookCard`
rows render unchanged). Search also moves its input from the Figma's **bottom bar to the native iOS
header search bar** — a deliberate UX change (confirmed) that's required for the results list to be the
screen's first child, and which fixes the earlier tab-bar clipping for free.

## Root cause (verified)

The iOS large title collapses only when the scrollable is the screen's **direct first child** AND has
`contentInsetAdjustmentBehavior="automatic"`
([Expo docs](https://docs.expo.dev/router/advanced/stack/#large-title-does-not-collapse-when-scrolling)).
Commit **`f9e6143`** ("uniform useSafeAreaInsets baseline") broke both: it removed
`contentInsetAdjustmentBehavior` and wrapped each scrollable in a manual-padding `<View>` /
`KeyboardAvoidingView`. That undid the exact mitigation the 2026-06-22 nav plan prescribed (expo#40717).
Separately, **FlashList v2 (2.0.2)** has no documented support for `contentInsetAdjustmentBehavior` or
native collapse and is corroborated-broken for header folding — so swap it out, don't fight it.

## Scope

| Screen | State | Action |
|---|---|---|
| **Archives** | vertical FlashList, wrapper, no inset behavior | Fix: FlatList + first child + inset |
| **Library** | same | Fix: same |
| **Search** | results FlashList + bottom search bar in KeyboardAvoidingView | Fix: native header search + FlatList first child |
| **About** | ScrollView, **small title** (no `headerLargeTitle`) | Just restore inset (not a collapse bug) |
| **Timeline** | horizontal pager, `headerLargeTitle:true` | None — can't collapse (no vertical scroll); leave the static large title |
| **Book detail** | already has the inset, `headerLargeTitle:false` | None |

## Decision: FlatList, not FlashList

Use RN `FlatList` on the three large-title list screens — the component Expo documents and supports,
guaranteed native collapse, zero native code, `BookCard`/`FilterPills` unchanged. The catalog is bounded
(hundreds of rows), so FlatList's virtualization is plenty. **No `getItemLayout`** — `BookCard` is
variable height (2-line title + variable data rows), so it's the wrong tool here. (Bench-only fallback,
not recommended: FlashList + `overrideProps={{ contentInsetAdjustmentBehavior: "automatic" }}`, verified
on device.)

## Per-screen changes

### Archives & Library — `app/(tabs)/{archives,library}/index.tsx`
- Swap `FlashList` → `FlatList`. (Props used — `data/renderItem/keyExtractor/refreshing/onRefresh/
  ListHeaderComponent`, plus Library's `extraData/ListEmptyComponent` — are all native FlatList props.)
- Make the list the screen's **direct first child**: delete the `<View style={{paddingTop…paddingBottom}}>`
  wrapper and the now-dead `useSafeAreaInsets` import/call. Add `contentInsetAdjustmentBehavior="automatic"`
  (natively insets for the header + tab bar; manual insets go away).
- Keep `FilterPills` in `ListHeaderComponent`.
- **Render the list immediately** — don't early-return a placeholder `<View>` for loading (a scroll view
  that mounts after a placeholder stalls collapse, rn-screens#2871). Archives' loading spinner + error
  early-returns should become `refreshing` + `ListEmptyComponent` states on an always-mounted list.
  Library's full-screen "collection awaits" CTA may stay an early return (nothing to scroll there).

### Search — `app/(tabs)/search/index.tsx`
- Add a `<Stack.Screen options={{ headerSearchBarOptions: {...} }} />` **inside `index.tsx`** (the screen
  has none today; the only `<Stack.Screen>` is in `_layout.tsx`). Setting it from the screen keeps the
  `query` state in the screen — the right call. Wire `onChangeText: (e) => setQuery(e.nativeEvent.text)`
  — **it's a native event, not a string** (add a code comment so nobody "fixes" it to `(text) => …`).
- Make the results **`FlatList` the first child** with `contentInsetAdjustmentBehavior="automatic"`.
  Delete the custom `searchBarRow`/`inputWrap`/clear button and the `KeyboardAvoidingView`.
- Render the FlatList always (empty `data` when no query); show the hint / no-match copy via
  `ListEmptyComponent`, not a swapped-in centered `<View>` (rn-screens#2871).
- Search's header has no funnel today (scan + profile only) — nothing to reconcile.

### About — `app/about.tsx`
Small title, so no collapse work: restore `contentInsetAdjustmentBehavior="automatic"` on the `ScrollView`
and drop the manual `paddingTop` from `contentContainerStyle`.

### Reconcile with the uniform-inset baseline
This reverts `f9e6143` **only on the three scroll screens** — `contentInsetAdjustmentBehavior` is the
native inset source there. The untouched screens (login, profile sheet, scan, book-detail toolbar) keep
their `useSafeAreaInsets` padding.

## Acceptance Criteria

- [ ] Archives, Library, Search large titles **collapse on scroll-up and re-expand at the top** (verify
      with populated lists — empty state has nothing to scroll, so test that separately).
- [ ] Content sits correctly below the header and above the tab bar with **no manual `insets`** on these
      three screens; no double-inset gap; no dead `useSafeAreaInsets` import.
- [ ] FilterPills still render and scroll with the list (Archives/Library).
- [ ] Search uses the native header search field; typing filters live; bottom bar + `KeyboardAvoidingView`
      removed; tab-bar clipping gone.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npx vitest run` green.
- [ ] **Device build (user — sandbox can't build):** collapse works inside NativeTabs, search back-nav is
      fine on iOS 26, no async-mount stall. If the **bottom** inset regresses under the floating tab bar,
      the fix is `contentContainerStyle={{ paddingBottom: <tabBarHeight> }}` — **not** re-adding
      `insets.bottom` (that was the original bug). [expo#42502](https://github.com/expo/expo/issues/42502) ·
      [expo#40048](https://github.com/expo/expo/issues/40048) ·
      [rn-screens#2871](https://github.com/software-mansion/react-native-screens/issues/2871)

## Alternatives Considered

- **FlashList + `overrideProps`** — undocumented, evidence says it won't fold reliably. Bench only.
- **`@expo/ui` native `List`** — rows want SwiftUI-native content; hosting `BookCard` via `RNHostView`
  negates recycling and forces a SwiftUI rewrite, for a collapse `FlatList` gives free. Rejected (and it
  isn't installed). Reserve for native settings/menu/sheet surfaces, not these custom lists.

## References

- Regression: `f9e6143` · prior mitigation: `docs/plans/2026-06-22-...-plan.md` (lines 59-61, 265-266)
- Files: `app/(tabs)/{archives,library,search}/index.tsx`, `app/(tabs)/search/_layout.tsx`, `app/about.tsx`
- Expo Stack docs (collapse + `headerSearchBarOptions`): https://docs.expo.dev/router/advanced/stack/
- FlashList won't collapse: https://github.com/PedroBern/react-native-collapsible-tab-view/issues/400
