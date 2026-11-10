import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
	canPlayHeroVideo,
	requestPlay,
	toggleVideoPlayback,
	videoToggleLabel,
} from '../../admin/app/_components/hero-video';

const read = (path: string) => readFileSync(resolve(__dirname, '../../admin/app', path), 'utf8');

describe('canPlayHeroVideo (#221)', () => {
	const SMALL = '(max-width: 767px)';
	const REDUCED = '(prefers-reduced-motion: reduce)';

	it('allows a large screen without reduced motion', () => {
		expect(canPlayHeroVideo(() => false)).toBe(true);
	});

	it('refuses a small screen', () => {
		expect(canPlayHeroVideo((q) => q === SMALL)).toBe(false);
	});

	it('refuses reduced motion', () => {
		expect(canPlayHeroVideo((q) => q === REDUCED)).toBe(false);
	});
});

describe('videoToggleLabel (#221)', () => {
	it('offers pause while playing', () => {
		expect(videoToggleLabel(false)).toBe('Pause background video');
	});

	it('offers play while paused', () => {
		expect(videoToggleLabel(true)).toBe('Play background video');
	});
});

describe('toggleVideoPlayback (#221)', () => {
	const video = (paused: boolean, play = vi.fn(() => Promise.resolve())) => ({
		paused,
		play,
		pause: vi.fn(),
	});

	it('pauses a playing video', () => {
		const v = video(false);
		toggleVideoPlayback(v, vi.fn());
		expect(v.pause).toHaveBeenCalledTimes(1);
		expect(v.play).not.toHaveBeenCalled();
	});

	it('resumes a paused video', () => {
		const v = video(true);
		toggleVideoPlayback(v, vi.fn());
		expect(v.play).toHaveBeenCalledTimes(1);
		expect(v.pause).not.toHaveBeenCalled();
	});

	it('handles a rejected play()', () => {
		const rejected = Promise.reject(new Error('interrupted'));
		const handled = vi.spyOn(rejected, 'catch');
		const v = video(
			true,
			vi.fn(() => rejected),
		);
		toggleVideoPlayback(v, vi.fn());
		expect(handled).toHaveBeenCalledTimes(1);
	});

	it('resyncs when a click-driven play() is refused', async () => {
		const v = video(
			true,
			vi.fn(() => Promise.reject(new DOMException('refused', 'NotAllowedError'))),
		);
		const onRejected = vi.fn();
		toggleVideoPlayback(v, onRejected);
		await vi.waitFor(() => expect(onRejected).toHaveBeenCalledTimes(1));
	});
});

describe('requestPlay (#221)', () => {
	it('reports a refused play()', async () => {
		const play = vi.fn(() => Promise.reject(new DOMException('refused', 'NotAllowedError')));
		const onRejected = vi.fn();
		requestPlay({ play }, onRejected);
		await vi.waitFor(() => expect(onRejected).toHaveBeenCalledTimes(1));
	});

	it('stays quiet when play() succeeds', async () => {
		const onRejected = vi.fn();
		await new Promise<void>((done) => {
			requestPlay({ play: () => Promise.resolve() }, onRejected);
			setTimeout(done, 0);
		});
		expect(onRejected).not.toHaveBeenCalled();
	});
});

describe('HeroBackdrop control wiring (#221)', () => {
	const src = read('_components/hero-backdrop.tsx');
	const button = src.match(/<button[\s\S]*?<\/button>/)?.[0] ?? '';

	it('gates the video and control on the playback check', () => {
		expect(src).toMatch(/canPlayHeroVideo\(\s*\(query\)\s*=>\s*window\.matchMedia\(query\)/);
		expect(src).toMatch(
			/\{playVideo && <HeroVideo\s+onFail=\{\(\) => setPlayVideo\(false\)\}\s*\/>\}/,
		);
	});

	it('drops the video and control when the video errors', () => {
		expect(src).toMatch(/onError=\{onFail\}/);
	});

	it('starts playback once, from the mount effect', () => {
		expect(src).not.toMatch(/^\s*autoPlay\s*$/m);
		expect(src).toMatch(
			/useEffect\(\(\) => \{\s*if \(videoRef\.current\) requestPlay\(\s*videoRef\.current,\s*syncPaused\s*\);\s*\}, \[syncPaused\]\)/,
		);
	});

	it('reads the paused state from the live element, through the ref', () => {
		expect(src).toMatch(
			/const video = videoRef\.current;\s*if \(video\) setPaused\(video\.paused\);/,
		);
		expect(src).toMatch(/useState\(false\)/);
	});

	it('renders a real button beside the aria-hidden video, not inside it', () => {
		expect(src).toMatch(
			/<video[\s\S]*?aria-hidden="true"[\s\S]*?\/>\s*\{\/\*[\s\S]*?\*\/\}\s*<button/,
		);
		expect(button).toMatch(/type="button"/);
		expect(button).not.toMatch(/tabIndex/);
	});

	it('labels the button from the paused state', () => {
		expect(src).toMatch(/const label = videoToggleLabel\(\s*paused\s*\)/);
		expect(button).toMatch(/aria-label=\{label\}/);
	});

	it('toggles the video on click', () => {
		expect(src).toMatch(/ref=\{videoRef\}/);
		expect(button).toMatch(/toggleVideoPlayback\(\s*videoRef\.current,\s*syncPaused\s*\)/);
	});

	it('follows the element play and pause events', () => {
		expect(src).toMatch(/onPlay=\{syncPaused\}/);
		expect(src).toMatch(/onPause=\{syncPaused\}/);
	});

	it('sits top right, matching its first place in tab order', () => {
		expect(button).toMatch(/\btop-6\b/);
		expect(button).not.toMatch(/\bbottom-6\b/);
	});

	it('has a visible focus ring and sits above the scrims', () => {
		expect(button).toMatch(/focus-visible:ring-2/);
		expect(button).toMatch(/focus-visible:ring-ring/);
		expect(button).toMatch(/\bz-10\b/);
		expect(button).not.toMatch(/pointer-events-none/);
	});
});

describe('body links are underlined without hover (#221)', () => {
	it.each(['_components/info-page.tsx', 'support/page.tsx', 'privacy/page.tsx'])('%s', (path) => {
		const src = read(path);
		expect(src).toMatch(/className="text-saber-blue underline underline-offset-2"/);
		expect(src).not.toMatch(/text-saber-blue hover:underline/);
	});
});
