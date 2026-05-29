---
title: "feat: 3D Book Covers — Shared-Element Transitions (Follow-ups)"
type: feat
date: 2026-04-22
parent: docs/plans/2026-04-10-feat-3d-book-covers-plan.md
status: proposed (not scheduled)
---

# 3D Book Covers — Shared-Element Transitions

## Context

The current build (shipped 2026-04-22) navigates from catalog → detail using Expo Router's default stack push. Tap feedback is a 120ms scale to 0.96 on the pressed row; the detail screen enters with the platform default (slide-from-right on iOS). The list cover and the detail hero are two separate `Book3D` renders — the user's eye sees two books, not one.

The design brief at `docs/brainstorms/2026-04-22-3d-book-covers-design-brief.md` §3.2 specifies a different intent:

> "The book is **the same element, visually**, from list thumbnail to detail hero. Not a crossfade. A crossfade breaks the promise that you're inspecting a specific object."

This plan documents two ways to deliver on that promise as optional follow-up work. Neither is scheduled; the user will decide if and when to pursue one. **v1** is a cheap fake that approximates continuity with two separate renders. **v2** is a true shared-element transition where a single node persists across screens.

---

## v1 — Faked Shared-Element

### Design

Two separate `Book3D` renders, choreographed to imply continuity. The list row fades under while the detail hero scales up from roughly where the thumbnail lived. The user's brain fills in the motion as a single traveling object.

**Choreography (per brief §3.2):**

1. **Press feedback:** pressed row's `Book3D` scales to 0.96 over 120ms with `spring({ damping: 18, stiffness: 300 })`. This is the "got it" confirmation. *(Already shipped.)*
2. **Navigation:** Expo Router push begins. The source cover does not animate out — it just fades under the incoming detail screen.
3. **Detail hero entry:** hero `Book3D` at 200×300 enters with:
   - `scale: 0.36 → 1.0` (72/200 = 0.36 — matches list thumbnail size)
   - `translateY: -120 → 0`
   - `rotateY: -15deg → -15deg` (no rotation delta — continuous pose)
4. **Background surface:** `tokens.surface.background` fades `0 → 1`.
5. **Chrome stagger:** title, buttons, and cards below the hero fade in 100ms after the hero starts, duration 220ms. Book arrives, then data about it.

**Total duration:** 420ms (matches iOS sheet-present timing).
**Easing:** `cubic-bezier(0.32, 0.72, 0, 1)` (iOS `UINavigationController` push curve — platform-native read as "navigation happened").

### Implementation steps

1. Customize the Expo Router stack navigator screen options for the `book/[id]` route. Use `CardStyleInterpolator` or Reanimated Layout Animations on the hero to drive the entry.
2. On `app/book/[id].tsx`, wrap the hero `Book3D` in an `Animated.View` that runs the scale + translateY on mount with the specified easing.
3. Stagger the chrome fade-in by 100ms using `withDelay`.
4. Ensure the catalog screen does not run an exit animation — the list should sit still under the incoming detail screen.

### Files touched

- `app/book/[id].tsx` — wrap hero, add entry animation.
- `app/(tabs)/_layout.tsx` or a new stack config — customize transition for `book/[id]`.
- `components/Book3D.tsx` — no change unless we need to expose a `entryTransition` prop.

### Acceptance criteria

- Tap any catalog row → hero in detail screen begins at 0.36 scale and translateY -120, resolves to 1.0 / 0 over 420ms with the specified curve.
- Chrome below hero begins fading 100ms into the hero's motion.
- Reduced motion: replaced with 280ms crossfade (per brief §5).
- No "double book flash" where the list thumbnail is visibly distinct from the hero's starting pose during the first frame of transition.

### Risks

- **Visual mismatch on first frame:** if the list thumbnail's `Book3D` and the hero's `Book3D` render differently at equivalent sizes (different spine %, different specular gradient stops because of list/detail variant splits), the transition's opening moment looks like two different books. Mitigation: audit both variants for identical silhouette at t=0.
- **Image load race:** if the hero's cover image hasn't loaded by the time the entry animation starts, the user sees the fallback tile enter and then pop to the real cover mid-transition. Mitigation: prefetch the hero image on press-in (`onPressIn`), before navigation begins.
- **Android platform delta:** Expo Router's default Android transition is a fade; the iOS push curve will feel off. May need platform-specific duration/easing or Android-specific choreography.

---

## v2 — Real Shared-Element (Reanimated `SharedTransition`)

### Design

A single `Book3D` node persists across the list → detail navigation. Reanimated 3.5+'s `SharedTransition` API animates the node's position, size, and transform values in one continuous tween. Not two renders pretending; one object moving.

