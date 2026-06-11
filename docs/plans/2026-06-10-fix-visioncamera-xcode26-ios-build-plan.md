---
title: "fix: VisionCamera V5 iOS archive failure on Xcode 26 (shelf scanner)"
type: fix
date: 2026-06-10
---

# fix: VisionCamera V5 iOS archive failure on Xcode 26 🐛

> **✅ RESOLVED via Path B (2026-06-11).** After build #9 showed a *second* VisionCamera
> compiler crash (IRGen, even at `-Onone`) on Swift 6.2.1, we dropped VisionCamera
> entirely and swapped the OCR engine to **`expo-camera` + `expo-text-extractor`** (Apple
> Vision on iOS, ML Kit on Android). Kept all of PR #8's engine-agnostic logic
> (matcher/reducer/review/session + 158 tests) — only the 3 engine files changed
> (`lib/ocr.ts`, `hooks/useShelfScan.ts`, `components/shelf-scan-capture.tsx`). Removed
> the `react-native-vision-camera*` / `react-native-nitro-*` deps, the
> `withVisionCameraNoOptimizer` plugin, and the Xcode-26.1 image pins. Local gates green:
> tsc · biome · 158/158 vitest · prebuild · `pod install` (114 pods, no VisionCamera/Nitro).
> Pending: an EAS build to confirm the archive. The rest of the doc is the journey that
> led here.

## Overview

