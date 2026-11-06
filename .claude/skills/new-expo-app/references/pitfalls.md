# Expo native-build pitfalls (hard-won)

These came from real builds, mostly iOS. Each entry is "the trap" + "what to do."

## Floating pod versions — builds break with no code change

`ios/` (incl. `Podfile.lock`) is gitignored in CNG, so EAS regenerates the Podfile and runs
`pod install` fresh every build. **CocoaPods re-resolves pod versions each time** — an
upstream pod can republish and break a build you didn't touch.

- When an iOS build breaks "out of nowhere," suspect a floated transitive pod first.
- To pin a misbehaving native JS dep, prefer the JS version (`package.json`); for a pure
  transitive **CocoaPod**, you generally can't pin from JS — fix the symptom (e.g. modular
  headers below) or pin the parent package.

## CocoaPods modular-header error (Google / Firebase Swift pods)

Symptom during `pod install`:
> The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and `RecaptchaInterop`, which
> do not define modules.

Cause: a Swift pod (here from Google Sign-In) depends on non-modular pods, which can't be
imported into Swift as static libs. Fix: opt those transitive pods into **modular headers**
(module-map generation — **not** `use_frameworks!`, which is unsafe alongside Nitro). Use a
config plugin (next section). It's `:modular_headers => true` per pod, or `use_modular_headers!`
globally (heavier).

## `withDangerousMod` Podfile plugin pattern

CNG has no per-pod build-setting surface, so patch the generated Podfile in a config plugin.
Make it **idempotent** and **fail-loud** (never silently write a Podfile missing the patch):

```js
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const BLOCK = `
  # >>> my-pod-patch (managed by plugin)
  pod 'GoogleUtilities', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true
  # <<< my-pod-patch
`;

module.exports = function withMyPodPatch(config) {
  return withDangerousMod(config, ['ios', async (cfg) => {
    const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
    let contents = fs.readFileSync(podfile, 'utf8');
    if (contents.includes('my-pod-patch')) return cfg;              // idempotent
    const anchor = /\n(\s*)use_expo_modules!\n/;                    // insert in the target block
    if (!anchor.test(contents)) throw new Error('[my-pod-patch] anchor missing; update plugin.');
    contents = contents.replace(anchor, (m) => m + BLOCK);
    fs.writeFileSync(podfile, contents);
    return cfg;
  }]);
};
```

To set a Swift **build setting** on specific pods instead, anchor on `post_install do |installer|`
and inject an `installer.pods_project.targets.each` loop setting e.g.
`config.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'`. Register the plugin in
`app.json` `plugins: ["./plugins/withMyPodPatch.js"]`. Verify with a local `prebuild` +
`grep` of the generated Podfile before any cloud build.

## Native-library maturity vs the toolchain (the expensive one)

A native lib whose surface is far ahead of the stable Xcode/Swift toolchain can **crash the
Swift compiler** (`swift-frontend` SIGSEGV in optimizer/IRGen passes) on the EAS image — not
a fixable config error. Real case: `react-native-vision-camera` v5 (NitroModules, C++ interop)
crashed the compiler two different ways on Xcode 26 / Swift 6.2.1; `-Onone` cleared one crash
but not the IRGen one.

Lessons:
- **Pick native libs that match the toolchain's maturity.** Bleeding-edge native modules are
  a build-stability risk, not just an API choice.
- **Keep an engine-agnostic boundary** around the risky dependency (e.g. an `ocr.ts` that
  exposes `recognize(uri) → Result<…>` regardless of engine) so swapping it is a 1-3 file
  change, not a rewrite.
- **For still-capture OCR specifically:** prefer `expo-camera` (capture) + `expo-text-extractor`
  (Apple Vision on iOS, ML Kit on Android) — in-Expo-ecosystem, builds in the simulator, no
  Nitro/C++-interop toolchain roulette. Reach for VisionCamera only if you genuinely need live
  frame processing, and budget for toolchain risk.
- A newer EAS Xcode image (point release) sometimes fixes a compiler crash — worth one pinned
  attempt — but don't stack speculative workarounds; if 1-2 don't land, swap the dependency.

## `deploymentTarget` can be load-bearing

`expo-build-properties` `ios.deploymentTarget` isn't just a floor — it can change **pod
resolution** (e.g. a high target selects a newer GoogleMLKit that pulls a different
GoogleUtilities, avoiding a conflict). Changing it can break pod install. Treat it as a real
dependency input, not cosmetic.

## Dev build required once native modules exist (not Expo Go)

Any custom native module (auth SDKs, camera, etc.) means **Expo Go can't run the app** — it
only bundles Expo's own native code, so you'll get `RN<Module> could not be found`. Use
`npx expo run:ios` to build+install a dev client once, then `npx expo start` against it.
On a setup where a physical device can't reach the Metro dev server, use the **iOS simulator**.

## `npm overrides` for transitive vuln patches

For a transitive dependency CVE, pin the fixed version via `package.json` `overrides`:

```jsonc
"overrides": { "shell-quote": "1.8.4" }
```

Then `npm install` and confirm `npm audit` is clean. Overrides-only — avoid unrelated bumps.

## Testable boundaries

Keep native-coupled code (camera, OCR, filesystem) behind thin adapters so the **pure logic**
(matchers, reducers, formatting) is unit-testable under Vitest's `node` env without a device.
When you must test the adapter itself, mock the native module (`vi.mock('expo-…')` +
`vi.mock('react-native')` for `Platform`); use `vi.hoisted` so the mock is available to the
hoisted `vi.mock` factory.
