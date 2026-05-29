---
title: "3D Book Covers — Design Brief"
type: brainstorm
date: 2026-04-22
parent: docs/plans/2026-04-10-feat-3d-book-covers-plan.md
status: design-only (no implementation)
---

# 3D Book Covers — Design Brief

A book on a shelf is a small, honest object. It has weight. It has a spine worn from reading. Light from the ceiling finds one corner first. This brief is about earning that feeling inside a React Native app running on a phone held in one hand, at 60fps, in the dark.

Every number below is a decision, not a default. If you change one, change it on purpose.

---

## 1. Visual Structure — the Object

A book has three faces we render: **front cover**, **spine**, **page block** (the paper edges). Back cover and bottom are never visible at our rest angles, so they don't exist.

### Proportions (ratios, not pixels)

All books render at a **2:3 aspect ratio** (width : height) — trade paperback-ish. This is the single standardized proportion across list and detail. Mass-market paperbacks are 1:1.55 and hardcovers are 1:1.5; 2:3 averages these and avoids the slot-machine skinniness of 1:1.55 on a phone screen.

| Element | Ratio / Value | Rationale |
|---|---|---|
| Cover aspect | 2:3 (W:H) | Standard trade paperback; averages mass-market and hardcover. |
| Spine thickness | **8% of cover width** (list), **6%** (detail) | At rest yaw of -15deg, a 20mm book is ~6% of its cover width when perspective-projected. List exaggerates to 8% so the cue survives thumbnail scale. |
| Page stack inset | **2px** on top, bottom, and right (list); **4px** (detail) | The paper block sits inside the cover boards. This inset is what makes a book look like a *book* and not a tile. Matte cream color `#F4EBD8` at 92% opacity, desaturated from pure white so it reads warm paper, not printer paper. |
| Front cover curvature | **None in list. Detail: 1.5deg of implied arc** via a secondary gradient stop | Real paperbacks bow slightly when held. In the list, curvature would cost a gradient stop we can't afford. In detail, we fake it with a soft horizontal highlight band at 60% across the cover (the "bow crown"), opacity 0.06. |
| Edge highlight (right edge, page side) | **1px inner rim** at `rgba(255,255,255,0.18)` | Reads as the cut page edge catching light. Absent this, covers look flat-printed. |
| Spine edge seam | **1px dark line** at `rgba(0,0,0,0.45)` at 8% cover width | The crease where the spine wrap meets the front board. This single line does 30% of the skeuomorphic work. |
| Corner rounding | **3px radius** on cover; **2px** on spine corners | Real books have softened corners from shelf wear. Sharp corners read as rectangles, not objects. |
| Corner shadow | Subtle radial darkening in the two outer corners (top-right, bottom-right), 8% opacity, 24px radius | Simulates ambient occlusion where the cover meets page block. |

### Hold-the-book mental model

If you close your eyes and hold a mass-market paperback:

- Your thumb on the front feels a smooth matte board with the tiniest lip at the edge where the cover wraps around the page block. → **1px inner rim highlight**.
- Your index finger on the spine feels the softer, recessed crease between spine and front board. → **1px dark seam at 8% width**.
- You can feel the paper edge is slightly indented from the cover edge on three sides. → **2px page inset**.
- The book has weight forward-and-down. → **Shadow offset `{x: 4, y: 8}`**, not centered.

If the render doesn't produce these four sensations for the eye, it's wrong.

---

## 2. Material & Lighting Model

### Cover material

**Matte with a faint satin sheen** — not gloss. Gloss on dark book covers looks like plastic toys. Modern Del Rey and Random House Worlds Star Wars hardcovers use matte board with spot-gloss titles; we don't render the spot-gloss (too noisy at thumbnail scale), just the matte.

- **Base:** the artwork or solid fallback color, unchanged luminosity.
- **Bump:** implied only. No normal map. A single faint noise layer is tempting but would cost GPU and shift every frame during rotation — we skip it. The directional lighting gradient carries the material read.
- **Specular:** a narrow soft highlight falling **top-left to center**, simulating a key light at roughly **10 o'clock, elevation 30deg** (datapad screen glow on Luke's face in the Bespin cell). Intensity: `rgba(255,255,255,0.10)` at peak, blurred across the upper-left third.
- **Fresnel rim:** only on the right edge and top edge, 1px, `rgba(255,255,255,0.12)`. This is the "board edge catches light" cue.

