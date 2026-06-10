---
date: 2026-06-05
topic: visual-shelf-scanner
---

# Visual Shelf Scanner (Spine Recognition → Owned Shelf)

## What We're Building

Evolve the scan tab from a single-ISBN barcode reader into a **shelf scanner**: the
user shows as much of their bookshelf as possible, the app silently captures one or
more photos, reads the text off each spine on-device, fuzzy-matches that text against
the Star Wars catalog, and presents a review queue of recognized books to add to the
owned shelf in one batch.

**Flow:** prompt user to frame their shelf → silent capture → **Finish / Continue**
(continue = take more photos to cover the rest of the library) → per-photo on-device
OCR → union matches across photos → review queue (confirm/deselect) → add selected to
owned shelf via the existing `toggleShelf(bookId, 'owned')` path.

The existing barcode scanner is **baked in** as a secondary mode: a first-run dialogue
explains the user can either scan their whole shelf at once or scan individual barcodes
to add books one at a time.

## Why This Approach

We deliberately rejected two tempting-but-wrong paths:

- **Live pan recognition** (recognize spines in real time as the camera moves) — the
  most demanding interaction; conflicts with "ship simplest first." Replaced by silent
  multi-capture with a Finish/Continue prompt, which covers an arbitrarily large
  library with near-zero user effort.
- **Pixel stitching** the photos into one composite to dedupe — panorama
  stitching is fragile, heavy on-device, and *especially* bad here because Star Wars
  spines look alike (shared logos/series banding cause misalignment and ghosting). It
  solves dedupe at the wrong layer.

Instead we **dedupe in data space**: recognize each photo independently and **union the
matched book IDs**. A book appearing in two overlapping photos collapses to the same
catalog entry automatically — no alignment math, far more reliable. The only thing this
can't distinguish is two physical copies of the same title, an acceptable edge case.

On-device OCR satisfies every stated constraint at once: free, offline, private, no API
keys, no server, and it handles rotated text — fitting both "simplest to ship" and
"avoid server cost."

We adopt **VisionCamera** (`react-native-vision-camera`) as the camera foundation rather
than the simpler expo-camera + one-shot-OCR path. Rationale is "build once, iterate":
VisionCamera is the only RN camera with frame processors, which is the exact substrate
for the eventual live-pan goal. v1 still uses captured stills (`takePhoto()` → OCR), so
there's no added v1 complexity from frame processing — but graduating to real-time
live-pan recognition later becomes a feature flag, not a rewrite. It also unifies both
modes under one camera stack (its built-in `useCodeScanner` covers the baked-in barcode
reader), replacing the current expo-camera scanner.

## Key Decisions

- **Interaction:** Silent multi-capture, not live pan. User frames shelf → app snaps →
  Finish/Continue loop until the whole library is covered.
- **Shutter:** Hands-free auto-capture — fire when the frame is steady and in focus
  (motion + focus gating to reject blur). No manual tap required in v1.
- **Coverage aid:** An edge "ghost" overlay of the previous shot helps the user line up
  the next section with deliberate overlap, so no shelf segment is missed. (Overlap
  itself is harmless — data-space dedupe collapses repeats; the ghost is about avoiding
  *gaps*, not dedupe.)
- **Capture feedback / delight:** OCR is batched at the end, but each capture gets an
  immediate flourish — the still scales down and morphs into little book shapes that
  drop one-by-one into a small "processing library" indicator. This is a
  capture-confirmation animation (illustrative, not a live recognition count); real
  matches appear in the review queue once batch processing finishes.
- **Recognition signal:** OCR-first (read spine title/author text), fuzzy-match to
  catalog. The "visual match" fallback is deferred — unclear spines are simply skipped.
- **Matching (runs on-device, in JS, against the in-memory `useBooks()` catalog —
  instant, no server):**
  - **Catalog-driven, not spine-driven.** No spine segmentation in v1. Pool all OCR
    lines from a photo into one text bag, then for each catalog book score how many of
    *its* distinctive title/author/series tokens appear in the bag. Iterating over the
    catalog (a few hundred SW books) instead of over spines reconciles "no segmentation"
    with "title+author+series matching": author and series become corroborating signals
    without needing to know which text belongs to which spine, dedupe-by-book is
    automatic, and ranked candidates fall out naturally.
  - **Signals & weighting:** Title + author + series. Rare/distinctive tokens (e.g.
    "Plagueis", "Mara", "Bane") weighted far higher than ubiquitous ones ("Star", "Wars",
    "Jedi", "Darth") — a TF-IDF-style weighting over the catalog vocabulary — so shared
    words don't drive collisions.
  - **Confidence = score + margin.** Tier each match by its weighted score *and* the gap
    between the #1 and #2 candidate. Near-ties → low confidence ("double-check these");
    clear winners with adequate score → high confidence (pre-selected); below floor →
    skipped.
  - **Output:** Ranked top-N candidates per recognized book (feeds the review-queue swap
    UI), each with a confidence tier.
  - **Edition collisions:** Match at the **title level** — collapse hardcover/paperback
    and Canon/Legends reissues, add one canonical row to the owned shelf.
- **Dedupe:** Result-level union of matched book IDs across photos. No pixel stitching.
- **Camera foundation:** `react-native-vision-camera`, chosen for frame-processor
  support so the future live-pan goal is a flag, not a rewrite. Replaces expo-camera;
  its `useCodeScanner` also serves the baked-in barcode mode. Requires a config plugin +
  dev build (Expo Go already dropped, so native modules are fine).