The shelf spine scanner (PR #8, `3c687b5`) can't produce an iOS build.
`react-native-vision-camera@5.0.11` (NitroModules "V5", via
`react-native-vision-camera-ocr-plus@2.0.0`) fails the EAS Release archive on
Xcode 26 (`SwiftCompile … 2 failures`, `Exit 65`). Xcode <26 is impossible because
VisionCamera 5.0.11 references **iOS 26 SDK-only AVFoundation symbols**, so the only
toolchain is Xcode 26 — where it currently fails.

There are two real ways forward, and the choice is a product decision, not a technical
one:

- **Path A — keep V5, fix the build.** Force the Nitro pods to Swift-5 language mode
  via a Podfile patch. Honors the "build once on the capable foundation" choice that
  drove the V5 adoption (future live-pan frame processor). Cost: a custom config
  plugin patching a generated Podfile, an unconfirmed diagnosis, and a ~20-min build
  loop on a toolchain that's actively fighting us.
- **Path B — drop V5, swap the OCR engine.** Replace VisionCamera with `expo-camera`
  (already a dep) + `expo-text-extractor` (Apple Vision on iOS, ML Kit on Android).
  Deletes the entire Nitro/Swift-6/Release-archive failure class instead of patching
  it, builds in the simulator, and is more accurate on iOS. Cost: abandons the V5
  frame-processor foundation for a future live-pan feature that has no code or timeline.

**v1 only does still-capture OCR.** `lib/ocr.ts:36` is a single, camera-agnostic call
(`PhotoRecognizer({ uri })`); the matcher/reducer/review layers consume `OcrFragment[]`
only. That boundary makes Path B a contained 3-file change — and is also why the heavy
V5 stack is currently buying nothing this build ships.

This plan replaces two reverted dead-end commits (an Xcode 26.1 pin; an Xcode 16.4 +
dropped-features attempt), now reset to the PR #8 baseline.

## Problem Statement

- **Xcode <26 impossible.** VisionCamera 5.0.11 references iOS-26-only AVFoundation
  symbols (`appleLog2`, `AVFileType.dcm`, `AVMetadataObject.ObjectType.dogHead/.catHead`,
  `proResRAW`, `nominalFocalLengthIn35mmFilm`, the deferred-start APIs, …) → ~25
  "has no member" errors on Xcode 16.4. Confirmed.
- **Xcode 26.0 (EAS SDK-54 default) and 26.1 (stable) both fail** the VisionCamera
  Swift compile/archive.
- **The spike's false GO.** Phase 0 ([2026-06-08 plan:278-303](2026-06-08-feat-visual-shelf-spine-scanner-plan.md))
  validated a **Debug iOS simulator** build. The production failure is a **Release,
  arm64, device archive** (`-O`, cxx-interop, Swift 6) — a code path the spike never
  exercised. Treat "spike validated v5" as validating the wrong build config.
- **The real `error:` line was never captured** (xcpretty truncates it). This is the
  central unknown the plan is gated on.

## Root Cause — CONFIRMED (Step 0 done, build #7 `bafddfd5`, Xcode 26.1)

The full Xcode log shows a **Swift compiler crash**, not a source/concurrency/linkage
error. While compiling the `VisionCamera` pod for Release with
**`-O -whole-module-optimization`**, `swift-frontend` **segfaults in the LLVM IR
`verify` pass**:

```
SwiftCompile … VisionCamera … swiftc -module-name VisionCamera -O -whole-module-optimization …
Command SwiftCompile failed with a nonzero exit code
Global is external, but doesn't have external or weak linkage!
ptr @90
Please submit a bug report (https://swift.org/contributing/#reporting-bugs) …
Stack dump:
0.  Running pass "verify" on module "…/VisionCamera.build/Objects-normal/arm64/Array+withoutDuplicates.o"
0  swift-frontend  llvm::sys::PrintStackTrace(…)   ← SIGSEGV
…
Rename failed: …/AVCaptureSession+addListener-*.o.tmp -> …/AVCaptureSession+addListener.o: No such file or directory
```

**Interpretation:**
- It is a **compiler codegen/optimizer crash** (`Global is external, but doesn't have
  external or weak linkage!` is an LLVM IR-verifier failure — swiftlang/swift bug class),
  triggered specifically by **whole-module optimization** in the Release archive.
- The many `Rename failed …o.tmp -> .o` lines are **downstream symptoms** (the object
  files were never produced because the compiler crashed) — not a build-system race.
- It is **NOT** Swift-6 strict concurrency (those appear only as *warnings* in the log),
  **NOT** a `could not build module` static-frameworks clash, and **NOT** fixed by
  `SWIFT_VERSION = 5.0` (my earlier hypothesis — wrong).
- **Only `VisionCamera` crashed** (single `Command SwiftCompile failed`). The
  `NitroImage` "Copy generated compatibility header" failure was a cascade.
- **Why the spike passed:** Debug simulator builds use `-Onone` — the crashing optimizer
  never runs. Release device archive uses `-O -whole-module-optimization`. Exactly the
  blind spot called out earlier.

**Fix:** stop running the crashing optimizer on the VisionCamera (and, pre-emptively,
Nitro) pods — set **`SWIFT_OPTIMIZATION_LEVEL = -Onone`** (highest confidence: no
optimizer ⇒ no optimizer crash) or, to keep optimization, **`SWIFT_COMPILATION_MODE =
singlefile`** (keeps `-O`, drops the whole-module IR that trips the verifier). A newer
toolchain (**Xcode 26.4**, where the maintainer archives clean — [nitro#1301](https://github.com/mrousavy/nitro/issues/1301))
may also dodge the compiler bug with zero code, but that's a gamble; the build-setting
override is deterministic. `5.0.11` is latest; **no version bump fixes this**, and never
add `useFrameworks: "static"` with Nitro.

## Update — 2026-06-11, build #9 `e78ad801` (preview): `-Onone` partial, deeper IRGen crash

Both new plugins worked. `pod install` completes (modular-headers fix), and VisionCamera +
all Nitro pods now compile at `-Onone` (confirmed in the log: `swiftc -module-name
VisionCamera -Onone …`; everything else still `-O`). **The optimizer "verify" crash is
gone.** But VisionCamera still crashes `swift-frontend` — a **separate crash in IRGen**,
emitting type metadata, which runs *even at `-Onone`*:

```
swiftc -module-name VisionCamera -Onone -whole-module-optimization …
Apple Swift version 6.2.1 … effective version 5.10
4  swift::irgen::IRGenModule::getAddrOfLLVMVariable(…)
5  swift::irgen::emitLazyTypeMetadata(swift::NominalTypeDecl*)
6  swift::irgen::IRGenerator::emitLazyDefinitions()
7  swift::performIRGeneration(…)
```

So `-Onone` alone is **insufficient** — VisionCamera V5 + Nitro hits a **Swift 6.2.1
compiler bug** (Xcode 26.1). Decisive signal: the maintainer archives the same stack
clean on **Swift 6.3.1 / Xcode 26.4** ([nitro#1301](https://github.com/mrousavy/nitro/issues/1301));
Xcode 26.4 (Swift 6.3) shipped 2026-03-24. VisionCamera's docs also list
`SWIFT_COMPILATION_MODE=singlefile` as a compiler-bug workaround.

### Revised recommendation (supersedes "Path A = `-Onone` alone")

1. **Bump the EAS image to Xcode 26.4 / Swift 6.3 — do this next.** One line in `eas.json`:
   `"image": "macos-tahoe-26.4-xcode-26.4"`. Highest-confidence fix (newer compiler,
   maintainer-confirmed clean). **Keep both plugins** — `-Onone` is harmless and
   `withGoogleModularHeaders` is still required for the Google pods regardless of toolchain.
2. **If 26.4 still crashes VisionCamera:** add `SWIFT_COMPILATION_MODE = singlefile` to the
   VisionCamera/Nitro pods in `withVisionCameraNoOptimizer.js` (disables whole-module,
   changing the IRGen metadata-emission path that's crashing — VisionCamera docs sanction
   this for compiler bugs).
3. **If both fail:** **Path B** (drop V5 → `expo-camera` + `expo-text-extractor` / Apple
   Vision). Two distinct VisionCamera compiler crashes on 26.1 means the foundation is
   fighting harder than it's worth for a still-capture scanner; cut it.

Attribution note: bumping to 26.4 moves the toolchain (the variable we'd held constant).
That's correct now — the plugin's effect (`-Onone` applied) is already confirmed in the
log, so the next variable to move is the compiler itself.

### Build #9 — crash attribution resolved + review synthesis (2026-06-11)

The log has **exactly one** `swift-frontend` crash; its frame-0 program args are
`-module-name VisionCamera … -Onone … -cxx-interoperability-mode=default`. So
**VisionCamera is the sole crasher** — the `Failed frontend command: ExpoSensors` line is
a reaped parallel job (no stack, only `WriteAuxiliaryFile` steps), not a second crash.
The crash is in VisionCamera's **C++-interop type-metadata emission** (Nitro), which stock
Expo Swift pods don't use — that's why only it crashes. Consequence: **Path B genuinely
removes the failure class**, and 26.4 is a legitimate keep-V5 attempt.

Plan-review (dhh / kieran / simplicity) consensus, adopted:
- **Stop calling toolchain moves "highest-confidence."** `-Onone` was predicted highest-
  confidence and was wrong; 26.4 is a *gamble* (one maintainer data point on different code),
  not a guarantee. Labelled as such throughout now.
- **The `singlefile` tier is cut.** Stacking a third speculative compiler workaround behind
  "if it still fails" is a slot machine. Decision is binary: 26.4 archives, or Path B.
- **Path B is the reviewer-favored default** — three distinct VisionCamera failures + two
  carried plugins for a still-capture scanner is the foundation not holding weight.
- **Recommended next action: hedge.** Fire **one** Xcode-26.4 EAS build (keep V5) *and, in
  parallel,* start the Path B swap on a branch (it builds in the simulator — seconds, not a
  20-min loop). Ship whichever lands first; if 26.4 fails, Path B is already underway and
  there are no further keep-V5 rungs.

## Key Facts / Constraints

- **CNG/prebuild project** — `ios/` is gitignored; the on-disk `Podfile.lock` is a stale
  pre-scanner artifact. Podfile changes must go through an **Expo config plugin**.
- **`expo-build-properties` `ios.deploymentTarget: "16.4"` is load-bearing** (ocr-plus
  needs ≥16.0 to select GoogleMLKit ≥8.0 vs the GoogleUtilities-8 conflict). **Keep 16.4.**
- `react-native-nitro-image@0.15.1` is a **separate top-level dep** (`package.json:62`) —
  any `start_with?('Nitro')` patch hits it too. Decide that deliberately.
- OCR is **still-capture only**; `lib/ocr.ts` is a swappable engine boundary.
- Pins to hold: `react-native-worklets@0.8.3` (0.9.x needs RN 0.83+), reanimated 4.1.x.
- Android build is **deferred / out of scope**.
- `expo-build-properties` has **no per-pod build-setting surface**, and `@config-plugins`
  ships no generic "set build setting on one pod" helper — so `withDangerousMod` is the
  standard mechanism for Path A (not an over-engineered choice, but confirmed necessary).

## Step 0 — Confirm the real error ✅ DONE

Captured from build #7 (`bafddfd5`, Xcode 26.1) raw Xcode logs — see **Root Cause**
above. Result: **`swift-frontend` optimizer crash compiling VisionCamera under
`-O -whole-module-optimization`**, not concurrency and not a linkage clash. This
**redirected the fix** away from the planned `SWIFT_VERSION = 5.0` (which would not have
helped) to disabling the crashing optimizer. The gate did its job — it saved a wasted
20-min build on the wrong patch.

## Path A — Keep VisionCamera V5 (disable the crashing optimizer) ✅ RECOMMENDED

Step 0 confirmed a **compiler optimizer crash**, and Path A now has a deterministic,
one-variable fix that keeps V5 **and** the iOS-26 `.icon`/glass. This is the route to take.

**A1 — the plugin is the ONLY new variable.** Add the config plugin below; pin `eas.json`
to **the same image that last failed (Xcode 26.1)** so a pass is attributable purely to
the plugin. Do **not** change `resourceClass`. Rebuild.

`plugins/withVisionCameraNoOptimizer.js`:
```js
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// swift-frontend SIGSEGVs in the LLVM IR "verify" pass when compiling the VisionCamera
// pod with -O -whole-module-optimization (Release archive), Xcode 26.x. Confirmed via
// build #7 bafddfd5 ("Global is external, but doesn't have external or weak linkage!").
// Disabling Swift optimization on the VisionCamera/Nitro pods sidesteps the crashing
// pass. -Onone is the highest-confidence fix (no optimizer ⇒ no optimizer crash); these
// are camera/bridge glue, so the runtime cost is negligible (heavy OCR is ML Kit C++,
// unaffected). Scope note: start_with?('Nitro') also covers react-native-nitro-image —
// intentional: identical -O -whole-module compile, pre-empts the same crash there.
const BLOCK = `
  # >>> vision-camera-no-optimizer (managed by withVisionCameraNoOptimizer.js)
  installer.pods_project.targets.each do |target|
    if target.name.start_with?('VisionCamera', 'Nitro')
      target.build_configurations.each do |config|
        config.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'
      end
    end
  end
  # <<< vision-camera-no-optimizer
`;

module.exports = function withVisionCameraNoOptimizer(config) {
  return withDangerousMod(config, ["ios", async (cfg) => {
    const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
    let contents = fs.readFileSync(podfile, "utf8");
    if (contents.includes("vision-camera-no-optimizer")) return cfg; // idempotent
    const anchor = /post_install do \|installer\|\n/;
    if (!anchor.test(contents)) {
      // Fail LOUD — never write a Podfile that silently lacks the patch.
      throw new Error("[withVisionCameraNoOptimizer] no `post_install do |installer|` anchor in Podfile; update the plugin.");
    }
    contents = contents.replace(anchor, (m) => m + BLOCK);
    if (!contents.includes("vision-camera-no-optimizer")) {
      throw new Error("[withVisionCameraNoOptimizer] injection failed; aborting.");
    }
    fs.writeFileSync(podfile, contents);
    return cfg;
  }]);
};
```
- Alternative that keeps optimization on: swap `SWIFT_OPTIMIZATION_LEVEL = -Onone` for
  `SWIFT_COMPILATION_MODE = singlefile` (keeps `-O`, drops the whole-module IR that trips
  the verifier). Try `-Onone` first — it's the most certain "make it ship" lever.

`app.json` plugins (keep deploymentTarget 16.4): add `"./plugins/withVisionCameraNoOptimizer.js"`.

`eas.json` `production.ios`: add `"image": "macos-sequoia-15.6-xcode-26.1"` (match last
failing build; resourceClass unchanged).

**A2 — only if A1 still fails: bump the toolchain.** Change *only* the image to the
newest stable toolchain the maintainer archives clean on:
`"image": "macos-tahoe-26.4-xcode-26.4"`. A newer `swift-frontend` may not carry the
optimizer crash at all. One variable. (Absorbs the old "Tier 2.") — Could also be tried
*before* A1 as a zero-code gamble, but A1 is deterministic, so prefer A1.

> The old "Tier 3 — VisionCamera v4" is **dropped**: it keeps the camera-library
> baggage *and* reintroduces the `worklets-core`/`worklets` Android collision the team
> already rejected — dominated by both Path A and Path B.

## Path B — Drop VisionCamera, swap to Apple Vision

Deletes the failure class. Contained by the `lib/ocr.ts` boundary.

- `lib/ocr.ts`: `PhotoRecognizer({uri})` → `extractTextFromImage(uri)` (returns `string[]`;
  map to `OcrFragment[]`). `react-native-vision-camera-ocr-plus` → `expo-text-extractor@2.0.0`.
- `components/shelf-scan-capture.tsx:15`: vision-camera `<Camera>` → expo-camera `<CameraView>`.
- `hooks/useShelfScan.ts:6,98-101`: `usePhotoOutput/usePreviewOutput` + `capturePhotoToFile`
  → expo-camera `takePictureAsync`.
- Remove `react-native-vision-camera*`, `react-native-nitro-*` deps.
- **Unchanged:** matcher, reducer, review, session, the `expo-build-properties`/camera-perm config.

Tradeoffs: abandons the live-pan frame-processor foundation ([[feedback_build_once_capable_foundation]]);
re-tune `SHELF_SCAN_CONSTANTS` (Apple Vision ≠ ML Kit accuracy); confirm `expo-text-extractor`
Android behavior before the deferred Android pass.

## The Decision — resolved ✅

Step 0 is done. The error is a **compiler optimizer crash**, which has a deterministic,
foundation-preserving fix → **take Path A** (A1: the `-Onone` plugin on the Xcode 26.1
image; A2: bump to Xcode 26.4 only if A1 fails).

The strategic question still stands but no longer forces a swap: the V5 fix is now a
single low-risk build setting, so keeping the frame-processor foundation costs little.
**Path B (Apple Vision) stays the fallback** — pursue it only if A1+A2 both fail, or if
you separately decide the V5 foundation isn't worth carrying for a not-yet-built feature.

## Acceptance Criteria

- [x] **Step 0 done:** error captured — `swift-frontend` optimizer crash compiling
      VisionCamera under `-O -whole-module-optimization` (build #7 `bafddfd5`). See Root Cause.
- [ ] EAS iOS Release build **archives** (no Exit 65) and reaches TestFlight.
- [ ] **Attribution recorded:** the passing build differs from build #7 by exactly the
      plugin (same Xcode 26.1 image, same resourceClass) — so the fix is provably the `-Onone` override.
- [ ] Path A only: iOS-26 `.icon` + glass preserved; `deploymentTarget 16.4` intact; no
      `useFrameworks: "static"`; no `resourceClass`/dep drift; local
      `xcodebuild -showBuildSettings -target VisionCamera | grep SWIFT_OPTIMIZATION_LEVEL` resolves to `-Onone`.
- [ ] Physical-iPhone round-trip: capture → OCR → match → add-to-owned (the path the spike skipped).
- [ ] Vitest (118/118), Biome, `tsc --strict` green.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Diagnosis wrong (rename race, not concurrency) | **Step 0 gate** disambiguates before any build |
| Multi-variable change → unattributable pass | A1 changes **only** the plugin, on the **same** failing image |
| Plugin silently no-ops on a changed Podfile shape | Plugin **throws** if anchor/marker missing; local `prebuild --no-install` + `xcodebuild -showBuildSettings` proves the setting resolves (not just text-present) |
| `start_with?('Nitro')` hits `nitro-image` | Acknowledged in-plugin; same family, intended |
| Each build ~20 min | One variable per build; Step 0 avoids a wasted build on the wrong fix |
| Rollback | **One branch per path** (squashable). Path A revert = delete plugin + 2 config lines. Path B is a multi-file swap — keep it isolated on its own branch |

## Verification Plan

1. **Step 0** (above) — gate.
2. Path A: `npx expo prebuild -p ios --clean` → `pod install` → confirm `-Onone` resolves
   on VisionCamera (`xcodebuild -showBuildSettings -target VisionCamera | grep
   SWIFT_OPTIMIZATION_LEVEL` → `-Onone`). For a toolchain bump, a local single-job Release
   compile (`xcodebuild … -configuration Release -sdk iphoneos -jobs 1`) can reproduce the
   VisionCamera compiler crash without a 20-min EAS archive — use it to confirm a fix before spending a build.
3. EAS build → successful archive → TestFlight / device install.
4. Physical iPhone: real shelf scan round-trip; tune `SHELF_SCAN_CONSTANTS` if needed.
5. Update this plan + spike plan with the real Release-archive outcome and the captured error.

## Learnings to Capture (post-fix)

- **Spike the real build config.** Debug-sim GO ≠ Release/arm64/EAS archive. Native-dep
  spikes must run an `eas build` (or device Release archive) before declaring GO.
- **At 20 min/build, attribution is the game** — change one variable; capture the real
  error before patching.
- VisionCamera V5 + Nitro on Xcode 26.1 / Swift 6.2.1 crashes `swift-frontend` in
  multiple passes (optimizer verify, then IRGen type-metadata) because of its C++ interop
  (`-cxx-interoperability-mode=default`); stock Swift Expo pods don't. `-Onone` clears only
  the optimizer crash. Never `useFrameworks: "static"` with Nitro.
- **A foundation that can't compile isn't a foundation.** The V5 stack was adopted for a
  live-pan feature with no code/timeline, yet has produced three distinct build failures and
  two carried Podfile plugins for a still-capture scanner that needs none of V5's power. The
  `lib/ocr.ts` boundary was built to make the engine swappable — if the toolchain bump
  doesn't land cleanly, use it. [[project_visioncamera_xcode26_conflict]], [[feedback_build_once_capable_foundation]].

## References

Internal: `lib/ocr.ts:2,36` · `hooks/useShelfScan.ts:6,98-101` ·
`components/shelf-scan-capture.tsx:15` · `app.json` (build-properties 16.4, expo-camera) ·
`eas.json` · `package.json` (`react-native-nitro-image:62`) ·
[2026-06-08 scanner plan:278-303](2026-06-08-feat-visual-shelf-spine-scanner-plan.md)

External (June 2026): VisionCamera #3743 https://github.com/mrousavy/react-native-vision-camera/issues/3743 ·
nitro #1301 https://github.com/mrousavy/nitro/issues/1301 ·
nitro #1282 https://github.com/mrousavy/nitro/issues/1282 ·
EAS images https://docs.expo.dev/build-reference/infrastructure/ ·
dangerous mods https://docs.expo.dev/config-plugins/dangerous-mods/ ·
ocr-plus https://github.com/jamenamcinteer/react-native-vision-camera-ocr-plus ·
expo-text-extractor https://github.com/pchalupa/expo-text-extractor

## Appendix — what changed after review (DHH / Kieran / simplicity)

- Step 0 promoted to a **blocking gate** with a truncation-defeating mechanism and a
  disconfirming branch (rename-race vs concurrency).
- Path A reduced to **one load-bearing variable** (plugin only, same failing image);
  dropped `resourceClass: large` (cargo-cult) and redundant `SWIFT_STRICT_CONCURRENCY`.
- Plugin **fails loud** (no silent no-op); real verification via `xcodebuild -showBuildSettings`.
- `start_with?('Nitro')` blast radius (incl. `nitro-image`) acknowledged.
- Collapsed 4 tiers → 2 paths; **deleted VisionCamera-v4** (dominated).
- Promoted the **Apple Vision swap** from "last resort" to a **co-equal path**, and made
  the V5-foundation-vs-ship-now tradeoff the explicit, user-owned decision.
