---
title: "feat: WebGPU + three.js hologram covers (Timeline shared stage + book detail hero)"
type: feat
date: 2026-10-15
branch: claude/cover-art-hologram-3d-676408
research: docs/brainstorms/2026-10-14-holo-cover-gpu-upgrade-research.md
supersedes: docs/plans/2026-05-01-feat-3d-book-covers-real-mesh-renderer-plan.md (deferred mesh plan; its gap list is folded in below)
status: draft — not reviewed
---

# ✨ WebGPU + three.js Hologram Covers

Replace the 2D `HoloCover` **hero** on the Timeline tab and the book detail screen with a real-time
3D hologram rendered by three.js (`three/webgpu`, TSL node materials) on `react-native-webgpu` (Metal
on iOS). It will have:
- a projector emitter and a volumetric light cone
- the cover projected onto a floating card, with scanlines, flicker and a chromatic fringe
- a fresnel rim and a tilt-reactive sheen
- drifting particles and real bloom

List thumbnails don't change.

## Decisions (user-confirmed 2026-10-14)

- **Stack:** `react-native-webgpu` + three.js WebGPURenderer/TSL. Not Skia, not R3F, not native Metal/RealityKit. The research doc has the comparison.
- **Scope:** split by the existing `HoloCover` `variant` prop:

  | Surface | Today | After |
  |---|---|---|
  | Timeline (`app/(tabs)/timeline/index.tsx`) | `variant="hero"` | **3D stage** |
  | Book detail (`app/book/[id].tsx`) | `variant="hero"` | **3D hero** |
  | Archive/Library rows, added-books sheet, scan review | `variant="thumb"` | **Unchanged** |

- **Timeline uses one shared canvas behind the pager**, not one per page.
- **Detail on top of the Timeline:** both canvases share one GPU device, and the Timeline pauses while it's covered.
- **Shared-element transitions:** a list thumbnail (an RN view) can't transition into a GPU canvas. Any future transition targets the static `HoloFace`, then crossfades to 3D.

## Current State (grounded)

- **`components/holo-cover.tsx`** has two variants:
  - `thumb` = `HoloFace`: a blue `LinearGradient` tint, the cover with `mixBlendMode: 'luminosity'`, scanline Views, and inset + outer `boxShadow` glow.
  - `hero` = `HoloFace` + `Projector`, a `LinearGradient` beam and emitter whose opacity pulses via `withRepeat`, plus optional `TiltedHero` (`useAnimatedSensor` ROTATION). Both hero call sites pass `tilt={false}`.
- **Timeline:** a horizontal `FlashList` pager (`snapToInterval={width}`, `disableIntervalMomentum`) with one `HoloCover` hero per page (`coverW = min(220, width*0.55)`, `coverH = coverW*1.5`). `onViewableItemsChanged` sets `activePage`. The body is offset by `useHeaderHeight()`. `TimelineRail` sits below.
- **Book detail:** `app/book/[id].tsx` puts a `HoloCover` hero at 200×300 inside a `ScrollView` with `headerLargeTitle`. `book/[id]` is a **root Stack screen**, so the `(tabs)` navigator, and with it the Timeline, **stays mounted underneath**.
- **Tokens:** `tokens.holo.*` in `constants/tokens.ts` (cyan `#3DE0FF`, tints, scanline, bloom, inner glow). `tokens.surface.background` is `#0A0A0C`.
- **Config:**
  - Expo SDK 56, RN 0.85.3, New Arch, `reactCompiler: true`, iOS deployment target 16.4
  - Reanimated 4.3.1, worklets 0.8.3
  - **No `metro.config.js`** and no `babel.config.js` (Expo defaults)
  - `tsconfig` extends `expo/tsconfig.base` (`moduleResolution: "bundler"`)
- **Tests:** Vitest, `environment: 'node'`, `**/*.test.ts`. Only pure TS logic is testable; there's no native or GPU testing.

## Research Findings (from the library's own docs and examples)

