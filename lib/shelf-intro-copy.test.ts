import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { shelfIntroCopy } from '@/lib/scan-a11y';

const readIfPresent = (path: string) => {
	const p = resolve(__dirname, '..', path);
	return existsSync(p) ? readFileSync(p, 'utf8') : '';
};

const capture = readIfPresent('components/shelf-scan-capture.tsx');

// The shutter's accessibilityLabel, read from source so the intro copy can't drift from it.
const shutterLabel = capture.match(
	/style=\{styles\.shutter\}[\s\S]*?accessibilityLabel="([^"]+)"/,
)?.[1];

describe('shelf intro copy', () => {
	it('default (no screen reader) copy is unchanged', () => {
		expect(shelfIntroCopy(false)).toEqual([
			'Pan the camera slowly across a row of spines. Photos snap on their own each time you hold steady — no tapping.',
			"Tap Finish when you're done and we'll match what we found against the Archive.",
		]);
	});

	it('screen-reader copy describes the manual flow by its control labels', () => {
		const text = shelfIntroCopy(true).join(' ');
		expect(shutterLabel).toBe('Take photo');
		expect(text).toContain(`double-tap ${shutterLabel}`);
		expect(text).toContain('Finish');
		expect(text).not.toContain('on their own');
		expect(text).not.toContain('no tapping');
	});
});

describe('shelf intro wiring', () => {
	it('ShelfIntro receives the screen-reader flag', () => {
		expect(capture).toMatch(/<ShelfIntro\s[^>]*screenReaderEnabled=\{\s*screenReaderEnabled\s*\}/);
		expect(capture).toMatch(/function ShelfIntro\(\{[^}]*screenReaderEnabled/);
	});

	it('ShelfIntro renders the helper copy, not hardcoded strings', () => {
		expect(capture).toMatch(/shelfIntroCopy\(\s*screenReaderEnabled\s*\)/);
		expect(capture).not.toMatch(/Photos snap on their own/);
	});
});
