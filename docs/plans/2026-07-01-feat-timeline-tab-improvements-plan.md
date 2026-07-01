---
title: Timeline Tab Improvements — compact header, cover canon badges, rail scrubbing, film/TV anchors
type: feat
date: 2026-07-01
branch: feat/nav-redesign-sdk56
reviewed: 2026-07-01 (dhh, kieran-typescript, code-simplicity)
---

# ✨ Timeline Tab Improvements

Four related improvements to the Timeline tab: (1) make the large title more compact while
keeping it large, (2) **remove the canon filter** and instead badge each hero cover with its
Canon/Legends status, (3) let users scrub the rail to move quickly through the chronology, and
(4) render films and TV shows as small anchor indicators along the top of the rail for context.

> **Revised after review + product decision.** Item 2 changed from "swap pills for a native
> segmented control" to "remove the filter, badge the covers" — the Timeline is a chronological
> browse of the whole saga, so filtering fragments the sweep (that belongs to Archives/Search),
> and removing the filter row reclaims space and makes the books the hero. This also drops the
> `@expo/ui` dependency entirely. Correctness/simplicity feedback from review is folded in.

## Overview

The Timeline tab is a horizontal, snap-paged scroll through the catalog in chronological order —
one `HoloCover` hero per book — with a passive notch rail beneath that reflects the current date.
It lives on branch **`feat/nav-redesign-sdk56`** (not `main`, which still ships the old Archives list).

All four items pull in the same direction: reclaim vertical space so the book cover is the hero,
and make the rail an active navigation surface instead of a passive readout. With the filter row
gone, the layout is just **compact large title → hero pager → rail**. Items 3 and 4 both operate on
the rail's coordinate system, so the rail is refactored once (item 3) and reused (item 4).

## Current State (grounded)

- **Screen:** [`app/(tabs)/timeline/index.tsx`](app/(tabs)/timeline/index.tsx) — `FlashList` horizontal
  pager (`snapToInterval={width}`, `disableIntervalMomentum`), `HoloCover` hero per page,
  `onViewableItemsChanged` sets `activePage`; `activeGroup = data.pageToGroup[activePage]`. Body offset
  by `useHeaderHeight()`. Currently holds `canonFilter` state + `<FilterPills>` — **both removed** here.
- **Header:** [`app/(tabs)/timeline/_layout.tsx`](app/(tabs)/timeline/_layout.tsx) — native `Stack`,
  `headerLargeTitle: true`, `title: 'Timeline'`, `fontFamily` from `useFontPref()`.
- **Hero:** [`components/holo-cover.tsx`](components/holo-cover.tsx) — `HoloCover({ coverUri, title,
  author, width, height, variant })`; hero variant renders a `HoloFace` (which knows the cover-face
  geometry) inside a `StaticHero`/`TiltedHero`. **No `canon` prop today.**
- **Existing canon badge:** [`components/book-card.tsx`](components/book-card.tsx) renders an **inline**
  pill (`styles.badge` + `canonBadge`/`legendsBadge` using `tokens.badge.canon` `#1a3a5c` /
  `tokens.badge.legends` `#5c3a1a`, `badgeText` uppercase). Not yet a reusable component.
- **Rail:** [`components/timeline-rail.tsx`](components/timeline-rail.tsx) — index-spaced notches,
  **one notch per group** (`PITCH = 28`), active tick centered via `translateX`, active group's `label`
  shown below. **Passive** — no touch handling.
- **Data/grouping:** [`lib/timeline.ts`](lib/timeline.ts) — `groupBooksByYear()` → `{ books (one per
  page), groups (one per distinct date = one notch, strictly increasing in `order`), pageToGroup
  (monotonic non-decreasing) }`; each group carries a precomputed `label`. `eraLabel()` → `"25,793 BBY"`.
- **Data model:** catalog is **books-only**. `books.timeline_order: number | null`, `canon: string`
  (non-null), `title`. **No film/TV data exists.**
- **Available libs:** `react-native-reanimated@4.3.1`, `react-native-gesture-handler@2.31.1`,
  `expo-haptics@~56.0.3`, `@shopify/flash-list@2.0.2`, Expo SDK `^56`.
- **Strict mode** (CLAUDE.md): assume `noUncheckedIndexedAccess` (indexed access is `T | undefined`).

