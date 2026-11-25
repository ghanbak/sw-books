import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #413: expo-router's Android Stack.Toolbar.Button / root Stack.Toolbar.Menu return null (and
// warn) unless `icon` is an image source. SF Symbol names stay the source of truth; Android maps
// them to Material Symbols rendered to images (expo-symbols) via `useToolbarIcon`.
const ROOT = resolve(__dirname, '..', '..');

function read(rel: string) {
	const path = resolve(ROOT, rel);
	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const materialNames = new Set(
	Object.keys(JSON.parse(read('node_modules/expo-symbols/build/android/symbols.json') || '{}')),
);

async function loadMapping() {
	const mod = await import('@/lib/android-toolbar-symbols');
	return mod;
}

const CALL_SITES = [
	'components/tab-header-actions.tsx',
	'components/book-detail-toolbar.tsx',
	'app/book/[id].tsx',
];

// The SF Symbols iOS shows today; they must stay the same and each needs an Android glyph.
const IOS_SYMBOLS = [
	'line.3.horizontal.decrease',
	'barcode.viewfinder',
	'person.crop.circle',
	'star',
	'star.fill',
	'plus.circle',
	'checkmark.circle.fill',
	'bookmark',
	'bookmark.fill',
	'book',
	'book.fill',
];

describe('SF Symbol → Material Symbol toolbar mapping', () => {
	it.each(IOS_SYMBOLS)('maps %s to a Material Symbol that expo-symbols ships', async (sf) => {
		const { ANDROID_TOOLBAR_SYMBOLS } = await loadMapping();
		const material = (ANDROID_TOOLBAR_SYMBOLS as Record<string, string>)[sf];
		expect(material).toBeTypeOf('string');
		expect(materialNames.has(material)).toBe(true);
	});

	it('keeps the sort menu glyph from #60', async () => {
		const { ANDROID_TOOLBAR_SYMBOLS } = await loadMapping();
		expect(ANDROID_TOOLBAR_SYMBOLS['line.3.horizontal.decrease']).toBe('filter_list');
	});

	it('gives the owned and wishlist toggles distinct on/off glyphs', async () => {
		const { ANDROID_TOOLBAR_SYMBOLS: m } = await loadMapping();
		expect(m['plus.circle']).not.toBe(m['checkmark.circle.fill']);
		expect(m.bookmark).not.toBe(m['bookmark.fill']);
	});
});

describe('toolbar call sites use the mapping (#413)', () => {
	it.each(CALL_SITES)('%s resolves icons through useToolbarIcon', (rel) => {
		const source = read(rel);
		expect(source).not.toBe('');
		expect(source).toMatch(
			/import\s*\{[^}]*\buseToolbarIcon\b[^}]*\}\s*from\s*'@\/hooks\/useToolbarIcon'/,
		);
		expect(source).toMatch(/useToolbarIcon\(\s*/);
	});

	it.each(CALL_SITES)('%s passes no SF Symbol literal straight to a toolbar icon', (rel) => {
		const source = read(rel);
		expect(source).not.toBe('');
		expect(source).not.toMatch(/\bicon="/);
		expect(source).not.toMatch(/\bicon=\{[^}]*'[^']*'[^}]*\}/);
	});

	it.each(CALL_SITES)('%s gates each toolbar icon until its Android glyph is ready', (rel) => {
		const source = read(rel);
		const icons = [...source.matchAll(/\bicon=\{\s*(\w+)\s*\}/g)].map((m) => m[1]);
		expect(icons.length).toBeGreaterThan(0);
		for (const name of icons) {
			expect(source).toMatch(new RegExp(`\\{\\s*${name}\\s*(\\?|&&)`));
		}
	});

	it('every SF Symbol a call site asks for has an Android glyph', async () => {
		const { ANDROID_TOOLBAR_SYMBOLS } = await loadMapping();
		const requested = CALL_SITES.flatMap((rel) =>
			[...read(rel).matchAll(/useToolbarIcon\(\s*([^)]*)\)/g)].flatMap((m) =>
				[...m[1].matchAll(/'([^']+)'/g)].map((s) => s[1]),
			),
		);
		expect(requested.length).toBeGreaterThanOrEqual(IOS_SYMBOLS.length);
		for (const sf of requested) expect(Object.keys(ANDROID_TOOLBAR_SYMBOLS)).toContain(sf);
	});

	it('the labelled "Add to library" button keeps a TalkBack label on Android', () => {
		const source = read('components/book-detail-toolbar.tsx');
		const prominent =
			source.match(/<Stack\.Toolbar\.Button[^>]*variant="prominent"[^>]*>/s)?.[0] ?? '';
		expect(prominent).toMatch(/accessibilityLabel=\{/);
	});
});
