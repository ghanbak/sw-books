---
title: "feat: WebGPU + three.js hologram covers (Timeline shared stage + book detail hero)"
type: feat
date: 2026-10-15
branch: claude/cover-art-hologram-3d-676408
research: docs/brainstorms/2026-10-14-holo-cover-gpu-upgrade-research.md
supersedes: docs/plans/2026-05-01-feat-3d-book-covers-real-mesh-renderer-plan.md (deferred mesh plan; its gap list is folded in below)
reviewed: 2026-10-15 (architecture-strategist, performance-oracle, code-simplicity, kieran-typescript) — feedback folded in
status: draft — revised after review; tap-to-open added 2026-10-15; release strategy = dark carrier build + OTA (2026-10-22)
---

# ✨ WebGPU + three.js Hologram Covers

Replace the 2D `HoloCover` **hero** on the Timeline tab and the book detail screen with a real-time 3D
hologram, rendered by three.js (`three/webgpu`, TSL node materials) on `react-native-webgpu` (Metal on iOS). It has:
- a projector emitter and a volumetric light cone
- the cover projected onto a floating card, with scanlines, flicker and a fresnel rim
- real bloom

List thumbnails don't change.

## Review changes (2026-10-15)

| Area | Change | From |
|---|---|---|
| Fallback | Error boundaries miss async init, frame-loop and `device.lost` failures. Replaced `HoloFallback.tsx` with a **status store** (`useHolo3DStatus()`) that stages report into. Cells and the detail screen branch on it. The fallback is static `HoloFace`, not the old projector hero. | arch, TS, simplicity |
| Dead code | Delete `Projector` / `StaticHero` / `TiltedHero` and the `variant`/`tilt` props **when each hero site migrates**, not a release later. | simplicity, arch |
| Scope cuts | No device-loss retry (loss → unavailable for the session). No gyro tilt in v1 (moved to Stretch). No animated crossfade (swap after the first frame is on screen). Chromatic fringe moved after the look is approved. | simplicity |
| Kill-switch | A build-time env switch (`EXPO_PUBLIC_HOLO_3D=0`), used to test the fallback path. *Update 2026-10-22:* `EXPO_PUBLIC_*` values are inlined into the JS bundle, and `expo-updates` has now landed, so an EAS Update built with `EXPO_PUBLIC_HOLO_3D=0` **does** act as a field kill-switch for binaries that already have the 3D build. | arch, TS |
| Modules | 11 files → 6. One stage component for both surfaces. Imperative controller, so the React Compiler can't hand the frame loop stale values. Runtime modules in `lib/`, kebab-case names. Lazy-loaded so three isn't evaluated at app start. | simplicity, arch, TS |
| Textures | Cache **encoded bytes**, not decoded bitmaps. Each stage owns its GPU textures for its window only, so nothing is shared to evict. **Mandatory downscale** to ≤640×960. Upload ahead of time with `renderer.initTexture()` while idle, never mid-swipe. | perf, arch, TS |
| Pausing | `setAnimationLoop(null)` leaves three's internal tick running. Pause means no render/present, driven imperatively by `useFocusEffect` + `AppState`. **Dispose after 30 s blurred**, re-init on focus. | perf, arch |
| Scroll sync | The "shared clock" claim was wrong. Scroll offset now comes from a Reanimated scroll handler (UI thread) into a SharedValue that the loop reads. New spike gate **G7** measures overlay↔card drift. | perf, arch |
| Resolution | Pixel ratio capped (≤2; 1.5 on Timeline). Canvas sized to the card + beam band. `antialias: false`. Bloom at reduced scale. Flicker computed on the CPU. | perf |
| Warm-up | `compileAsync` before the first frame. G2 split into segments. Cold/warm defined. | perf |
| Measurement | Gates run on a **Release** device build (spike screen behind an env flag, not `__DEV__`), with Instruments. G3 budget is 8.3 ms at 120 Hz, including `present()`. | perf |
| Deps | `react-native-webgpu@0.15.1` (now latest). Exact pins via `-- --save-exact`. Correct `--save-dev` syntax. `three/webgpu`-only imports enforced by Biome. `.js` addon paths. No `@webgpu/types`. | TS |
| Phases | 6 → 4. Hardening folded into each phase's exit criteria. | simplicity |
| Release (2026-10-22) | The feature ships **OTA**. Only the native module rides one dark carrier build (1.4.0), proven by the full spike before submission. Phases 1–3 are EAS Updates gated by `eas fingerprint:compare`. See Release Strategy. | user |
| Navigation fact | **Timeline pages weren't tappable.** Detail was only reachable from `book-card.tsx` (Archives/Library/Search) and the barcode scanner. **Resolved:** tap-to-open added in Phase 2, so Timeline → detail becomes the main two-renderer flow. | arch, user |

**Considered and not adopted:**
- a `GPUDeviceProvider` at the root (blocks rendering of the whole app tree)
- texture refcounting (made unnecessary by per-stage textures)
- a separate `params.ts` (`THREE.Color` already does sRGB→linear)
- worklets Bundle Mode up front (stays a stretch escape hatch)

## Decisions (user-confirmed 2026-10-14)

- **Stack:** `react-native-webgpu` + three.js WebGPURenderer/TSL. The research doc has the comparison.
- **Scope**, split by the existing `HoloCover` `variant` prop:

  | Surface | Today | After |
  |---|---|---|
  | Timeline (`app/(tabs)/timeline/index.tsx`) | `variant="hero"` | **3D stage** |
  | Book detail (`app/book/[id].tsx`) | `variant="hero"` | **3D hero** |
  | Archive/Library rows, added-books sheet, scan review | `variant="thumb"` | **Unchanged** |

- **Timeline:** one shared canvas behind the pager, not one per page.
- **Shared GPU device.** A blurred Timeline pauses.
- **Shared-element transitions:** RN view → GPU canvas isn't possible. Any future transition targets `HoloFace`.
- **Platform:** 3D is **iOS-only**. Android and web report `unavailable` and render `HoloFace`.
- **Tap-to-open (2026-10-15):** tapping a Timeline page opens that book's detail. It uses `router.push(`/book/${book.id}`)`, as `book-card.tsx` does, and it's built in Phase 2.

