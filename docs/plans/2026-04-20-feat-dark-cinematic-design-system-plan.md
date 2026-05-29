---
title: "feat: Dark Cinematic Design System"
type: feat
date: 2026-04-20
---

# Dark Cinematic Design System

## Overview

Apply the design principles from `.impeccable.md` across the entire app. The core problem: 3D book covers (the app's signature element) sit on default white Expo surfaces with hardcoded colors. The app needs dark cinematic surfaces, a token-based color system, lightsaber blue accent, and consistent visual personality.

## Priority Order

Work from foundation outward — tokens first, then surfaces, then component-level refinements.

---

## Step 1: Design Token System

File: `constants/tokens.ts`

Create semantic color tokens that all components reference. Design for future theming (Sith red, Mandalorian green).

```typescript
const jediBlueTheme = {
  accent: {
    primary: '#4A90D9',      // lightsaber blue — buttons, active states, toggles
    secondary: '#FFE81F',    // Star Wars yellow — scanner, emphasis, badges
  },
  surface: {
    background: '#0A0A0C',   // near-black
    card: '#1A1A1E',         // elevated surfaces
    input: '#1A1A1E',        // search bar, text inputs
  },
  border: {
    subtle: 'rgba(255,255,255,0.08)',
    accent: 'rgba(74,144,217,0.3)', // blue tint border
  },
  text: {
    primary: '#ECEDEE',
    secondary: 'rgba(255,255,255,0.6)',
    hint: 'rgba(255,255,255,0.3)',
    inverse: '#0A0A0C',     // for text on accent buttons
  },
  badge: {
    canon: '#1a3a5c',
    legends: '#5c3a1a',
  },
  status: {
    error: '#c44',
    success: '#4A90D9',
  },
};
```

- [ ] Create `constants/tokens.ts` with the theme object above
- [ ] Export a `useTheme()` hook (returns the current theme — hardcode Jedi blue for now)
- [ ] Update `constants/theme.ts` to reference tokens (keep backward compat with `Colors` for tab bar)

## Step 2: Dark Surfaces + Navigation Chrome

Apply dark backgrounds and navigation styling globally.

- [ ] Root layout: set `DarkTheme` as default (remove light/dark toggle for now — dark only)
- [ ] Tab bar: dark background (`#0A0A0C`), lightsaber blue active tint (`#4A90D9`), `rgba(255,255,255,0.3)` inactive
- [ ] Navigation header: dark background, light text, no border/shadow (or very subtle border)
- [ ] Status bar: light content on dark background
- [ ] All screen containers: `backgroundColor: tokens.surface.background`

## Step 3: Catalog Screen

- [ ] Dark background
- [ ] Search bar: dark surface (`#1A1A1E`), subtle border, search icon (magnifying glass) on left, placeholder in hint color
- [ ] Filter chips: border style instead of fill. Inactive: subtle border + secondary text. Active: lightsaber blue border + blue text (or blue fill + inverse text)
- [ ] Book count text: hint color
- [ ] List item separators: subtle `rgba(255,255,255,0.05)` line or consistent padding
- [ ] Loading state: lightsaber blue ActivityIndicator on dark background
- [ ] Error state: dark card surface with error color accent, retry button in accent blue
- [ ] Empty search: hint color text on dark background

## Step 4: Book Card (List Item)

- [ ] Dark background, no white text on white
- [ ] Title: text.primary color
- [ ] Author: text.secondary color
- [ ] Series text: text.hint color
- [ ] Canon/Legends badges: keep existing colors (they work on dark)
- [ ] Consider: subtle shelf indicator icon if the user has this book shelved

## Step 5: Book Detail Screen

- [ ] Dark background for the entire screen
- [ ] Cover: larger breathing room, centered on dark surface — the hero moment
- [ ] Group metadata into a dark card section (`surface.card` with subtle border)
- [ ] Title: larger, bolder, text.primary
- [ ] Author: text.secondary
- [ ] Metadata (type, publisher): text.hint, grouped in a row
- [ ] Synopsis: text.primary, comfortable line height, in its own section
- [ ] Format chips: dark surface with subtle border (not `#f0f0f0`)
- [ ] Shelf buttons: accent.primary (blue) when active instead of badge navy. Inactive: dark surface with border. Text changes to inverse when active.
- [ ] "Add to Shelf" label: bolder, text.primary

## Step 6: Bookshelf Screen

- [ ] Dark background
- [ ] Filter chips: same treatment as catalog (border style, blue active)
- [ ] Empty state: dark surface, evocative copy ("Your collection awaits"), lightsaber blue primary CTA, ghost/border secondary CTA. Drop the system emoji — use an icon or just bold text.
- [ ] Empty filter state: hint text on dark background

## Step 7: Scanner Screen

- [ ] Already mostly correct (dark background, yellow accent). Verify it matches tokens.
- [ ] Result card: use `surface.card` instead of `rgba(255,255,255,0.08)`
- [ ] "View Book" button: accent.primary (blue) instead of yellow? Or keep yellow as scanner-specific accent.

## Step 8: Profile Screen

- [ ] Dark background
- [ ] Section labels: text.hint
- [ ] Values: text.primary
- [ ] Sign out button: dark surface with border, error color text
- [ ] Version text: text.hint

---

## Acceptance Criteria

- [ ] All screens use dark surfaces — no white/light gray backgrounds anywhere
- [ ] All colors reference tokens from `constants/tokens.ts` — zero hardcoded hex in screen/component files (except tokens.ts itself and Book3D cover fallback palette)
- [ ] Tab bar: dark background, lightsaber blue active icon
- [ ] Nav headers: dark background, light text
- [ ] Active interactive elements (filter chips, shelf buttons) use lightsaber blue
- [ ] Search bar has a search icon and dark surface treatment
- [ ] Book detail feels like a "hero moment" — cover prominent, metadata grouped
- [ ] Empty bookshelf is evocative, not generic
- [ ] 3D book covers look better on dark backgrounds than on white (this is the whole point)

---

## Non-Goals

- Custom fonts (system fonts are fine)
- Theming UI (future — just build the token structure for it)
- Animations beyond what already exists (3D covers, press feedback)
- New features — this is a visual pass on existing screens only
