---
title: ossusarchives.com — Fullscreen hyperspace hero video + top-left datapad card
type: feat
date: 2026-08-05
---

# ✨ ossusarchives.com — Fullscreen hyperspace hero + top-left datapad card

## Overview

Replace the centered text stub at `/` with a fullscreen hyperspace video hero. Move the copy to a
top-left card styled like the app's shared datapad card — notch footer included — left-aligned, and swap
"Coming soon to iOS." for a lightsaber-blue pill button: "Join the TestFlight" →
<https://testflight.apple.com/join/pT9n8FCC>.

Scope: one page rewrite, one new client component, two static assets, one `next.config.ts` headers rule.
No DB, no auth, no new routes. The page stays `force-static`.

## Problem Statement / Motivation

- `/` is a placeholder ([admin/app/page.tsx:13-27](admin/app/page.tsx:13)): centered text, no product
  imagery, and a dead-end "Coming soon to iOS." line with nothing to click.
- TestFlight is live. The site has no path into it.
- A finished hyperspace render of the app already exists and isn't being used anywhere.

## Research Findings

### The marketing site is the admin app

`admin/` is a single Next.js 15 App Router deployment serving all of ossusarchives.com — `/` (marketing),
`/privacy`, and the gated `/admin/*`. Established in
[docs/plans/2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md](docs/plans/2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md).

| Fact | Source | Why it matters |
|---|---|---|
| Vercel project root is `admin/` | [admin/vercel.json](admin/vercel.json) | New assets go in `admin/public/`, served at `/…` |
| `admin/public/` **does not exist** | — | Must be created |
| Middleware matcher is `/admin/:path*` only | [admin/middleware.ts:9-11](admin/middleware.ts:9) | `/` and static assets bypass auth. No change needed |
| Next 15 pinned deliberately | prior plan | Keep `export const dynamic = 'force-static'` |
| `lucide-react` already a dependency | [admin/package.json](admin/package.json) | `ExternalLink` available, no install |
| Dark-only, `<html className="dark">` | [admin/app/layout.tsx](admin/app/layout.tsx) | No light-mode variants |
| Biome: tabs, single quotes, semicolons, width 100 | [admin/biome.json](admin/biome.json) | Root `biome.json` **ignores** `admin/` — lint from `admin/` or these files are silently skipped |
| Biome is a **root** dependency, not `admin/`'s | `admin/package.json` has no biome | `biome check .` resolves via root `node_modules/.bin`. `npm run admin:install` alone leaves it missing |
| `admin/lib/env.ts` parses env at module load | [admin/lib/env.ts:10](admin/lib/env.ts:10) | ⚠️ `next build` **fails without** the 4 Supabase vars |
| **This worktree has no `node_modules`** | verified | ⚠️ `npm ci` at root **and** in `admin/` before Phase 3 |
| Tailwind preflight sets `img,video { height: auto }` | compiled from `admin/app/globals.css` | ⚠️ **`inset-0` alone does not stretch replaced elements** — see the `size-full` note below |
| No `next/image` lint rule active | script is `biome check .`, not `next lint` | A plain `<img>` is fine (and correct — we need `object-cover` on a raw element) |

### The source video — inspected

**Location: `/Users/ethan/Desktop/_website-2026/_videos/ossusarchives-hyperspace.mp4` — outside the repo.**
(There is no `_videos/` folder in `sw-books`.)

```
1920x1080 · h264 · yuv420p · 60 fps · 19.367 s · 30.5 MB · 12.6 Mbps
```

Content: an iPhone mockup tumbling through a radial hyperspace star-streak tunnel, cycling through app
screens (Archives list → book detail → Timeline with a book cover). Rendered in Rotato — the project file
`ossusarchives-hyperspace.rotato` sits beside it.

1. **The phone is dead-center, the corners are dark.** Top-left is the darkest region of frame and
   contains no subject. The card lands in empty space, and no readability scrim is needed.
2. **The loop seam is nearly clean.** First and last frames have *identical camera geometry and identical
   starfield positions*; only the phone's on-screen content differs (Archives vs. Timeline). A plain
   `loop` will not pop geometrically. If the screen-content change reads badly, crossfade the tail into
   the head — but ship without it first.
3. **`object-cover` crops correctly at every aspect.** The subject is centered, so narrow viewports crop
   the empty sides. At 390×844 the visible slice is ~26% of frame width; the phone occupies ~16%
   centered — it stays fully in frame.

### Measured encoding data