Why 10 o'clock and not 45deg? A 45-degree key light is the stock 3D-software default and reads as "rendered." 10 o'clock (about 60deg from vertical) is cinematic and matches how the user's own face/phone shadows a book in real life when holding it — the left side is lit because the phone is held with the right hand, tilted slightly.

### Page-block material

Pages catch **only ambient** — no specular. Paper is diffuse. A faint vertical striation (the cut page lines) is desirable but cannot be rendered cheaply in RN. Future enhancement if we move to Three.js.

### Ambient + ground shadow

- **Ambient floor:** `rgba(255,255,255,0.02)` uniform overlay. So faint you can't see it, but it prevents the shadowed side from crushing into pure black on OLED.
- **Contact shadow (ground shadow):** a **soft elliptical blur** under the book, offset down 8px, 28px blur radius, 22% opacity `#000`. **Not** a hard drop shadow. In the list, this is a view shadow; in detail view, it deserves a dedicated positioned blurred ellipse because the book lifts off the surface as it rotates, and the shadow should **grow softer and shift** with pitch (see Animation section).

### List vs. Detail lighting — explicit difference

| Aspect | List (72x108 or 100x150) | Detail (200x300+) |
|---|---|---|
| Specular highlight | Single static 3-stop linear gradient (matches current impl) | Dynamic, shifts position with gesture rotation |
| Fresnel rim | Omitted — below perceptual threshold at 72px wide | Present on right and top edges |
| Corner ambient occlusion | Omitted | Present |
| Ground shadow | Native `shadowRadius: 10` | Dedicated positioned blurred ellipse, animates with pitch |
| Page stack | 2px inset, solid color | 4px inset, with 1px internal highlight line |
| Spine seam | Implied by gradient only | Explicit 1px dark line |

The rule: **the list version communicates "book-shaped." The detail version communicates "this specific book, in your hand."** They are the same component at different fidelities, not the same render at different sizes.

---

## 3. Animation Specs

Every duration and easing below is a decision. Where I default to an iOS-native curve, I say why.

### 3.1 Catalog list — entry rotation on scroll

**Default:** books are static at their rest pose. Per-item scroll tracking is a frame-budget tax we don't need for 200+ books in a FlatList.

**Recommended enhancement:** a one-shot **"settling" rotation** when an item first enters the viewport, not continuous scroll-coupled rotation.

- **Trigger:** viewport threshold of **50%** item height visible (measured via FlatList `viewabilityConfig.itemVisiblePercentThreshold: 50`).
- **From → To:** `rotateY: -22deg → -15deg`, `translateY: 6px → 0px`, `opacity: 0 → 1`.
- **Duration:** **360ms**. Long enough to register, short enough that rapid scrolling doesn't queue a visible backlog.
- **Easing:** `cubic-bezier(0.2, 0.8, 0.2, 1)` — the "emphasized decelerate" curve. Front-loaded motion, soft arrival. *Why not the iOS default `(0.25, 0.1, 0.25, 1)`?* The iOS default is symmetric and feels polite but weightless. `(0.2, 0.8, 0.2, 1)` has more initial push — it feels like the book is **arriving** under its own momentum, which matches our skeuomorphic promise.
- **Stagger:** **40ms** per item, capped at 5 items (so items 6+ all use 200ms stagger, not 240ms, 280ms, ...). Uncapped stagger makes fast scrolls feel like a conveyor belt.
- **Only on initial mount** — do not re-trigger on scroll back into view. Subsequent appearances are instant. Checked via a `Set<bookId>` of already-animated IDs.

### 3.2 Tap-to-open — catalog row to detail hero

The book is **the same element, visually**, from list thumbnail to detail hero. Not a crossfade. A crossfade breaks the promise that you're inspecting a specific object.

- **Choreography:**
  1. On tap, the row's `Book3D` scales to 0.96 (existing press feedback) — **120ms**, spring `{ damping: 18, stiffness: 300 }`. This is the "got it" confirmation.
  2. Navigation begins. The source cover **does not animate out** — it just fades under the incoming detail screen.
  3. The detail screen enters with a **shared-element-like feel**, faked: the hero `Book3D` at size 200x300 enters with `scale: 0.36 → 1.0` (72/200 = 0.36), `translateY: -120 → 0`, `rotateY: -15 → -15` (no rotation delta — the book continues the same pose).
  4. Background surface (`tokens.surface.background`) fades in from `0 → 1`.
