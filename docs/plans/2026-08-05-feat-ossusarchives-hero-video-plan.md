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

Scope is one page (`admin/app/page.tsx`), one new client component, three new static assets, and one
`next.config.ts` headers rule. No DB, no auth, no new routes. The page stays `force-static`.

## Problem Statement / Motivation

- `/` is a placeholder (`admin/app/page.tsx:13-27`): centered text, no product imagery, and a dead-end
  "Coming soon to iOS." line with nothing to click.
- TestFlight is live. The site has no path into it.
- A finished hyperspace render of the app already exists and isn't being used anywhere.

## Research Findings

Research was done inline (direct repo + asset inspection) rather than via subagents.

### The marketing site is the admin app

`admin/` is a single Next.js 15 App Router deployment serving all of ossusarchives.com — `/` (marketing),
`/privacy`, and the gated `/admin/*`. Established in
[docs/plans/2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md](docs/plans/2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md).

| Fact | Source | Why it matters |
|---|---|---|
| Vercel project root is `admin/` | [admin/vercel.json](admin/vercel.json) | New assets go in `admin/public/`, served at `/…` |
| `admin/public/` **does not exist** | — | Must be created |
| Middleware matcher is `/admin/:path*` only | [admin/middleware.ts:9-11](admin/middleware.ts:9) | `/` and `/public` assets bypass auth. No change needed |
| Next 15 is pinned deliberately | prior plan | Keep `export const dynamic = 'force-static'`; don't reach for Next 16 idioms |
| `lucide-react` already a dependency | [admin/package.json](admin/package.json) | `ExternalLink` icon available, no install |
| Dark-only, `<html className="dark">` | [admin/app/layout.tsx](admin/app/layout.tsx) | No light-mode variants needed |
| Biome: tabs, single quotes, semicolons, width 100 | [admin/biome.json](admin/biome.json) | Root `biome.json` ignores `admin/`; lint from `admin/` |
| `admin/lib/env.ts` parses env at module load | [admin/lib/env.ts:10-17](admin/lib/env.ts:10) | ⚠️ `next build` **fails without** the 4 Supabase vars — see Dependencies |
| No `next/image` lint rule active | script is `biome check .`, not `next lint` | A plain `<img>` is fine here (and correct — we need `object-cover` on a raw element) |

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
   contains no subject. The card lands in empty space — no repositioning of the video needed.
2. **The loop seam is nearly clean.** First and last frames have *identical camera geometry and identical
   starfield positions*; only the phone's on-screen content differs (Archives vs. Timeline). A plain
   `loop` will not pop geometrically. An optional crossfade is documented below if the screen-content
   change reads badly.
3. **`object-cover` crops correctly at every aspect.** Because the subject is centered, narrow viewports
   crop the empty sides. At 390×844 the visible slice is ~26% of frame width; the phone occupies ~16%
   centered — it stays fully in frame.

### Decisions taken (confirmed with the user)

| Decision | Choice |
|---|---|
| Privacy Policy link | Stays **inside the text card**, below the button |
| Card treatment | **Exact app match** — opaque `#1A1A1E`, no translucency/blur |
| Mobile (<768px) | **Poster image only** — no video download |
| Source video | **Encoded derivatives only** in `admin/public/`; 30.5 MB master stays on the Desktop |

### Style targets — measured from the app

**Card** — "Cards (datapad style)", [app/book/[id].tsx:407-416](app/book/[id].tsx:407):

```ts
backgroundColor: tokens.surface.card,        // #1A1A1E  → bg-card
borderRadius: 12,                            //          → rounded-[12px]  (⚠️ Tailwind rounded-xl = 14px here)
padding: 16,                                 //          → p-4
borderWidth: StyleSheet.hairlineWidth,       //          → border (1px is the web-equivalent weight)
borderColor: tokens.border.subtle,           // rgba(255,255,255,0.08) → border-border
```

**Button** — [components/buy-on-amazon-button.tsx:54-71](components/buy-on-amazon-button.tsx:54):