Real encodes of this source, VMAF scored against a CRF-12 30fps reference:

| Encode | Size | VMAF |
|---|---|---|
| x264 crf26 **with** `-g 60 -keyint_min 60 -sc_threshold 0` | 2.83 MB | 95.51 |
| **x264 crf26, GOP flags removed** | **1.51 MB** | **95.27** |

**The fixed-GOP flags cost 47% of the file for −0.24 VMAF.** They force a keyframe every 2s — 10 I-frames
instead of 3 — and I-frames on dense star-noise are enormously expensive. Fixed GOP exists for seeking and
adaptive streaming; a background loop is never seeked.

VP9 and AV1 were measured too and both lose. VP9 crf34 is 2.31 MB at VMAF 93.68 — bigger *and* worse than
x264. AV1 wins on quality-per-byte but, like VP9, has no hardware decoder on Apple Silicon (pre-M3) or most
Intel laptops, so a forever-looping background video would burn CPU and battery on every visit. **Ship one
H.264 file** — hardware-decoded on everything.

**Poster:** at `-q:v 4` the JPEG measures 204 KB. The same frame as `cwebp -q 68` is **101 KB**. WebP works
for both `<img src>` and `<video poster>` (Safari 14+). `cwebp` is installed at `/opt/homebrew/bin/cwebp`.

### Decisions taken (confirmed with the user)

| Decision | Choice |
|---|---|
| Privacy Policy link | Stays **inside the text card**, below the button |
| Card treatment | **Exact app match** — opaque `#1A1A1E`, no translucency/blur |
| Mobile (<768px) | **Poster image only** — no video download |
| Source video | **Encoded derivatives only** in `admin/public/`; 30.5 MB master stays on the Desktop |

### Style targets — measured from the app

**Card** — [components/ui/card.tsx](components/ui/card.tsx), the shared shell that
[components/book-card.tsx:36](components/book-card.tsx:36) wraps every book row in. It has **no border**
and carries a skeuomorphic **datapad notch footer**:

```ts
// card
backgroundColor: tokens.surface.card,   // #1A1A1E → bg-card
borderRadius: 12,                       //         → rounded-[12px]  (⚠️ Tailwind rounded-xl = 14px here)
borderWidth: 0,                         //         → no utility; preflight already emits `border: 0 solid`
overflow: 'hidden',                     //         → overflow-hidden (clips the notch tab)
// body
padding: 12,                            //         → p-3
// notchStrip — 12px tall, sits below the body, inside the card
height: 12, paddingHorizontal: 12, paddingRight: 24,   // → h-3 pl-3 pr-6, flex, items-start, justify-between
// lightBars (left): two bars, gap 4
{ width: 32, height: 4, borderRadius: 2, bg: tokens.border.subtle }   // → h-1 w-8 rounded-[2px] bg-border
{ width: 8,  height: 4, borderRadius: 2, bg: tokens.border.subtle }   // → h-1 w-2 rounded-[2px] bg-border
// notchTab (right)
{ width: 88, height: 12, borderTopLeftRadius: 16, borderTopRightRadius: 16,
  bg: tokens.surface.background }       // #0A0A0C → h-3 w-[88px] rounded-t-[16px] bg-background
```

Three things verified against compiled Tailwind output rather than the documented scale:

- `items-start` on the strip is **load-bearing**. Without it CSS's default `stretch` makes the lightBars
  wrapper 12px tall, and its own `items-center` then centers the 4px bars at y=4–8 instead of y=0–4.
- RN resolves `paddingRight` over `paddingHorizontal`, so the strip is **12L / 24R**, not 24/24.
- `rounded-t-[16px]` on a 12px-tall box **clamps to 12px** — in RN *and* CSS, by the same rule. The 16 is
  nominal on both sides. Don't "fix" it.

**Button** — [components/buy-on-amazon-button.tsx:54-71](components/buy-on-amazon-button.tsx:54):

```ts
height: 52, borderRadius: 100, gap: 10,      // → h-13 rounded-full gap-2.5
backgroundColor: tokens.accent.primary,      // #4A90D9 → bg-primary
color: tokens.text.inverse,                  // #0A0A0C → text-primary-foreground
fontSize: 16, fontWeight: '600',             // → text-base font-semibold
pressed: { opacity: 0.85 },                  // → active:opacity-85  (NOT hover-only — see below)
icon: ExternalLink size={18} strokeWidth={2.5}
```

