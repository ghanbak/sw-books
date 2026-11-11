import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { shelfIntroCopy } from '@/lib/scan-a11y';
import { SCAN_INTRO_BUTTON, SCAN_INTRO_TITLE, scanIntroPoints } from '@/lib/scan-intro';

const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');
const capture = read('components/shelf-scan-capture.tsx');
const glassButton = read('components/ui/glass-button.tsx');

const points = (screenReaderEnabled: boolean) =>
	scanIntroPoints({ shelfHowTo: shelfIntroCopy(screenReaderEnabled)[0], screenReaderEnabled });

// The ShelfIntro function body, so wiring checks can't pass on code elsewhere in the file.
const introBody = capture.slice(
	capture.indexOf('function ShelfIntro('),
	capture.indexOf('function CaptureFlash('),
);

describe('scan intro points', () => {
	it('covers the four scan-mode points in order, each with an SF Symbol', () => {
		const list = points(false);
		expect(list.map((p) => p.title)).toEqual([
			'Scan your shelf',
			'Scan a book cover',
			'Scan an ISBN barcode',
			'Review and add',
		]);
		for (const p of list) expect(p.icon).toMatch(/^[a-z0-9.]+$/);
		expect(new Set(list.map((p) => p.icon)).size).toBe(4);
		expect(list.at(-1)?.body).toContain('library');
	});

	it('gives each row one spoken label of title + body', () => {
		for (const p of points(false)) expect(p.accessibilityLabel).toBe(`${p.title}. ${p.body}`);
	});

	it('uses the screen-reader shelf copy and double-tap wording under VoiceOver', () => {
		const [shelf, , , review] = points(true);
		expect(shelf.body).toBe(shelfIntroCopy(true)[0]);
		expect(review.body).toMatch(/^Double-tap Finish/);
		expect(points(false)[3].body).toMatch(/^Tap Finish/);
	});
});

describe('ShelfIntro wiring', () => {
	it('renders the point list with SymbolView icons and per-row labels', () => {
		expect(introBody).toMatch(
			/scanIntroPoints\(\s*\{\s*shelfHowTo,\s*screenReaderEnabled\s*\}\s*\)/,
		);
		expect(introBody).toMatch(/points\.map\(/);
		expect(introBody).toMatch(/<SymbolView\s[^>]*name=\{\s*item\.icon\s*\}/);
		expect(introBody).toMatch(/accessibilityLabel=\{\s*item\.accessibilityLabel\s*\}/);
		expect(introBody).toContain('{SCAN_INTRO_TITLE}');
		expect(SCAN_INTRO_TITLE).toBe('Scan mode');
	});

	it('dismisses through the glass button and keeps the same dismiss handler', () => {
		expect(introBody).toMatch(/<GlassButton\s[^>]*label=\{\s*SCAN_INTRO_BUTTON\s*\}/);
		expect(introBody).toMatch(/onPress=\{\s*onDismiss\s*\}/);
		expect(capture).toMatch(/<ShelfIntro\s[^>]*onDismiss=\{\s*dismissIntro\s*\}/);
		expect(SCAN_INTRO_BUTTON).toBe('Start Scanning');
	});

	it('respects Reduce Motion for every entering animation', () => {
		expect(capture).toMatch(/<ShelfIntro\s[^>]*reduceMotion=\{\s*reduceMotion\s*\}/);
		const enterings = introBody.match(/entering=\{[^}]*\}/g) ?? [];
		expect(enterings.length).toBeGreaterThan(0);
		for (const e of enterings) expect(e).toMatch(/reduceMotion \?|enter\(/);
		expect(introBody).toMatch(/reduceMotion\s*\?\s*undefined\s*:\s*FadeInDown/);
	});
});

describe('GlassButton', () => {
	it('tints glass with the accent token and uses no hardcoded colors', () => {
		expect(glassButton).toMatch(/tintColor=\{\s*tokens\.accent\.primary\s*\}/);
		expect(glassButton).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
		expect(glassButton).toMatch(/accessibilityRole="button"/);
		expect(glassButton).toMatch(/accessibilityLabel=\{\s*accessibilityLabel \?\? label\s*\}/);
	});

	it('uses the dark text.inverse label on both the glass and the solid fallback path', () => {
		// One label style, applied unconditionally: no glass-only override can swap in a
		// light color (text.primary measured ~2.9:1 on the rendered blue glass).
		const labelBlock = glassButton.match(/\blabel:\s*\{([^}]*)\}/)?.[1] ?? '';
		expect(labelBlock).toMatch(/\bcolor:\s*tokens\.text\.inverse\b/);
		expect(glassButton).toMatch(/<Text style=\{\s*styles\.label\s*\}>/);
		expect(glassButton.match(/<Text\b/g)).toHaveLength(1);
		expect(glassButton).not.toMatch(/color:\s*tokens\.text\.primary/);
		// Both branches of the glass check exist and render the same label after them.
		expect(glassButton).toMatch(/liquidGlassAvailable \?\s*\(\s*<GlassView/);
		expect(glassButton).toMatch(/styles\.fallback\]/);
	});
});
