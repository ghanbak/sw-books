import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Vitest is node-only (no render tests), so assert the #293 wiring in source.
const ROOT = resolve(__dirname, '..');
const CAPTURE = 'components/shelf-scan-capture.tsx';
// Built by concatenation so this file doesn't match its own scan.
const PLACEHOLDER = ['scan-tray', 'placeholder'].join('-');

function source(rel: string): string {
	return readFileSync(join(ROOT, rel), 'utf8');
}

function sourceFiles(dir: string): string[] {
	const abs = join(ROOT, dir);
	if (!existsSync(abs)) return [];
	return readdirSync(abs).flatMap((name) => {
		const rel = join(dir, name);
		if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
		return /\.(ts|tsx)$/.test(name) ? [rel] : [];
	});
}

describe('scan tray wiring (#293)', () => {
	it('the capture screen renders the real tray', () => {
		expect(source(CAPTURE)).toMatch(
			/import\s*\{\s*ScanTray\s*\}\s*from\s*'@\/components\/scan-tray'\s*;/,
		);
	});

	it('leaves no placeholder file or reference behind', () => {
		expect(existsSync(join(ROOT, `components/${PLACEHOLDER}.tsx`))).toBe(false);
		const offenders = ['app', 'components', 'hooks', 'lib', 'constants']
			.flatMap(sourceFiles)
			.filter((rel) => source(rel).includes(PLACEHOLDER));
		expect(offenders).toEqual([]);
	});

	it('renders the HUD controls after the tray, so they win taps in its drop-headroom band', () => {
		const src = source(CAPTURE);
		const tray = src.indexOf('<ScanTray');
		expect(tray).toBeGreaterThan(-1);
		for (const handler of [
			/onPress=\{\s*scan\.captureNow\s*\}/,
			/onPress=\{\s*scan\.finish\s*\}/,
		]) {
			const at = src.search(handler);
			expect(at).toBeGreaterThan(tray);
		}
		expect(src).toMatch(/style=\{\s*styles\.hud\s*\}\s*pointerEvents="box-none"/);
	});

	it('stretches the tray root so a few books do not centre under an alignItems parent', () => {
		// The tray owns its full-width scrim/blur; the HUD column centres its children.
		const tray = source('components/scan-tray.tsx');
		expect(tray).toMatch(/\btray:\s*\{[^}]*alignSelf:\s*'stretch'/);
	});
});

describe('modules orphaned by the unified scan view (#106) are gone', () => {
	it.each(['lib/barcode-lookup.ts', 'lib/scan-mode.ts', 'components/added-books-sheet.tsx'])(
		'%s is deleted',
		(rel) => {
			expect(existsSync(join(ROOT, rel))).toBe(false);
		},
	);

	it('scan-a11y drops the old shelf Finish label and barcode announcement', () => {
		const src = source('lib/scan-a11y.ts');
		expect(src).not.toMatch(/export function finishScanLabel\b/);
		expect(src).not.toMatch(/export function barcodeResultAnnouncement\b/);
	});

	it('deriveShelfChrome no longer computes the mode-switch dirty flag', () => {
		const src = source('lib/shelf-scan.ts');
		const type = src.match(/export type ShelfChrome = \{[^}]*\}/)?.[0];
		expect(type).toBeDefined();
		expect(type).not.toMatch(/\bdirty\s*:/);
		const fn = src.match(/export function deriveShelfChrome\([\s\S]*?\n\}/)?.[0];
		expect(fn).toBeDefined();
		expect(fn).not.toMatch(/\bdirty\b/);
	});
});
