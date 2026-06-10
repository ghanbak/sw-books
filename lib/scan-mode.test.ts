import { DEFAULT_SCAN_MODE, parseStoredScanMode } from '@/lib/scan-mode';
import { describe, expect, it } from 'vitest';

describe('parseStoredScanMode', () => {
	it.each([
		['barcode', 'barcode'],
		['shelf', 'shelf'],
	])('keeps the valid stored value %j', (stored, expected) => {
		expect(parseStoredScanMode(stored)).toBe(expected);
	});

	it.each([null, undefined, '', 'qr', 'Shelf', ' shelf '])(
		'falls back to the default for invalid value %j',
		(stored) => {
			expect(parseStoredScanMode(stored)).toBe(DEFAULT_SCAN_MODE);
		},
	);

	it('defaults to shelf — the headline experience', () => {
		expect(DEFAULT_SCAN_MODE).toBe('shelf');
	});
});
