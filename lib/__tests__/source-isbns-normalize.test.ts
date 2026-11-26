import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeSourcedIsbn } from '../isbn';

// scripts/source-isbns.ts runs main() (network + fs writes) on import, so its
// normalization path is tested through the shared helper plus a source check
// that the script uses it and keeps no private copies.
const SCRIPT = readFileSync(resolve(__dirname, '..', '..', 'scripts', 'source-isbns.ts'), 'utf8');

describe('normalizeSourcedIsbn', () => {
	it('rejects an ISBN-10 with a wrong check digit', () => {
		expect(normalizeSourcedIsbn('0345384005')).toBeNull();
	});

	it('rejects an ISBN-10 with X outside the check position', () => {
		expect(normalizeSourcedIsbn('03453X4009')).toBeNull();
	});

	it('converts a valid ISBN-10 to its ISBN-13', () => {
		expect(normalizeSourcedIsbn('0345384008')).toBe('9780345384003');
		expect(normalizeSourcedIsbn('0-345-38400-8')).toBe('9780345384003');
	});

	it('rejects an ISBN-13 with a wrong check digit', () => {
		expect(normalizeSourcedIsbn('9780345384003')).toBe('9780345384003');
		expect(normalizeSourcedIsbn('9780345384004')).toBeNull();
	});

	it('strips only hyphens and spaces, so prefixed identifiers stay invalid', () => {
		expect(normalizeSourcedIsbn('978 0 345 38400 3')).toBe('9780345384003');
		expect(normalizeSourcedIsbn('ISBN:0345384008')).toBeNull();
	});
});

describe('scripts/source-isbns.ts wiring', () => {
	it('imports normalizeSourcedIsbn from lib/isbn', () => {
		expect(SCRIPT).toMatch(
			/import\s*\{[^}]*\bnormalizeSourcedIsbn\b[^}]*\}\s*from\s*'\.\.\/lib\/isbn'/,
		);
	});

	it('defines no private ISBN-10/13 helpers', () => {
		expect(SCRIPT).not.toMatch(/function\s+(isIsbn10|isIsbn13|isbn10to13|normalizeIsbn13)\s*\(/);
		expect(SCRIPT).not.toMatch(/\bnormalizeIsbn13\s*\(/);
	});

	it('routes all three sourcing call sites through the shared helper', () => {
		expect(SCRIPT.match(/\bnormalizeSourcedIsbn\(\s*/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
	});
});
