import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Node-only Vitest: assert the unified scan view's wiring in source (#106).
const path = (rel: string) => resolve(__dirname, '..', rel);
const source = (rel: string) => (existsSync(path(rel)) ? readFileSync(path(rel), 'utf8') : '');

/** The value of `prop` inside the StyleSheet entry `style` (whitespace-tolerant). */
function styleValue(src: string, style: string, prop: string): string | undefined {
	const block = src.match(new RegExp(`\\b${style}:\\s*\\{([^}]*)\\}`))?.[1] ?? '';
	return block.match(new RegExp(`\\b${prop}:\\s*([^,\\n]+)`))?.[1]?.trim();
}

const capture = 'components/shelf-scan-capture.tsx';
const scan = 'app/scan.tsx';

describe('scan view secondary buttons use surface tokens (triage AC)', () => {
	it.each([
		[capture, 'secondaryButton'],
		[capture, 'dismissButton'],
	])('%s: %s', (file, style) => {
		const src = source(file);
		expect(styleValue(src, style, 'backgroundColor')).toBe('tokens.surface.card');
		expect(styleValue(src, style, 'borderWidth')).toBe('1');
		expect(styleValue(src, style, 'borderColor')).toBe('tokens.border.subtle');
	});

	it('no hardcoded white 0.12 fill is left in the scan components', () => {
		for (const file of [capture, scan, 'components/barcode-scan-panel.tsx']) {
			expect(source(file)).not.toMatch(/rgba\(\s*255,\s*255,\s*255,\s*0\.12\s*\)/);
		}
	});
});

describe('unified scan view wiring', () => {
	it('the segmented control and the old ISBN panel are gone', () => {
		expect(existsSync(path('components/scan-mode-switcher.tsx'))).toBe(false);
		expect(existsSync(path('components/barcode-scan-panel.tsx'))).toBe(false);
		expect(source(scan)).not.toMatch(/ScanModeSwitcher|BarcodeScanPanel/);
	});

	it('the host picks its state from the pure selector', () => {
		expect(source(scan)).toMatch(/selectScanViewState\(\s*\{/);
	});

	it('one camera does both OCR stills and barcodes', () => {
		const src = source(capture);
		expect(src).toMatch(/barcodeScannerSettings=\{/);
		expect(src).toMatch(/onBarcodeScanned=\{/);
		expect(src).toMatch(/ref=\{\s*scan\.setCameraRef\s*\}/);
	});

	it('the tray renders the captured list', () => {
		expect(source(capture)).toMatch(/<ScanTray\s+books=\{\s*scan\.captured\s*\}/);
	});

	it('the captured-image ghost overlay is gone', () => {
		expect(source(capture)).not.toMatch(/scan\.ghostUri/);
	});

	it('the Finish button is glass tinted with the primary accent', () => {
		expect(source(capture)).toMatch(/tintColor=\{\s*tokens\.accent\.primary\s*\}/);
	});

	it('the hook prepends via the pure capture-list helper', () => {
		const hook = source('hooks/useShelfScan.ts');
		expect(hook).toMatch(/prependCaptured\(/);
		expect(hook).toMatch(/mergeCapturedIntoMatches\(/);
	});
});
