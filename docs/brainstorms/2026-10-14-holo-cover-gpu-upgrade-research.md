---
title: "Research: GPU/shader upgrade for the hologram cover (Timeline tab)"
type: research
date: 2026-10-14
status: research — no decision yet
related:
  - components/holo-cover.tsx
  - app/(tabs)/timeline/index.tsx
  - docs/plans/2026-05-01-feat-3d-book-covers-real-mesh-renderer-plan.md
---

# Hologram cover: GPU and shader upgrade research

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

## Recommended path
1. **Spike A on the Timeline:** Skia 2.15.x, one `HoloShader` component, mounted on the active page ±1, with tilt turned back on.
   - Measure the binary size change, first-frame time when paging, GPU memory over 100 page flips, and FPS on a device. The simulator ignores the gyro.
2. If the spike holds up, use the same component for the detail hero, and keep thumbnails as they are.
3. Move to Skia v3 once it's stable, then decide whether C (a real 3D book on the detail screen) is worth it.
4. Keep B as the fallback if Skia's binary size or double image decoding turns out to cost too much.

## Skills for 3D/shader work

**Already installed (`~/.agents/skills`):**
- `overdrive` — ambitious shader and motion UI
- `expo-module` — Swift module and native view, needed for option B
- `expo-ui` — SwiftUI from React, including custom modifiers
- `swiftui-expert-skill` / `swiftui-pro` — `visualEffect` and SwiftUI performance
- `react-native-best-practices` (Callstack) — Reanimated and native performance

None of the installed skills cover Skia shaders, WebGPU or three.js.

**Candidates to add.** All are third-party; read each SKILL.md before installing.

| Skill | Covers | Install |
|---|---|---|
| `software-mansion-labs/skills` → `animations` | Reanimated 4, Skia, react-native-webgpu, TypeGPU, Reanimated↔WebGPU worklets, GPU particles | `npx skills add software-mansion-labs/skills --skill animations --agent claude-code` |
| `andreev-danila/skills` → `reanimated-skia-performance` | Skia RuntimeEffect with animated uniforms, diagnosing jank | `npx skills add andreev-danila/skills --skill reanimated-skia-performance --agent claude-code` |
| `tristanmanchester/agent-skills` → `react-native-skia` | Skia in Expo, RuntimeShader | `npx skills add https://github.com/tristanmanchester/agent-skills --skill react-native-skia` |
| madebyecho `react-native-skia-shaders` | SkSL techniques: SDFs, noise, lighting, post-processing | via skillsmp.com |
| `enzed/r3f-skills` → `r3f-shaders`, `r3f-postprocessing` | R3F `shaderMaterial`, bloom (web-first; only useful if we take option C) | `npx skills add enzed/r3f-skills --skill r3f-shaders --agent claude-code` |
| `OpenAEC-Foundation/Three.js-Claude-Skill-Package` | 24 skills: three r160+, R3F, WebGPU (web-first) | clone into `.claude/skills` |
| `vladimirbrejcha/ios-ai-skills` → `swiftui-animation` | SwiftUI `colorEffect`/`layerEffect`/`ShaderLibrary`, with a `metal-shaders.md` reference | `npx skillscat add vladimirbrejcha/ios-ai-skills/swiftui-animation` |
| `dpearson2699/swift-ios-skills` → `realitykit` / `charleswiltgen/axiom` → `axiom-realitykit` | RealityKit `RealityView` (only if we try that path) | `npx -y skills add charleswiltgen/axiom --skill axiom-realitykit --agent claude-code` |

**Picks for option A:** Software Mansion `animations` plus `reanimated-skia-performance`. **For option B, add:** `swiftui-animation`.

## Not verified
- Measured Skia and Dawn binary sizes, Canvas init time, and GPU memory per instance.
- Whether the SDK 56 pin of Skia 2.6.2 conflicts with 2.15.x. Check what `npx expo install` resolves.
- The contents and maintenance status of the third-party skills (I only saw directory listings).

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
