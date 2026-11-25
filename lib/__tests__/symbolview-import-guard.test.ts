import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #443: expo-symbols' Android SymbolView clips at large font scale (#441). Every component goes
// through `@/components/ui/symbol-view` (dp bitmap on Android, re-export on iOS). Only the iOS
// re-export may take a value import of SymbolView from 'expo-symbols'; `import type` is fine.
const ROOT = resolve(__dirname, '..', '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib'];
const WRAPPER = 'components/ui/symbol-view.tsx';
const ALLOWED = new Set([WRAPPER]);

function sourceFiles(): string[] {
	return SCAN_DIRS.flatMap((dir) =>
		readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
			.filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes('node_modules'))
			.map((f) =>
				relative(ROOT, join(ROOT, dir, f))
					.split('\\')
					.join('/'),
			),
	);
}

/** True when `src` value-imports or re-exports SymbolView from 'expo-symbols' (multi-line safe). */
function importsSymbolViewValue(src: string): boolean {
	const re = /\b(import|export)\s+(type\s+)?\{([^}]*)\}\s*from\s*['"]expo-symbols['"]/g;
	for (const m of src.matchAll(re)) {
		if (m[2]) continue;
		const names = m[3]
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		if (names.some((n) => /^SymbolView\b/.test(n))) return true;
	}
	return false;
}

describe('SymbolView import guard (#443)', () => {
	const files = sourceFiles();

	it('scans the source tree and finds the wrapper', () => {
		expect(files.length).toBeGreaterThan(0);
		expect(files).toContain(WRAPPER);
	});

	it('detects value imports and ignores type-only ones', () => {
		expect(importsSymbolViewValue("import { SymbolView } from 'expo-symbols';")).toBe(true);
		expect(
			importsSymbolViewValue("import {\n\tSymbolView,\n\ttype SFSymbol,\n} from 'expo-symbols';"),
		).toBe(true);
		expect(importsSymbolViewValue("export { SymbolView } from 'expo-symbols';")).toBe(true);
		expect(importsSymbolViewValue("import type { SymbolViewProps } from 'expo-symbols';")).toBe(
			false,
		);
		expect(importsSymbolViewValue("import { type SymbolView } from 'expo-symbols';")).toBe(false);
		expect(
			importsSymbolViewValue("import { SymbolView } from '@/components/ui/symbol-view';"),
		).toBe(false);
	});

	it('only the iOS re-export imports SymbolView from expo-symbols', () => {
		const offenders = files.filter(
			(rel) => !ALLOWED.has(rel) && importsSymbolViewValue(readFileSync(join(ROOT, rel), 'utf8')),
		);
		expect(offenders).toEqual([]);
	});
});
