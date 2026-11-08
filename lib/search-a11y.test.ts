import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { searchAnnouncement } from '@/lib/search-a11y';

describe('searchAnnouncement', () => {
	it('speaks the result count, pluralized', () => {
		expect(searchAnnouncement({ query: 'zahn', catalogState: 'list', count: 1 })).toBe('1 match');
		expect(searchAnnouncement({ query: 'zahn', catalogState: 'list', count: 12 })).toBe(
			'12 matches',
		);
		expect(searchAnnouncement({ query: 'star', catalogState: 'list', count: 1234 })).toBe(
			`${(1234).toLocaleString()} matches`,
		);
	});

	it('says "No matches" at zero', () => {
		expect(searchAnnouncement({ query: 'zzz', catalogState: 'list', count: 0 })).toBe('No matches');
		expect(searchAnnouncement({ query: 'zzz', catalogState: 'empty', count: 0 })).toBe(
			'No matches',
		);
	});

	it('stays silent for an empty or whitespace query', () => {
		expect(searchAnnouncement({ query: '', catalogState: 'list', count: 0 })).toBeNull();
		expect(searchAnnouncement({ query: '   ', catalogState: 'list', count: 0 })).toBeNull();
	});

	it('stays silent while the catalog is loading or failed', () => {
		expect(searchAnnouncement({ query: 'zahn', catalogState: 'loading', count: 0 })).toBeNull();
		expect(searchAnnouncement({ query: 'zahn', catalogState: 'error', count: 0 })).toBeNull();
	});
});

// Vitest is node-only (no render tests), so assert the debounce wiring in source.
describe('Search screen announcement wiring', () => {
	const src = readFileSync(resolve(__dirname, '../app/(tabs)/search/index.tsx'), 'utf8');

	// The one effect that consumes the helper, through to its deps array.
	const effect = src.match(
		/useEffect\(\s*\(\) => \{(?:(?!useEffect\()[\s\S])*?\n\t\}, \[[^\]]*\]/g,
	);
	const announceEffect = effect?.find((body) => body.includes('searchAnnouncement(')) ?? '';

	it('uses the helper and the shared announce', () => {
		expect(src).toMatch(/import \{ announce \} from '@\/hooks\/useAccessibility'/);
		expect(src).toMatch(/import \{ searchAnnouncement \} from '@\/lib\/search-a11y'/);
		expect(announceEffect).toMatch(/searchAnnouncement\(\s*\{[^}]*query: trimmed/);
		expect(announceEffect).toMatch(/catalogState/);
	});

	it('debounces and clears the timer on change and unmount', () => {
		expect(announceEffect).toMatch(/setTimeout\(\s*\(\) => announce\(/);
		expect(announceEffect).toMatch(/return \(\) => clearTimeout\(\s*timer\s*\)/);
	});

	it('re-announces a new query with the same count', () => {
		expect(announceEffect).toMatch(/\}, \[[^\]]*\btrimmed\b[^\]]*\]$/);
		expect(announceEffect).toMatch(/\}, \[[^\]]*\bcatalogState\b[^\]]*\]$/);
		expect(announceEffect).toMatch(/\}, \[[^\]]*\bresults\.length\b[^\]]*\]$/);
	});
});