## Research Findings

### Native large title (item 1)
- `headerLargeTitleStyle` accepts **`fontFamily`, `fontSize`, `fontWeight`, `color`** — the native large
  title font can be shrunk **without a custom title**.
- There is **no native option** for large-title height/padding (UIKit-fixed). A large title only collapses
  when a **vertical** scrollable reaches the header edge; Timeline is a **horizontal** pager → never
  collapses, which is why it permanently occupies space.
- **Conclusion:** reduce `fontSize` (34 → ~28) for "large but compact"; reclaim is **bounded** (~15–25pt).
  Plain custom heading only as a fallback if measured reclaim is insufficient. `useHeaderHeight()` may not
  shrink with the font — verify the body offset on-device (that offset is the whole premise of item 1).

### Scrubbing + anchors (items 3 & 4)
- Reanimated 4 + gesture-handler 2 + expo-haptics are present — sufficient for a pan-scrub with
  per-crossing haptics and a Reanimated-driven rail translate.
- Coordinate helpers called from worklets **must be worklet-safe** (pure, or `'worklet'`); a plain imported
  fn invoked in a gesture/`useAnimatedStyle` throws **only on device** — matches the repo's Reanimated
  device-only-crash learning.
- Films/TV are a **bounded, slow-changing** set (~12 films + ~15 TV) → static curated module.

## Decisions (user-confirmed)

- **Item 1:** native compact large title via `headerLargeTitleStyle`; plain custom heading only as fallback.
- **Item 2:** **remove the canon filter**; badge each timeline hero with a **top-corner Canon/Legends
  overlay**, reusing an extracted `<CanonBadge>`. No `@expo/ui`.
- **Item 4:** **static curated module** (`lib/timeline-anchors.ts`), no DB; anchors are always-on context.

---

## Technical Approach

### Naming convention (adopt everywhere — highest-leverage correctness fix)

The rail is **group-spaced** (one notch per group); the pager is **page-spaced** (one page per book).
A group can span multiple pages. Never use a bare `activeIndex`:
- **`activeGroupIndex`** — index into `groups` / rail notches (drives `translateX`).
- **`activePageIndex`** — index into `books` / pager pages (drives `scrollToIndex`).
- Convert group→page via `groups[g].firstPage`; page→group via `pageToGroup[p]`.

### Phase 1 — Compact header + remove filter + cover canon badges (items 1 & 2)

Both reclaim vertical space; together they collapse the top of the screen to just the title.

**1a. Native compact large title** — [`app/(tabs)/timeline/_layout.tsx`](app/(tabs)/timeline/_layout.tsx)

```tsx
headerLargeTitleStyle: { fontFamily, fontSize: 28, fontWeight: '700' } // was ~34 default
```
- Tune `fontSize` 26–28 on-device; verify `useHeaderHeight()` offset responds and nothing clips.
- **Fallback (only if reclaim insufficient):** `headerLargeTitle: false` + a plain
  `<Text style={{ fontSize: 30, fontWeight: '700', fontFamily, paddingTop: 4, paddingBottom: 6, paddingHorizontal: 16 }}>Timeline</Text>`
  as the first body element. Decide on-device; don't pre-write both paths.

**2a. Remove the filter** — [`app/(tabs)/timeline/index.tsx`](app/(tabs)/timeline/index.tsx)
- Delete the `canonFilter` state, the `<FilterPills>` row, and the `styles.filters` view. `data` becomes
  `groupBooksByYear(books)` over **all** books. The timeline shows the full chronology.

**2b. Extract a reusable `<CanonBadge>`** — new [`components/ui/canon-badge.tsx`](components/ui/canon-badge.tsx)
- Lift the pill from `book-card.tsx` (badge container + `canonBadge`/`legendsBadge` colors + uppercase
  text) into `<CanonBadge canon={book.canon} />`. Refactor `book-card.tsx` to use it (no visual change) so
  there's one source of truth for the badge look.

**2c. Badge the hero (top-corner overlay)** — [`components/holo-cover.tsx`](components/holo-cover.tsx)
- Add an optional `canon?: string` prop to `HoloCover`. For the **hero** variant, render `<CanonBadge>`
  absolutely positioned in the **top corner of the `HoloFace`** (the face knows its own cover bounds, so
  the badge sits on the artwork corner and tilts/moves with the face). Thumb variant ignores it.
