---
title: "Shelf scanner: device calibration method (gyro gate, MATCH_CONSTANTS, thermal/battery)"
date: 2026-11-07
tags: [app, shelf-scan, ocr, expo-text-extractor, calibration, gyroscope, thermal, accessibility, qa]
area: app (Expo) — shelf scanner (`lib/shelf-scan.ts`, `lib/spine-match.ts`, `hooks/useShelfScan.ts`)
symptoms:
  - "SHELF_SCAN_CONSTANTS still labelled Provisional (lib/shelf-scan.ts)"
  - "MATCH_CONSTANTS tuned on desktop macOS Vision with 3 photos, not the shipping engines"
  - "No thermal/battery check on a full 20-photo scan"
status: method documented; device run outstanding (#76)
---

# Shelf scanner device calibration

The matcher was calibrated in Phase 4.5 (plan `docs/plans/2026-06-08-feat-visual-shelf-spine-scanner-plan.md`)
on 3 shelf photos OCR'd by **desktop macOS Vision**, cut into tiles. The app ships
`expo-text-extractor` (Apple Vision on iOS, ML Kit on Android) on full-resolution
`takePictureAsync` stills. The gyro auto-capture gate (`SHELF_SCAN_CONSTANTS`) has never
been tuned on a device. This page is the procedure for re-checking all three on real
hardware and deciding whether any value changes.

## What gets measured

| Area | Values | File |
|---|---|---|
| Auto-capture gate | `STEADY_MAX_MAGNITUDE` (0.15 rad/s), `STEADY_HOLD_MS` (600), `MIN_CAPTURE_INTERVAL_MS` (1200), `MAX_CAPTURES` (20) | `lib/shelf-scan.ts` |
| Gyro sampling | `GYRO_INTERVAL_MS` (100) | `hooks/useShelfScan.ts` |
| Matching | `HIGH_SCORE` 0.6, `HIGH_MARGIN` 0.12, `LOW_SCORE` 0.4, `MIN_TITLE_TOKEN_COVERAGE` 2, `MAX_TITLE_TOKEN_DF` 5, `SUPPORT_BOOST`/`SUPPORT_CAP` | `lib/spine-match.ts` |
| Device cost | thermal state, battery drop, time to review, memory | — |

## Setup

- A **release-configured dev build** on a physical device (the simulator no-ops the gyro and
  has no real camera). iPhone first; repeat on a low-RAM Android if one is available.
- Battery 80–100%, not charging, Low Power Mode off, room temperature, brightness fixed.
- A test shelf: 3–5 sections of Star Wars books with known catalog matches, plus off-catalog
  noise (non-SW books, DVDs). Write the ground-truth list (catalog slug per visible spine)
  **before** scanning.
- The `.calibration/` harness (`ocr.swift`, `calibrate.ts`) is local-only and gitignored
  (it holds personal photos). It is not needed for the device run; it is only for an
  offline sweep of `MATCH_CONSTANTS` against saved fragments (step 3).

## 1. Gyro gate (auto-capture feel)

Run 5 scans of the same shelf, panning at a normal pace. For each, note:

- **Missed holds:** you held steady about 1 s and no photo fired.
- **Phantom fires:** a photo fired while still moving, or twice on one framing.
- **Cadence:** photos per shelf section (target: 1–2 with visible overlap in the ghost).

To see raw values, temporarily log the gyro magnitude in the `Gyroscope.addListener`
callback in `hooks/useShelfScan.ts` (dev build, `__DEV__` only, never committed), and read
the steady-hand range from Metro.

Decide:
- Misses with steady-hand magnitudes just above 0.15: raise `STEADY_MAX_MAGNITUDE` to the
  observed steady p90 plus a small margin.
- Phantom fires: lower `STEADY_MAX_MAGNITUDE` or raise `STEADY_HOLD_MS` (100 ms steps).
- Duplicate framings: raise `MIN_CAPTURE_INTERVAL_MS`.
- Change one constant at a time and re-run the 5 scans.

## 2. Thermal and battery on a 20-photo scan

Do 3 back-to-back full scans to the `MAX_CAPTURES` cap (20), then Finish each one.

- Battery % before and after the set (iOS: Settings > Battery; Android: `adb shell dumpsys battery`).
- Thermal: Xcode > Debug Navigator > Energy Impact and `ProcessInfo.thermalState`
  (Instruments > Thermal State), or Android Studio Profiler > Energy. Note the peak state.
- Time from Finish to the review screen (stopwatch) and peak memory (Xcode memory gauge).
- Hand-feel: is the phone warm, does the preview stutter late in the scan?

Pass: thermal state stays nominal or fair, no memory warnings or crash, Finish to review
under about 5 s on 20 photos, battery drop under about 3% per scan. If it fails, lower
`MAX_CAPTURES` or capture quality before touching anything else, and record why.

## 3. Matching on the shipping OCR engine

For each of the 5 scans in step 1, compare the review queue to the ground truth:

- **High bucket:** true positives and false positives. Target precision ≥ 0.95 (the plan's
  criterion), excluding non-book media labelled with a catalog title (a known FP class).
- **Low bucket:** true and false positives.
- **Misses:** ground-truth books in neither bucket.

To sweep thresholds offline, save the OCR fragments a device scan produced (dev-only
`console.log` of `stateRef.current.fragments` before `matchFragments`) into
`.calibration/` and run the harness `--sweep` against them. `matchFragments` and
`classifyConfidence` take an optional `constants` override for this; app code never
passes one.

Decide:
- Keep the current values if high precision ≥ 0.95 and high recall did not drop more than
  about 10 points versus Phase 4.5 (1.00 on 28 books).
- Otherwise change one constant at a time, bias to precision, and reject a change that only
  fixes one spine (Phase 4.5 rejected `HIGH_SCORE` 0.74 for that reason).
- `LOW_SCORE` stays at or below 0.4 unless the data says otherwise: weak but true
  title-only spines must still reach "Double-check these".

## 4. Screen reader pass (VoiceOver and TalkBack)

The labels were added by code review (#76). On device, confirm with the screen reader on:
the manual-shutter hint replaces auto-capture, each capture is announced, Finish reads the
photo count, the review announces the recognized count, rows read title, author, and
"already owned" or "double-check this match", the swap sheet traps focus (VoiceOver) and a
two-finger scrub closes it, and barcode results are spoken.

## Where results go

- New values: edit the constant in place with a dated comment naming the device, engine,
  sample size, and metric (for example `// 2026-11-xx iPhone 17 Pro, Apple Vision via
  expo-text-extractor, 5 scans / 40 books: high P 0.97 R 0.93`). Drop "Provisional" from
  the `SHELF_SCAN_CONSTANTS` doc comment once the gate is tuned.
- Measurements: append a "Device calibration" section to this page with the device, OS,
  build, the per-scan table, and the thermal/battery numbers.
- Update the Phase 4.5 / Phase 6 caveats in the scanner plan to point here.
- Run `npm run verify`. Constant changes are JS-only, so they ship OTA (check the
  fingerprint per `docs/agents/releases.md`).