Colors map exactly to [admin/app/globals.css](admin/app/globals.css) — no new CSS vars. The one
approximation is body copy: `text-muted-foreground` is `#9d9da1`, whereas `tokens.text.secondary`
(`rgba(255,255,255,0.6)`) composites over the card to ≈`#a3a3a5`, ~4% lighter. Sub-perceptual, and the
affected text has no direct RN counterpart, so the admin's own token wins.

`h-13`/`gap-2.5`/`text-base` are used over `h-[52px]`/`gap-[10px]`/`text-[16px]` — identical computed
values, but rem-derived, so the button honors a user's root font-size setting. Radii and the 88px tab stay
absolute px, which is the normal web convention.

## Proposed Solution

```
admin/
  public/hero/
    hyperspace-1080.mp4            ~1.5 MB   H.264, desktop/tablet only
    hyperspace-poster.webp         ~100 KB   LCP element; also the <video poster>
  app/
    _components/hero-backdrop.tsx  NEW  'use client' — poster always, video layered on top
    page.tsx                       EDIT layout + card + button
  next.config.ts                   EDIT immutable cache headers for /hero/*
```

### Layout

```
┌─ <main> relative min-h-svh ────────────────────────────┐
│  <HeroBackdrop/>  poster img + (desktop) video, both   │
│                   absolute inset-0 size-full           │
│  ┌ p-6 sm:p-10 lg:p-16 ─────────────────────────────┐  │
│  │ ┌ card max-w-md ────────┐                        │  │
│  │ │ Ossus Archives        │      (phone mockup      │  │
│  │ │ A datapad for your…   │       lives here,       │  │
│  │ │ [ ⧉ Join the TestFlight ]     dead-center)      │  │
│  │ │ Privacy Policy        │                        │  │
│  │ │ ▬ ▪         ╭──────╮  │  ← CardNotch footer     │  │
│  │ └─────────────┴──────┴──┘                        │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### ⚠️ `size-full` is mandatory on the media layer

Tailwind v4 preflight emits `img, video { max-width: 100%; height: auto; }`. That author-origin
`height: auto` **overrides the `width`/`height` attributes**, and for an absolutely-positioned *replaced*
element the height resolves from the intrinsic ratio rather than stretching between `top:0` and `bottom:0`.

Measured in Chrome without `size-full`:

| viewport | media box | uncovered |
|---|---|---|
| 1440×900 | 1440×810 | **90px** black band |
| 980×2121 | 980×551 | **1569px** |

`object-cover` is a no-op in that state, because the element box already matches the media's 16:9. This
affects the poster on *every* path, mobile and reduced-motion included. `size-full` compiles to
`width:100%; height:100%` and fixes it.

### Why a client component

`prefers-reduced-motion` cannot pause a video from CSS (`display:none` still downloads and decodes), and we
need to skip the download entirely below 768px. Two non-JS approaches were checked and neither works:
`<source media="…">` is **not** supported inside `<video>` (that's `<picture>`-only), and `preload="none"`
is overridden by `autoplay`. JS is the only mechanism.

This does **not** break `force-static`. Client components are prerendered into the static HTML at build
time; importing one cannot opt a route out of static generation.

**The poster is never unmounted.** It renders on the server, is the LCP element, and stays as the base
layer for the life of the page. The video mounts *over* it — so there is no element swap, no black flash,
and no re-decode. The video also waits for `load`, so its fetch never contends with the LCP poster.

### `admin/app/_components/hero-backdrop.tsx` (new)

```tsx
'use client';

import { useEffect, useState } from 'react';

const SMALL_SCREEN = '(max-width: 767px)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const FILL_LAYER = 'absolute inset-0 size-full object-cover';