- **Duration:** **420ms** total, matching iOS sheet-present timing.
- **Easing:** `cubic-bezier(0.32, 0.72, 0, 1)` — the iOS UINavigationController push curve. This is one of the rare cases where the platform default is exactly right: users read it subconsciously as "navigation happened."
- **Opacity:** detail screen chrome (title, buttons, cards below the hero) fades in **100ms later** than the hero, duration 220ms. The book arrives, *then* the data about it. This hierarchy is non-negotiable: **the book is the hero**.

True shared-element transitions (`react-native-reanimated`'s `SharedTransition` in Reanimated 3.5+) are feasible here and worth it — they would make the book literally the same node. Worth the implementation effort in a follow-up; the staged fake above is the v1 target.

### 3.3 Detail view — gesture rotation

This is the hero interaction. The current plan values are close; I'm tightening them.

- **Pan sensitivity:** **0.35 deg per point** (plan has 0.3). At 0.3, a full 180deg turn requires dragging 600pt, which is more than a phone screen width on most devices — feels sluggish. At 0.35, a 180deg turn is 514pt, about one full screen sweep on a Pro Max. Below 0.3 feels draggy; above 0.5 feels twitchy.
- **Yaw (rotateY) bounds:** `[-180, 180]` with **soft rubber-band past ±150**. Resistance function: `effectiveDelta = delta * (1 - min(abs(yaw - 150) / 60, 0.85))` inside the bounds zone. User can overshoot, but the book pushes back.
- **Pitch (rotateX) bounds:** `[-35, 35]` (plan has ±45). ±35 keeps the book from ever showing its "top" or "bottom" face, which we don't render. Rubber-band past ±25.
- **Inertia:** `withDecay({ deceleration: 0.997, velocityFactor: 1.0 })`. Plan has 0.993; **0.997 gives a longer, more satisfying glide** — the book spins like it has real angular momentum, takes about 2.1 seconds to settle from a fast flick. Jerky flicks at 0.993 stop too quickly and feel tinny.
- **Return-to-rest:** **no auto-return.** The book stays where you leave it. This is important: auto-return feels like the app is correcting you. Exception: if the user hasn't touched it for 8 seconds, a slow idle drift begins (see 3.4).
- **Grabbing a spinning book:** instant stop via `cancelAnimation` + capture current position (already in plan — keep this).
- **Spring on explicit "reset" (double-tap):** `withSpring({ damping: 14, stiffness: 120, mass: 1 })`. These values give a single overshoot of ~6% — a small "settle" that reads as the book finding its shelf pose. No overshoot would feel dead; two overshoots would feel cartoonish.

### 3.4 Idle state — subtle breathing

**Not "breathing" — breathing is wrong for an inert object.** What we want is the faintest drift, as if the book is suspended in space and catching imperceptible air currents.

- **Start:** 8 seconds after the last gesture ends.
- **Motion:** `rotateY` oscillates ±1.5deg from current pose. `rotateX` oscillates ±0.8deg. Independent phases.
- **Period:** **7.2 seconds** on yaw, **5.4 seconds** on pitch. Incommensurate periods (7.2 / 5.4 = 1.33...) mean the composite motion never visibly repeats — looks organic.
- **Easing:** sine wave (not spring). Springs have perceivable acceleration; sine is pure, neutral drift.
- **Amplitude ramp-in:** over 1.2 seconds from 0 to full amplitude, so it doesn't start abruptly.
- **Kill instantly** on any touch.

This is below the threshold of conscious notice but above the threshold of subconscious aliveness. If the user doesn't realize it's animating, we've done it right.

### 3.5 Pinch — zoom out, not in

- **Pinch-in (pinch closer to zoom in on the book):** dismisses the viewer, returning to the detail screen. Scale threshold: **0.82**. Below this during an active pinch, commit the dismiss transition.
- **Pinch-out (spread fingers):** **no-op**. The book is already rendered at its maximum useful size. Allowing further zoom would expose cover image resolution limits and feels like a "free" gesture with no payoff.

Rationale for asymmetry: pinch-in as dismiss is iOS-native Photos-app behavior. Users know it. Pinch-out for cover inspection is where users would expect to see cover detail (spot-gloss, embossing) — which we don't render, so offering the gesture is a false promise.

---

## 4. Interaction Behaviors & Haptics

| Event | Behavior | Haptic |
|---|---|---|
| Tap book in list | Scale 0.96 on press, navigate on release | `Haptics.selectionAsync()` on press |
| Tap book in detail (opens viewer) | Scale 0.96, then modal open | `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` on modal open completion |
| Drag-rotate in viewer | Continuous rotation following finger | None during drag — haptics during gesture feel like the book is "clicking" over detents it doesn't have |
| Cross ±90deg yaw | Threshold event, once per crossing | `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)` — a soft "click" as the book turns past profile |
| Cross ±150deg yaw (rubber-band start) | Entering resistance zone | `Haptics.selectionAsync()` — subtle tick, feels like a detent |
| Release with high velocity | Inertia begins | None — the motion itself is the feedback |
| Inertia settles to rest | Animation ends | None — silence is correct; anything else would feel like a notification |
| Double-tap in viewer | Spring reset to rest pose (-15, 0) | `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)` — the "snap back" is satisfying with a medium thump |
| Long-press in list (500ms) | Preview sheet with shelf actions (Owned / Read / Want to Read) — not a rotation | `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)` at 500ms |
| Pinch-in to dismiss viewer | Book shrinks with pinch, commits at scale 0.82 | `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` at commit |
| Close viewer (X button or dismiss) | Modal exit animation | `Haptics.selectionAsync()` on commit |

**Haptic principle:** haptics are for **threshold crossings** and **commits**, not for ongoing motion. A book spinning under your thumb should feel smooth and silent. A book crossing from front-facing to profile-facing is a narrative beat and deserves a tick.

All haptics use `expo-haptics`. Respect system haptic settings — Expo handles this automatically on iOS.

---

## 5. Accessibility

### Reduced motion (`AccessibilityInfo.isReduceMotionEnabled()`)

Reduced motion is **not** "no motion." It is "motion that doesn't provoke vestibular response." We remove things that fly, rotate, or parallax. We keep things that fade.

| Feature | Normal | Reduced Motion |
|---|---|---|
| List entry settling rotation | -22deg → -15deg + translateY | **Disabled.** Static at -15deg from first render, opacity fade 200ms. |
| Book rest angle in list/detail | -15deg with 3D perspective | **2D flat render (rotateY: 0deg).** The book shows spine via a fixed 8%-width dark strip on the left edge — no perspective. This is a deliberate design call: rotation is what motion-sensitive users react to, and a front-on book with a visible spine strip still reads unambiguously as a book. |
| Tap-to-open transition | Staged scale + translate | **Crossfade only**, 280ms, `ease-out`. |
| Gesture rotation in viewer | Full interaction | **Replaced with auto-rotate toggle button** — a button labeled "Rotate book" that steps through 4 fixed angles (-45, 0, 45, 90 degrees of yaw) with a 300ms transition between each. No pitch. No inertia. Accessible alternative from the plan's acceptance criteria. |
| Idle drift | Enabled | **Disabled.** Static. |
| Pinch-to-dismiss | Enabled | **Disabled.** Explicit close button only. |

### VoiceOver / screen reader

- **List item:** `accessibilityLabel`: `"{title} by {author}. {canon or Legends}{, series name if present}."` E.g. `"Heir to the Empire by Timothy Zahn. Legends. Thrawn Trilogy."` The 3D render itself is decorative — its label is empty (already in impl). The outer `Pressable` owns the label. **Role:** `button`. **Hint:** `"Opens book details."`
- **Detail hero cover:** `accessibilityLabel`: `"3D cover of {title}."` **Hint:** `"Double tap to inspect. Swipe up with one finger to close."` **Role:** `image button`.
- **Inside viewer (reduced motion off):** announce rotation changes is inappropriate — too chatty. Instead, label the viewer container as `"Book cover viewer. {title}. Pan with one finger to rotate."`
- **Inside viewer (reduced motion on):** the Rotate button has label `"Rotate book"` and value announces current angle: `"Facing forward"`, `"Turned 45 degrees right"`, `"Turned to profile"`, `"Turned 45 degrees left"`.

### Focus states (external keyboard / switch control)

Books in a list receive focus as individual buttons. Focus ring: **2px solid `tokens.accent.primary` (#4A90D9)** at 4px offset from the book's bounding box, 6px border radius. Animated in over 120ms. This is the lightsaber-blue outer glow — feels native to the app's visual language, not a gray system default.

### Touch targets

Book thumbnails in list are 72x108 (less than 44x44 iOS minimum on width). The **row itself** is the hit target — 104pt tall row, full width. Already correct in `book-card.tsx`. Do not add a book-local hit target; let the row handle it.

---

## 6. Tradeoff Note — Gradient Overlays (list) vs. Three.js PBR (detail)

**I affirm the split, with one modification.**

### Why the split is right

- **Frame budget, list:** FlatList with 200+ books must hit 60fps during fast scrolls on mid-tier Android. Each `Book3D` is currently ~4 Views plus 2 gradients plus 1 image. A Three.js scene per row is a non-starter — a single `expo-gl` context is ~6–12 MB of GPU state, and virtualizing GL contexts inside a FlatList is unsolved in RN. Gradients are the only affordable option. **Correct call.**
- **Visual payoff, list:** at 72x108, PBR specular lobes, screen-space reflections, and normal maps are **below the perceptual threshold**. The user sees a book-shaped thumbnail. The gradient render and the PBR render look identical at that scale. Spending the GPU budget would be pure vanity.
- **Frame budget, detail:** one book, one full-screen modal, no virtualization pressure. A single Three.js scene with one PBR material is ~4ms of GPU per frame on an iPhone 13, well inside budget.
- **Visual payoff, detail:** at 200x300+, users can see the material. Spot-gloss on titles, subtle bump on the cover texture, environment-mapped reflections — these transform "a picture of a book" into "a book." PBR earns its cost here.

### The modification

**Don't go to full PBR on day one.** The Reanimated gradient approach (what exists today) at detail-scale is already 80% of the visual payoff. Before committing to Three.js in the viewer, ship the tightened Reanimated detail view described in this brief (dynamic lighting, page inset, fresnel rim, animated ground shadow). Measure: does a user studying the book in viewer mode *want* more fidelity, or is it already satisfying?

**My prediction:** the gap between "skeuomorphic gradients at 200x300 with dynamic lighting" and "PBR with env maps at 200x300" is smaller than the plan assumes. The gap between "flat image" and "skeuomorphic gradients" is enormous. Spend the engineering effort on the first gap first. Revisit PBR if user feedback asks for "shinier" or "more real."

**Concrete recommendation:**
1. V1 (ship now): Reanimated gradients in list, tightened Reanimated in detail with dynamic lighting + animated shadow + idle drift + all specs in section 3.
2. V1.5 (measure): check whether users ever pinch/rotate at length in the viewer. If avg inspection time > 5s, they want more. If < 2s, they're just confirming "yes that's the book."
3. V2 (earned): Three.js PBR in the viewer only. Gradient path remains for reduced-motion users and as Android fallback.

### What would change my mind

If the design team commits to **hardcover embossing, foil stamping, or spot-gloss** as visual differentiators between book editions — those **require** PBR (specular varying per-texel). If they don't, gradients are enough.

---

## Quick Reference — Key Numbers

| # | Value | Purpose |
|---|---|---|
| -15deg | Rest yaw | Establishes book-object read; shows spine |
| 2:3 | Aspect ratio | Standardized across all sizes |
| 8% / 6% | Spine thickness (list / detail) | Perspective-correct at rest yaw |
| 2px / 4px | Page inset (list / detail) | Paper block recessed from cover |
| 0.35 deg/pt | Pan sensitivity | Full rotation in ~one screen sweep |
| 0.997 | Decay deceleration | 2.1s glide from fast flick |
| [-180, 180] yaw, [-35, 35] pitch | Gesture bounds | Hides unrendered faces |
| 360ms | List entry settle duration | Registers without queueing |
| 40ms, capped 5 items | Stagger | Prevents conveyor-belt feel |
| 420ms | Tap-to-open total | iOS-native sheet timing |
| `cubic-bezier(0.2, 0.8, 0.2, 1)` | Entry easing | Arriving momentum |
| `cubic-bezier(0.32, 0.72, 0, 1)` | Navigation easing | iOS-native push curve |
| 8s | Idle drift onset | Below notice, above inactivity |
| 7.2s / 5.4s | Idle drift periods | Incommensurate, never repeats |
| ±1.5deg / ±0.8deg | Idle drift amplitude | Subconscious aliveness |
| 500ms | Long-press threshold | iOS-standard |

---

## What This Brief Does Not Specify

- Cover image CDN / caching strategy (not a design concern).
- Actual Three.js / react-three-fiber scene graph for V2 detail view (out of scope — decide if/when we commit to PBR).
- Spine text rendering (noted as future enhancement in the plan).
- Themed color variants (Sith red, Mandalorian green) — token system is ready; brief stays Jedi-blue.
- Metro bundler or Hermes flags.

The goal of this brief is a book that feels real under your thumb. Every spec serves that goal. Nothing else.