- Timeline passes `canon={item.canon}` in `renderItem`. Keep the badge small and high-contrast so it reads
  over cover art without dominating (books stay the hero).

### Phase 2 — Rail navigation (item 3)

Ship in two increments so the cheap win lands first and the scrub is de-risked:

**2a. Tap-a-notch to jump (first increment).** Tap `Gesture` on the rail: tapped screen-x →
`clampIndex(round(indexAtCenter(width, tapX)), groups.length)` → `scrollToIndex({ index: groups[g].firstPage })`.
No shared value, no scrub state, no feedback loop. Delivers "move quickly" immediately and validates the
coordinate math on-device.

**2b. Pan-scrub (the requested feature).** Continuous drag on top of 2a.

**Coordinate helpers** — [`lib/timeline.ts`](lib/timeline.ts) (pure, worklet-safe arithmetic):

```ts
export const RAIL_PITCH = 28;
export function groupCenterX(index: number) { 'worklet'; return index * RAIL_PITCH + RAIL_PITCH / 2; }
export function railTranslateX(width: number, groupIndex: number) { 'worklet'; return width / 2 - groupCenterX(groupIndex); }
export function indexAtCenter(width: number, translateX: number) { 'worklet'; return (width / 2 - translateX - RAIL_PITCH / 2) / RAIL_PITCH; }
export const clampIndex = (i: number, n: number) => Math.min(Math.max(i, 0), n - 1);
```
- **Fold `firstPageOfGroup` into `groupBooksByYear`:** add a `firstPage: number` field to each group
  (first page index for that group) instead of a separate parallel-array builder + prop.
- **Invariant to unit-test:** `indexAtCenter(w, railTranslateX(w, k)) === k` for **fractional** `k` (the
  `−PITCH/2` term is the easy off-by-half-pitch to break).

**Interactive rail** — [`components/timeline-rail.tsx`](components/timeline-rail.tsx)

- Drive rail `translateX` with **one** `useSharedValue`. Two modes:
  - **Paging mode:** when the pager reports a new `activeGroupIndex`, `withTiming` `translateX` to
    `railTranslateX(width, activeGroupIndex)`.
  - **Scrub mode:** on pan, `translateX = clamp(startX + e.translationX, minTx, maxTx)`; derive
    `g = clampIndex(round(indexAtCenter(width, translateX)), groups.length)` — **clamp the derived index**,
    not just `translateX`, or `scrollToIndex` throws at the extremes.
- **Coalesce side-effects on group-crossing:** hold `g` in a shared value; fire `Haptics.selectionAsync()`
  **and** `runOnJS(scrollToPage)(groups[g].firstPage)` only when `g` **changes** — one guard for both, so a
  fast multi-notch frame doesn't flood the JS thread.
- **`scrubbing` is a `useSharedValue<boolean>`** (written on the UI thread, read as `.value` in the JS
  `onViewableItemsChanged`). While true, the pager's viewability callback is ignored. **Clear it only after
  the settle scroll reconciles** — not synchronously on `onEnd` — because `scrollToIndex({animated:false})`
  emits its viewability event a frame or two later; clearing early lets that late callback yank position
  back (the jitter the flag prevents). Gate the clear on the pager reporting the expected index (or
  `onMomentumScrollEnd`/short tick).
- **`setActivePage` once, on release** — never per frame during a scrub. During a scrub the position
  source-of-truth is `translateX` (UI thread), not React state.
- **Label:** enlarge the **existing** `groups[g].label` while scrubbing (don't recompute `eraLabel`, no
  follow-the-finger callout).
- **Page alignment:** the pager uses `disableIntervalMomentum` + `snapToInterval`; assert it rests
  **exactly** page-aligned after a fast scrub (no half-page rest).

### Phase 3 — Film & TV anchors on the rail (item 4)

Small indicators along the **top** of the rail, riding the **same single `translateX`** (one transformed
container, static children — **not** a shared value per anchor). Always-on context (no filter to respect).

**3a. Curated data** — new [`lib/timeline-anchors.ts`](lib/timeline-anchors.ts)

