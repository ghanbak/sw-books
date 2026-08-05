'use client';

import { useEffect, useState } from 'react';

const SMALL_SCREEN = '(max-width: 767px)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

// `size-full` is load-bearing: preflight sets `img,video { height: auto }`, which
// overrides the width/height attributes, so `inset-0` alone leaves the media at its
// intrinsic 16:9 and bares a black band below it.
const FILL_LAYER = 'absolute inset-0 size-full object-cover';

/**
 * Hyperspace hero backdrop. The poster renders on the server and never unmounts —
 * it is the LCP element and the sole visual below 768px or under reduced motion.
 * The video layers over it after `load` so its fetch never competes with the poster.
 */
export function HeroBackdrop() {
	const [playVideo, setPlayVideo] = useState(false);

	useEffect(() => {
		// Read once. A resize or an OS motion-preference flip mid-visit isn't worth
		// listeners on a single-screen page — and skipping them also avoids
		// MediaQueryList.addEventListener, which is absent on older Safari.
		const allowed =
			!window.matchMedia(SMALL_SCREEN).matches && !window.matchMedia(REDUCED_MOTION).matches;
		if (!allowed) return;

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
				// No `preload`: autoPlay already forces the fetch, and the attribute would
				// only override UA heuristics that back off on constrained connections.
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