- **Recognition engine:** On-device OCR via a VisionCamera frame-processor OCR plugin
  (e.g. `react-native-vision-camera-text-recognition`, ML Kit under the hood). Free,
  offline, handles rotation. **v1 runs OCR on captured stills** (`takePhoto()`); frame
  processors stay dormant until the live-pan iteration.
- **iOS accuracy escape hatch:** Off-the-shelf VisionCamera OCR plugins use ML Kit on
  both platforms, not Apple Vision. If iOS accuracy disappoints, write a custom Apple
  Vision frame-processor plugin — same architecture, no rebuild. Start on ML Kit.
- **Shelf population:** Review queue. All matches shown; user confirms/deselects before
  anything is written to the owned shelf. Decisions:
  - **Layout:** List rows by default (cover + title/author/series, easy to scan), with a
    user toggle to a cover grid ("books are the hero" view).
  - **Selection & confidence:** High-confidence matches are pre-selected; low-confidence
    matches drop into a separate "double-check these" group, unselected by default.
  - **Correcting wrong matches:** Tap a row to see ranked alternative candidates and swap
    among them, with a catalog-search fallback to pick manually. (Implies the matcher
    returns **ranked top-N candidates per spine**, not just a single best guess.)
  - **Already-owned:** Recognized books already on the owned shelf show an "already in
    library" badge and are excluded from the add — confirms they were seen, no no-op
    writes.
- **Non-catalog books:** Ignored silently. Only catalog matches surface in v1.
- **Orientation:** Assume mixed vertical/horizontal spines; rely on ML Kit's rotation
  handling.
- **Relationship to barcode scanner:** Shelf scan is the primary flow; barcode reading
  is retained as a secondary mode. First-run dialogue introduces both.
- **Data model:** No schema changes. Reuse `books` (catalog), `user_books.owned`, and
  the existing `useUserBooks().toggleShelf` mutation.
- **Failure & empty states:**
  - **Zero matches:** Helpful empty state naming likely causes (lighting, distance,
    not-in-catalog) + Retry, and offer the barcode mode as a fallback.
  - **Bad capture quality:** Gate silently (auto-capture only clean, in-focus frames);
    if too many frames are unusable, surface a "hard to read — try better light" hint.
  - **All low-confidence:** Reassuring framing — header "Found these — tap to confirm",
    everything in the double-check group, no scary empty "confident" section.
  - **Offline at add:** Queue the adds locally and sync when back online, telling the
    user it'll finish later. (Net-new infra — see open questions.)

## Open Questions

- **Matching tuning (approach decided; values TBD in planning):** How distinctive-token
  weights are computed (precompute a TF-IDF table over the catalog at build time vs at
  runtime on catalog load?); per-token edit-distance tolerance for OCR noise (l/1, O/0,
  partial words); and the actual numeric cutoffs for the high / low / skip tiers and the
  #1-vs-#2 margin. Needs real OCR samples from a shelf photo to calibrate.
- **Bag-matching false positives:** A distinctive token from book A could appear on book
  B's spine (cover-blurb text, "from the author of…"). How aggressively to guard (e.g.
  require title-token coverage, not just one rare token) without hurting recall.
- **OCR → spine segmentation:** ML Kit returns text blocks for a whole image. How do we
  attribute blocks to individual spines (especially with mixed orientation)? Per-block
  match against catalog may be enough without explicit segmentation.
- **Plugin specifics:** Confirm the exact VisionCamera OCR frame-processor plugin
  (engine, rotation support, whether it exposes a still-image OCR path or only live
  frames — if frame-only, v1 may run a frame processor on a brief capture burst instead
  of `takePhoto()`), and Expo config-plugin + worklets (`react-native-worklets-core`)
  compatibility with the current SDK 54 setup.
- **expo-camera migration:** Scope the swap of `app/(tabs)/scan.tsx`'s `CameraView`
  barcode flow to VisionCamera's `useCodeScanner` without regressing the existing reader.
- **Auto-capture tuning:** What steadiness/focus thresholds trigger a shot, and the
  min interval between auto-captures so panning to a new section yields exactly one clean
  frame (not a burst of near-duplicates)? Is there a max-photo cap or a nudge to Finish?
- **Processing-tray animation:** How many "books" drop per capture if the count isn't
  known yet (fixed handful? scale to detected text blocks?), and what the indicator
  shows during the final batch OCR pass (spinner, progress, running tally as photos
  resolve).
- **Ghost overlay source:** Use the full previous frame at low opacity, or just an edge
  strip? How to keep it legible against a busy shelf.
- **Review queue UX:** How to present matches (cover grid? list?), how to show
  confidence, and how to handle a book already on the owned shelf (dim/skip).
- **Graduation path:** If on-device text-only accuracy disappoints, the matching layer
  stays identical when adding a cloud-vision fallback (Approach C) — worth keeping the
  recognition step cleanly abstracted.
- **Offline add queue (cost decision):** The app currently writes directly via
  `toggleShelf` with no offline support. The chosen "queue locally + sync later" needs
  net-new infra (persisted pending-adds store + sync/retry). Decide in planning whether
  v1 ships the full queue or starts with "Add requires connection" and adds the queue as
  a fast follow.
- **"Too many bad frames" threshold:** What fraction/count of rejected frames triggers
  the "try better light" hint, and how the quality gate (blur/exposure) is measured.

## Next Steps

→ `/workflows:plan` for implementation details (VisionCamera + OCR plugin setup and
dev-build impact, expo-camera→VisionCamera barcode migration, capture loop + state
machine, OCR→catalog matching module, review-queue screen, first-run mode dialogue, and
how shelf-scan/barcode modes share the scan tab).
