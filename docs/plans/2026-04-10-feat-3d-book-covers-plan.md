---
title: "feat: 3D Skeuomorphic Book Covers"
type: feat
date: 2026-04-10
parent: docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md
---

# 3D Skeuomorphic Book Covers

## Overview

Render book covers as 3D objects throughout the app using Reanimated perspective transforms — no WebGL, no Three.js, no GPU surfaces. Books should feel like physical objects with weight and light.

Two contexts:
1. **Catalog list:** Static -15deg angle with spine, gradient lighting, and shadow. Performant in FlatList.
2. **Detail view:** Full-screen modal with gesture-driven rotation, inertia physics, and animated lighting.

Both use the same `Book3D` component at different sizes with different interaction modes.

**Dependencies added:** `expo-linear-gradient` only. `react-native-reanimated` and `react-native-gesture-handler` are already in the project.

---

## Technical Approach

### `Book3D` Component

File: `components/Book3D.tsx`

A reusable component that renders a book cover with perspective depth, a visible spine, gradient lighting, and shadow.

**Props:**

```typescript
interface Book3DProps {
  coverUri: string | null;
  title: string;
  author: string[];
  width: number;          // e.g., 120
  height: number;         // e.g., 180
  spineWidth?: number;    // e.g., 16, default 14
  spineColor?: string;    // default '#2c1810'
  rotateY?: SharedValue<number>;  // always SharedValue, default useSharedValue(-15)
  onPress?: () => void;
  accessibilityLabel: string;
}
```

**Visual structure:**

```
┌──────────────────────────┐
│ Front Cover              │ ← perspective(800) + rotateY(-15deg)
│ ┌──┐                     │   with translateX pivot (spine edge)
│ │S │  [Cover Image]      │
│ │P │  or                 │
│ │I │  [Color + Title     │ ← fallback for null/broken covers
│ │N │   + Author]         │
│ │E │                     │
│ └──┘                     │
│  + LinearGradient overlay│ ← 3-stop: highlight, transparent, shadow
│  + Shadow beneath        │ ← layered box-shadow for depth
└──────────────────────────┘
```

**Transform origin workaround** — React Native has no `transform-origin`. To rotate around the spine (left edge):

```typescript
transform: [
  { perspective: 800 },
  { translateX: -width / 2 },   // shift pivot to left edge
  { rotateY: `${angle}deg` },
  { translateX: width / 2 },    // shift back
]
```

**Spine** — a simple absolutely-positioned dark strip at the left edge. No 3D transforms on it — the cover's own `rotateY` makes the left edge recede, and the dark strip reinforces that:

```typescript
<View style={{
  position: 'absolute',
  left: 0,
  width: spineWidth,
  height: '100%',
  backgroundColor: spineColor,
  borderTopLeftRadius: 2,
  borderBottomLeftRadius: 2,
}} />
```

**Lighting gradient** — 3-stop `LinearGradient` overlay on the cover:

```typescript
<LinearGradient
  colors={[
    'rgba(255,255,255,0.15)',  // left highlight (light from upper-left)
    'transparent',              // middle
    'rgba(0,0,0,0.12)',         // right shadow
  ]}
  start={{ x: 0, y: 0 }}
  end={{ x: 1, y: 0 }}
  style={StyleSheet.absoluteFill}
/>
```

**Shadow** (skeuomorphic depth):

```typescript
// iOS
shadowColor: '#000',
shadowOffset: { width: 4, height: 6 },
shadowOpacity: 0.25,
shadowRadius: 12,
// Android
elevation: 8,
```

**Press feedback:**

```typescript
const pressStyle = useAnimatedStyle(() => ({
  transform: [{ scale: withSpring(isPressed.value ? 0.96 : 1, { damping: 15 }) }],
}));
```

### Missing Cover Fallback

When `coverUri` is `null` or the image fails to load (`Image.onError`), display a generated placeholder:

```
┌──────────────────────────┐
│ ┌──┐                     │
│ │  │   ████████████████  │ ← randomized background color
│ │  │                     │   seeded from book slug/title
│ │  │     BOOK TITLE      │ ← white text, centered
│ │  │     Author Name     │ ← smaller, lower opacity
│ │  │                     │
│ │  │   ████████████████  │
│ └──┘                     │
└──────────────────────────┘
```