export function HeroBackdrop() {
	const [playVideo, setPlayVideo] = useState(false);

	useEffect(() => {
		// Read once. A resize or an OS motion-preference flip mid-visit isn't worth
		// listeners on a single-screen page — and skipping them also avoids
		// MediaQueryList.addEventListener, which is absent on older Safari.
		const allowed =
			!window.matchMedia(SMALL_SCREEN).matches && !window.matchMedia(REDUCED_MOTION).matches;
		if (!allowed) return;

		// Wait for `load` so the video fetch never competes with the LCP poster.
		// The readyState guard matters: async chunk loading can run this after `load`.
		if (document.readyState === 'complete') {
			setPlayVideo(true);
			return;
		}
		const onLoad = () => setPlayVideo(true);
		window.addEventListener('load', onLoad, { once: true });
		// Covers unmount before `load` fires; `once` covers the normal path.
		return () => window.removeEventListener('load', onLoad);
	}, []);

	return (
		<>
			<img
				src="/hero/hyperspace-poster.webp"
				alt=""
				width={1920}
				height={1080}
				fetchPriority="high"
				decoding="async"
				className={FILL_LAYER}
			/>
			{playVideo && (
				<video
					src="/hero/hyperspace-1080.mp4"
					poster="/hero/hyperspace-poster.webp"
					autoPlay
					muted
					loop
					playsInline
					disableRemotePlayback
					aria-hidden="true"
					tabIndex={-1}
					className={FILL_LAYER}
				/>
			)}
		</>
	);
}
```

- No `preload` — `autoPlay` already forces the fetch, and the attribute only overrides UA heuristics that
  would otherwise back off on constrained connections. Control *when the element mounts* instead.
- `disableRemotePlayback` stops Safari offering an AirPlay route for a decorative video.

### `admin/app/page.tsx` (rewrite)

```tsx
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { HeroBackdrop } from './_components/hero-backdrop';

// Public, statically rendered marketing page — no auth, no DB, crawlable.
export const dynamic = 'force-static';

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/pT9n8FCC';

export const metadata = {
	title: 'Ossus Archives — Star Wars Book Tracker',
	description: 'Track your Star Wars book collection across Canon and Legends.',
};

