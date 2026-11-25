import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #435: useMaterialSymbolSource bakes its colour (alpha included) into the glyph bitmap, and
// @expo/ui's Android Icon applies `color` as a SrcIn tint, which keeps the tint's RGB but
// multiplies alphas. So wherever an Icon tint carries the token, the bitmap must be seeded
// opaque, or rgba(…,0.5) renders at ~0.25.
const ROOT = resolve(__dirname, '..', '..');

function read(rel: string) {
	const path = resolve(ROOT, rel);
	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

const ICON_ANDROID = read('components/sf-icon.android.tsx');
const DISCLOSURE = read('components/profile-disclosure.android.tsx');
const HOOK = read('hooks/useMaterialSymbolSource.ts');
const TOKENS = read('constants/tokens.ts');

// Opaque: #RGB / #RRGGBB, #RRGGBBFF, or rgb()/rgba(…, 1).
function isOpaque(color: string) {
	return (
		/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{6}ff)$/i.test(color) ||
		/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(color) ||
		/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*1(?:\.0+)?\s*\)$/i.test(color)
	);
}

function functionBody(source: string, name: string) {
	const start = source.search(new RegExp(`export function ${name}\\(`));
	if (start < 0) return '';
	const next = source.indexOf('\nexport ', start + 1);
	return source.slice(start, next < 0 ? undefined : next);
}

describe('SFIcon (Android) seeds the glyph opaque and tints with the token (#435)', () => {
	const body = functionBody(ICON_ANDROID, 'SFIcon');
	const call = body.match(/useMaterialSymbolSource\(\s*android\s*,\s*24\s*,\s*([^)]*?)\s*\)/);

	it('finds the SFIcon body and its hook call', () => {
		expect(body).not.toBe('');
		expect(call).not.toBeNull();
	});

	it('never seeds the bitmap with the translucent-capable `color` prop', () => {
		expect(call?.[1]).not.toBe('color');
	});

	it('seeds the bitmap with an opaque constant', () => {
		const seedName = call?.[1] ?? '';
		const literal = /^'([^']+)'$/.exec(seedName)?.[1];
		const constant = ICON_ANDROID.match(
			new RegExp(`const\\s+${seedName.replace(/\W/g, '')}\\s*=\\s*'([^']+)'`),
		)?.[1];
		const seed = literal ?? constant ?? '';
		expect(seed).not.toBe('');
		expect(isOpaque(seed)).toBe(true);
	});

	it('passes the token only as the Icon tint', () => {
		expect(body).toMatch(/<Icon\b[^>]*\bcolor=\{\s*color\s*\}/);
		// Remove the destructured prop and the Icon tint; no other use of `color` may remain.
		const rest = body.replace(/SFIcon\(\{[^}]*\}/, '').replace(/\bcolor=\{\s*color\s*\}/, '');
		expect(rest).not.toMatch(/\bcolor\b/);
	});
});

describe('Other tinted callers keep an opaque seed (#435)', () => {
	it('the hook default seed is an opaque token', () => {
		const def = HOOK.match(/color:\s*string\s*=\s*tokens\.text\.(\w+)/)?.[1];
		expect(def).toBeDefined();
		const value = TOKENS.match(new RegExp(`\\b${def}:\\s*'([^']+)'`))?.[1] ?? '';
		expect(value).not.toBe('');
		expect(isOpaque(value)).toBe(true);
	});

	it('DisclosureGroup chevron uses the default (opaque) seed and tints via Icon', () => {
		const body = functionBody(DISCLOSURE, 'DisclosureGroup');
		expect(body).not.toBe('');
		expect(body).toMatch(/useMaterialSymbolSource\(\s*'expand_more'\s*,\s*24\s*\)/);
		expect(body).toMatch(/<Icon\b[\s\S]*?color=\{\s*tokens\.text\.tertiary\s*\}/);
	});
});