```ts
height: 52, borderRadius: 100, gap: 10,      // → h-[52px] rounded-full gap-[10px]
backgroundColor: tokens.accent.primary,      // #4A90D9 → bg-primary
color: tokens.text.inverse,                  // #0A0A0C → text-primary-foreground
fontSize: 16, fontWeight: '600',             // → text-[16px] font-semibold
pressed: { opacity: 0.85 },                  // → hover:opacity-85 active:opacity-85
icon: ExternalLink size={18} strokeWidth={2.5}
```

Every value maps to an existing token in [admin/app/globals.css](admin/app/globals.css) — no new CSS vars.

## Proposed Solution

```
admin/
  public/hero/
    hyperspace-1080.mp4          ~3 MB   H.264, desktop/tablet
    hyperspace-1080.webm         ~2 MB   VP9, preferred by modern browsers
    hyperspace-poster.jpg        ~150 KB 1920×1080, <video poster> + the mobile still
  app/
    _components/hero-video.tsx   NEW  'use client' — media-query gated video/poster swap
    page.tsx                     EDIT layout + card + button
  next.config.ts                 EDIT immutable cache headers for /hero/*
```

### Layout

```
┌─ <main> relative min-h-dvh overflow-hidden ────────────┐
│  <HeroVideo/>   absolute inset-0 object-cover          │
│  scrim          absolute inset-0, radial from top-left │
│  ┌ p-6 sm:p-10 lg:p-16 ─────────────────────────────┐  │
│  │ ┌ card max-w-md ────────┐                        │  │
│  │ │ Ossus Archives        │      (phone mockup      │  │
│  │ │ A datapad for your…   │       lives here,       │  │
│  │ │ [ ⧉ Join the TestFlight ]     dead-center)      │  │
│  │ │ Privacy Policy        │                        │  │
│  │ └───────────────────────┘                        │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

The scrim is a **top-left radial**, not a full-surface wash, so it never dims the centered phone:

```
bg-[radial-gradient(120%_100%_at_0%_0%,rgba(10,10,12,0.85)_0%,rgba(10,10,12,0.35)_35%,transparent_65%)]
```

### Why a client component

`prefers-reduced-motion` cannot pause a video from CSS (`display:none` still downloads and decodes), and
we need to skip the download entirely below 768px. A small `'use client'` component reading `matchMedia`
is the only way to do both.

This does **not** break `force-static`. The component prerenders with `playVideo = false`, so the static
HTML ships the poster `<img>` — which becomes the LCP element. On desktop, hydration swaps in the
`<video>`, whose own `poster` attribute is the same file, so the transition is invisible.

### `admin/app/_components/hero-video.tsx` (new)

```tsx
'use client';

import { useEffect, useState } from 'react';

const SMALL_SCREEN = '(max-width: 767px)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const LAYER = 'absolute inset-0 h-full w-full object-cover object-center';

