---
title: "Research: GPU/shader upgrade for the hologram cover (Timeline tab)"
type: research
date: 2026-10-14
status: decided (2026-10-14) — WebGPU + three.js (option C)
related:
  - components/holo-cover.tsx
  - app/(tabs)/timeline/index.tsx
  - docs/plans/2026-05-01-feat-3d-book-covers-real-mesh-renderer-plan.md
---

# Hologram cover: GPU and shader upgrade research

## Decision (2026-10-14)

**Build on `react-native-webgpu` + three.js (`three/webgpu`, TSL).** The goal is real 3D assets and lighting, which rules out a 2D shader: we want geometry, lights that move across surfaces, a beam with volume, particles and bloom. That puts option C, not option A, at the centre of the work.

**Scope.** The split follows the existing `HoloCover` `variant` prop:

| Surface | Today | After |
|---|---|---|
| Timeline tab (`app/(tabs)/timeline/index.tsx`) | `variant="hero"` | **New 3D cover** |
| Book detail (`app/book/[id].tsx`) | `variant="hero"` | **New 3D cover** |
| Archive/Library rows (`components/book-card.tsx`) | `variant="thumb"` | Unchanged: current `HoloCover` and styles |
| Added-books sheet, shelf scan review | `variant="thumb"` | Unchanged |

`HoloCover`'s `thumb` path and its styles (tint, luminosity blend, scanlines, edge glow) stay as they are. The 3D cover is a new component used only on the two hero surfaces, and `HoloFace` stays as its placeholder while loading and its fallback when there's no GPU. Once nothing uses the old `hero` variant (projector beam, gyro tilt), it can be removed.

This reverses the May 2026 deferral. Two things answer its cost objection:
- **One persistent canvas behind the Timeline pager.** There's one GPU device and one renderer. Paging swaps the cover texture and animates the transition. Init and GPU memory are paid once per tab, not once per page.
- **The detail screen gets its own canvas while it's open.** Pushing it from the Timeline means two canvases are live at once, so it should either share the GPU device or the Timeline should pause rendering while it's covered.
- **Lists never touch the GPU.**
- **Shared-element transitions (agreed):** item 8 of the May plan applies. A list thumbnail, which is an RN view, can't shared-element-transition into a GPU canvas. If detail transitions are wanted later, transition into the static `HoloFace` and crossfade to 3D.

The scope and the points above were agreed with the product owner on 2026-10-14.

