---
title: "feat: 3D Book Covers — Real Mesh + Cover Texturing"
type: feat
date: 2026-05-01
parent: docs/plans/2026-04-10-feat-3d-book-covers-plan.md
status: deferred (2026-05-04) — polish existing viewer instead
---

# 3D Book Covers — Real Mesh + Cover Texturing

> **Decision (2026-05-04): not pursuing.** Reviewed in parallel by DHH-style taste, Kieran TS, simplicity, and performance reviewers. All four converged: the runtime cost (~140–180 KB bundle, 500 ms–1.8 s modal-open latency, ~30 MB GPU baseline, two animation systems to coordinate) outweighs the visible delta inside the rotation range users naturally explore (-30° to 30°). Polish path identified instead — see [Polish path](#polish-path-recommended-instead) below. Kept as reference. Revisit only if a concrete user complaint surfaces about the existing viewer.

## What this plan was

Replace the perspective-transform fake-3D in [components/Book3DViewer.tsx](components/Book3DViewer.tsx) with a real 3D rendered book mesh: textured cuboid, runtime cover-image texture on the front face, gesture-driven rotation in a real GL/WebGPU pipeline. The catalog list (`Book3D.tsx`) would have stayed unchanged.

## Why we're not building it

- **Visible delta is small.** The fake-3D viewer is convincing at -30° to 30° — the range users naturally rotate to. Real-mesh fixes "looks weird at extreme angles in a modal nobody lingers in."
- **Cost is high.** Three.js + GL stack adds ~140–180 KB gzipped bundle, ~30 MB GPU baseline per session, 500 ms–1.8 s modal-open latency without prewarm, and two animation systems (Reanimated UI-thread worklets + Three.js JS-thread RAF) that must be explicitly coordinated.
- **Cheaper alternative gets ~70% of the visual win** for ~0% of the runtime cost. See polish path.
- **The shared-element transitions sibling plan** ([2026-04-22-…shared-element-transitions](docs/plans/2026-04-22-feat-3d-book-covers-shared-element-transitions-plan.md)) is a higher-value polish item for similar effort and ships actual user-felt continuity from list to detail — a win this plan does not deliver.

## Polish path (recommended instead)

A 1–2 hour pass on the existing perspective viewer. Tracked as a small follow-up to the parent plan rather than its own document.

1. **Right-edge page-edge strip** — 3 thin `LinearGradient` lines simulating a stack of pages. Already listed as a "Future Enhancement" in the [parent plan](docs/plans/2026-04-10-feat-3d-book-covers-plan.md).
2. **Sub-layer parallax** — render cover, spine, and page-edge strip as separate `Animated.View`s with different `translateZ` via nested perspective. Adds genuine depth at low cost.
3. **Tighter rotation-coupled lighting** — adjust the existing gradient overlay's interpolation so the highlight tracks rotation more aggressively at extreme angles.
4. **Spine bevel** — add a subtle `borderTopLeftRadius` / `borderBottomLeftRadius` and an inset shadow to the spine strip for depth at the binding edge.

## If we ever DO build the real mesh

The reviewer pass surfaced gaps any future implementation must close. Captured here so the work isn't re-discovered:

1. **Reanimated worklets ↔ Three.js RAF interop is the biggest blind spot.** Two animation drivers, two clocks. Specify the bridge pattern: `useAnimatedReaction` → `useRef` mirror read by the RAF tick is the cheapest. Without this, decay-phase rotation visibly stutters under JS GC.
2. **Disposal must be enumerated, not waved at.** `renderer.dispose()`, `renderer.forceContextLoss()` (for `expo-gl`), `geometry.dispose()`, every material's `.dispose()`, every texture's `.dispose()`, plus an abort path for in-flight `TextureLoader.load`. Verify with kernel-side EAGLContext / Metal-context leak count, not just JS heap delta.
3. **Texture sizing.** Source covers run up to 1200×1800. Decoded RGBA at that size = 8.6 MB GPU per book. Downsample to 512×768 via `expo-image-manipulator` before upload; generate mips for oblique-rotation aliasing.
4. **Modal-open latency masking.** GL init (400–1400 ms) + texture decode + first draw = 500 ms–1.8 s. Render the existing 2D perspective viewer immediately and crossfade to the 3D mesh once it's ready.
5. **GL prewarm strategy.** Init the GL surface off-screen during idle (`InteractionManager.runAfterInteractions`) after first list render settles. ~15–25 MB GPU heap idle cost buys a much smaller per-modal latency.
6. **Stack pick:** `react-native-wgpu` first, `expo-three` as fallback. **Eliminate `@react-three/fiber-native`** — effectively unmaintained since 2023.
7. **Three.js pin:** r160+ for Hermes compatibility.
8. **Shared-element-transition incompatibility.** If the [v2 shared-element plan](docs/plans/2026-04-22-feat-3d-book-covers-shared-element-transitions-plan.md) ships first, the source list thumbnail (perspective-transform `View`) and the destination (GL Canvas) cannot share a transition node. The two paths are mutually exclusive in v2 — not orthogonal as the original draft of this plan claimed.
9. **Aspect-fit policy.** Center-crop on a 1.4:1 trade paperback clips title-band headers. Anchor `texture.offset.y = 0` (crop from top) preserves them. Letterbox very-wide omnibus covers with the spine-sampled color.
10. **App.json constraints to verify in any spike:** `newArchEnabled: true` and `reactCompiler: true` (lines 10 and 69 of [app.json](app.json)). The React Compiler's memoization could stale-pin a texture across cover changes — explicitly test.
11. **Texture upload blocks the JS thread** ~30–80 ms for a 600×900 image. Use `expo-image` for off-thread decode → hand bitmap to `THREE.DataTexture`, rather than `THREE.TextureLoader` directly.
12. **Leak-test bar should be 100 modal cycles, not 10.** Power-users browse fast and crashes from compounding leaks surface at 50–80 opens.

## References

- Parent: [docs/plans/2026-04-10-feat-3d-book-covers-plan.md](docs/plans/2026-04-10-feat-3d-book-covers-plan.md)
- Sibling: [docs/plans/2026-04-22-feat-3d-book-covers-shared-element-transitions-plan.md](docs/plans/2026-04-22-feat-3d-book-covers-shared-element-transitions-plan.md)
- Multi-reviewer feedback that drove the deferral (DHH-style taste, Kieran TS, simplicity, performance oracle) — informal session output
- [react-native-wgpu](https://github.com/wcandillon/react-native-webgpu)
- [expo-three](https://github.com/expo/expo-three)
- [Three.js TextureLoader](https://threejs.org/docs/#api/en/loaders/TextureLoader)
