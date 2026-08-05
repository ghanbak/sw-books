---
title: ossusarchives.com — Fullscreen hyperspace hero video + top-left datapad card
type: feat
date: 2026-08-05
---

# ✨ ossusarchives.com — Fullscreen hyperspace hero + top-left datapad card

## Overview

Replace the centered text stub at `/` with a fullscreen hyperspace video hero. Move the copy to a
top-left card styled exactly like the app's datapad card, left-aligned, and swap "Coming soon to iOS."
for a lightsaber-blue pill button — "Join the TestFlight" → <https://testflight.apple.com/join/pT9n8FCC>.

Scope: one page rewrite, one new client component, two static assets, one `next.config.ts` headers rule.
No DB, no auth, no new routes. The page stays `force-static`.

**Revised 2026-08-05** after simplicity, TypeScript, and performance reviews. See
[Review revisions](#review-revisions) for what changed and why.

**Rebased onto `911a9e3`** ("Native-first navigation redesign + holographic covers", PR #9), which
rewrote the app's card and book-row components. The card spec below is re-derived from the new shared
[components/ui/card.tsx](components/ui/card.tsx) — it now has **no border**, **12px padding**, and a
**datapad notch footer**. The Amazon button spec was re-checked and is unchanged.

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
| `admin/lib/env.ts` parses env at module load | [admin/lib/env.ts:10](admin/lib/env.ts:10) | ⚠️ `next build` **fails without** the 4 Supabase vars |
| **This worktree has no `node_modules`** | verified | ⚠️ `npm ci` at root **and** in `admin/` before Phase 3 |
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

Three findings that shape the implementation:

1. **The phone is dead-center, the corners are dark.** Top-left is the darkest region of frame and
   contains no subject. The card lands in empty space. This is also why **no scrim is needed** — see
   [Review revisions](#review-revisions).
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
| x264 crf28 (with GOP flags) | 2.34 MB | 94.71 |
| VP9 crf34 | 2.31 MB | 93.68 |
| SVT-AV1 crf44 preset 6 | 2.03 MB | 96.45 |

**The fixed-GOP flags cost 47% of the file for −0.24 VMAF.** They force a keyframe every 2s — 10 I-frames
instead of 3 — and I-frames on dense star-noise are enormously expensive. Fixed GOP exists for seeking and
adaptive streaming; a background loop is never seeked. Removing them makes the ≤3 MB target trivially met
and the whole quality-escalation ladder unnecessary.

**VP9 is strictly dominated** — bigger *and* worse than x264 at every comparable point. It also has **no
hardware decoder on Apple Silicon**, so every Mac visitor would software-decode a 1080p30 loop forever.
AV1 wins on quality-per-byte but has the same forever-loop battery problem on pre-M3 Apple Silicon and most
Intel laptops. **Ship one H.264 file** — hardware-decoded on everything.

**Poster:** at `-q:v 4` the JPEG measures **204 KB**, not the ~150 KB originally estimated. The same frame
as `cwebp -q 68` is **101 KB**. WebP works for both `<img src>` and `<video poster>` (Safari 14+).
`cwebp` is installed at `/opt/homebrew/bin/cwebp`.

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
borderWidth: 0,                         //         → NO border utility
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

Every measurement lands on Tailwind's standard scale (`h-3`=12, `h-1`=4, `w-8`=32, `w-2`=8, `gap-1`=4,
`p-3`/`pl-3`=12, `pr-6`=24), so only the radii and the 88px tab need arbitrary values.

> The notch tab is filled with the *screen background* color so it reads as a cutout of the card. On the
> hero it sits over video rather than over `#0A0A0C`, so it renders as a solid near-black tab instead of a
> true cutout. That's fine — the video's own field is near-black behind the card — and a real cutout would
> need CSS masking for no visible gain.

**Button** — [components/buy-on-amazon-button.tsx:54-71](components/buy-on-amazon-button.tsx:54):

```ts
height: 52, borderRadius: 100, gap: 10,      // → h-[52px] rounded-full gap-[10px]
backgroundColor: tokens.accent.primary,      // #4A90D9 → bg-primary
color: tokens.text.inverse,                  // #0A0A0C → text-primary-foreground
fontSize: 16, fontWeight: '600',             // → text-[16px] font-semibold
pressed: { opacity: 0.85 },                  // → hover:opacity-85
icon: ExternalLink size={18} strokeWidth={2.5}
```

Every value maps to an existing token in [admin/app/globals.css](admin/app/globals.css) — no new CSS vars.

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
│                   absolute inset-0 object-cover        │
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

No scrim. The card is opaque, the top-left is already the darkest region of frame, and nothing else on the
page sits over the video.

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
const FILL_LAYER = 'absolute inset-0 object-cover';

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
		if (document.readyState === 'complete') {
			setPlayVideo(true);
			return;
		}
		const onLoad = () => setPlayVideo(true);
		window.addEventListener('load', onLoad, { once: true });
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

Notes:
- No `biome-ignore` — `a11y/useMediaCaption` already exempts `<video muted>`, so the suppression would be
  reported as unused.
- No `preload` — `autoPlay` already forces the fetch; the attribute only overrides UA heuristics that would
  otherwise back off on constrained connections. Control *when the element mounts* instead.
- `alt=""` alone marks the poster decorative; `aria-hidden` on it would be redundant.
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
				<div className="w-full max-w-md overflow-hidden rounded-[12px] bg-card text-left">
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
							className="flex h-[52px] w-full items-center justify-center gap-[10px] rounded-full bg-primary font-semibold text-[16px] text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
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

`focus-visible:outline-hidden`, **not** `outline-none`. In Tailwind v4 `outline-none` emits
`outline-style: none` with no forced-colors fallback, and the `ring-*` indicator is a `box-shadow` that
Windows High Contrast Mode discards — the only CTA on the page would have zero focus state there.
`outline-hidden` keeps the transparent-outline fallback. (`admin/components/ui/button.tsx` has the same
v3-ism, but it's shadcn-generated and Biome-ignored — don't propagate it.)

No `overflow-hidden` on `<main>`: with an absolutely-positioned media layer it clips the card with no
scrollbar once the card exceeds viewport height (200% zoom, short landscape phone). `object-cover` already
clips inside the element box, so it was never doing anything.

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
playback begins before the file finishes downloading. **No `-g`/`-keyint_min`/`-sc_threshold`** — see
measured data above.

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

**Gate — check sizes before committing:**

```bash
ls -lh admin/public/hero/
```

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
   on the poster, which is the LCP resource:

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
- `next build` needs `admin/.env.local` with `SUPABASE_LOCAL_URL`, `SUPABASE_LOCAL_SERVICE_ROLE_KEY`,
  `SUPABASE_PROD_URL`, `SUPABASE_PROD_SERVICE_ROLE_KEY` — [admin/lib/env.ts:10](admin/lib/env.ts:10)
  parses at module load and `/admin/*` builds in the same pass. The marketing page needs none of them.

```bash
cd admin && npm run lint && npm run build
```

Confirm `/` is still marked static (`○`) in the build output. If it isn't, the cause is a dynamic API in a
server component — *not* the client-component import, which cannot flip a route to dynamic.

```bash
cd admin && npm run dev
```

Checks at `127.0.0.1:3100`:

- [ ] Desktop ≥1280px — video plays, loops, silent; **no black flash** on hydration
- [ ] Card is visually identical to the app's book-detail card (side-by-side against the simulator)
- [ ] Button matches "Find on Amazon": pill, 52px, `#4A90D9`, dark label, external-link icon; opens
      TestFlight in a new tab
- [ ] 390×844 — Network tab shows **zero** video bytes
- [ ] DevTools → Rendering → `prefers-reduced-motion: reduce` → zero video bytes
- [ ] 200% browser zoom — card is fully reachable, page scrolls
- [ ] Keyboard focus ring visible on the button
- [ ] Lighthouse **desktop** (1350×940), LCP element is the poster. Mobile emulation is 412px — below the
      gate — so a green mobile score proves nothing about the desktop path.

After deploying to a preview URL:

```bash
curl -sI -r 0-1 https://<preview>/hero/hyperspace-1080.mp4 | grep -iE 'HTTP|x-vercel-cache|content-range'
```

Expect `206` with `x-vercel-cache: HIT` — confirming range requests are served from cache, not an origin
round-trip per chunk.

## Review revisions

Three reviewers examined the first draft. Changes made:

**Cut (simplicity + performance agreed):**
- **The WebM/VP9 encode.** Measured strictly worse than H.264 on both size and VMAF, plus no hardware
  decode on Apple Silicon → continuous CPU/battery cost on every Mac visit.
- **The radial-gradient scrim.** The plan's own research says the top-left is the darkest region with no
  subject, and the card is opaque — a contrast fix where there is no contrast problem.
- **The `saveData` check.** Chromium-only, removed from Chrome desktop, and evaluated only in the
  desktop-video path where it is ~always false. It was also the sole reason the file needed an `as` cast —
  and that line was **102 columns against Biome's `lineWidth: 100`, so Phase 3's first gate would have
  failed on the plan's own snippet.**
- **The `change` listeners.** One cut, three problems solved: it satisfies the simplicity objection,
  removes the older-Safari `addEventListener` crash risk (a throwing effect tears down the React 19 root to
  a blank page), and eliminates a resize-restarts-playback bug.
- **The `preload` attribute** — redundant alongside `autoPlay`.
- **The dead `biome-ignore`** — `useMediaCaption` already exempts `<video muted>`.
- **The `sr-only` hedge, the crossfade recipe, the poster-sharpness mitigation branches, and the Success
  Metrics section** — hedges against low-probability problems, or unmeasurable without site analytics.

**Fixed (real defects):**
- **Black flash on desktop.** `if (!playVideo) return <img/>` early-returned a *different element type*, so
  React unmounted the poster and mounted a fresh video — painting `#0A0A0C` full-screen for a frame or more
  mid-hydration. The poster now stays mounted and the video layers over it.
- **`-g 60 -keyint_min 60 -sc_threshold 0` cost 47% of the file** for −0.24 VMAF. Removed.
- **`focus-visible:outline-none`** removes the focus indicator entirely in Windows High Contrast Mode under
  Tailwind v4. Now `outline-hidden`.
- **`overflow-hidden`** clipped the card with no scrollbar at 200% zoom.
- **Poster was 204 KB as JPEG**, not the estimated 150 KB. WebP at `-q 68` is ~101 KB.
- **The LCP poster had no `fetchPriority="high"`**, and the video mount raced it. Now prioritized, and the
  video waits for `load`.
- **The `force-static` verification note described an impossible failure** — importing a client component
  cannot flip a route to dynamic.
- **`HeroVideo` renders an `<img>` in most executions** (mobile, reduced-motion, every server render).
  Renamed `HeroBackdrop`.
- **This worktree has no `node_modules`** — added as a Phase 3 prerequisite.

**Kept over an objection:** the `next.config.ts` cache header. Simplicity called it ceremony guarding an
imperceptible round-trip, but the poster is the LCP resource and is served from `public/` — a revalidation
round-trip on the LCP element on every repeat visit is exactly what's worth removing. The rename footgun is
real and is documented in the code comment.

**Deferred, not cut:** a `visibilitychange` pause. Chrome pauses and Safari suspends silent background
video heuristically, so an explicit guard is redundant in practice — but it's three lines if battery
complaints ever surface.

## Acceptance Criteria

- [ ] `/` renders a fullscreen hyperspace video behind the content on desktop
- [ ] Copy sits in a top-left, left-aligned card matching `components/ui/card.tsx` (`#1A1A1E`, 12px
      radius, no border, 12px padding) **including the CardNotch footer** — two light bars left, notched
      tab right
- [ ] "Coming soon to iOS." is gone
- [ ] A pill button matching "Find on Amazon" reads "Join the TestFlight" and links to
      `https://testflight.apple.com/join/pT9n8FCC` in a new tab
- [ ] Privacy Policy link retained inside the card, still routing to `/privacy`
- [ ] Viewports <768px and `prefers-reduced-motion: reduce` get the poster with **zero video bytes**
- [ ] No black flash on hydration
- [ ] Committed hero assets total ≤ 2 MB
- [ ] `/` still builds as a static route
- [ ] `npm run lint` and `npm run build` pass from `admin/`

## Dependencies & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `next build` fails on missing Supabase env | High if `.env.local` absent | Populate from `admin/.env.local.example` |
| Forgetting `npm ci` in the bare worktree | High | Phase 3 prerequisite |
| MP4 overshoots 2.5 MB | Low — measured at ~1.5 MB | `-crf 28`, then `scale=1600:900` |
| Loop seam pops visibly | Low — geometry verified identical | Crossfade tail into head |
| Mobile poster looks soft (~2.3× upscale at DPR 3) | Medium | Re-export a portrait variant from `ossusarchives-hyperspace.rotato` |
| `immutable` caches a bad encode | Low | Version the filename on any re-encode |
| Autoplay blocked (iOS Low Power Mode) | Low | Degrades correctly — the poster stays visible |

**Expect `/`'s LCP to regress in absolute terms** regardless of tuning: this replaces a text-only page with
a full-bleed image. Poster weight is the only real lever, which is why it's WebP.

## References

### Internal
- [admin/app/page.tsx](admin/app/page.tsx) — the file being rewritten
- [components/buy-on-amazon-button.tsx:54-71](components/buy-on-amazon-button.tsx:54) — button spec
- [components/ui/card.tsx](components/ui/card.tsx) — card + CardNotch spec
- [components/book-card.tsx:36](components/book-card.tsx:36) — the book row wrapping itself in that Card
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
