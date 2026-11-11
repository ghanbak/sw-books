import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Vitest is node-only (no render tests), so assert the wiring in source: book rows open detail
// through a zoom + preview Link, and the detail hero is the zoom's target.
function source(rel: string): string {
	return readFileSync(resolve(__dirname, '..', rel), 'utf8');
}

function count(haystack: string, needle: string): number {
	return haystack.split(needle).length - 1;
}

describe('book row → detail zoom + preview wiring', () => {
	const card = source('components/book-card.tsx');
	const detail = source('app/book/[id].tsx');

	it('the row pushes the same detail route through a Link', () => {
		expect(count(card, '<Link href={`/book/${book.id}`} push asChild>')).toBe(1);
		expect(card).not.toContain('router.push');
	});

	it('the row has a trigger, a zoom source around the cover, and a long-press preview', () => {
		expect(count(card, '<Link.Trigger>')).toBe(1);
		expect(count(card, '<Link.AppleZoom>')).toBe(1);
		expect(count(card, '<Link.Preview />')).toBe(1);
		// The zoom source wraps the thumbnail, not the whole full-width row.
		const zoom = card.slice(card.indexOf('<Link.AppleZoom>'), card.indexOf('</Link.AppleZoom>'));
		expect(zoom).toContain('<HoloCover');
	});

	it('the Slot child keeps a plain style object (Slot drops style functions)', () => {
		expect(card).toContain('style={styles.wrap}');
		expect(card).not.toMatch(/style=\{\(\{ pressed \}\)/);
	});

	it('the detail hero is the zoom target and skips the 3D stage in a preview', () => {
		expect(count(detail, '<Link.AppleZoomTarget>')).toBe(1);
		expect(detail).toContain('const isPreview = useIsPreview();');
		expect(detail).toMatch(/\{isPreview \? null : \(\s*<HoloStage/);
	});
});