export default function Home() {
	return (
		<main className="relative min-h-svh bg-background">
			<HeroBackdrop />
			<div className="relative p-6 sm:p-10 lg:p-16">
				{/* Mirrors components/ui/card.tsx — the shell every book row uses */}
				<div className="w-full max-w-md overflow-hidden rounded-[12px] bg-card text-card-foreground text-left">
					<div className="space-y-4 p-3">
						<div className="space-y-2">
							<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">Ossus Archives</h1>
							<p className="text-muted-foreground text-sm leading-relaxed">
								A datapad for your Star Wars library — track every novel across Canon and Legends.
							</p>
						</div>
						{/* Matches components/buy-on-amazon-button.tsx */}
						<a
							href={TESTFLIGHT_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="flex h-13 w-full items-center justify-center gap-2.5 rounded-full bg-primary font-semibold text-base text-primary-foreground transition-opacity hover:opacity-85 active:opacity-85 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
						>
							<ExternalLink size={18} strokeWidth={2.5} aria-hidden="true" />
							Join the TestFlight
							<span className="sr-only">(opens in a new tab)</span>
						</a>
						<nav>
							<Link href="/privacy" className="text-muted-foreground text-sm hover:underline">
								Privacy Policy
							</Link>
						</nav>
					</div>
					{/* CardNotch — the datapad footer from components/ui/card.tsx */}
					<div aria-hidden="true" className="flex h-3 items-start justify-between pl-3 pr-6">
						<div className="flex items-center gap-1">
							<div className="h-1 w-8 rounded-[2px] bg-border" />
							<div className="h-1 w-2 rounded-[2px] bg-border" />
						</div>
						<div className="h-3 w-[88px] rounded-t-[16px] bg-background" />
					</div>
				</div>
			</div>
		</main>
	);
}
```

`active:opacity-85`, not `hover:` alone. Tailwind v4 compiles `hover:` inside `@media (hover: hover)`, so a
hover-only rule gives **zero press feedback on touch** — and RN's `pressed` is a press state, not a hover
state. Both are kept: `hover:` for the desktop affordance, `active:` for the actual app-matching behavior.

`focus-visible:outline-hidden`, **not** `outline-none`. In Tailwind v4 `outline-none` emits
`outline-style: none` with no forced-colors fallback, and the `ring-*` indicator is a `box-shadow` that
Windows High Contrast Mode discards — the only CTA on the page would have zero focus state there.
`outline-hidden` adds the `@media (forced-colors: active)` transparent-outline fallback.

No `overflow-hidden` on `<main>`: with an absolutely-positioned media layer it clips the card with no
scrollbar once the card exceeds viewport height (200% zoom, short landscape phone). It stays on the *card*,
where it clips the notch tab's top radii — matching RN's `overflow: 'hidden'`.

`min-h-svh` rather than `dvh` — on iOS Safari `dvh` re-resolves as the URL bar collapses, relayouting the
hero on every scroll.

## Implementation Phases

### Phase 1 — Encode the assets

`ffmpeg 8.1.2` and `cwebp` are both installed. Run from the repo root.

```bash
mkdir -p admin/public/hero
SRC="$HOME/Desktop/_website-2026/_videos/ossusarchives-hyperspace.mp4"
```

**H.264, single file.** 60→30 fps, audio stripped (`-an`, also guarantees autoplay), `+faststart` so
playback begins before the file finishes downloading. **No `-g`/`-keyint_min`/`-sc_threshold`.**

```bash
ffmpeg -i "$SRC" -an \
  -vf "fps=30,scale=1920:1080:flags=lanczos" \
  -c:v libx264 -profile:v high -level 4.0 -preset veryslow -crf 26 \
  -pix_fmt yuv420p -movflags +faststart \
  admin/public/hero/hyperspace-1080.mp4
```

**Poster.** The phone must be facing camera — it is edge-on around t≈3s (unusable). Good candidates:
**t≈0s** (Archives list), **t≈9s** (book detail), **t≈18s** (Timeline, large book cover — most striking).

```bash
for t in 0 9 18; do
  ffmpeg -ss $t -i "$SRC" -frames:v 1 -vf scale=960:-1 -y "/tmp/poster-cand-$t.png"
done
# with the chosen timestamp:
ffmpeg -ss 18 -i "$SRC" -frames:v 1 -y /tmp/poster.png
cwebp -q 68 /tmp/poster.png -o admin/public/hero/hyperspace-poster.webp
```

**Gate — check sizes before committing** (`ls -lh admin/public/hero/`):

| Asset | Ceiling |
|---|---|
| `hyperspace-1080.mp4` | 2.5 MB (expect ~1.5 MB) |
| `hyperspace-poster.webp` | 160 KB (expect ~100 KB) |

If the MP4 overshoots: raise `-crf` to 28, then `scale=1600:900`. Do not trim the duration — that breaks
the clean loop seam. **Total git impact: ~1.6 MB**, permanent. The 30.5 MB master stays out.

### Phase 2 — Component + page

1. Create `admin/app/_components/hero-backdrop.tsx` (code above).
2. Rewrite `admin/app/page.tsx` (code above).
3. Add cache headers to `admin/next.config.ts` alongside the existing keys. Next serves unhashed `public/`
   assets as `Cache-Control: public, max-age=0`, costing a conditional-GET round-trip per load — including
   on the poster, which is the LCP resource. That's the whole justification; the tradeoff is the rename
   constraint in the comment:

```ts
// /hero/* is immutable — a re-encode MUST ship under a new filename (…-1080.v2.mp4).
async headers() {
	return [
		{
			source: '/hero/:path*',
			headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
		},
	];
},
```

No changes to `sitemap.ts`, `robots.ts`, or `middleware.ts` — no new routes, and `/` is already listed.

### Phase 3 — Verify

**Prerequisites** (this worktree is bare):

```bash
npm ci && cd admin && npm ci
```

- Use `npm ci`, not `npm install` — `install` drifts the Expo dependency tree in this repo.
- The root install is not optional: Biome is a **root** dependency and `admin`'s `biome check .` resolves
  the binary from root `node_modules/.bin`. Without it you get "command not found", which is easy to
  misread as a passing lint.
- `next build` needs `admin/.env.local` with `SUPABASE_LOCAL_URL`, `SUPABASE_LOCAL_SERVICE_ROLE_KEY`,
  `SUPABASE_PROD_URL`, `SUPABASE_PROD_SERVICE_ROLE_KEY` — [admin/lib/env.ts:10](admin/lib/env.ts:10)
  parses at module load and `/admin/*` builds in the same pass. The marketing page needs none of them.

```bash
cd admin && npm run lint && npm run build
```

Confirm `/` is still marked static (`○`). If it isn't, the cause is a dynamic API in a server component —
*not* the client-component import, which cannot flip a route to dynamic.

```bash
cd admin && npm run dev
```

Checks (run on `127.0.0.1:3101` dev / `:3102` prod — port 3100 was occupied by another dev server):

- [x] **Media fills the viewport** — `<img>` and `<video>` both measured 1440×900 in a 1440×900 viewport.
      Without `size-full` these would be 1440×810
- [x] Desktop — video plays, loops, silent; **no black flash**: poster and video measured coexisting in
      the DOM, so the poster never unmounts
- [x] Card matches `components/ui/card.tsx` — verified by measurement, not eyeball: card 448×234,
      `rgb(26,26,30)`, radius 12px, `overflow: hidden`, `borderWidth: 0px`; notch strip 448×12 with
      12px/24px padding; bars 32×4 and 8×4 at 4px gap in `rgba(255,255,255,0.08)`; tab 88×12 at x=400
- [x] **Notch tab reads as a notch**, not a blob — inspected at 3× scale. Kill switch not triggered
- [x] Button matches "Find on Amazon"; `active:opacity-85` present for touch press feedback
- [x] Link is `https://testflight.apple.com/join/pT9n8FCC`, `target="_blank"`,
      `rel="noopener noreferrer"`, with an `sr-only` "(opens in a new tab)"
- [x] 375×812 — **zero** mp4 requests, no `<video>` in the DOM (Resource Timing, current load only)
- [x] `prefers-reduced-motion: reduce` at a **desktop** viewport — zero mp4 requests, no `<video>`
      (stubbed via a pre-hydration `initScript`, so only the motion preference differed)
- [x] Short viewport — `<main>` computes `overflow: visible`, page scrolls, card reachable
- [x] Focus ring — all five `focus-visible:*` rules compiled; `outline-hidden` carries its
      `@media (forced-colors: active)` fallback; focus produces a 2px card ring + 4px `rgb(74,144,217)` ring
- [x] Production build, desktop 1350×940: **LCP 201 ms, CLS 0.00**; Lighthouse Accessibility / Best
      Practices / SEO all **100** (50 passed, 0 failed)

> **LCP element is the tagline `<p>`, not the poster.** Chrome never made the full-viewport image an LCP
> candidate, so the plan's earlier assumption was wrong. `fetchPriority="high"` still gets the visual hero
> painted early, and LCP is text at 201 ms — better than the image-LCP case this was hedging against.

## Acceptance Criteria

- [x] `/` renders a fullscreen hyperspace video behind the content on desktop, filling the viewport at
      every aspect ratio
- [x] Copy sits in a top-left, left-aligned card matching `components/ui/card.tsx` (`#1A1A1E`, 12px
      radius, no border, 12px padding) **including the CardNotch footer**
- [x] "Coming soon to iOS." is gone
- [x] A pill button matching "Find on Amazon" reads "Join the TestFlight" and links to
      `https://testflight.apple.com/join/pT9n8FCC` in a new tab
- [x] Privacy Policy link retained inside the card, still routing to `/privacy`
- [x] Viewports <768px and `prefers-reduced-motion: reduce` get the poster with **zero video bytes**
- [x] Committed hero assets total **1.5 MB** (1.4 MB mp4 + 105 KB webp), under the 2 MB gate
- [x] `/` still builds as a static route (`○`, 662 B / 106 kB first load)
- [x] `npm run lint` and `npm run build` pass from `admin/`

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Loop seam pops visibly | Low — geometry verified identical | Crossfade tail into head |
| ~~Mobile poster looks soft~~ | **Closed** | Checked at 375×812 — the mockup's UI stays legible. No action |
| ~~Notch tab reads as a blob over video~~ | **Closed** | Inspected at 3×; reads as a notch. Kill switch not used |
| `immutable` caches a bad encode | Low | Version the filename on any re-encode |
| Autoplay blocked (iOS Low Power Mode) | Low | Degrades correctly — the poster stays visible |
| 1080p loop decoding in a background tab | Low | Chrome pauses and Safari suspends silent background video heuristically. If battery complaints surface, add a `visibilitychange` pause (~3 lines) |

The anticipated LCP regression **did not materialize**: LCP stayed text (the tagline `<p>`) at 201 ms with
CLS 0.00, because Chrome does not treat the full-viewport poster as an LCP candidate.

## References

### Internal
- [admin/app/page.tsx](admin/app/page.tsx) — the file being rewritten
- [components/ui/card.tsx](components/ui/card.tsx) — card + CardNotch spec
- [components/book-card.tsx:36](components/book-card.tsx:36) — the book row wrapping itself in that Card
- [components/buy-on-amazon-button.tsx:54-71](components/buy-on-amazon-button.tsx:54) — button spec
- [constants/tokens.ts](constants/tokens.ts) / [admin/app/globals.css](admin/app/globals.css) — token parity
- [admin/middleware.ts:9](admin/middleware.ts:9) — confirms `/` is ungated
- [admin/lib/env.ts:10](admin/lib/env.ts:10) — build-time env requirement
- [docs/plans/2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md](docs/plans/2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md) — site architecture

### External
- [Route Segment Config — `dynamic`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
- [`next.config.js` headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [MDN — autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
- [MDN — `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [Tailwind v4 — `outline-hidden` vs `outline-none`](https://tailwindcss.com/docs/upgrade-guide)