export function HeroVideo() {
	// Server + first paint render the poster. Desktop upgrades to video after hydration.
	const [playVideo, setPlayVideo] = useState(false);

	useEffect(() => {
		const small = window.matchMedia(SMALL_SCREEN);
		const reduced = window.matchMedia(REDUCED_MOTION);
		const saveData =
			(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

		const sync = () => setPlayVideo(!small.matches && !reduced.matches && !saveData);
		sync();
		small.addEventListener('change', sync);
		reduced.addEventListener('change', sync);
		return () => {
			small.removeEventListener('change', sync);
			reduced.removeEventListener('change', sync);
		};
	}, []);

	if (!playVideo) {
		return <img src="/hero/hyperspace-poster.jpg" alt="" aria-hidden="true" className={LAYER} />;
	}

	return (
		// biome-ignore lint/a11y/useMediaCaption: decorative, muted, no audio track
		<video
			autoPlay
			muted
			loop
			playsInline
			preload="auto"
			poster="/hero/hyperspace-poster.jpg"
			aria-hidden="true"
			tabIndex={-1}
			className={LAYER}
		>
			<source src="/hero/hyperspace-1080.webm" type="video/webm" />
			<source src="/hero/hyperspace-1080.mp4" type="video/mp4" />
		</video>
	);
}
```

### `admin/app/page.tsx` (rewrite)

```tsx
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';

import { HeroVideo } from './_components/hero-video';

export const dynamic = 'force-static';

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/pT9n8FCC';

export const metadata = {
	title: 'Ossus Archives — Star Wars Book Tracker',
	description: 'Track your Star Wars book collection across Canon and Legends.',
};

export default function Home() {
	return (
		<main className="relative min-h-dvh overflow-hidden bg-background">
			<HeroVideo />
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(10,10,12,0.85)_0%,rgba(10,10,12,0.35)_35%,transparent_65%)]"
			/>
			<div className="relative p-6 sm:p-10 lg:p-16">
				{/* Matches the app's datapad card: app/book/[id].tsx "Cards (datapad style)" */}
				<div className="w-full max-w-md space-y-4 rounded-[12px] border border-border bg-card p-4 text-left">
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
						className="flex h-[52px] w-full items-center justify-center gap-[10px] rounded-full bg-primary font-semibold text-[16px] text-primary-foreground transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:opacity-85"
					>
						<ExternalLink size={18} strokeWidth={2.5} aria-hidden="true" />
						Join the TestFlight
						<span className="sr-only">(opens in a new tab)</span>
					</a>
					<Link
						href="/privacy"
						className="block text-muted-foreground text-xs hover:text-foreground"
					>
						Privacy Policy
					</Link>
				</div>
			</div>
		</main>
	);
}
```

> `sr-only` is not in this Tailwind v4 setup by default — v4 ships it as a core utility, so it works. If
> the build reports it as unknown, use `aria-label="Join the TestFlight (opens in a new tab)"` on the
> anchor instead and drop the span.

## Implementation Phases

### Phase 1 — Encode the assets

Run from the repo root. `ffmpeg 8.1.2` is installed with `libx264`, `libvpx-vp9`, and `libsvtav1`.

```bash
mkdir -p admin/public/hero
SRC="$HOME/Desktop/_website-2026/_videos/ossusarchives-hyperspace.mp4"
```

**H.264 baseline** — 60→30 fps (a background loop does not need 60), audio stripped (`-an`, also
guarantees autoplay), `+faststart` so playback begins before the file finishes downloading:

```bash
ffmpeg -i "$SRC" -an \
  -vf "fps=30,scale=1920:1080:flags=lanczos" \
  -c:v libx264 -profile:v high -level 4.0 -preset slow -crf 26 \
  -pix_fmt yuv420p -g 60 -keyint_min 60 -sc_threshold 0 \
  -movflags +faststart \
  admin/public/hero/hyperspace-1080.mp4
```

**VP9** — smaller at equal quality, served first via `<source>` ordering:

```bash
ffmpeg -i "$SRC" -an \
  -vf "fps=30,scale=1920:1080:flags=lanczos" \
  -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 \
  -pix_fmt yuv420p -g 60 \
  admin/public/hero/hyperspace-1080.webm
```

**Poster** — the phone must be facing camera. It is edge-on around t≈3s (unusable). Good candidates:
**t≈0s** (Archives list), **t≈9s** (book detail), **t≈18s** (Timeline, large book cover — most striking).
Extract candidates, pick one, then render at full size:

```bash
for t in 0 9 18; do
  ffmpeg -ss $t -i "$SRC" -frames:v 1 -vf scale=960:-1 -y "/tmp/poster-cand-$t.jpg"