```ts
export type MediaKind = 'film' | 'series';
export type TimelineAnchor = {
  title: string;
  kind: MediaKind;
  timeline_order: number;      // BBY negative, ABY positive — same axis as books
  canon: 'Canon' | 'Legends';  // required — used only for optional visual distinction, not filtering
};

export const TIMELINE_ANCHORS: TimelineAnchor[] = [
  { title: 'The Phantom Menace', kind: 'film', timeline_order: -32, canon: 'Canon' },
  { title: 'Revenge of the Sith', kind: 'film', timeline_order: -19, canon: 'Canon' },
  { title: 'A New Hope', kind: 'film', timeline_order: 0, canon: 'Canon' },
  // …~12 films + ~15 TV shows. Curation (hand-checked timeline_order) is the real work here.
];
```
- v1 stores a single representative `timeline_order` for ranged shows (Clone Wars, etc.); range bands are
  a **future** note.

**3b. Anchor positioning** — [`lib/timeline.ts`](lib/timeline.ts)

```ts
// Fractional GROUP index for an arbitrary order; index-spaced, lerped between bracketing groups.
export function fractionalIndexForOrder(order: number, groups: TimelineGroup[]): number {
  // Preconditions (assert): groups non-empty, strictly increasing in `order` (guaranteed by
  // groupBooksByYear → lerp is divide-by-zero-safe). length === 1 → 0. order <= groups[0].order → 0.
  // order >= last → length-1. else find bracketing i and lerp. Returned value is a GROUP index.
}
```
- Anchors are hidden when the timeline is empty, so this is never called with `[]` — guard it anyway.

**3c. Render anchors** — [`components/timeline-rail.tsx`](components/timeline-rail.tsx)
- One `Animated.View` sharing `translateX`; each anchor a static child at
  `groupCenterX(fractionalIndexForOrder(order, groups))`, rendered as a small `film`/`tv` glyph
  (`text.hint`, brightening near center) that doesn't obscure the active date label. Optionally tint by
  `canon` for a Canon/Legends visual cue.
- **Cut from v1 (future notes):** tap-to-jump on an anchor; clustering / "+N" glyph (accept slight overlap
  for ~27 anchors); range bands.

## Edge Cases & Flows

- **Empty timeline:** existing empty state; rail + anchors hidden.
- **Single group:** `translateX` centers it; scrub is a no-op; no haptic spam; anchor lerp short-circuits to 0.
- **Scrub past either end:** clamp `translateX` **and** the derived group index before lookup.
- **Rapid flick vs pager settle (UI race):** `scrubbing` shared value gates `onViewableItemsChanged`, cleared
  only after settle reconciles. Test fast back-and-forth flicks on a **physical device**.
- **Book with no `timeline_order`:** already excluded from `groupBooksByYear` (no place on the axis) — badge
  still renders on any book that IS shown, since `canon` is always present.
- **Anchor outside book date range:** clamp to first/last group index (never lerp off an edge array).
- **Badge over dark/busy cover art:** ensure the top-corner pill stays legible (existing badge colors are
  solid fills with uppercase text — sufficient contrast).
- **Long era labels ("25,793 BBY"):** keep `tabular-nums`; enlarged scrub label must not clip at large
  Dynamic Type.

## Acceptance Criteria

### Item 1 — Compact large title
- [ ] "Timeline" still reads as a large title but occupies measurably less vertical space.
- [ ] Native `headerLargeTitleStyle` used (no custom title) unless on-device reclaim is insufficient, in
      which case the plain-`<Text>` fallback is used and the reason noted in the PR.
- [ ] `useHeaderHeight()` offset verified on-device; hero not clipped.

### Item 2 — Remove filter + cover canon badges
- [ ] The canon filter row is gone; the Timeline shows all books chronologically.
- [ ] A `<CanonBadge>` is extracted and reused by `book-card.tsx` with no visual change there.
- [ ] Each timeline hero shows a Canon/Legends badge overlaid on the **top corner** of the cover face,
      moving/tilting with the face and legible over cover art.
- [ ] No `@expo/ui` dependency added.

### Item 3 — Rail navigation
- [ ] Tap-to-jump (2a) moves to the tapped notch's group.
- [ ] Pan-scrub (2b) moves through the timeline and drives the hero pager.
- [ ] Selection haptic + pager scroll fire once per **group crossing** (shared, coalesced guard).
- [ ] Active date label emphasized (enlarged existing label) during a scrub.
- [ ] On release: rail + pager snap to the same group, pager rests **exactly** page-aligned, no drift, no
      feedback-loop jitter (late-viewability race handled).