Sources:
- [three.js integration](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/integrations/three-js.mdx)
- [Canvas](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/canvas.mdx)
- [Native APIs](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/native-api.mdx)
- [React APIs](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/react-api.mdx)
- [Worklets](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/integrations/worklets.mdx)
- [Expo](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/expo.mdx)
- example screens in [`apps/example/src/ThreeJS/`](https://github.com/wcandillon/react-native-webgpu/tree/main/apps/example/src/ThreeJS): `Cube`, `PostProcessing`, `Memory`, `InstancedMesh`, and `components/makeWebGPURenderer.ts`

| Topic | What the docs say | Consequence for us |
|---|---|---|
| Versions | `react-native-webgpu@0.14.2` peers: RN ≥0.81, worklets ≥0.7.2, Reanimated ≥4.2.1. Bundles `react-native-webgpu-dawn@154.3.0`. New Arch only. | ✅ all met. |
| Expo | Ships a config plugin (`"plugins": ["react-native-webgpu"]`) that turns off Metal API Validation in the Xcode scheme. This is **required on the iOS Simulator**: Dawn trips false positives there. | Add the plugin, then prebuild and rebuild the dev client. |
| Imports | Always `import * as THREE from "three/webgpu"`, plus `three/tsl`. If you use `three/addons/*` (we will, for `BloomNode` and `RoundedBoxGeometry`), alias bare `three` and `three/webgpu` to `build/three.webgpu.js` in Metro. Addon imports need the `.js` extension for types. | Create `metro.config.js`. |
| Hermes | Has `TextEncoder` but not `TextDecoder`, which three's core and loaders use. Import `fast-text-encoding` once before any three code. | Polyfill in `app/_layout.tsx`. |
| Static class blocks | `babel-preset-expo` already includes the transform. | Nothing to do. |
| Types | `@types/three` exposes `three/webgpu`, `three/tsl` and `three/addons/*` via `exports`. `moduleResolution: "bundler"` honours them. | Nothing to do; pin `@types/three` to match three. |
| Renderer | `new THREE.WebGPURenderer({ canvas: context.canvas, context, device, antialias })`. **Pass our own `GPUDevice`**, or the renderer requests its own and we can't share or tear it down. Don't call `context.configure()`: the renderer does it. | One shared device for both stages. |
| Frame loop | `renderer.setAnimationLoop(cb)`, then `context.present()` **after every render**, because RN doesn't swap frames itself. If you drive `render()` yourself, `await renderer.init()` first. | Our loop: update uniforms → `pipeline.render()` → `present()`. |
| Pixel density | Size the buffer as `canvas.width = canvas.clientWidth * PixelRatio.get()` (and height), and recompute on resize. `getContext` is sync; if the layout size is 0, retry on the next frame. | Handle in the stage's layout effect. |
| Transparency | Transparent canvas = `opaque={false}` + premultiplied alpha + an alpha-0 clear (on iOS, alphaMode is what controls it). | We render **opaque** with the clear colour set to `tokens.surface.background`: simpler and faster. |
| Post-processing | `PostProcessing.tsx` uses `new THREE.RenderPipeline(renderer)`, `pass(scene, camera)`, `bloom()` from `three/addons/tsl/display/BloomNode`, and `outputNode = color.add(bloom)`. `PostProcessing` was renamed `RenderPipeline` in r183. | Same pattern for our bloom. |
| Teardown | `setAnimationLoop(null)` **alone leaks**. `renderer.dispose()` stops three's internal RAF. Known **three r184+ leak** ([#445](https://github.com/wcandillon/react-native-webgpu/issues/445)): stale listeners on the module-level shared `QuadMesh` geometry hold on to disposed backends. The example's `disposeWebGPURenderer()` clears them, "**safe while the app has at most one live renderer**". | We'll briefly have two renderers (detail over Timeline), so clear listeners only when the **last** live renderer is disposed (see the registry below). |
| Images | RN provides `createImageBitmap(blob \| ArrayBuffer)` for use with `copyExternalImageToTexture`. Three's `TextureLoader` (DOM `<img>`) won't work. | Fetch cover → `createImageBitmap` → `THREE.Texture`. **Not documented: whether three's WebGPU backend accepts RN's ImageBitmap as a texture source. Phase 0 gate G1.** |
| Assets | Three's loaders take URLs. Register `glb`/`hdr` in Metro `assetExts` and use `Image.resolveAssetSource(require(...)).uri`. Release builds flatten asset paths, so **ship self-contained `.glb`**, not `.gltf` + `.bin`. | Only matters if we add a modelled projector. |
| Threads | Default: render on the JS thread. Worklet or UI-thread rendering is possible (`installWebGPU()`, device created on JS then passed in), but running whole three scenes off the JS thread needs **experimental Worklets Bundle Mode**. `device.lost` only fires on the main JS runtime. | v1 renders on the JS thread (the library's documented default); off-thread rendering is a stretch phase. |
| Shared device | `GPUDeviceProvider` / `useMainDevice` share a device, but the provider **renders `null` until the device is ready**. | Don't wrap the app root in it. Use a lazy module singleton instead (below). |
| Testing | Jest mock `react-native-webgpu/jestSetup.js` exists. | We use Vitest in a node environment, so keep GPU code out of `*.test.ts` modules. |

## Architecture

```
lib/holo3d/                      pure TS, unit-tested (Vitest)
  pager.ts                       scroll offset → per-page world X / rotation / visibility
  texture-window.ts              which page indices need textures (active ±1), LRU eviction order
  params.ts                      tokens.holo → linear-RGB uniform values; reduce-motion presets

components/holo3d/
  gpu.ts                         lazy device singleton + renderer registry + safe dispose
  textures.ts                    cover URI → ImageBitmap → THREE.Texture cache (LRU), disposal
  scene.ts                       buildHoloScene(): card, emitter, beam, particles, lights, camera
  materials.ts                   TSL: holoCardMaterial, beamMaterial, emitterMaterial, particleMaterial
  pipeline.ts                    RenderPipeline + bloom
  HoloStage.tsx                  <Canvas> + renderer lifecycle + frame loop (multi-card, Timeline)
  HoloHero3D.tsx                 single-card stage for book detail (+ gyro tilt)
  HoloFallback.tsx               error boundary → existing static HoloCover hero
```

### GPU device and renderer lifecycle (`gpu.ts`)

- **Device:** `getHoloDevice(): Promise<GPUDevice>` calls `navigator.gpu.requestAdapter()` → `requestDevice()` once, then memoizes it.
  - If WebGPU isn't available, the adapter is `null`, or device creation throws, it resolves to `null` and callers render `HoloFallback`.
  - It subscribes to `device.lost` on the JS runtime: clear the memo, then remount live stages once. A second loss means a permanent fallback for the session.
- **Renderer registry:** `createHoloRenderer(context, device)` wraps `makeWebGPURenderer` and increments `liveRenderers`. `disposeHoloRenderer(renderer)`:
  - always calls `setAnimationLoop(null)` and `renderer.dispose()`
  - clears the `QuadMesh` listeners (#445) only when `liveRenderers` hits 0
  - **Upgrade note:** re-check #445 before upgrading three. If it's fixed upstream, delete the listener clearing.
- **No `GPUDeviceProvider` at the root:** it would block the whole app tree on device creation, and request a GPU on launch even for users who never open the Timeline.

### Cover textures (`textures.ts`)

- `loadCoverTexture(uri)` does `fetch(uri)` → `arrayBuffer()` → `createImageBitmap(buf)` → `new THREE.Texture(bitmap)`. It sets:
  - `colorSpace = SRGBColorSpace`
  - `generateMipmaps = true` (the card tilts, so it needs mips)
  - `anisotropy` = 4
- The cache holds at most **5** textures, keyed by URI. Evicting one calls `texture.dispose()` and `bitmap.close()`. Both stages share the cache.
  - Each renderer still uploads its own GPU copy; the cache saves the network fetch and decode.
- **Size:**
  - Covers can be up to 1200×1800, which is ~8.6 MB RGBA each, plus ~33% for mips.
  - Five cached means about 57 MB worst case. Check in G4. If it's too much:
    - use `createImageBitmap` resize options (verify they're supported in RN), or
    - drop the cache to 3.
- **Upload cost:** the mesh plan flagged ~30–80 ms on the JS thread for texture upload. Measure in G2. If it's noticeable, prefetch textures for the active page ±1 while the pager is idle.
- **Books with no cover image (or a failed load):**
  - The card uses a procedural texture: a solid `getCoverColor(title)` fill with the same scanline treatment.
  - The title and author render as **RN `Text` in the transparent pager cell above the stage**, the same way the 2D fallback does today.
  - It's fine that the text isn't projected; it stays legible.

### The hologram look (`scene.ts`, `materials.ts`, `pipeline.ts`)

All geometry is procedural in code. No external 3D assets in v1, so there's no asset pipeline and no `.glb`.

| Element | Geometry | Material (TSL sketch; verify node names against r186) |
|---|---|---|
| **Card** | `RoundedBoxGeometry` (addons), 2:3 aspect, thin depth (~0.02), radius matching the 8pt corner | `MeshBasicNodeMaterial` (unlit, emissive look). `colorNode`:<br>• the cover's `texture()` → luminance → `mix(tintBottom, tintTop, lum)` (the luminosity blend, now in-shader)<br>• scanlines: `fract(uv().y * N - time * speed)` step, at about today's 12pt pitch<br>• chromatic fringe: R/B sampled at `uv() ± dir * k`<br>• flicker: `0.92 + 0.08 * noise(time)`, rare dropout bands<br>• fresnel rim: `pow(1 - abs(dot(normalView, positionViewDirection)), p)` × cyan<br>• tilt sheen: thin-film-ish hue shift driven by a `uTilt` uniform<br>`transparent`, `opacity` ~0.92, `depthWrite: false` |
| **Emitter** | Flat ring (`RingGeometry`) + disc under the card | Additive, `cyan` × pulse (`sin(time)`, today's 2.8 s period) |
| **Beam** | Open-ended `CylinderGeometry` / cone from emitter to card bottom | Additive, `side: DoubleSide`, alpha = vertical gradient × soft edges (view-angle falloff) × slow noise streaks. Replaces today's `LinearGradient` cone. |
| **Particles** | `InstancedMesh` of small quads (~150), pattern from `InstancedMesh.tsx` | Additive sprites, drifting upward in the beam (position from `instanceIndex` + `time` in TSL; no per-frame JS) |
| **Bloom** | `RenderPipeline`: `pass(scene, camera)` → `bloom(color, strength, radius, threshold)` → `color.add(bloom)` | Same pattern as `PostProcessing.tsx`. Tune so the bloom matches today's `holoBloom` box-shadow. Tone mapping: `NeutralToneMapping` (as in the example) or none; decide in Phase 2. |

- **Lights:** none needed (unlit and additive).
- **Camera:** `PerspectiveCamera` with a low FOV (~30°) so the card looks flat-on at rest.
- **Colours:** come from `lib/holo3d/params.ts`, converted from `tokens.holo` (sRGB → linear). This keeps theming working (CLAUDE.md principle 5).
- **Reduce motion:** `params.ts` exports a still preset: no flicker, static scanlines, frozen particles, no tilt. The loop still renders whenever inputs change.

### Timeline: one shared stage behind the pager

```
<View listWrap>
  <HoloStage style={absoluteFill} books={data.books} scrollX={scrollXRef} />   ← one Canvas, one renderer
  <FlashList horizontal … renderItem={TransparentPage} onScroll={…} />          ← gestures, a11y, overlays
</View>
```

- **Pages become transparent cells.** Each is a `Pressable` with `accessibilityLabel="{title} by {author}"`, plus any overlays: the no-cover title text, and canon badges if the [timeline-improvements plan](2026-07-01-feat-timeline-tab-improvements-plan.md) ships them. The 3D content is behind the list, so FlashList keeps paging, snapping, viewability and VoiceOver.
- **Scroll sync:** `onScroll` (`scrollEventThrottle={16}`) writes `contentOffset.x` into a ref. The frame loop reads the ref and positions cards with `lib/holo3d/pager.ts`:
  - `pageX(i) = i * width - scrollX` maps to world X
  - cards more than one page away are hidden
  - a slight carousel-style Y-rotation and fade on cards leaving centre
  - The JS-thread loop and JS-thread scroll events share one clock, so cards stay locked to the finger.
- **Card pool:** 3 card meshes (previous, active, next) are reused. On `activePage` change, their textures are rebound from the cache. `lib/holo3d/texture-window.ts` decides what to load and evict. One emitter, beam and particle system stays fixed at screen centre: the projector is "the device", and covers slide through its beam.
- **Pausing** (`setAnimationLoop(null)`, renderer kept alive) when:
  - the screen isn't focused (`useIsFocused`), e.g. book detail pushed or another tab selected
  - `AppState !== 'active'`
  - Resume on refocus without re-init.
- **Frame rate:** render at display rate while scrolling. When idle, throttle to 30 fps by skipping frames in the loop (the ambient animation doesn't need 120 Hz). Verify in G3 that ProMotion behaves.
- **Delete** the per-page `HoloCover` hero from `renderItem`.

### Book detail: single-card hero

- `HoloHero3D` replaces `<HoloCover variant="hero" />` in `app/book/[id].tsx`. It's the same scene with one card and no pager.
  - The canvas is **larger than the card** (≈1.5× the card, centred) so bloom and the beam aren't clipped. Layout keeps the current 200×300 card footprint.
- **First paint:** show static `HoloFace` straight away, then crossfade to the canvas once the first frame is presented. This covers device and init latency, and doubles as the future shared-element target.
- **Tilt:** bring the gyro back for this hero. `useAnimatedSensor(ROTATION)`, baseline latched, clamped to ±15° (logic from `TiltedHero`), drives card rotation and `uTilt`.
  - The value is read from the JS-thread frame loop (`sensor.sensor.value`), so no worklet transform strings are built.
  - This avoids the device-only crash class in memory `project_reanimated_sensor_worklet_crash`.
  - Gated on reduce motion, as today. The simulator doesn't produce motion events, so verify on a device.
- **Timeline paused:** the Timeline is unfocused while detail is up, so its loop is paused and only one renderer is drawing. Both share the device.

### Fallbacks

`HoloFallback` (error boundary + `getHoloDevice() === null`) renders the **existing** `HoloCover` hero code path for:
- no WebGPU
- device loss after the retry
- an init or shader-compile throw
- a feature flag kill-switch: `HOLO_3D_ENABLED` in `constants/` (on by default once shipped)

So the old `Projector` / `TiltedHero` code stays until Phase 5.

## Implementation Phases

### Phase 0 — Spike and go/no-go (throwaway screen, ~1 day)

Install and configure (below), then build a dev-only screen `app/dev/holo-spike.tsx` (`__DEV__` only). It shows **one remote cover** on a textured `RoundedBox` card with the bloom pipeline.

**Gates.** Each needs a pass, or a documented workaround, before Phase 1:
- **G1 Texture path:** an RN `createImageBitmap` result renders correctly as a `THREE.Texture`: right orientation, sRGB, mips.
  - Fallback: build a raw `GPUTexture` via `copyExternalImageToTexture` and wrap it for three. Investigate if G1 fails, because it decides feasibility.
- **G2 Init latency** on device: canvas mount → first presented frame. Target < 400 ms warm, < 1 s cold. Also measure the per-texture upload cost.
- **G3 Frame time** on device: JS-thread frame cost < 4 ms at 60 fps with bloom on. Check ProMotion. If it's over budget, evaluate worklets Bundle Mode early.
- **G4 Memory:** GPU and process memory over **100 mount/unmount cycles** (the `Memory.tsx` method) and 100 texture swaps. No growth after GC.
- **G5 Size:**
  - JS bundle delta via `npx expo export --platform ios` (three's WebGPU build)
  - **IPA size delta** (the Dawn xcframework is the unknown; Apple's over-the-air download limit isn't at risk, but report the number)
- **G6 Simulator:** works with the config plugin; Metal validation is off after `prebuild --clean`.

**Output:** append measurements to the research doc and decide go/no-go with the user.

### Phase 1 — Foundation

- **Dependencies:** `npx expo install react-native-webgpu three fast-text-encoding` and `npx expo install -- --save-dev @types/three`.
  - Pin **exact** `three@0.186.1` and `@types/three@0.186.0`: three breaks APIs between minors (`PostProcessing`→`RenderPipeline` in r183, the #445 leak in r184).
  - Commit `package-lock.json`; use `npm ci` afterwards (memory: `project_npm_ci_not_install`).
- **`app.json`:** add `"react-native-webgpu"` to `plugins`.
- **`metro.config.js`** (new): `getDefaultConfig(__dirname)` + the `three`/`three/webgpu` → `build/three.webgpu.js` alias from the docs.
- **`app/_layout.tsx`:** `import 'fast-text-encoding'` as the first import.
- **Rebuild native:** prebuild and rebuild the dev client, on the iPhone 17 Pro / iOS 26.4 simulator by UDID (memory: `project_simulator_target_device`). Launch Metro via the worktree's own expo binary (memory: `project_nested_worktree_metro_root`).
- **Pure modules + tests:** `lib/holo3d/pager.ts`, `texture-window.ts`, `params.ts`, each with `*.test.ts`:
  - page → X / rotation / visibility at boundaries (first and last page, overscroll)
  - texture window at list ends
  - LRU order
  - token → linear RGB
- `components/holo3d/gpu.ts`, `textures.ts`, `HoloFallback.tsx`, and the `HOLO_3D_ENABLED` flag.

### Phase 2 — The hologram look

- `scene.ts`, `materials.ts`, `pipeline.ts` per the table above, built in the dev spike screen (now a tuning screen). That screen gets preset toggles for:
  - reduce-motion still
  - bloom on/off
  - with and without a cover
- Compare against the Figma projected-cover node (`134:2077`) and today's 2D hero, side by side on the simulator.
- **Exit:** the user approves the look from simulator screenshots or a recording.

### Phase 3 — Timeline integration

- `HoloStage.tsx`: canvas sizing (pixel ratio, resize), the card pool, scroll sync, the texture window, focus/AppState pause, idle throttling.
- Timeline screen: transparent `TransparentPage` cells with a11y labels and the no-cover title overlay; the stage behind; remove the hero `HoloCover` from `renderItem`.
- Verify:
  - fast flings
  - scrubbing via the rail if it lands
  - filter changes, which change the `data.books` identity, so rebind textures
  - first and last page
  - an empty catalog (the existing empty state, with no stage mounted)

### Phase 4 — Book detail hero

- `HoloHero3D.tsx`: an oversized canvas, the `HoloFace` → 3D crossfade, gyro tilt (gated on reduce motion).
- Push detail from the Timeline:
  - the Timeline loop pauses
  - detail renders
  - pop back: the detail renderer is disposed (no listener clearing, since the Timeline renderer is still live) and the Timeline resumes without re-init
- Deep link straight into detail with no Timeline mounted: a single renderer, so listener clearing happens on dispose.

### Phase 5 — Hardening and cleanup

- Repeat G2–G4 on device across the real flows: Timeline ↔ detail × 100, tab switching, background/foreground.
- **Device loss:** simulate via `device.destroy()` in a dev action, then check that the retry and then the fallback work.
- **VoiceOver:** pages read title and author; the canvas is `accessible={false}` / `importantForAccessibility="no-hide-descendants"`.
- **Remove dead code:** once both hero sites have migrated and the flag has been on for a release, delete `HoloCover`'s `hero` branch (`Projector`, `StaticHero`, `TiltedHero`, `variant`/`tilt` props) but keep `HoloFace` (the thumbs plus the fallback/crossfade face). Until then, the hero path stays as `HoloFallback`'s target.
- Update `CLAUDE.md` Design Context with a line on the 3D hero, and update the research doc's status.
- Optional follow-up: write a project skill `.claude/skills/holo-3d` from this plan's verified patterns, pinned to our versions.

### Stretch (not in scope; separate plans)

- **Off-JS-thread rendering** via worklets Bundle Mode (experimental), if G3 shows JS-thread contention while paging.
- **A modelled projector base:** a self-contained `.glb` from Blender, loaded via `GLTFLoader` and Metro `assetExts`.
- **Skia v3 composition** (shared Dawn device, zero-copy) if we later want 2D effects layered over the 3D.

## Acceptance Criteria

**Functional**
- [ ] Timeline renders every hero through **one** canvas and renderer. Cards track the finger during paging with no visible lag, and snap with the pager.
- [ ] Book detail renders the 3D hero with bloom unclipped. The `HoloFace` → 3D crossfade has no blank frame.
- [ ] Books without covers show a tinted card with legible title and author.
- [ ] Archive, Library, added-books sheet and scan review are visually unchanged (`thumb` path untouched).
- [ ] If WebGPU is unavailable, init fails, the device is lost twice, or the flag is off, every hero falls back to today's 2D hero.
- [ ] Reduce Motion: no flicker, scanline motion, particles drift or tilt. The look is otherwise the same.
- [ ] VoiceOver reads each Timeline page as "{title} by {author}". The canvas isn't focusable.

**Performance (physical device, measured in Phase 0 and again in Phase 5)**
- [ ] First 3D frame on detail is < 400 ms warm. Timeline stage init is < 1 s cold, with the static face showing meanwhile.
- [ ] JS-thread frame cost < 4 ms at 60 fps while paging. No dropped frames on the pager.
- [ ] No memory growth after 100 Timeline↔detail cycles and 100 page swaps (after GC).
- [ ] Rendering is paused when the screen is unfocused or the app is backgrounded (CPU/GPU ≈ 0 for the stage).
- [ ] JS bundle and IPA size deltas are reported and accepted.

**Quality gates**
- [ ] `npm run lint`, `npm test`, and `npx tsc --noEmit` pass.
- [ ] `lib/holo3d/*` has unit tests.
- [ ] The simulator runs with the config plugin; flows are verified on a physical device. Gyro and perf are device-only.

## Edge Cases

- **Zero-size layout** on first mount: `getContext` returns null → retry with `requestAnimationFrame` (per the docs).
- **Rotation / iPad split view:** the app is portrait-only, but `supportsTablet` is on, so recompute buffer size on `clientWidth` change.
- **Fast flings across many pages:** the texture window lags behind. Show the procedural tint until the cover arrives, and never block the frame on a load.
- **The same book opened twice in a row:** a cache hit means no fetch.
- **Cover URL 404 or decode failure:** the procedural texture plus the RN title overlay, mirroring `CoverFace`'s `onError`.
- **Filter change while textures are loading:** cancel stale loads by checking the URI on resolve.
- **React Compiler:** keep three objects in refs created inside effects (never in render), and give `HoloStage` stable effect deps. The mesh plan warned the compiler can stale-pin a texture across cover changes, so test a cover change on a mounted detail screen.

## Dependencies and Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| RN `ImageBitmap` not accepted as a three texture source | Medium | Gate G1 on day 1; raw `GPUTexture` wrap as fallback. |
| `react-native-webgpu` is a "technical preview" | Medium | Pin versions, keep the kill-switch flag and 2D fallback, and test on device before every bump. |
| three API churn between minors (r183 rename, r184 leak) | High over time | Pin exact versions; the upgrade checklist re-checks #445 and the `RenderPipeline`/`bloom` APIs. |
| JS-thread contention (FlashList + React + render loop) | Medium | Light scene (≤3 cards, ~6 draw calls), idle throttling, pause when unfocused; Bundle Mode is the stretch escape hatch. |
| IPA size growth from Dawn | Unknown | Measure in G5 and decide with the user. |
| Battery/thermal from continuous animation | Medium | 30 fps when idle, pause when unfocused or backgrounded, reduce-motion still mode. |
| Simulator isn't representative (perf, gyro) | Certain | Device runs are required for perf and tilt sign-off. A physical iPhone can't reach the dev server (memory: `feedback_expo_go_device`), so use a device build (`npx expo run:ios --device` or an internal EAS build). |

## Alternatives Considered

The research doc has the full comparison. In short:
- **Skia SkSL:** cheapest, but no real geometry or lighting.
- **Native Metal / RealityKit:** iOS-only, outside Reanimated, more Swift.
- **R3F:** native support isn't ready (`@react-three/native` says "do not use yet"), and we don't need JSX scene graphs for ≤3 objects.
- **Per-page canvases:** N devices, pipelines and inits. The shared stage pays once.

## References

**Internal**
- [Research and decision](../brainstorms/2026-10-14-holo-cover-gpu-upgrade-research.md)
- [components/holo-cover.tsx](../../components/holo-cover.tsx), [app/(tabs)/timeline/index.tsx](../../app/(tabs)/timeline/index.tsx), [app/book/[id].tsx](../../app/book/[id].tsx), [constants/tokens.ts](../../constants/tokens.ts)
- [Deferred mesh plan (gap list)](2026-05-01-feat-3d-book-covers-real-mesh-renderer-plan.md#if-we-ever-do-build-the-real-mesh), [Timeline improvements plan](2026-07-01-feat-timeline-tab-improvements-plan.md)

**External**
- react-native-webgpu docs: [three.js](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/integrations/three-js.mdx), [canvas](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/canvas.mdx), [native APIs](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/native-api.mdx), [React APIs](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/react-api.mdx), [worklets](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/integrations/worklets.mdx), [Expo](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/getting-started/expo.mdx)
- Examples: [`PostProcessing.tsx`](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/example/src/ThreeJS/PostProcessing.tsx), [`Memory.tsx`](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/example/src/ThreeJS/Memory.tsx), [`InstancedMesh.tsx`](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/example/src/ThreeJS/InstancedMesh.tsx), [`makeWebGPURenderer.ts`](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/example/src/ThreeJS/components/makeWebGPURenderer.ts)
- [Leak issue #445](https://github.com/wcandillon/react-native-webgpu/issues/445), [three.js WebGPURenderer manual](https://threejs.org/manual/en/webgpurenderer)