**Color generation** — deterministic per book (same book always gets same color) using a simple hash of the title:

```typescript
const COVER_COLORS = [
  '#8B0000', '#1a3a5c', '#2d4a22', '#4a2545', '#5c3a1a',
  '#1a4a4a', '#3d2b1f', '#4a1a1a', '#1a2a4a', '#3a1a4a',
];

function getCoverColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash) + title.charCodeAt(i);
    hash |= 0;
  }
  return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
}
```

The fallback View contains:
- Background color from the palette
- Title text (white, bold, centered, max 3 lines with ellipsis)
- Author text (white, 60% opacity, smaller, 1 line with ellipsis)
- Same spine, gradient, and shadow treatment as the image version

### Detail View — Interactive 3D Rotation

File: `components/Book3DViewer.tsx`

When the user taps a book cover, a full-screen modal opens with a larger `Book3D` that they can drag to rotate.

**Gesture mapping** — horizontal drag → Y rotation (yaw), vertical drag → X rotation (pitch):

```typescript
const rotationY = useSharedValue(-15);   // initial yaw
const rotationX = useSharedValue(0);     // initial pitch
const savedRotY = useSharedValue(-15);
const savedRotX = useSharedValue(0);

const DEGREES_PER_PIXEL = 0.3;

const panGesture = Gesture.Pan()
  .onBegin(() => {
    // Cancel any active decay animation and capture current position
    cancelAnimation(rotationY);
    cancelAnimation(rotationX);
    savedRotY.value = rotationY.value;
    savedRotX.value = rotationX.value;
  })
  .onUpdate((event) => {
    rotationY.value = savedRotY.value + event.translationX * DEGREES_PER_PIXEL;
    rotationX.value = savedRotX.value - event.translationY * DEGREES_PER_PIXEL;
  })
  .onEnd((event) => {
    // Inertia: book spins with momentum, decelerates
    rotationY.value = withDecay({
      velocity: event.velocityX * DEGREES_PER_PIXEL,
      deceleration: 0.993,
      clamp: [-180, 180],
    });
    rotationX.value = withDecay({
      velocity: -event.velocityY * DEGREES_PER_PIXEL,
      deceleration: 0.993,
      clamp: [-45, 45],
    });
  });
```

**Key fix:** `onBegin` calls `cancelAnimation` and captures the current position. This prevents the race condition where `savedRotY` captures the release position instead of the decay-settled position.

**Animated lighting** — the gradient overlay shifts position based on the current rotation angle:

```typescript
const lightStyle = useAnimatedStyle(() => ({
  opacity: interpolate(
    Math.abs(rotationY.value),
    [0, 30, 60],
    [0.1, 0.2, 0.35]
  ),
  transform: [{
    translateX: interpolate(
      rotationY.value,
      [-60, 0, 60],
      [-width / 2, 0, width / 2]
    ),
  }],
}));
```

**Modal behavior:**
- Opens with `FadeIn.duration(300).springify()`
- Close via X button or swipe-down gesture
- Dark semi-transparent background
- Book centered vertically, rendered at ~2x list size

---

## Implementation Plan

### Step 1: `Book3D` Component

File: `components/Book3D.tsx`

- [x] Build base component: `Animated.View` with `perspective(800)` + `rotateY(-15deg)` + `translateX` pivot
- [x] Cover image with `Image.onError` detection
- [x] Missing cover fallback: deterministic color from title hash + title text + author text
- [x] Dark strip spine (absolutely positioned, no 3D transforms, `borderTopLeftRadius: 2`)
- [x] 3-stop `LinearGradient` overlay (`expo-linear-gradient`)
- [x] Native shadow (iOS `shadowProps`, Android `elevation`)
- [x] Press feedback: `scale(0.96)` with spring on `Pressable`
- [x] Android: ensure `perspective` is FIRST in transform array
- [x] `backfaceVisibility: 'hidden'` on the cover
- [x] `accessibilityLabel` prop (e.g., "Book cover: Heir to the Empire by Timothy Zahn")
- [x] `accessibilityRole="button"` on the pressable wrapper
- [x] Fixed item height in list (no variable aspect ratios — standardize to book proportions)
- [ ] Test with both real cover URLs and null covers
- [ ] Test on physical iOS and Android devices