## Current State (grounded)

> **Re-grounded 2026-10-22** after merging `origin/main` (v1.3.0). The timeline-improvements plan (#28), Wookieepedia enrichment (#33/#37), EAS Update, patch-package and the SF Symbols migration have all landed. The deltas are folded in below.

- **`components/holo-cover.tsx`** has two variants:
  - `thumb` = `HoloFace`: a `LinearGradient` tint + cover with `mixBlendMode: 'luminosity'`, scanline Views, `boxShadow` glow.
  - `hero` = `HoloFace` + `Projector` (beam/emitter `LinearGradient`s pulsing via `withRepeat`), plus `TiltedHero`, which is dead because both call sites pass `tilt={false}`.
  - **New (#28):** a `canon` prop. On a `hero`, `HoloFace` overlays a `CanonBadge` (`components/ui/canon-badge.tsx`) at the cover's top-left corner, at full opacity above the tinted clip.
  - `HoloFace` and `CoverFace` aren't exported.
- **Timeline (after #28):**
  - a horizontal `FlashList` pager (`snapToInterval={width}`, `disableIntervalMomentum`)
  - **the canon filter was removed**: the whole chronology shows, with a per-hero `canon` badge
  - one hero per page: `coverW = min(220, width*0.55)`, `coverH = coverW*1.5`
  - `renderItem` has **no press handler**
  - `onViewableItemsChanged` → `activePage` React state → `TimelineRail`
  - the rail supports **scrubbing**, which jumps the pager with `scrollToOffset` (not `scrollToIndex`; every page is exactly one screen wide)
  - film/TV anchor pills float over the hologram glow (`tokens.rail.*`)
  - `data.books.length === 0` → empty state replaces `listWrap`
- **Book detail (after #33):** `app/book/[id].tsx` has a hero at 200×300 inside a `ScrollView`.
  - **No native large title** (`headerLargeTitle: false`). The header is transparent (`headerLargeStyle: { backgroundColor: 'transparent' }`, `headerBlurEffect: 'none'`) specifically so it doesn't cut off the hologram glow. The 3D canvas's bloom margin depends on this staying transparent.
  - `EnrichmentSection` (Wookieepedia timeline and characters) sits below the synopsis.
  - Reached from `components/book-card.tsx` and `components/barcode-scan-panel.tsx`.
  - `book/[id]` is a root Stack screen pushed over `(tabs)`, which is `NativeTabs` (`expo-router/unstable-native-tabs`).
- **Icons:** lucide was removed. New UI uses `expo-symbols` `SymbolView` (memory `feedback_sf_symbols_icons`).
- **Covers:** `book.cover_image` is a remote URL from mixed hosts (penguinrandomhouse.com, books.google.com, …). There's no reliable sized-variant API across hosts.
- **Tokens:** `tokens.holo.*` in `constants/tokens.ts` (no imports, so it's test-safe).
- **Config:**
  - Expo SDK 56 (`~56.0.23`), RN 0.85.3, New Arch, `reactCompiler: true`
  - Reanimated 4.3.1, worklets 0.8.3, Biome 1.9.4, `react-native-screens` 4.26.2
  - **No `metro.config.js`**
  - `tsconfig` extends `expo/tsconfig.base` (`lib: ["DOM","ESNext"]`, `moduleResolution: "bundler"`, `skipLibCheck`)
  - **`expo-updates` is now installed:** `runtimeVersion: { policy: "fingerprint" }`, EAS Update URL in `app.json`
    - Adding `react-native-webgpu` changes the native fingerprint. That one piece can't ship OTA; everything else can. See **Release Strategy** below.
  - **`patch-package` postinstall:** `react-native-screens` and `expo-router` are patched and pinned (memory `project_native_patches_patch_package`). Our new deps don't touch them, but run `npm ci` (which runs postinstall), not a bare install.
  - `app.json` plugins now include `./plugins/withPodsMinDeploymentTarget.js`
- **Tests:** Vitest, `environment: 'node'`, `**/*.test.ts`. Only pure TS; nothing that imports `three` or native modules.

## Research Findings (from the library's own docs and examples)

Sources:
- react-native-webgpu docs: [three.js](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/integrations/three-js.mdx), [Canvas](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/canvas.mdx), [Native APIs](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/native-api.mdx), [React APIs](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/react-api.mdx), [Worklets](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/integrations/worklets.mdx), [Expo](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/expo.mdx)
- example screens in [`apps/example/src/ThreeJS/`](https://github.com/wcandillon/react-native-webgpu/tree/main/apps/example/src/ThreeJS): `Cube`, `PostProcessing`, `Memory`, `InstancedMesh`, `components/makeWebGPURenderer.ts`

| Topic | What the docs say | Consequence for us |
|---|---|---|
| Versions | `react-native-webgpu@0.15.1` (latest; 0.14.2 when research started) peers: RN ≥0.81, worklets ≥0.7.2, Reanimated ≥4.2.1. Bundles Dawn `154.3.0`. New Arch only. | ✅ all met. |
| Expo | Config plugin `"react-native-webgpu"` turns off Metal API Validation in the Xcode scheme. **Required on the iOS Simulator.** | Add the plugin, then prebuild and rebuild. |
| Imports | Use `three/webgpu` and `three/tsl`. Using `three/addons/*` needs a Metro alias from `three` and `three/webgpu` → `build/three.webgpu.js`. | Create `metro.config.js`. App code imports **only** `three/webgpu`/`three/tsl` (tsc resolves bare `three` to the WebGL-only types). Enforce with Biome `noRestrictedImports`. |
| Addon types | `@types/three` maps `./addons/*` → `./examples/jsm/*` with no extension probing. | Use `three/addons/tsl/display/BloomNode.js`, `three/addons/geometries/RoundedBoxGeometry.js`. |
| Global types | react-native-webgpu augments global `GPUDevice`/`Navigator`. TS 6's lib.dom already has WebGPU types (`lib: ["DOM"]` via the Expo base). `skipLibCheck` hides a `readonly gpu` redeclaration clash. | No tsconfig change. **Don't** add `@webgpu/types`. `navigator.gpu` is typed non-optional, so detect with `'gpu' in navigator`. |
| Hermes | No `TextDecoder`. Import `fast-text-encoding` before any three code. | Import it at the top of the lazy runtime entry (its only consumer). |
| Renderer | `new WebGPURenderer({ canvas: context.canvas, context, device, antialias })`. Pass **our own device**. Don't call `context.configure()`. `PostProcessing.tsx` uses `antialias: false`. | Shared device; `antialias: false` (bloom softens edges anyway). |
| Frame loop | `setAnimationLoop(cb)`. `context.present()` after every render. If you drive `render()` yourself, `await renderer.init()` first. | Loop: update uniforms → `pipeline.render()` → `present()`. |
| Pixel density | `canvas.width = clientWidth * PixelRatio.get()`. `getContext` is sync; retry on the next frame at zero size. | Cap the ratio (see Resolution policy). |
| Transparency | Needs `opaque={false}` + premultiplied alpha + an alpha-0 clear. | Render **opaque**, clear colour = `tokens.surface.background`. |
| Post-processing | `new THREE.RenderPipeline(renderer)`, `pass(scene, camera)`, `bloom()`, `outputNode = color.add(bloom)` (`PostProcessing` was renamed `RenderPipeline` in r183). | Same pattern. |
| Teardown | `setAnimationLoop(null)` **doesn't stop three's internal rAF**; `dispose()` does. Known r184+ leak [#445](https://github.com/wcandillon/react-native-webgpu/issues/445): clear `QuadMesh` geometry listeners after dispose, "safe while the app has at most one live renderer". | Pausing still has a leftover tick (measure it, see Pausing). Clear listeners only when the live-renderer count reaches 0. `QuadMesh` is exported from `three/webgpu`, so no `any`. |
| Images | RN `createImageBitmap(blob \| ArrayBuffer)`. Three's DOM `TextureLoader` doesn't work. Whether three accepts RN's `ImageBitmap` as a texture source is **undocumented**. | Gate **G1** (includes resize support). |
| Threads | Default: the JS thread. Off-thread three needs **experimental** worklets Bundle Mode. `device.lost` and `uncapturederror` only fire on the main JS runtime. | v1 renders on the JS thread. Bundle Mode is a stretch goal. |
| Shared device | `GPUDeviceProvider` renders `null` until the device is ready. | Lazy module singleton instead. |

## Architecture

```
lib/holo3d/pager.ts (+ pager.test.ts)   pure: cardTransform(), windowIndices(), px↔world projection
lib/holo3d/runtime/gpu.ts               device singleton, live-renderer counter, dispose (#445), status store
lib/holo3d/runtime/textures.ts          encoded-bytes cache; decode+downscale → THREE.Texture per stage
lib/holo3d/runtime/scene.ts             card / emitter / beam (/ particles) + TSL materials + bloom pipeline
lib/holo3d/runtime/stage.ts             createHoloStage(): imperative controller (the only owner of three objects)
components/holo-stage.tsx               <Canvas> + React wiring; lazy-loaded; one component for both surfaces
```

- **`lib/holo3d/runtime/*` imports three and must never be imported by `*.test.ts`.** `pager.ts` doesn't import three.
- **Lazy loading:** `components/holo-stage.tsx` is loaded with `React.lazy(() => import('@/components/holo-stage'))`. The `Suspense` fallback is `HoloFace`, so `three/webgpu` isn't evaluated at app start, or ever on Android/web or when switched off.
- **Exports:** export `HoloFace` from `components/holo-cover.tsx` (fallback/pending face).

### Status store (`gpu.ts`), replacing the error-boundary fallback

```ts
type HoloStatus =
  | { kind: 'pending' }
  | { kind: 'ready' }
  | { kind: 'unavailable'; reason: 'disabled' | 'platform' | 'no-webgpu' | 'init' | 'frame' | 'device-lost' };
export function useHolo3DStatus(): HoloStatus; // useSyncExternalStore over a module store
```

- **`unavailable` straight away** when:
  - `process.env.EXPO_PUBLIC_HOLO_3D === '0'` (`'disabled'`)
  - `Platform.OS !== 'ios'` (`'platform'`)
  - `!('gpu' in navigator)`, or `requestAdapter()` returns null (`'no-webgpu'`)
- **Stages report failures:**
  - `init` / `compileAsync` rejection → `'init'`
  - the frame callback wraps its body in try/catch, then stops the loop and reports `'frame'`
  - `device.onuncapturederror` and `device.lost` → `'device-lost'`
- **Any `unavailable` is sticky for the session.** There's no retry.
- **Consumers:**
  - Timeline cells render `HoloFace` when status ≠ `ready`, and transparent cells when `ready`.
  - Detail renders `HoloFace` until the stage reports its first presented frame, then unmounts it.
- **Last resort:** a small class error boundary (`getDerivedStateFromError(error: unknown)`), keyed by book id, catches sync render throws only.

### Device and renderer lifecycle (`gpu.ts`)

- **`getHoloDevice(): Promise<GPUDevice | null>`**
  - requests the adapter and device once, memoized
  - checks the status first
  - subscribes to `device.lost` on the JS runtime
- **`createHoloRenderer(context, device)`** increments `liveRenderers`.
  - **Every** path decrements it, including when init fails after creation.
  - Use the repo's `alive` cancellation idiom (`useReduceMotion`), so a device or `init()` that resolves after unmount disposes immediately instead of rendering to a dead canvas.
- **`disposeHoloRenderer(renderer)`:** `setAnimationLoop(null)` → `dispose()` → decrement. When the count reaches 0, also call `clearQuadMeshListeners()`:

```ts
import { QuadMesh } from 'three/webgpu';
type WithListeners = { _listeners?: Record<string, unknown> };
/** three r184+ leak workaround (react-native-webgpu#445). Delete when fixed upstream. */
function clearQuadMeshListeners(): void {
  const { geometry } = new QuadMesh();
  for (const t of [geometry, geometry.index, ...Object.values(geometry.attributes)]) {
    if (t) (t as WithListeners)._listeners = {};
  }
}
```

- **Promises:** `init()`, `compileAsync()`, `setAnimationLoop()` and `dispose()` return promises. Always `await` them or explicitly `void` them.

### Stage controller (`stage.ts`): React Compiler-safe

`createHoloStage(context, device, opts) → { setBooks, setSize, setScroll, setReduceMotion, setPressed, pause, resume, dispose, onFirstFrame }`

- **Owns everything:** renderer, scene, pipeline and textures live inside the controller (effect-local), never in React state or render-time refs.
- **`holo-stage.tsx`** creates the controller in one mount effect. It syncs props through small effects that call setters, keyed on derived primitives (a joined URI string and `width`), not `data.books` identity.
- **No stale closures:** the frame loop only reads controller fields, so it can't capture stale props. Never write `ref.current` during render.
- **Canvas typing:** one helper; no scattered `as HTMLCanvasElement`:

  ```ts
  const layoutSize = (c: HTMLCanvasElement | OffscreenCanvas) =>
    'clientWidth' in c ? { w: c.clientWidth, h: c.clientHeight } : null;
  ```

### Cover textures (`textures.ts`)

- **Shared cache of encoded bytes only:** `Map<uri, Promise<ArrayBuffer>>`. Insertion order works as the LRU, with a cap of ~16 (a few hundred KB each). The promise map dedupes concurrent fetches.
- **Per-stage GPU textures:** each stage decodes and uploads its own textures, for its window only:
  - Timeline: `windowIndices(activePage, count, 1)`, i.e. ≤3
  - Detail: 1
  - A texture is disposed as soon as it leaves the window. No texture is shared between renderers, so neither stage can evict the other's.
- **Pipeline:**
  1. bytes → `createImageBitmap` with a **mandatory downscale to ≤640×960** (on-screen max ≈660×990 px). Resize options are verified in G1. If they're unsupported, use the G1 fallback (below).
  2. `new THREE.Texture(bitmap)`: `SRGBColorSpace`, mipmaps on, anisotropy 2.
  3. **Pre-upload with `renderer.initTexture(tex)` while idle**: one per frame, never during scroll or momentum.
  4. `bitmap.close()` after upload.
  5. Bind to a card only once uploaded. Until then the card shows its no-cover tint.
- **Memory:** ≤3.3 MB per texture with mips, ×≤4 live (3 Timeline + 1 detail). That's ≈13 MB, compared with ~160 MB in the original plan.
- **Stale loads:** a load resolving for a URI no longer in the window is dropped. The bytes stay cached, but no bind happens.
- **No cover, or a failed load:** `uHasCover = 0` mixes a `getCoverColor(title)` uniform colour under the same shader scanlines. Title and author render as RN `Text` in the cell above (mirrors `CoverFace`).

### The hologram look (`scene.ts`)

All geometry is procedural; there are no asset files. Verify TSL node names against r186 in Phase 0.

| v1 element | Geometry | Material |
|---|---|---|
| **Card** | `RoundedBoxGeometry` (addons, `.js`), 2:3, depth ~0.02 | Unlit `MeshBasicNodeMaterial`:<br>• cover `texture()` → luminance → `mix(tintBottom, tintTop, lum)`<br>• scanlines `fract(uv().y * N - time * s)`<br>• fresnel rim `pow(1 - abs(dot(normalView, positionViewDirection)), p)` × cyan<br>• `uTilt` sheen driven by **pager rotation** (Timeline) and a slow idle sway (detail)<br>• `uFlicker` (CPU-computed uniform)<br>`transparent`, `depthWrite: false` |
| **Emitter** | `RingGeometry` + disc | Additive, cyan × `uPulse` (CPU, 2.8 s period) |
| **Beam** | Open cone (`CylinderGeometry`) emitter → card | Additive, `DoubleSide`, vertical gradient × edge falloff. Cheap hash noise only (it's the main fill cost). |
| **Bloom** | `RenderPipeline`: `pass()` → `bloom()` → `add` | Run at **reduced resolution** (r186 API: pass resolution scale; verify). Start with 3–5 levels and cut to 3 if over budget. Tone mapping decided while tuning. |

- **After the look is approved:**
  - chromatic fringe
  - flicker dropout bands
  - **particles**: an `InstancedMesh` of ~150 additive quads with positions in TSL; built last in Phase 1 and time-boxed
- **Lights and camera:** no lights (unlit and additive). `PerspectiveCamera` at ~30° FOV.
- **Colours:** `new THREE.Color(token)` from `tokens.holo` (THREE does sRGB→linear; it parses the `rgba()` tokens' RGB and ignores alpha, so alpha comes from material opacity).
- **Reduce motion:** a `uMotion` uniform (0/1) scales time. While reduce motion is on, the loop **renders only when inputs change** (0 fps idle).

### Resolution policy

- **Pixel ratio:**
  - Drawing buffer = layout × `min(PixelRatio.get(), 2)`.
  - The Timeline starts at **1.5** (bloom hides the softness), and Phase 1 tuning confirms it.
- **Timeline canvas size:** sized to the **card + beam band** (pager width × card height + beam + bloom margin), not the full `listWrap`.
- **Detail canvas size:** ≈1.5× the card footprint, so the bloom and beam aren't clipped.

### Timeline: one shared stage behind the pager

```
<View listWrap>
  <HoloStage style={band} books={data.books} scrollX={scrollX /* SharedValue */} />   one Canvas
  <AnimatedFlashList horizontal onScroll={scrollHandler} renderItem={Cell} … />        gestures, a11y, overlays
</View>
```

- **Cells:**
  - A cell is a `Pressable` with `onPress={() => router.push(`/book/${book.id}`)}` (the `book-card.tsx` idiom), `accessibilityRole="button"` and `accessibilityLabel="{title} by {author}"`.
  - When `ready`, the cell is transparent and holds the RN overlays: the **`CanonBadge`** at the card's top-left (now shipped, #28), positioned with `cardRect()` plus the same 8 pt inset as `HoloFace`'s `heroBadge` style, and the no-cover title. The badge must stay in step with the 3D card while paging (G7).
  - When not `ready`, it renders `HoloFace` inside the same `Pressable`.
  - The canvas is `accessible={false}`.
- **Tap target:** limit the pressable area to the card rectangle (`coverW × coverH`, centred, using the same projection as the cards), not the whole page, so taps on empty space don't navigate.
- **Swipe vs tap:** the horizontal pan takes over from a `Pressable` once it moves past the touch slop (standard RN behaviour). Verify that flings never trigger a push.
- **Press feedback:** on press-in, `controller.setPressed(index, true)` briefly brightens the card and emitter through a uniform. Only the canvas reacts, with no RN layer on top. Under reduce motion, use `Haptics.selectionAsync()` instead (`expo-haptics` is already installed).
- **Scroll sync:**
  - `useAnimatedScrollHandler` writes `contentOffset.x` into a SharedValue on the UI thread. FlashList is wrapped with `Animated.createAnimatedComponent`.
  - Each frame, the loop reads `scrollX.get()` and positions cards with `pager.ts`.
  - `pager.ts` exposes one px→world projection, so the overlays and cards share the same mapping.
  - Card transforms come from the live offset.
  - The **texture window** keys off the settled `activePage`, so rail-scrub jumps (`scrollToOffset`, which streams intermediate offsets while scrubbing) don't thrash loads.
  - Cards for pages skipped mid-scrub show the no-cover tint; they're never uploaded.
  - A residual lag of up to one frame between native overlays and GPU cards is expected; G7 measures it.
- **Card pool:** 3 meshes (previous, active, next) are re-bound as the window moves. One emitter and beam stay fixed at screen centre, and covers slide through the beam.
- **Pausing:** done imperatively, never through re-rendering state:
  - `useFocusEffect` → `controller.pause()` / `resume()`
  - `AppState` listener → the same
  - Pause = no `render()`/`present()`.
  - After **30 s blurred**, or on background, `dispose()`. Focus re-inits, showing `HoloFace` until the first frame.
  - Phase 0 measures the leftover three tick while paused. If it's >0.1 ms/frame or shows in the Energy gauge, dispose on blur immediately.
- **Frame rate:**
  - Display rate while scrolling.
  - An idle throttle is **only added if G3 or the soak test calls for it**: a frame-count divisor from the measured rAF interval (÷4 at 120 Hz, ÷2 at 60 Hz). Idle = no scroll and no momentum for 150 ms.
  - Verify `CADisableMinimumFrameDurationOnPhone` in the prebuilt `Info.plist`; without it, rAF is capped at 60 Hz.
- **Empty state:** an empty catalog unmounts the stage and disposes it. Re-init when books return is accepted (rare).
- **Remove** the per-page `HoloCover` hero.

### Book detail hero

- `app/book/[id].tsx` replaces `<HoloCover variant="hero" />` with `<HoloStage books={[book]} />`: the same component, no `scrollX`, an oversized canvas around the 200×300 footprint.
- **First paint:** `HoloFace` stays mounted until `onFirstFrame`. That fires after the first `present()` + `device.queue.onSubmittedWorkDone()`, which follows `await renderer.compileAsync(scene, camera)` plus one warm-up pipeline render. Then `HoloFace` unmounts, with no animation.
- **Pausing:** the same `useFocusEffect`/`AppState` rule (detail can be covered by another detail or a modal).
- **Two live renderers: the main flow is now Timeline → tap → detail.**
  - The Timeline blurs and pauses straight away (no render or present). Its renderer stays alive for 30 s, so coming back within that time resumes at once.
  - Detail creates its own renderer on the shared device, so only one renderer draws at a time.
  - The detail cover's encoded bytes are already in the shared cache (the Timeline just loaded them), so detail only pays decode + upload, not the network fetch.
  - Popping back disposes the detail renderer. The count is still 1, so the #445 listener clear doesn't run. The Timeline resumes.
  - A visit longer than 30 s disposes the Timeline. Back then shows `HoloFace` until the Timeline re-inits (warm init, G2).
  - Archives/Library → detail (Timeline mounted but blurred, or never mounted) follows the same rules.
- **Timeline and detail stages are separate instances:** both canvases are on screen during the push transition, so a single stage can't move between screens.

## Release Strategy: one dark carrier build, then OTA (decided 2026-10-22)

**Goal:** ship the hologram covers as EAS Updates, not as a feature App Store release.

**Hard constraint.** `react-native-webgpu` is a native module: a Dawn `.xcframework`, a Metal-backed `Canvas` view and JSI bindings. EAS Update can only replace the JS bundle and assets. The README says adding a native module "needs a new build". The `fingerprint` runtime policy also means an update that depends on it is **never delivered** to binaries without it. **So 100% OTA isn't possible.** The nearest workable version:

1. **One carrier build, the only store submission.** The next binary (1.4.0) includes every native-affecting change, with **no user-visible change**. 3D isn't wired into any screen, the spike route is off, and the app still renders today's 2D heroes. It carries:
   - the `react-native-webgpu@0.15.1` native module (autolinked even though no shipped JS imports it)
   - the `"react-native-webgpu"` config plugin in `app.json`
   - `CADisableMinimumFrameDurationOnPhone` in `ios.infoPlist`, **only if** the prebuilt `Info.plist` lacks it (check in Phase 0)
   - every JS dependency too (`three`, `fast-text-encoding`, `@types/three`), plus `metro.config.js` and the Biome rule. These are already in place, so no later OTA changes `package.json` dependencies or bundler config. That removes any doubt about what the fingerprint hashes.
2. **Everything else ships as EAS Updates** on that runtime, with no review and no new binary. Each phase from 1 onward follows the same ladder:
   1. `npm ci`
   2. `eas fingerprint:compare --build-id <carrier build>` must report **no change** (the gate)
   3. `eas update --channel preview` → verify on the preview build (same native layer)
   4. `eas update --channel production`
   - The ladder covers the runtime code, the look, the Timeline, detail, tap-to-open, tuning, and the cleanup.
3. **Users on 1.3.0 or older binaries keep the 2D hero** until they install 1.4.0 from the store. The fingerprint stops the 3D updates reaching them, and they can't crash on a missing module.

**Rules this adds for Phases 1–3 (OTA-safe):**
- **No native-affecting edits.** That means no `app.json` native fields or plugins, no new or upgraded native deps, and no `patches/` changes.
  - **Keep `NSMotionUsageDescription`** (originally a Phase 3 removal). Removing it changes the native layer, so it waits for a future binary.
  - Leave `expo-sensors` installed.
- **Version freeze:** `react-native-webgpu` is frozen at 0.15.1 until the next binary.
  - three (pure JS) *can* move forward OTA, but only to versions verified on 0.15.1's Dawn (`154.3.0`).
  - The #445 workaround and the `RenderPipeline`/`bloom` checks apply to any three bump.
- **Defensive import:** the lazy runtime entry wraps `import('react-native-webgpu')` / `navigator.gpu` detection in try/catch → status `unavailable: 'no-webgpu'`. The fingerprint should make a mismatch impossible, but this is cheap insurance against a bad channel or runtime configuration.
- **Rollback and kill-switch:**
  - `eas update:republish` the previous update, or
  - publish an update built with `EXPO_PUBLIC_HOLO_3D=0`, which takes every surface back to `HoloFace` in the field
  - Optionally stage production rollouts as a percentage (EAS Update rollouts; check the current CLI flag at publish time).

**Consequence: the native layer must be proven *before* the carrier is submitted.**
- If 0.15.1 turns out to be missing something we need (G1's texture path, a crash fix), the only remedy is **a second store build**.
- So Phase 0's full spike (G1–G7) runs on a **local Release build** of the exact carrier native configuration *before* `eas build --profile production`.
- G1's fallback (raw `GPUTexture` via `copyExternalImageToTexture`) uses the same native module, so it stays OTA-able.
- G5 (IPA size) is decided before submission, because it's the carrier that adds Dawn.

## Implementation Phases

### Phase 0 — Native foundation, spike, carrier build (the only store build)

**Install** (exact pins: three breaks APIs between minors):

```
npx expo install react-native-webgpu@0.15.1 three@0.186.1 fast-text-encoding@1.0.6 -- --save-exact
npx expo install @types/three@0.186.0 -- --save-dev --save-exact
```

- `@types/three` tracks major.minor, so 0.186.0 is correct for three 0.186.1.
- **Lockfile:** review the `package-lock.json` diff for expo or expo-asset drift (memory `project_npm_ci_not_install`), commit it, then `npm ci`. That re-runs the `patch-package` postinstall; confirm the screens and expo-router patches still apply.
- **`app.json`:** add the `"react-native-webgpu"` plugin. After `npx expo prebuild --clean`, check `ios/<App>/Info.plist` for `CADisableMinimumFrameDurationOnPhone`. If it's missing, add it under `ios.infoPlist` **now** (it's native, so it can't be added later OTA).
- **`metro.config.js`** (new): `getDefaultConfig` + the documented `three` alias + `assetExts` for `glb`/`hdr`. That pre-empts the projector-model stretch item, so bundler config never changes after the carrier.
- **`biome.json`:** add `style/noRestrictedImports`, restricting `three` (use `three/webgpu`).
- **Rebuild:**
  - simulator: prebuild + dev client on the iPhone 17 Pro / iOS 26.4 simulator by UDID (memory `project_simulator_target_device`), with Metro launched via the worktree's own expo binary (memory `project_nested_worktree_metro_root`)
  - device: a **Release build** (`npx expo run:ios --device --configuration Release`, or an internal EAS build)

**Spike screen:** `app/dev/holo-spike.tsx`, reachable only when `EXPO_PUBLIC_HOLO_SPIKE=1`, so it works in Release. It has:
- one remote cover on a `RoundedBox` card with bloom
- a transparent FlashList with text overlays over a canvas band (for G7)
- a mount/unmount loop (the `Memory.tsx` method)

**Gates.** Measured on a Release device build with Instruments. Each needs a pass, or a documented workaround, before Phase 1:

| Gate | Pass | How to measure |
|---|---|---|
| **G1 Texture path** | RN `createImageBitmap` → `THREE.Texture` renders correctly (orientation, sRGB, mips), **and** downscaling to ≤640×960 works. Fallback if not: upload a raw `GPUTexture` via `copyExternalImageToTexture` + a render-pass downscale. Deciding this is feasible gates the whole project. | Visual + a timing log |
| **G2 First frame** | Warm (second mount in the same session): <400 ms. Cold (first launch after install, empty Metal shader cache): <1 s, with `HoloFace` showing meanwhile. Report segments: device / init / `compileAsync` / texture / first submit. | `performance.now()` marks + Metal System Trace |
| **G3 Frame time** | Loop body p50/p95/max **including** `getCurrentTexture()` + `present()` ≤ 8.3 ms p95 at 120 Hz. GPU frame time and pass count recorded. No hitches while paging during the `activePage` re-render. If over budget: bloom levels → 3 → resolution scale → then evaluate Bundle Mode. | Instruments: Time Profiler, Metal System Trace, Animation Hitches |
| **G4 Memory** | No growth after GC over 100 mount/unmount cycles + 100 texture swaps. Leftover tick on a paused renderer measured. | `Memory.tsx` method + Allocations |
| **G5 Size** | JS bundle delta (`npx expo export --platform ios`) and **IPA delta** (Dawn) reported and accepted by the user. | export / archive |
| **G6 Simulator** | Runs with the config plugin after `prebuild --clean`. | — |
| **G7 Scroll drift** | A 120 Hz screen recording of a slow drag and a fling: overlay text and card stay in step (≤1 frame). | Screen recording |

**Output:** measurements are appended to the research doc. Go/no-go with the user.

**Carrier build** (after a go, with the user's approval to submit):
1. The spike route stays env-gated off. No shipped screen imports the 3D runtime; the app is visually identical to 1.3.0.
2. `npm ci` → `eas build --profile production` (plus `--profile preview` for the OTA test bed: same native layer, `preview` channel) → TestFlight smoke test (app launches, 2D heroes unchanged) → submit 1.4.0 for review.
3. **Record the carrier fingerprint and build id** in the research doc. Every later update is compared against it.
4. The carrier can go out with other 1.4.0 work. It doesn't need its own release, as long as that other work also adds no native changes after the carrier is cut.

### Phase 1 — Runtime and the look (ships OTA)

- `lib/holo3d/pager.ts` + `pager.test.ts`:
  - `cardTransform(index, scrollX, pageWidth) → { offset, rotationY, opacity, visible }`
  - `windowIndices(active, count, radius = 1)`
  - the px↔world projection
  - `cardRect(pageWidth, pageHeight, coverW, coverH)` → the centred card rectangle in cell coordinates, used for both the tap target and overlay placement
  - Tests: `pageWidth === 0` (no NaN), first and last page, overscroll, window at both ends, `cardRect` centring.
- `lib/holo3d/runtime/{gpu,textures,scene,stage}.ts` per the Architecture section. Export `HoloFace`.
- **Tune on the spike screen** using `__DEV__`-time constants (no preset UI). Compare with Figma node `134:2077` and today's 2D hero. Particles come last and are time-boxed.
- **Exit:** the user approves the look from simulator screenshots or a recording.
- **Ships as:** nothing user-visible yet. The runtime can ride the Phase 2 update; no update is needed for Phase 1 alone.

### Phase 2 — Timeline (ships OTA)

- `components/holo-stage.tsx` (lazy), an `AnimatedFlashList` scroll handler, transparent/`HoloFace` cells by status, pausing + 30 s dispose.
- **Tap-to-open:** `Pressable` cells limited to the card rectangle, `router.push(`/book/${book.id}`)`, the press-in brighten uniform, and the haptic under reduce motion.
- **Remove the hero `HoloCover` from the Timeline.**
- **Exit:**
  - G3 and G7 re-checked on the real screen
  - fling and rail-scrub behave, and the film/TV anchor pills stay legible over the 3D glow
  - tapping a card opens the right book; flings and drags never push; taps outside the card don't navigate
  - the canon badge tracks its card while dragging and flinging
  - status ≠ ready shows `HoloFace` (test with `EXPO_PUBLIC_HOLO_3D=0`)
  - VoiceOver reads the cells
- **Ships as:** EAS Update, following the release ladder (fingerprint compare → `preview` → `production`). This is the first user-visible 3D release. Users on 1.4.0+ get it on their next cold launch.

### Phase 3 — Book detail and cleanup (ships OTA)

- `<HoloStage books={[book]} />` in `app/book/[id].tsx`, with the `onFirstFrame` swap and pausing.
- **Delete** `Projector`, `StaticHero`, `TiltedHero` and the `variant`/`tilt` props from `holo-cover.tsx`. **Keep** `HoloFace`'s `canon` prop and its `CanonBadge`: the fallback/pending face on both surfaces still shows the badge. **Don't** remove `NSMotionUsageDescription` or `expo-sensors` here. Both are native-affecting, so they're left for the next binary (and the gyro-tilt stretch item would reuse them).
- **Exit:**
  - **Timeline → tap → detail → back:** one drawing renderer at a time; resuming within 30 s needs no re-init; #445 clear runs only at count 0
  - Archives → detail with the Timeline mounted-but-blurred behaves the same way
  - 100 cycles of Timeline → tap → detail → back, plus 100 cycles of tab switch → detail, with no memory growth
  - a detail visit longer than 30 s: back shows `HoloFace`, then the Timeline re-inits
  - background/foreground
  - a **10-minute device soak** (Power Profiler, thermal state), including Low Power Mode at 60 Hz
- **Degrade order if hot:** bloom off → idle throttle → `unavailable`.
- Update the research doc status, and add a `CLAUDE.md` Design Context line for the 3D hero.
- **Ships as:** EAS Update, following the same ladder.

### Stretch (separate plans)

Each item is marked OTA or new build:
- **Gyro tilt** on the detail hero (**OTA**: `expo-sensors` and the motion string are already in the binary). Read `sensor.sensor.get()` in the JS loop; watch the device-only crash class in memory `project_reanimated_sensor_worklet_crash`.
- **Off-JS-thread rendering** via worklets Bundle Mode, if G3 shows contention (**likely a new build**: Bundle Mode changes the worklets/Babel/native setup; verify).
- **A modelled projector base** (**OTA** if Metro `assetExts` for `glb` is added in the carrier's `metro.config.js`, so add it there pre-emptively; assets themselves ship OTA): a self-contained `.glb`, `GLTFLoader`.
- **Skia v3 composition** (**new build**: a native module).
- **A shared-element transition** into `HoloFace` (**OTA**).

## Acceptance Criteria

**Functional**
- [ ] The Timeline renders every hero through **one** canvas and renderer. Cards and their overlays stay in step (≤1 frame) while dragging and flinging.
- [ ] Tapping a Timeline card opens that book's detail. Drags and flings never navigate, and taps outside the card rectangle don't navigate. Back within 30 s resumes the Timeline at once.
- [ ] Book detail renders the 3D hero with bloom unclipped. `HoloFace` → 3D has no blank frame.
- [ ] Books without covers show a tinted card with legible RN title and author.
- [ ] Archive, Library, added-books sheet and scan review are visually unchanged.
- [ ] `unavailable` (env switch, non-iOS, no WebGPU, init/frame failure, device loss) shows `HoloFace` on both surfaces, for the rest of the session.
- [ ] Reduce Motion: no flicker, scanline motion or sway, and no rendering while idle.
- [ ] VoiceOver reads each Timeline page as a button, "{title} by {author}", and double-tap opens detail. The canvas isn't focusable.

**Performance (Release build, physical device)**
- [ ] G2: warm first frame <400 ms, cold <1 s, with segments reported.
- [ ] G3: loop p95 ≤8.3 ms at 120 Hz, including `present()`. No hitches while paging.
- [ ] G4: no memory growth over 100 cycles. Live cover textures ≤4 at ≤640×960.
- [ ] Paused stages don't render. Leftover tick measured, and acted on if over threshold. A blurred Timeline is disposed after 30 s.
- [ ] 10-minute soak: no thermal throttling to `.serious`.
- [ ] G5: JS and IPA deltas accepted (before the carrier is submitted).

**Release (OTA)**
- [ ] The carrier build (1.4.0) is visually identical to 1.3.0, and its fingerprint and build id are recorded.
- [ ] Every Phase 1–3 update passes `eas fingerprint:compare --build-id <carrier>` with no change, and is verified on the `preview` channel before `production`.
- [ ] Binaries older than the carrier keep the 2D hero and never receive the 3D updates.
- [ ] Rollback is rehearsed once on `preview`: republish the previous update, and an `EXPO_PUBLIC_HOLO_3D=0` update shows `HoloFace`.

**Quality gates**
- [ ] `npm run lint` (including the `three` import restriction), `npm test`, and `npx tsc --noEmit` pass. No `any`.
- [ ] `pager.test.ts` covers the edge cases above.

## Edge Cases

- **Zero-size layout:** `getContext` returns null, so retry on the next rAF (documented).
- **iPad / size change:** recompute the buffer when `clientWidth` changes.
- **Fast flings across many pages:** cards show the no-cover tint until their texture finishes uploading. A frame never waits on a load.
- **Cover 404 or decode failure:** `uHasCover = 0` + the RN title overlay.
- **Filter change:** the derived URI key changes → the window rebinds, and stale loads are dropped.
- **Unmount during async device or init:** the `alive` guard disposes, and the counter decrements.
- **React Compiler:** a cover change on a mounted detail screen rebinds (no stale pin), verified explicitly.

## Dependencies and Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| RN `ImageBitmap` or resize not accepted by three | Medium | G1 on day 1. Raw `GPUTexture` + render-pass downscale fallback. |
| `react-native-webgpu` "technical preview" (0.14→0.15 in a day) | Medium | Exact pins, the status store fallback, a device test before any bump. |
| three API churn (r183 rename, r184 leak) | High over time | Exact pins. The upgrade checklist re-checks #445, `RenderPipeline`, `bloom`, pass resolution scale. |
| JS-thread contention (FlashList + React + loop on Hermes, no JIT) | Medium | Capped resolution, reduced-scale bloom, CPU uniforms, pausing; then Bundle Mode. |
| Fill cost (full-ratio buffer, beam overdraw, bloom chain) | Medium | Resolution policy, band-sized canvas, cheap beam noise. |
| IPA growth (Dawn) | Unknown | G5; user decides before the carrier is submitted. |
| The carrier's native layer turns out insufficient after shipping (a missing API, or a crash fixed only in a newer `react-native-webgpu`) | Low–Medium | The full spike (G1–G7) runs on a local Release build of the exact carrier configuration before submission. G1's fallback is in the same native module. The worst case is a second store build. |
| An OTA accidentally changes the fingerprint (a stray dep bump, an `app.json` edit, a patch), stranding the update | Medium | A mandatory `eas fingerprint:compare` step in the release ladder; `npm ci` before publishing; the OTA-safe rules in Release Strategy. |
| `react-native-webgpu` frozen at 0.15.1 until the next binary | Certain | Accepted. three bumps OTA only after they're verified on Dawn `154.3.0`. |
| Battery and thermal | Medium | Pausing, 30 s dispose, soak test, degrade order. |
| Simulator not representative (perf) | Certain | Release device builds for G2–G4 and G7. A physical iPhone can't reach the dev server (memory `feedback_expo_go_device`), so a Release device build is required anyway. |

## Alternatives Considered

The research doc has the full comparison. Within this approach:
- **Per-page canvases:** N devices, pipelines and inits.
- **R3F:** native support isn't ready, and there's no need for JSX scene graphs with ≤3 objects.
- **The old projector hero as the fallback:** keeps ~150 LOC of dead 2D animation alive. `HoloFace` is enough.

## References

**Internal**
- [Research and decision](../brainstorms/2026-10-14-holo-cover-gpu-upgrade-research.md)
- [components/holo-cover.tsx](../../components/holo-cover.tsx), [app/(tabs)/timeline/index.tsx](../../app/(tabs)/timeline/index.tsx), [app/book/[id].tsx](../../app/book/[id].tsx), [components/book-card.tsx](../../components/book-card.tsx), [constants/tokens.ts](../../constants/tokens.ts), [hooks/useAccessibility.ts](../../hooks/useAccessibility.ts)
- [Deferred mesh plan (gap list)](2026-05-01-feat-3d-book-covers-real-mesh-renderer-plan.md#if-we-ever-do-build-the-real-mesh), [Timeline improvements plan](2026-07-01-feat-timeline-tab-improvements-plan.md)

**External**
- react-native-webgpu docs: [three.js](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/integrations/three-js.mdx), [canvas](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/canvas.mdx), [native APIs](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/native-api.mdx), [React APIs](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/react-api.mdx), [worklets](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/integrations/worklets.mdx), [Expo](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/expo.mdx)
- Examples: [`PostProcessing.tsx`](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/example/src/ThreeJS/PostProcessing.tsx), [`Memory.tsx`](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/example/src/ThreeJS/Memory.tsx), [`InstancedMesh.tsx`](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/example/src/ThreeJS/InstancedMesh.tsx), [`makeWebGPURenderer.ts`](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/example/src/ThreeJS/components/makeWebGPURenderer.ts)
- [Leak issue #445](https://github.com/wcandillon/react-native-webgpu/issues/445), [three.js WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer)
