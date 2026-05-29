# iOS App Icons — Brainstorm

**Date:** 2026-05-07
**Status:** Shipped (Approach B — Icon Composer `.icon`)

## What We're Building

Proper iOS app icon support for OssusArchives. Today, `app.json` points to a single `./assets/images/icon.png` via the top-level `expo.icon`. iOS uses that as a fallback for every appearance, which means we miss dark and tinted variants on iOS 18+ and skip the Liquid Glass treatment available on iOS 26.

Goal: ship an icon setup that looks right in every iOS appearance mode (light, dark, tinted) and is easy to iterate on as the brand evolves.

## Current State

- `app.json` → `expo.icon: ./assets/images/icon.png` (single 1024×1024)
- No `ios.icon` block — iOS uses the top-level icon for all appearances
- Android already has full adaptive icon (foreground / background / monochrome)
- App is locked to dark mode (`userInterfaceStyle: "dark"`) and uses Liquid Glass tab bars

## Approaches Considered

### Approach A — Multi-variant PNG icons (recommended)

Provide three 1024×1024 PNGs and wire them via `ios.icon` as an object:

```jsonc
"ios": {
  "icon": {
    "light": "./assets/images/ios-icon-light.png",
    "dark":  "./assets/images/ios-icon-dark.png",
    "tinted": "./assets/images/ios-icon-tinted.png"
  }
}
```

- **Pros:** Works in managed workflow, no prebuild, ships in EAS Build today, supported by Expo SDK 51+. iOS 18+ users automatically get the right variant. Dark variant matches our `#0A0A0C` background; tinted variant respects Apple's monochrome treatment.
- **Cons:** Three assets to maintain. Static — no Liquid Glass parallax or specular highlights.
- **Best for:** Shipping the right thing now, with minimal complexity. Matches our managed-workflow conventions.

### Approach B — iOS 26 Icon Composer (.icon file)

Use Xcode's Icon Composer to author a layered `.icon` bundle (background, mid, foreground layers + glass material). Wire it in via a custom Expo config plugin or `expo prebuild` + manual asset placement.

- **Pros:** Native Liquid Glass effects (parallax, specular, dynamic tint). Future-proof for iOS 26+. Highest production value.
- **Cons:** Requires either prebuild (breaks managed workflow) or a custom config plugin. More authoring effort. Falls back to PNG anyway on iOS ≤ 25, so we still need Approach A's assets.
- **Best for:** A polish pass after the PNG variants are live, especially if we want the icon to feel like a hero element on iOS 26 home screens.

### Approach C — Status quo (single PNG)

Leave `expo.icon` as-is.

- **Pros:** Zero work.
- **Cons:** Looks wrong in dark and tinted modes on modern iOS. Inconsistent with Android, which already has full adaptive support. Not "proper."
- **Best for:** Not recommended.

## Outcome

**Shipped Approach B (Icon Composer `.icon`).**

The original recommendation was Approach A (PNG trio) as a baseline with B as optional polish. In practice, the user authored an `App-Icon.icon` bundle directly in Icon Composer, and Expo SDK 54's `ios.icon` accepts a `.icon` directory path natively — so we skipped A entirely.

Icon Composer encodes light / dark / tinted / mono layers in a single bundle, which made the PNG-trio approach moot. Verified on device 2026-05-07.

## What Shipped

1. **Asset:** `assets/images/App-Icon.icon` (Icon Composer bundle) — single source of truth, encodes all appearance variants natively.
2. **Config:** Added `ios.icon: "./assets/images/App-Icon.icon"` to [app.json](../../app.json). Top-level `expo.icon` retained as cross-platform fallback.
3. **Build:** Verified on device after a fresh native build (Expo Go uses its own icon, so `.icon` bundles only render in dev/prod builds).

## Notes for Future Icon Work

- **`.icon` requires Xcode 26+.** EAS Build's current iOS image handles this; local builds need Xcode 26 installed.
- **Native asset, not JS.** Edits to the `.icon` bundle require a fresh build — JS reload won't pick them up.
- **Splash alignment:** `splash-icon.png` remains a separate PNG. Worth a future check that splash and icon read as the same brand at a glance.
