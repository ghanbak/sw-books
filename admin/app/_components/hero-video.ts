const SMALL_SCREEN = '(max-width: 767px)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** The hero video only plays on larger screens without an OS reduced-motion preference. */
export function canPlayHeroVideo(matches: (query: string) => boolean): boolean {
	return !matches(SMALL_SCREEN) && !matches(REDUCED_MOTION);
}

export function videoToggleLabel(paused: boolean): string {
	return paused ? 'Play background video' : 'Pause background video';
}

type Playback = {
	paused: boolean;
	play(): Promise<unknown>;
	pause(): void;
};

/**
 * A refused play() fires no play or pause event; the rejection is the only signal
 * that the video stayed paused. `onRejected` re-reads the element.
 */
export function requestPlay(video: Pick<Playback, 'play'>, onRejected: () => void): void {
	video.play().catch(onRejected);
}

export function toggleVideoPlayback(video: Playback, onRejected: () => void): void {
	if (!video.paused) {
		video.pause();
		return;
	}
	requestPlay(video, onRejected);
}