done
# then, with the chosen timestamp:
ffmpeg -ss 18 -i "$SRC" -frames:v 1 -q:v 4 admin/public/hero/hyperspace-poster.jpg
```

**Gate — check sizes before committing:**

```bash
ls -lh admin/public/hero/
```

| Asset | Target | Hard ceiling |
|---|---|---|
| `hyperspace-1080.mp4` | ≤ 3 MB | 4 MB |
| `hyperspace-1080.webm` | ≤ 2 MB | 3 MB |
| `hyperspace-poster.jpg` | ≤ 180 KB | 250 KB |

If the MP4 overshoots: raise `-crf` to 28, then drop to `fps=24`, then `scale=1600:900`. Do not trim the
duration — that breaks the clean loop seam (see below).

**Total git impact: ~5 MB**, permanent. Acceptable; the 30.5 MB master stays out.

### Phase 2 — Component + page

1. Create `admin/app/_components/hero-video.tsx` (code above).
2. Rewrite `admin/app/page.tsx` (code above).
3. Add immutable cache headers — Next serves unhashed `public/` assets as `must-revalidate`, costing a
   round-trip per load on a 3 MB file. Add to `admin/next.config.ts` alongside the existing keys:

```ts
async headers() {
	return [
		{
			source: '/hero/:path*',
			headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
		},
	];
},
```

> `immutable` means a re-encode **must** ship under a new filename (`hyperspace-1080.v2.mp4`). Note this
> in a comment above the rule.

No changes to `sitemap.ts`, `robots.ts`, or `middleware.ts` — no new routes, and `/` is already listed.

### Phase 3 — Verify

```bash
cd admin && npm run lint
```

```bash
cd admin && npm run build
```

- ⚠️ **`next build` needs `admin/.env.local` populated** with `SUPABASE_LOCAL_URL`,
  `SUPABASE_LOCAL_SERVICE_ROLE_KEY`, `SUPABASE_PROD_URL`, `SUPABASE_PROD_SERVICE_ROLE_KEY`.
  [admin/lib/env.ts:10](admin/lib/env.ts:10) parses at module load and `/admin/*` is built in the same
  pass. The marketing page itself needs none of them.
- In the build output, confirm `/` is still marked **static** (`○`). If it flipped to `ƒ`, the client
  component was imported wrong.

```bash
cd admin && npm run dev
```

Visual + behavioral checks at `127.0.0.1:3100`:

- [ ] Desktop ≥1280px — video plays, loops, silent; card top-left; phone mockup unobscured
- [ ] Card is visually identical to the app's book-detail card (side-by-side against the simulator)
- [ ] Button matches "Find on Amazon": pill, 52px tall, `#4A90D9`, dark label, external-link icon
- [ ] Clicking the button opens the TestFlight URL in a new tab
- [ ] "Privacy Policy" still routes to `/privacy`
- [ ] 390×844 (DevTools iPhone) — **Network tab shows no `.mp4`/`.webm` request**; poster only
- [ ] DevTools → Rendering → emulate `prefers-reduced-motion: reduce` → poster only, no video request
- [ ] Resize 1280 → 390 live: video is torn down, no console errors
- [ ] Landscape phone (844×390) — card doesn't collide with the notch; bump padding if it does
- [ ] Keyboard: Tab reaches the button then the link; the video is never focusable
- [ ] Lighthouse: LCP element is the poster image, LCP < 2.5s

## Technical Considerations

### Loop seam

First and last frames share identical camera pose and identical starfield positions — only the phone's
screen content differs. The loop will not jump geometrically. If the screen-content pop reads badly,
crossfade the tail into the head rather than re-rendering:

```bash
# 0.5s crossfade at the loop point (19.367s source → 18.867s output)
ffmpeg -i "$SRC" -an -filter_complex \
  "[0:v]trim=0:18.867,setpts=PTS-STARTPTS[body]; \
   [0:v]trim=18.867:19.367,setpts=PTS-STARTPTS[tail]; \
   [0:v]trim=0:0.5,setpts=PTS-STARTPTS[head]; \
   [tail][head]blend=all_expr='A*(1-T/0.5)+B*(T/0.5)'[x]; \
   [body][x]concat=n=2:v=1:a=0[v]" -map "[v]" ... 
```

### Poster sharpness on phones

At 390×844 / DPR 3 the poster is upscaled ~2.3× from the 1080-tall source, so the phone mockup's on-screen
UI will be soft. Two mitigations, in order of preference:

1. **Re-export a portrait variant from Rotato.** `ossusarchives-hyperspace.rotato` is right next to the
   MP4. Exporting 1080×1920 (or 4K) gives a genuinely crisp mobile still. Cheapest real fix, requires a
   manual Rotato step.
2. **Center-crop the existing master** to `crop=608:1080` and ship it as `hyperspace-poster-portrait.jpg`,
   selected via `<picture><source media="(max-width: 767px)">`. Still upscales ~1.9×, but the phone fills
   more of the frame so apparent size is correct.

Defer both — check option 0 first (the plain landscape poster at `object-cover`), since motion-blurred
starfields hide softness well and the card covers the top-left third.

### Accessibility

- Video is decorative: `aria-hidden="true"`, `tabIndex={-1}`, no captions needed (no audio track at all
  after `-an`). Poster `<img>` gets `alt=""` + `aria-hidden`.
- External link: `target="_blank" rel="noopener noreferrer"` plus a visually-hidden "(opens in a new tab)".
- Measured contrast, all AA-passing:
  - `#0A0A0C` on `#4A90D9` (button) — **5.9:1**
  - `#ECEDEE` on `#1A1A1E` (heading/body) — **14.7:1**
  - `#9d9da1` on `#1A1A1E` (tagline, privacy link) — **6.4:1**
  - The opaque card means video brightness never affects text contrast.
- `focus-visible` ring uses `ring-ring` (`#4A90D9`) offset against `ring-offset-card`.
- Reduced motion fully honored — the video is never mounted, not merely hidden.

### Performance

- Static HTML ships the poster only; the video is a post-hydration, desktop-only fetch.
- Mobile pays **0 bytes** of video.
- `+faststart` + `preload="auto"` → playback starts on first buffered chunk.
- Vercel serves `admin/public/` from the edge CDN; with the `immutable` header, repeat visits cost nothing.

## Acceptance Criteria

- [ ] `/` renders a fullscreen hyperspace video behind the content on desktop
- [ ] Copy sits in a top-left, left-aligned card matching the app's datapad card (`#1A1A1E`, 12px radius,
      `rgba(255,255,255,0.08)` border, 16px padding)
- [ ] "Coming soon to iOS." is gone
- [ ] A pill button matching "Find on Amazon" reads "Join the TestFlight" and links to
      `https://testflight.apple.com/join/pT9n8FCC` in a new tab
- [ ] Privacy Policy link retained inside the card, still routing to `/privacy`
- [ ] Viewports <768px and `prefers-reduced-motion: reduce` get the poster with **zero video bytes**
- [ ] Committed hero assets total ≤ 6 MB
- [ ] `/` still builds as a static route
- [ ] `npm run lint` and `npm run build` pass from `admin/`

## Success Metrics

- TestFlight joins attributable to the site (App Store Connect tester count after deploy).
- Lighthouse performance ≥ 90 on desktop; LCP < 2.5s on both desktop and 4G-throttled mobile.
- No increase in `/` TTFB — the route stays static.

## Dependencies & Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `next build` fails on missing Supabase env | High if `.env.local` is absent | Populate from `admin/.env.local.example` before Phase 3 |
| MP4 won't compress under 4 MB | Medium — dense star streaks are motion-heavy | Escalate `-crf` → `fps=24` → `scale=1600:900`, in that order |
| Loop seam pops visibly | Low — geometry verified identical | Crossfade recipe above |
| Mobile poster looks soft | Medium | Re-export portrait from the `.rotato` project |
| `immutable` header caches a bad encode | Low | Version the filename on any re-encode |
| Autoplay blocked | Very low | `muted` + `playsInline` + no audio track satisfies every current policy; poster is the fallback |

**Prerequisites:** ffmpeg (present, 8.1.2), source video on the Desktop, `admin/.env.local` populated.

## References

### Internal
- [admin/app/page.tsx](admin/app/page.tsx) — the file being rewritten
- [components/buy-on-amazon-button.tsx:54-71](components/buy-on-amazon-button.tsx:54) — button spec
- [app/book/[id].tsx:407-416](app/book/[id].tsx:407) — datapad card spec
- [constants/tokens.ts](constants/tokens.ts) / [admin/app/globals.css](admin/app/globals.css) — token parity
- [admin/middleware.ts:9](admin/middleware.ts:9) — confirms `/` is ungated
- [admin/lib/env.ts:10](admin/lib/env.ts:10) — build-time env requirement
- [docs/plans/2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md](docs/plans/2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md) — site architecture

### External
- [Route Segment Config — `dynamic`](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)
- [`next.config.js` headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [MDN — autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
- [MDN — `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