The rendering-cost list in [the May plan](../plans/2026-05-01-feat-3d-book-covers-real-mesh-renderer-plan.md#if-we-ever-do-build-the-real-mesh) still applies:
- disposal
- texture downsampling and mipmaps
- crossfading from the static face while the renderer starts
- bridging Reanimated values to the render loop
- a 100-cycle leak test

Its stack note needs updating: the package is now `react-native-webgpu`, and R3F is maintained but its native support isn't ready (see the table below).

Skills research comes next, scoped to this stack.

## Current state

[components/holo-cover.tsx](../../components/holo-cover.tsx) is made of plain RN Views:
- a blue `LinearGradient` under the cover, with `mixBlendMode: 'luminosity'` on the cover
- one `View` per scanline, at a 12px pitch
- an inset `boxShadow` edge glow and an outer cyan `boxShadow` bloom
- a `LinearGradient` beam cone and emitter that pulse their opacity through `withRepeat`
- optional gyro tilt (`useAnimatedSensor` → `rotateX`/`rotateY`), which is currently **off** on the Timeline (`tilt={false}`)

The Timeline is a horizontal snap-paged FlashList with one hero per page, so only 1–3 heroes are mounted at once. That keeps a per-page GPU canvas affordable. The list thumbnails must stay static.

Nothing in the current stack works per pixel, so effects like chromatic aberration, glitch displacement, rim light, iridescence and particles aren't possible today.

## Ecosystem changes since the May 2026 mesh plan (versions checked on npm)

| Item | Status |
|---|---|
| Skia | Package renamed: `@shopify/react-native-skia` stops at **2.14.0**. The new package is **`react-native-skia`** in the `wcandillon/react-native-skia` repo. `latest` is **3.4.4** (v3 = Graphite on Dawn/WebGPU, released 2026-10-05) and `release-2.x` is **2.15.1**. Expo SDK 56 pins 2.6.2. |
| WebGPU | `react-native-wgpu` was renamed **`react-native-webgpu`** (latest **0.14.2**). It ships an Expo config plugin, and its README still calls it a technical preview. |
| three.js | **r186.1**. `three/webgpu` and the TSL node shaders run on react-native-webgpu (Hermes needs a `TextDecoder` polyfill). |
| R3F | **9.8.2** is maintained, which corrects the May note that called it "unmaintained since 2023". Its native entry is still expo-gl with known performance problems. The WebGPU-based `@react-three/native` (v10) isn't published and is marked "do not use yet". Drei has no native export. |
| TypeGPU | **0.12.7** (Software Mansion). Lets you write WGSL shaders in TypeScript, and works with react-native-webgpu. |
| expo-three | Abandoned (last release 2024-07, peer dep `three ^0.166`). expo-gl is OpenGL ES, which Apple has deprecated. |
| Filament | `react-native-filament` **1.11.0**. A PBR/glTF engine that releases slowly, so it doesn't fit 2D shader effects. |
| Expo | **SDK 57** shipped (RN 0.86, Reanimated 4.5). We're on 56. |

## Options

### A. Skia `RuntimeShader` (SkSL) — recommended first step
One SkSL shader takes the cover as `uniform shader image` and adds:
- scanlines
- RGB split / chromatic aberration
- glitch bands and flicker
- a fake fresnel rim based on distance to the edge
- thin-film iridescence that shifts with tilt

Reanimated shared values bind straight to uniforms, so the whole chain stays on the UI thread with no JS work per frame: `useAnimatedSensor` → `useDerivedValue({ time, tilt })` → `uniforms`. The beam cone and particles (`Points`/`Atlas`) go in the same Canvas with additive blending.

- **Pros:** most features for the least cost. Works cross-platform. Reuses the Reanimated knowledge we already have. Canvas setup takes about one frame.
- **Cons:** a native binary of several MB (not measured). Skia decodes images itself, so each cover is held twice alongside expo-image's copy, which is fine for 1–3 pages. Shaders should be supersampled by `PixelRatio`.
- **Pager rule:** mount a Canvas only on the active page ±1. Every other page renders the current static `HoloFace`.
- **v2 or v3:** the shader API is the same in both. v3 adds a zero-copy path to WebGPU/three.js later, but it's 9 days old and gets daily patches. Start on **2.15.x** and move to v3 once it settles.
- **Starting points:**
  - `react-native-skia-shaders` (Paper Shaders ported to SkSL)
  - the Skia example app's `glitchMemories` shader
  - [ShaderKit](https://github.com/jamesrochabrun/ShaderKit)'s holographic card shaders, as a source of math to port

### B. SwiftUI Metal shader through a local Expo module — iOS-native option
`@expo/ui` 56 exposes a public `ViewModifierRegistry` and `createModifier`. I confirmed both in `node_modules/@expo/ui/ios/Modifiers/ViewModifierRegistry.swift`. A local module could register a `holoShader` modifier made of one Swift file plus one `.metal` file, built on `layerEffect` / `colorEffect` / `distortionEffect`, available since iOS 17.

- **Blocker:** `layerEffect` doesn't render UIKit-backed views, so it can't wrap expo-image or an RN child. The cover would have to load natively as a SwiftUI `Image`, which means a custom SwiftUI view rather than just a modifier.
- **Animation:** time and gyro would run natively (`TimelineView` + CoreMotion), not through Reanimated.
- **Pros:** lowest runtime cost. Metal-quality output. WWDC26 session 322 covers this exact cover-art pattern.
- **Cons:** iOS only. More Swift to maintain. Not part of the Reanimated and shared-element world.

### C. react-native-webgpu + three.js (TSL) or TypeGPU — real 3D
This is the route for a real book mesh, a volumetric beam, GPU particles and real post-process bloom. The cost objections in the May plan still apply: ~150 KB+ of JS, async renderer init, tens of MB of GPU memory, and a device and pipeline per canvas. It's acceptable on the **detail screen hero only**, not one per Timeline page. Skia v3 makes this cheaper later, because Skia and three.js can share a GPU device and composite with no copy.

### D. Not recommended
- expo-three
- R3F over expo-gl
- Filament
- a RealityKit `RealityView` per page (no maintained RN wrapper, and a full 3D renderer per view is overkill for a textured card)

iOS 26 adds nothing specific beyond Liquid Glass, which we already use.

## Recommended path (pre-decision; superseded by the decision above)
1. **Spike A on the Timeline:** Skia 2.15.x, one `HoloShader` component, mounted on the active page ±1, with tilt turned back on.
   - Measure the binary size change, first-frame time when paging, GPU memory over 100 page flips, and FPS on a device. The simulator ignores the gyro.
2. If the spike holds up, use the same component for the detail hero, and keep thumbnails as they are.
3. Move to Skia v3 once it's stable, then decide whether C (a real 3D book on the detail screen) is worth it.
4. Keep B as the fallback if Skia's binary size or double image decoding turns out to cost too much.

## How 3D has been done in React Native (prior art and docs)

npm figures are monthly downloads, checked 2026-10-14.

| Era / approach | Package (latest, downloads/mo) | Status | Docs |
|---|---|---|---|
| **2017+: WebGL over OpenGL ES** — three.js on `expo-gl` via `expo-three` | `expo-gl` 57.0.2 (1.05M) · `expo-three` 8.0.0 (239K) | expo-gl is still shipped, but OpenGL ES is deprecated on Apple. expo-three's repo hasn't been pushed since 2024-07, and developers report slow model loading on the JS thread. | [expo-three](https://github.com/expo/expo-three), [three.js forum](https://discourse.threejs.org/t/threejs-with-react-native-using-expo/20598) |
| **R3F on native** — `@react-three/fiber/native` over expo-gl | `@react-three/fiber` 9.8.2 | The native path has known performance problems. The WebGPU successor `@react-three/native` isn't on npm, and its README says "do not use yet". | [pmndrs/native](https://github.com/pmndrs/native), [state of R3F in Expo](https://trifonstatkov.medium.com/the-current-state-of-using-react-three-fiber-in-react-native-expo-c65918593eaf) |
| **Babylon React Native** (Microsoft/Babylon team) — Babylon Native C++ engine | `@babylonjs/react-native` 2.0.6 (1.7K) | Active: released 2026-10-12, peers `react-native: *`, `@babylonjs/core >=9`. The README still says "early phase" (touch input only, single view), and the forum shows people hitting version lag. Babylon, not three.js. | [repo](https://github.com/BabylonJS/BabylonReactNative), [Babylon blog](https://babylonjs.medium.com/babylon-react-native-bringing-3d-and-xr-to-react-native-applications-7928b55acc85) |
| **ViroReact** — AR/VR scenes | `@reactvision/react-viro` 3.0.3 (20K) | Maintained (ReactVision, 1.8K★, pushed 2026-10-12). Built for AR/VR, so it's the wrong tool for an in-app card. | [repo](https://github.com/ReactVision/viro), [docs](https://docs.viromedia.com/docs/3d-objects) |
| **Filament** (Margelo) — Google's Filament PBR engine over JSI | `react-native-filament` 1.11.0 (53K) | Maintained but slow (last release 2026-05). Uses glTF and its own declarative API; custom materials need its `matc` compiler. | [repo](https://github.com/margelo/react-native-filament) |
| **Game engines embedded** — Unity as a Library, Godot | `@azesmway/react-native-unity` (6.7K) · `react-native-godot` (381) | Niche. A whole engine runtime for one view. | — |
| **2024+: WebGPU (Metal on iOS)** — three.js `WebGPURenderer` on `react-native-webgpu` | `react-native-webgpu` 0.14.2 (140K, 1.3K★, pushed today) | **The current, documented path, and the one we chose.** Backed by Shopify and Software Mansion. Its README still calls it a technical preview. | see below |

**Primary documentation for our stack:**
- **react-native-webgpu → [Three.js integration](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/integrations/three-js.mdx)** (published at https://wcandillon.github.io/react-native-webgpu/). It covers:
  - import from `three/webgpu`
  - a Metro alias for `three/addons`
  - the `fast-text-encoding` polyfill for Hermes
  - `@types/three` tsconfig setup
  - creating `WebGPURenderer` with our own `GPUDevice` (so we can tear it down and share it)
  - `setAnimationLoop()` + `context.present()` every frame
  - `await renderer.init()` if we drive frames ourselves
  - There's also a **hosted Expo template** with a Three.js option. Sibling page: [react-three-fiber.mdx](https://github.com/wcandillon/react-native-webgpu/blob/main/apps/docs/content/docs/integrations/react-three-fiber.mdx).
- **The library's example app, [`apps/example/src/ThreeJS/`](https://github.com/wcandillon/react-native-webgpu/tree/main/apps/example/src/ThreeJS)**, has working RN screens that map straight onto our needs:
  - `PostProcessing.tsx` → bloom
  - `List.tsx` → canvases in a list or pager
  - `Memory.tsx` → teardown and leak behaviour
  - `ToneMapping.tsx`
  - `Helmet.tsx` → glTF PBR with an HDR environment
  - `InstancedMesh.tsx` → particles
  - `Backdrop.tsx`, `Fiber.tsx` (R3F)
- **Shopify Engineering, [The Future of React Native Graphics: WebGPU, Skia, and Beyond](https://shopify.engineering/webgpu-skia-web-graphics)** (2025): the rationale and roadmap. three.js examples run unchanged on RN WebGPU, and Skia Graphite will let Skia and three.js share a GPU device.
- **Software Mansion, [react-native-webgpu-worklets](https://github.com/software-mansion-labs/react-native-webgpu-worklets)**: three.js, wgpu-matrix and TypeGPU running on Reanimated worklets on the UI thread. Its last push was 2025-08 (0.3.0, 367/mo), so treat it as a reference; react-native-webgpu now supports worklet runtimes itself.
- **three.js manual, [WebGPURenderer](https://threejs.org/manual/en/webgpurenderer)** and the official `webgpu_*` examples at r186, for TSL, `RenderPipeline` and bloom.

**Conclusion:** we don't need a third-party skill to learn this stack. The library's own docs plus its example screens are the authoritative reference. A project skill distilled from them, pinned to our versions, beats any skill on skills.sh.

## Skills for the chosen stack (WebGPU + three.js)

**Method.** I searched the skills.sh search API (`/api/search`) for: webgpu, threejs, three, tsl, typegpu, shader, r3f, react three fiber, webgl, 3d, postprocessing, bloom, wgsl, react-native-webgpu and lighting. Anything under **1,000 installs** was dropped. I then read the SKILL.md and references of each finalist from GitHub; nothing was installed. Install counts are a weak signal: identical "product-photography" clones and browser-evasion skills sit at 18K–94K installs.

**The projects behind the stack don't publish relevant skills.** three.js/mrdoob has none. wcandillon (react-native-webgpu, Skia) has none. pmndrs's best is 248 installs. Shopify's skills are commerce-only, and Margelo's are MMKV, Nitro and VisionCamera. Below are the company-published skills plus the strongest individual ones:

| Skill | Installs | Publisher | Covers our stack? | Fit |
|---|---|---|---|---|
| `dgreenheck/webgpu-claude-skill` → `webgpu-threejs-tsl` | 1,282 | Dan Greenheck: three.js educator (threejsroadmap.com, EZ-Tree), 1.2K★ repo | Yes: `three/webgpu` + TSL node materials, `Fn()`, compute, post-processing, device loss. Aligned to **r183** (we're on r186). Examples use the DOM, so they need adapting to the RN canvas. No license. | **High** — shaders and materials |
| `software-mansion-labs/skills` → `react-native-best-practices` | 5,434 | **Software Mansion** (Reanimated, worklets, TypeGPU), MIT | Its `references/animations/gpu-animations.md` covers the react-native-webgpu canvas and device, the required `context.present()`, passing the device to worklets via `scheduleOnUI`, and minimum versions (Reanimated ≥4.2.1, worklets ≥0.7.2; we meet both). It uses the package's old name `react-native-wgpu`. three.js coverage is about 15 lines, with no TSL. | **High** — RN↔GPU glue |
| `emalorenzo/three-agent-skills` → `three-best-practices` | 1,331 | Emanuel Lorenzo, individual creative dev | Mostly WebGL-first, but has TSL, mobile-optimization, `shader-mobile` and disposal rules (three 0.182+). Only 26 of ~120 indexed rule files exist, and it recommends the deprecated `renderAsync`. | Medium — performance and disposal |
| `software-mansion-labs/skills` → `typegpu` | 1,536 | **Software Mansion** | Raw TypeGPU/WGSL, including `@typegpu/react` on RN worklets. Explicitly not three.js. Its setup tells the agent to swap `typescript` for `npm:tsover` and run `npx typegpu --enhance`; we'd decline both. | Medium — only if we add raw compute passes |
| `expo/skills` → `expo-animation` | 12,563 | **Expo** (with Emil Kowalski), MIT | Reanimated, gestures and router transitions. No WebGPU, three.js or shaders. Runs `npx submit-expo-feedback` for feedback. | Low |
| `cloudai-x/threejs-skills` (fundamentals, shaders, lighting, postprocessing) | 11K–15K | Anonymous account created 2026-01; one commit dump, never updated | WebGL + GLSL only. Its single WebGPU snippet uses outdated imports and a class r183 renamed. | Low — points to the wrong renderer |
| `heygen-com/hyperframes` → `three` / `typegpu` | 69K / 51K | **HeyGen** | Browser `WebGLRenderer`/`navigator.gpu` tied to HyperFrames video rendering. Both standalone skills were removed on 2026-06-14. | None |
| `vercel-labs/json-render` → `react-three-fiber` | 2,247 | **Vercel Labs** | JSON-described R3F scenes for json-render only. | None |

**Picks:**
1. **`dgreenheck/webgpu-threejs-tsl`** — the three.js layer: TSL materials, the holo shader, bloom.
2. **Software Mansion `react-native-best-practices`** — the React Native layer: webgpu canvas, worklets, Reanimated-driven uniforms. Its name clashes with the installed Callstack `react-native-best-practices`, so install it under a different name or keep only `references/animations/`.
3. *(Optional)* `emalorenzo/three-best-practices` for mobile performance and disposal. Ignore its WebGL defaults and `renderAsync` advice.

Read before installing. dgreenheck and emalorenzo have no LICENSE file. Nothing in either runs scripts.

## Earlier skills survey (pre-decision)

**Already installed (`~/.agents/skills`):**
- `overdrive` — ambitious shader and motion UI
- `expo-module` — Swift module and native view, needed for option B
- `expo-ui` — SwiftUI from React, including custom modifiers
- `swiftui-expert-skill` / `swiftui-pro` — `visualEffect` and SwiftUI performance
- `react-native-best-practices` (Callstack) — Reanimated and native performance

None of the installed skills cover Skia shaders, WebGPU or three.js.

**Candidates to add.** All are third-party; read each SKILL.md before installing. Install counts are from skills.sh as of 2026-10-14, sorted high to low within each group.

| Skill | skills.sh installs | Covers | Install |
|---|---|---|---|
| **Skia / React Native GPU (option A)** | | | |
| `andreev-danila/skills` → `reanimated-skia-performance` | **944** | Skia RuntimeEffect with animated uniforms, diagnosing jank | `npx skills add andreev-danila/skills --skill reanimated-skia-performance --agent claude-code` |
| `tristanmanchester/agent-skills` → `react-native-skia` | 112 | Skia in Expo, RuntimeShader | `npx skills add https://github.com/tristanmanchester/agent-skills --skill react-native-skia` |
| `software-mansion-labs/skills` → `animations` | 27 | Reanimated 4, Skia, react-native-webgpu, TypeGPU, Reanimated↔WebGPU worklets, GPU particles. Low count, but published by Reanimated's own maintainers | `npx skills add software-mansion-labs/skills --skill animations --agent claude-code` |
| `madebyecho/agent-skills` → `react-native-skia-shaders` | 4 | 25+ SkSL techniques ported from GLSL: SDFs, noise, lighting, post-processing | `npx skills add madebyecho/agent-skills --skill react-native-skia-shaders` |
| **WebGPU / three.js (option C)** | | | |
| `enzed/r3f-skills` → `r3f-shaders` / `r3f-postprocessing` | 1.8K / 1.8K | R3F `shaderMaterial`, bloom. Web-first | `npx skills add enzed/r3f-skills --skill r3f-shaders --agent claude-code` |
| `software-mansion-labs/skills` → `typegpu` | 1.5K | TypeGPU 0.12, `'use gpu'` TS→WGSL. Web-focused; the page doesn't mention RN | `npx skills add software-mansion-labs/skills --skill typegpu --agent claude-code` |
| `OpenAEC-Foundation/Three.js-Claude-Skill-Package` | 124–148 per skill (3.2K total across 24) | three r160+, R3F, Drei, WebGPU (`threejs-impl-webgpu`: 129), shaders (`threejs-syntax-shaders`: 137). Web-first | `npx skills add OpenAEC-Foundation/Three.js-Claude-Skill-Package --skill <name>` |
| **iOS native (option B)** | | | |
| `dpearson2699/swift-ios-skills` → `realitykit` | 3.1K | RealityKit `RealityView` (only if we try that path) | `npx -y skills add dpearson2699/swift-ios-skills --skill realitykit --agent claude-code` |
| `charleswiltgen/axiom` → `axiom-realitykit` | 153 | RealityKit, migrating from SceneKit | `npx -y skills add charleswiltgen/axiom --skill axiom-realitykit --agent claude-code` |
| `vladimirbrejcha/ios-ai-skills` → `swiftui-animation` | 8 | SwiftUI `colorEffect`/`layerEffect`/`ShaderLibrary`, with a `metal-shaders.md` reference | `npx skills add vladimirbrejcha/ios-ai-skills --skill swiftui-animation` |

What the counts say:
- Usage of React Native GPU skills is thin. Only `reanimated-skia-performance` has real adoption.
- The skills with large counts (r3f, typegpu, the realitykit skill) target web or native Swift, not React Native.

**Picks for option A:** `reanimated-skia-performance` (most used) plus Software Mansion `animations` (fewest installs, but the publisher maintains Reanimated, worklets and TypeGPU). **For option B, add:** `swiftui-animation` (barely used; read it before relying on it).

## Not verified
- Measured Skia and Dawn binary sizes, Canvas init time, and GPU memory per instance.
- Whether the SDK 56 pin of Skia 2.6.2 conflicts with 2.15.x. Check what `npx expo install` resolves.
- The contents and maintenance status of the third-party skills. I checked install counts on skills.sh but haven't read their SKILL.md files.

## Sources
- https://github.com/wcandillon/react-native-skia · https://wcandillon.github.io/react-native-skia/docs/getting-started/migration
- https://github.com/wcandillon/react-native-webgpu
- https://github.com/pmndrs/native · https://github.com/pmndrs/react-three-fiber
- https://github.com/margelo/react-native-filament
- https://docs.expo.dev/guides/expo-ui-swift-ui/extending/
- https://developer.apple.com/documentation/swiftui/view/layereffect(_:maxsampleoffset:isenabled:)
- https://developer.apple.com/videos/play/wwdc2026/322
- https://github.com/jamesrochabrun/ShaderKit
- https://claudeskills.info/zh/skills/software-mansion-labs/skills/animations/
- https://agentskills.so/skills/andreev-danila-skills-reanimated-skia-performance
- https://www.vibeindex.ai/skills/tristanmanchester/agent-skills/react-native-skia
- https://skillsmp.com/creators/madebyecho
- https://vibeindex.ai/skills/enzed/r3f-skills/r3f-shaders
- https://github.com/OpenAEC-Foundation/Three.js-Claude-Skill-Package
- https://playbooks.com/skills/vladimirbrejcha/ios-ai-skills/swiftui-animation
- https://claudemarketplaces.com/skills/charleswiltgen/axiom/axiom-realitykit