- [ ] Scrubbing past either end is clamped (translateX + derived index).

### Item 4 — Film/TV anchors
- [ ] Films/TV render as small top-of-rail indicators at chronologically correct (lerped) positions,
      tracking notches during paging and scrubbing via one shared `translateX`.
- [ ] Distinguishable by kind; don't obscure the active date label.

### Quality gates
- [ ] `npm run lint` clean (Biome).
- [ ] Vitest pure-fn tests with invariants: `indexAtCenter∘railTranslateX === identity` (fractional),
      `groups[*].firstPage` strictly increasing & length === groups.length,
      `fractionalIndexForOrder` empty/single/clamp/lerp cases.
- [ ] Verified on **iOS Simulator** (dev) **and** a **physical device** for gestures/haptics/worklets.

## Alternatives Considered

- **Keep a filter as a native `@expo/ui` segmented control (item 2):** rejected — filtering fragments the
  Timeline's chronological sweep (Archives/Search already filter), the native control loses the
  lightsaber-blue brand tint and needs a native rebuild/OTA-forfeit, and removing the filter reclaims a
  whole row. Cover badges give the canon signal inline without any of that.
- **Custom compact title first (item 1):** rejected as default (user wants native); kept as fallback.
- **`media` DB table (item 4):** rejected — ~25 slow-changing, non-user rows don't warrant a migration,
  RLS, types regen, and admin surface. Static module ships instantly and reviews trivially.
- **To-scale rail (item 4):** rejected — dates span millennia; index-spacing keeps notches usable; anchors
  lerp between neighbors for a sensible relative position.

## Dependencies & Risks

- **Native large-title reclaim is bounded**, and `useHeaderHeight()` may not shrink — verify on-device.
- **Scrub feedback loop + late-viewability race** — highest-risk piece; `scrubbing` shared value cleared
  after settle; device testing mandatory.
- **Worklet-safety of coordinate helpers** — mark `'worklet'`; a plain imported fn in a gesture throws
  **only on device** (repo Reanimated learning). Don't sign off from the simulator alone.
- **Badge extraction regression** — refactoring `book-card.tsx` onto `<CanonBadge>` must be visually
  identical; snapshot/visual check.
- **Physical iPhone can't reach the dev server** — develop on the **iOS Simulator**; for on-device
  gesture/haptic verification use a dev-client / TestFlight build, not Expo Go on device.
- **Anchor curation accuracy** — hand-curated `timeline_order`; keep the list small, sourced, reviewed.

## References

### Internal
- [`app/(tabs)/timeline/index.tsx`](app/(tabs)/timeline/index.tsx) — pager; remove filter state/row
- [`app/(tabs)/timeline/_layout.tsx`](app/(tabs)/timeline/_layout.tsx) — large-title header options
- [`components/holo-cover.tsx`](components/holo-cover.tsx) — add `canon` prop + corner badge on hero face
- [`components/book-card.tsx`](components/book-card.tsx) — source of the badge pill to extract
- [`components/timeline-rail.tsx`](components/timeline-rail.tsx) — rail coordinate math being refactored
- [`lib/timeline.ts`](lib/timeline.ts) — `groupBooksByYear` (+`firstPage`), `eraLabel`, new helpers
- [`constants/tokens.ts`](constants/tokens.ts) — `badge.canon`/`badge.legends`, color/spacing tokens

### External
- Native-stack header options (`headerLargeTitleStyle`) — https://reactnavigation.org/docs/native-stack-navigator/
- Large-title-covers-content pattern — https://github.com/software-mansion/react-native-screens/issues/2801
- `react-native-best-practices` skill (Reanimated/gesture perf)

## Notes

- All work targets **`feat/nav-redesign-sdk56`** (Timeline doesn't exist on `main` yet).
- Phasing: Phase 1 (title + filter removal + badges) is standalone; Phase 2a (tap-to-jump) ships the cheap
  navigation win and validates the coordinate math; Phase 2b (scrub) builds on it; Phase 3 (anchors) reuses
  Phase 2's `fractionalIndexForOrder` + shared `translateX`.
