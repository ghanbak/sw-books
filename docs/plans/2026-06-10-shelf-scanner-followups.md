# Shelf scanner — deferred follow-ups

Non-blocking findings from the high-effort code review of the visual shelf
scanner (PR for `visual-book-spine-scanner`). The two blocking items — barcode
lookup-throw handling and review-list memoization — were fixed in `ea0fb9e`.
These four are lower-severity (efficiency / robustness / cleanup) and were left
for a later pass. None hold up the feature.

## 1. `matchFragments` ranking is O(n²)–O(n³) over candidates

**File:** `lib/spine-match.ts` (the ranking loop, ~line 320)

Inside the per-candidate ranking loop, `related` is computed with a full
`scored.filter` whose predicate (`shareTitleToken`) itself scans title tokens,
and `supersets` filters again. This is superlinear in the number of post-floor
candidates.

- **Cost:** once per Finish (not per frame), on the JS thread while the user
  waits on the Processing spinner. Fine at ~30 books; grows with a dense shelf.
- **Fix:** after the sort, build a `titleToken → candidate indices` index once,
  then look up competitors per candidate in ~O(matches) instead of O(matches²).
  Keep the existing `isSubset`/superset semantics — only change how competitors
  are gathered.

## 2. `shelfScanReducer` has no exhaustiveness fallback

**File:** `lib/shelf-scan.ts` (the `switch (action.type)`, ~line 88)

The switch covers every `ShelfScanAction` and has no `default`/post-switch
return. TypeScript makes this unreachable today, but a future action added to
the union without a matching case — or any untyped/stray dispatch — returns
`undefined`, making `state` undefined and crashing every downstream
`state.phase` read.

- **Fix:** add `default: return state;` (fail-safe) or an `assertNever(action)`
  exhaustiveness guard so a missing case is a compile error rather than a
  runtime state-machine corruption.

## 3. Duplicated `Book3D` a11y wrapper and `OwnedBadge`

**File:** `components/shelf-scan-review.tsx` (3× and 2×)

The "Book3D wrapped in a `pointerEvents="none"` +
`accessibilityElementsHidden` + `importantForAccessibility="no-hide-descendants"`
View" pattern is copy-pasted verbatim in `ReviewRow`, `ReviewTile`, and
`SwapSheet`. The "owned" badge (`View` + `Text`) is duplicated in `ReviewRow`
and `SwapSheet`.

- **Cost:** cleanup only — any a11y-strategy or badge-style change must be
  applied in 3 / 2 places and re-duplicated by the next shelf component.
- **Fix:** extract `<AccessibleBook3D>` and `<OwnedBadge>` (alongside the
  existing `Book3D`).

## 4. Temp-file deletion correctness is spread across three mechanisms

**File:** `hooks/useShelfScan.ts`

Still-file cleanup relies on three independently-maintained things: the
`deletedUrisRef` double-delete guard, the `aliveRef` liveness token, and
per-continuation cleanup duplicated across `recognizeStill` / `capture` /
`reset` / the unmount sweep. Each new async path that touches a still must
remember to honor all three.

- **Cost:** altitude/maintenance — a future continuation (retry queue, upload
  preview) that forgets one check leaks files on unmount or double-deletes.
- **Fix:** fold file ownership into the capture record's status
  (`'pending' | 'retained' | 'deleted'`) so the invariant is reducer-checkable
  and unit-testable instead of distributed across refs.

---

_Captured 2026-06-10. Pick up opportunistically; #1 and #2 are the most
worthwhile (a real perf/robustness win each), #3 and #4 are pure cleanup._

---

## 5. ~~EAS image pin + optimizer plugin are scaffolding~~ — ✅ RESOLVED (Path B, 2026-06-11)

Moot: VisionCamera was dropped entirely (swapped to `expo-camera` + `expo-text-extractor`).
The `withVisionCameraNoOptimizer` plugin and all `ios.image` pins were removed. The
`withGoogleModularHeaders` plugin stays (it's for Google Sign-In auth, not the scanner).
Original note retained below for history.

### (historical) EAS image pin + optimizer plugin are scaffolding — revisit after first green build

**Files:** `eas.json` (all three `ios.image`), `plugins/withVisionCameraNoOptimizer.js`

The `macos-sequoia-15.6-xcode-26.1` pin + the `-Onone` config plugin are the fix for
the VisionCamera Xcode-26 archive crash (see
`2026-06-10-fix-visioncamera-xcode26-ios-build-plan.md`). The pin is deliberately the
**same image as the last failing build (#7)** so a green build is provably attributable
to the plugin, not the toolchain.

Once a build is confirmed green:
- Decide whether to keep 26.1, move to a newer stable (e.g. `xcode-26.4`), or drop the
  pin and track the SDK-54 default. The plugin is the real fix; the pin is scaffolding.
- Retire the plugin entirely once `react-native-vision-camera` ships a fix for the
  Xcode-26 whole-module-optimization compiler crash (track mrousavy/react-native-vision-camera#3743).

_Added 2026-06-11._
