'use client';

import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { canPlayHeroVideo, requestPlay, toggleVideoPlayback, videoToggleLabel } from './hero-video';

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
		if (!canPlayHeroVideo((query) => window.matchMedia(query).matches)) return;

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
				src="/hero/hyperspace-poster.v2.webp"
				alt=""
				width={1920}
				height={1080}
				fetchPriority="high"
				decoding="async"
				className={FILL_LAYER}
			/>
			{/* A video that can't load unmounts with its control, leaving the poster. */}
			{playVideo && <HeroVideo onFail={() => setPlayVideo(false)} />}
		</>
	);
}

function HeroVideo({ onFail }: { onFail: () => void }) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [paused, setPaused] = useState(false);
	const label = videoToggleLabel(paused);

	// React nulls the ref on unmount, so a late rejection can't set state.
	const syncPaused = useCallback(() => {
		const video = videoRef.current;
		if (video) setPaused(video.paused);
	}, []);

	// play() replaces the autoplay attribute: a refused autoplay reports nothing, while
	// play() rejects. One request also leaves nothing to race. A pending or running
	// play() has `paused` false, so the initial state holds until a rejection corrects it.
	useEffect(() => {
		if (videoRef.current) requestPlay(videoRef.current, syncPaused);
	}, [syncPaused]);

	return (
		<>
			{/* No `preload`: play() already forces the fetch, and the attribute would
			    only override UA heuristics that back off on constrained connections. */}
			<video
				ref={videoRef}
				src="/hero/hyperspace-1080.v2.mp4"
				poster="/hero/hyperspace-poster.v2.webp"
				muted
				loop
				playsInline
				disableRemotePlayback
				aria-hidden="true"
				tabIndex={-1}
				onPlay={syncPaused}
				onPause={syncPaused}
				onError={onFail}
				className={FILL_LAYER}
			/>
			{/* z-10 lifts it above the page's scrims, which paint later in DOM order. Top
			    right, so it comes before the footer links visually as well as in tab order. */}
			<button
				type="button"
				aria-label={label}
				title={label}
				onClick={() => {
					if (videoRef.current) toggleVideoPlayback(videoRef.current, syncPaused);
				}}
				className="absolute top-6 right-6 z-10 inline-flex size-11 items-center justify-center rounded-full bg-background/60 text-foreground ring-1 ring-white/15 backdrop-blur-sm transition-opacity hover:opacity-85 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:opacity-85"
			>
				{paused ? (
					<Play size={18} strokeWidth={2.5} aria-hidden="true" />
				) : (
					<Pause size={18} strokeWidth={2.5} aria-hidden="true" />
				)}
			</button>
		</>
	);
}