The book on the catalog row and the hero on the detail screen are tagged with the **same unique id** (the book's UUID). When navigation occurs, Reanimated finds both tagged nodes, snapshots the source bounds, and animates the destination node from source bounds to its own layout bounds.

**Choreography:**

Same visual end state as v1 (scale, translateY, chrome stagger), but the *source* of the motion is the list thumbnail's actual on-screen position, not a hardcoded `translateY: -120`. Tapping a book in the middle of the screen, near the top, or near the bottom all produce motion originating from that specific book.

**Pose continuity:** `rotateY: -15deg` holds across the transition. The list variant's lighting gradients morph into the detail variant's dynamic lighting as the node grows.

### Implementation steps

1. **Upgrade audit:** verify `react-native-reanimated` is ≥3.5.0 (required for `SharedTransition`). Check compatibility with current Expo SDK 54.
2. **Add `sharedTransitionTag` prop** to `Book3D` that accepts a book UUID (passed as `sharedTransitionTag={`book-cover-${book.id}`}`).
3. **Tag both call sites:**
   - Catalog list: each `Book3D` in `book-card.tsx` tags with the book's id.
   - Detail hero: `app/book/[id].tsx` tags its hero with the same id.
4. **Configure transition:** wrap the hero in `Animated.View` with `sharedTransitionStyle` and a `SharedTransition.custom()` function defining the easing and duration (must match v1 values: 420ms, iOS push curve).
5. **Reconcile list/detail variant differences:** spine thickness (8% vs 6%), page inset (2px vs 4px), and specular gradient stops. Either:
   - (a) animate the variant-specific values via shared values that tween from list config → detail config during the transition, OR
   - (b) accept a one-frame discontinuity and standardize on detail spec for the transition duration.
6. **Reduced motion fallback:** `SharedTransition.custom()` returns an immediate layout (no motion) when `AccessibilityInfo.isReduceMotionEnabled()` is true.

### Files touched

- `components/Book3D.tsx` — accept and forward `sharedTransitionTag`.
- `components/book-card.tsx` — pass tag.
- `app/book/[id].tsx` — pass matching tag, add `sharedTransitionStyle`.
- `package.json` — bump Reanimated if needed.

### Acceptance criteria

- The tapped row's book visibly *travels* from its exact on-screen position to the detail hero center. Starting bounds depend on which row was tapped.
- Pose (rotateY, specular falloff) is continuous. No blink, no pop.
- Back navigation reverses the transition: hero shrinks back to the exact row position.
- Reduced motion: immediate layout, no tween.
- Works on iOS and Android without platform-specific code in the component.

### Risks

- **Reanimated version drift:** `SharedTransition` API matured in 3.5; breaking changes in 3.6+. Pin the version.
- **Expo Router integration:** shared transitions require navigation-library awareness. Expo Router uses React Navigation under the hood, which supports `SharedElement` but with caveats on nested navigators. Our stack is flat, so likely fine — needs verification.
- **Variant reconciliation overhead:** if we go with option (a) above, every transition runs interpolators for 6–8 additional values (spine width, page inset, specular opacity ×N stops). Frame-budget cost is small but non-zero; if it shows, fall back to option (b).
- **Back-gesture interop:** iOS edge-swipe back gesture must drive the reverse transition correctly. React Navigation handles this, but shared transitions can flicker mid-gesture if the tag isn't re-applied on unmount.

---

## Tradeoff Matrix

| Dimension | v1 (Faked) | v2 (Real Shared-Element) |
|---|---|---|
| Implementation cost | ~2 hours | ~1 day (incl. variant reconciliation) |
| Visual quality ceiling | Good if sizes align; fails if list/hero differ | Excellent — genuine continuity |
| Fragility to variant changes | High — any list/detail spec drift breaks it | Low — it's the same node |
| Frame-budget cost | Negligible (timing-based animations only) | Small but measurable (layout interpolation per frame) |
| Back-gesture fidelity | Platform default | Reverse shared transition, matches forward |
| Reduced-motion path | Clean 280ms crossfade | Clean immediate layout |
| Library / version risk | None (uses existing Reanimated APIs) | Depends on Reanimated ≥3.5 + Expo Router stability |
| Maintenance burden | Two separate animations to keep aligned as variants evolve | One tag to keep aligned |

---

## Recommendation

**If pursuing now: v2 directly.** The v1 fake is cheap but locks in the "two renders pretending" model the brief explicitly argues against. Shipping v1 and then migrating to v2 means implementing the transition twice, and the v1 → v2 migration re-does most of the detail screen's entry logic.

**If pursuing later (6+ months out):** v1 is a reasonable stopgap if the detail screen's entry behavior changes so often that the v2 investment feels premature.

**If not pursuing at all:** fine. The current platform-default navigation is readable and craftsmanlike. The brief's "book is the hero" promise is fulfilled by the book's visual weight in the hero position; the transition is a secondary beat.

---

## Open Questions / Prerequisites

1. **Reanimated version:** confirm current `react-native-reanimated` version in `package.json`. Upgrade to ≥3.5 if needed.
2. **Expo Router + React Navigation SharedElement compatibility:** verify with a ~30-minute spike before committing to v2.
3. **Variant reconciliation choice:** (a) animate variant values during transition, or (b) standardize on detail spec for the transition duration. Decide after the spike based on frame-budget measurements.
4. **Scope of "chrome stagger":** does the 100ms delay apply to *every* piece of non-hero content on the detail screen, or only the immediately-below content (title, metadata)? Below-the-fold cards might not need the stagger.
5. **Priority:** does this rank above the shared-element polish items the developer already deferred (long-press preview sheet, pinch-to-dismiss)? All three are craft improvements competing for the same budget.