### Step 2: Detail View with Gesture Rotation

File: `components/Book3DViewer.tsx`

- [x] Full-screen modal wrapping a larger `Book3D`
- [x] `Gesture.Pan` mapped to `rotateY` (yaw) and `rotateX` (pitch) shared values
- [x] `onBegin`: `cancelAnimation` on both axes + capture current position
- [x] `onUpdate`: apply translation * `DEGREES_PER_PIXEL` (0.3)
- [x] `onEnd`: `withDecay` for inertia (deceleration: 0.993, clamp yaw [-180, 180], pitch [-45, 45])
- [x] Animated gradient overlay that shifts position with rotation angle
- [x] Dark background overlay (semi-transparent)
- [x] Close button (top-right)
- [x] Book title and author displayed below the 3D book
- [ ] Accessibility: auto-rotate toggle button as non-gesture alternative
- [x] Missing cover fallback works at large size too

---

## Acceptance Criteria

- [ ] Books in catalog list render with visible 3D depth (angled cover + spine + shadow)
- [ ] Books with missing covers show a colored placeholder with title and author
- [ ] Same book always gets the same fallback color
- [ ] Pressing a book scales to 0.96 with spring physics
- [ ] Tapping a book cover opens full-screen 3D view
- [ ] In full-screen: drag horizontally rotates (yaw), drag vertically tilts (pitch)
- [ ] Release with velocity: book spins with inertia, decelerates naturally
- [ ] Grabbing a spinning book stops it immediately (cancelAnimation)
- [ ] Light gradient shifts with rotation angle
- [ ] Close full-screen returns to list
- [ ] Screen reader announces "Book cover: {title} by {author}" on each book
- [ ] 60fps maintained during catalog scrolling with 200+ books
- [ ] Works on physical iOS and Android devices

---

## Dependencies

| Package | Purpose | Status |
|---|---|---|
| `expo-linear-gradient` | Light simulation gradient overlay | New — lightweight, stable |
| `react-native-reanimated` | UI-thread animations, spring/decay physics | Already in project |
| `react-native-gesture-handler` | Pan gesture for rotation | Already in project |

---

## Performance Notes

- All transforms run in Reanimated UI-thread worklets — no JS bridge
- No GL context, no GPU surfaces — books are regular React Native views
- FlatList virtualization works normally (books are just Views)
- Static -15deg angle means no per-item scroll tracking overhead
- Gesture rotation is only active on the single focused book in the detail modal
- Press feedback uses `withSpring` (lightweight, no layout recalculation)

---

## Future Enhancements

- **Scroll-triggered rotation:** Animate `rotateY` from -25deg to -15deg as books enter the viewport using `useScrollOffset` + `interpolate`. Adds per-item animated styles but creates a "settling into place" feel.
- **Spine text:** Render the series name vertically on the spine strip.
- **Page-edge texture:** Thin horizontal lines on a right-edge strip to simulate paper.
- **Three.js detail view:** If users request richer 3D (environment reflections, bump-mapped covers), add `react-native-wgpu` + Three.js for the detail view only. Requires Expo SDK 54+.
- **Dominant color extraction:** Use `expo-image` or a palette library to sample the actual cover's dominant color for the spine, rather than a fixed dark brown.

---

## References

- [Reanimated useAnimatedStyle](https://docs.swmansion.com/react-native-reanimated/docs/core/useAnimatedStyle/) — worklet-based animated styles
- [Reanimated withDecay](https://docs.swmansion.com/react-native-reanimated/docs/animations/withDecay/) — inertia physics
- [Reanimated withSpring](https://docs.swmansion.com/react-native-reanimated/docs/animations/withSpring/) — spring animations
- [Reanimated Handling Gestures](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/handling-gestures/) — gesture + worklet integration
- [CSS 3D Book Technique](https://scastiel.dev/animated-3d-book-css) — spine + gradient approach adapted for RN
- [RN Transform Origin Workaround](https://chrizog.com/react-native-rotation-anchor-point) — translateX pivot trick
