import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #430: expo-symbols has no Android fallback for SF Symbol names, so `<SymbolView name="xmark" />`
// renders blank on Android. Every call site must carry a Material name too — through
// `symbolName()` (lib/app-symbols.ts) or an inline `{ ios, android }` object.
const ROOT = resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib'];

// iOS-only glyphs with no Material equivalent, rendered behind a Platform.OS === 'ios' gate.
const IOS_ONLY = new Set(["{ ios: 'apple.logo' }"]);

function read(rel: string) {
	const path = resolve(ROOT, rel);
	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function sourceFiles(): string[] {
	return SCAN_DIRS.flatMap((dir) => {
		const abs = join(ROOT, dir);
		if (!existsSync(abs)) return [];
		return readdirSync(abs, { recursive: true, encoding: 'utf8' })
			.filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
			.map((f) => relative(ROOT, join(abs, f)));
	});
}

/** Returns the `{…}` expression (outer braces stripped) or quoted string starting at `start`. */
function readAttrValue(src: string, start: number): string {
	const open = src[start];
	if (open === '"' || open === "'") return src.slice(start, src.indexOf(open, start + 1) + 1);
	if (open !== '{') return '';
	let depth = 0;
	let quote: string | null = null;
	for (let i = start; i < src.length; i++) {
		const c = src[i];
		if (quote) {
			if (c === quote && src[i - 1] !== '\\') quote = null;
			continue;
		}
		if (c === '"' || c === "'" || c === '`') quote = c;
		else if (c === '{') depth++;
		else if (c === '}' && --depth === 0) return src.slice(start + 1, i).trim();
	}
	return '';
}

/** The opening tag text from `<SymbolView` to its closing `>` (brace/quote aware). */
function readTag(src: string, start: number): string {
	let depth = 0;
	let quote: string | null = null;
	for (let i = start; i < src.length; i++) {
		const c = src[i];
		if (quote) {
			if (c === quote && src[i - 1] !== '\\') quote = null;
			continue;
		}
		if (c === '"' || c === "'" || c === '`') quote = c;
		else if (c === '{') depth++;
		else if (c === '}') depth--;
		else if (c === '>' && depth === 0) return src.slice(start, i + 1);
	}
	return src.slice(start);
}

type Site = { id: string; name: string };

function symbolViewSites(): Site[] {
	return sourceFiles().flatMap((rel) => {
		const src = read(rel);
		return [...src.matchAll(/<SymbolView\b/g)].map((m) => {
			const tag = readTag(src, m.index);
			const attr = /\sname=/.exec(tag);
			const name = attr ? readAttrValue(tag, attr.index + attr[0].length) : '';
			const line = src.slice(0, m.index).split('\n').length;
			return { id: `${rel}:${line}`, name: name.replace(/\s+/g, ' ') };
		});
	});
}

/** True when the `name` value resolves to an Android glyph (or is an allowed iOS-only glyph). */
function hasAndroidName(name: string) {
	if (/^symbolName\(/.test(name)) return true;
	if (/^\{[\s\S]*\bandroid\s*:\s*'[a-z0-9_]+'[\s\S]*\}$/.test(name)) return true;
	return IOS_ONLY.has(name);
}

const SITES = symbolViewSites();

describe('SymbolView call sites carry an Android name (#430)', () => {
	it('finds the known call sites', () => {
		expect(SITES.length).toBeGreaterThanOrEqual(18);
	});

	it.each(SITES)('$id passes an Android glyph ($name)', ({ name }) => {
		expect(hasAndroidName(name)).toBe(true);
	});

	it('rejects a plain SF string, a bare identifier and an SF-only ternary', () => {
		expect(hasAndroidName('"xmark"')).toBe(false);
		expect(hasAndroidName('icon')).toBe(false);
		expect(hasAndroidName("kind === 'film' ? 'film' : 'tv'")).toBe(false);
		expect(hasAndroidName("{ ios: 'xmark' }")).toBe(false);
		expect(hasAndroidName("{ ios: 'xmark', android: 'close' }")).toBe(true);
		expect(hasAndroidName("symbolName('xmark')")).toBe(true);
	});

	it('reads a Biome-wrapped multi-line name attribute', () => {
		const src = `<SymbolView\n\tname={symbolName(\n\t\tkind === 'film' ? 'film' : 'tv',\n\t)}\n\tsize={10}\n/>`;
		const tag = readTag(src, 0);
		const attr = /\sname=/.exec(tag);
		expect(attr).not.toBeNull();
		expect(readAttrValue(tag, (attr?.index ?? 0) + (attr?.[0].length ?? 0))).toMatch(
			/^symbolName\(/,
		);
	});
});

describe('SF → Material mapping (lib/app-symbols.ts)', () => {
	const materialNames = new Set(
		Object.keys(JSON.parse(read('node_modules/expo-symbols/build/android/symbols.json') || '{}')),
	);

	it('maps every SF name to a Material Symbol expo-symbols ships', async () => {
		const { ANDROID_SYMBOLS } = await import('@/lib/app-symbols');
		const entries = Object.entries(ANDROID_SYMBOLS);
		expect(entries.length).toBeGreaterThan(0);
		for (const [sf, material] of entries) {
			expect({ sf, shipped: materialNames.has(material) }).toEqual({ sf, shipped: true });
		}
	});

	it('symbolName keeps the SF name for iOS and adds the Material name', async () => {
		const { symbolName } = await import('@/lib/app-symbols');
		expect(symbolName('xmark')).toEqual({ ios: 'xmark', android: 'close' });
		expect(symbolName('chevron.forward')).toEqual({
			ios: 'chevron.forward',
			android: 'chevron_right',
		});
		expect(symbolName('arrow.up.forward.app')).toEqual({
			ios: 'arrow.up.forward.app',
			android: 'open_in_new',
		});
	});

	it.each(['components/ui/glass-icon-button.tsx', 'components/ui/subtle-button.tsx'])(
		'%s types its icon prop as an AppSymbol',
		(rel) => {
			const src = read(rel);
			expect(src).toMatch(/import\s*\{[^}]*\bAppSymbol\b[^}]*\}\s*from\s*'@\/lib\/app-symbols'/);
			expect(src).toMatch(/icon\??:\s*AppSymbol/);
		},
	);
});
