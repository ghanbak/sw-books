// The diff view's Re-run lookup clears the previous candidates before each lookup, and a
// failed lookup also clears the field selections (issue 395): no stale OL/GB columns, no
// live Apply, no stale "candidates fetched" time. A successful re-run keeps the render-time
// selection pruning from #240. The helper is covered in new-book-search-reset.test.ts;
// this checks the wiring (no DOM in this suite) plus the patch it leaves.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runResettingSearch } from '../../admin/lib/resetting-search';
import { type LookupSelection, buildLookupPatch } from '../sources/lookup-selection';
import type { LookupResult } from '../sources/types';

const path = resolve(__dirname, '../../admin/app/admin/books/[slug]/_components/diff-view.tsx');
const source = existsSync(path) ? readFileSync(path, 'utf-8') : '';

describe('diff view lookup wiring', () => {
	const start = source.indexOf('function runLookup(');
	const end = source.indexOf('function fillEmpty(');
	const runLookup = start >= 0 && end > start ? source.slice(start, end) : '';
	const onErrorAt = runLookup.search(/\(error\)\s*=>\s*\{/);
	const onError = onErrorAt >= 0 ? runLookup.slice(onErrorAt) : '';

	it('the runLookup slice and its error callback are found', () => {
		expect(runLookup.length).toBeGreaterThan(0);
		expect(onError.length).toBeGreaterThan(0);
	});

	it('imports runResettingSearch', () => {
		expect(source).toMatch(
			/import\s*\{\s*runResettingSearch\s*\}\s*from\s*'@\/lib\/resetting-search'/,
		);
	});

	it('runLookup goes through runResettingSearch with setCandidates and startLookup', () => {
		expect(runLookup).toMatch(/runResettingSearch\(\s*setCandidates,\s*startLookup,/);
		expect(runLookup).toMatch(/lookupCandidates\(\s*book\.slug\s*\)/);
	});

	it('runLookup does not start its own transition or set candidates itself', () => {
		expect(runLookup).not.toMatch(/startLookup\(\s*async/);
		expect(runLookup).not.toMatch(/setCandidates\(\s*res\.data\s*\)/);
	});

	it('a failed lookup clears the selections and Replace state, then toasts', () => {
		expect(onError).toMatch(/setSelection\(\s*\{\s*\}\s*\)/);
		expect(onError).toMatch(/setReplaceIsbn\(\s*false\s*\)/);
		expect(onError).toMatch(/setConfirmSlug\(\s*''\s*\)/);
		expect(onError).toMatch(/toast\.error\(\s*`Lookup failed: \$\{error\.message\}`/);
	});

	it('a successful lookup still toasts', () => {
		expect(runLookup).toMatch(/toast\.success\(\s*`Lookup done/);
	});
});

const book = {
	slug: 'thrawn',
	cover_image: null,
	publisher: 'Del Rey',
	date_published: null,
	language: null,
	synopsis: null,
	format: [],
	isbn: ['9780000000001'],
	primary_isbn: '9780000000001',
} as unknown as Parameters<typeof buildLookupPatch>[0];

const candidates = {
	ol: { publisher: 'Lucasfilm Press', isbn: ['9780000000002'] },
	gb: {},
	fetchedAt: '2026-11-24T10:00:00.000Z',
} as unknown as LookupResult;

/** Drives runResettingSearch like DiffView does, tracking candidates and selection. */
function harness() {
	let current: LookupResult | null = candidates;
	let selection: LookupSelection = { publisher: 'ol', isbn: 'ol' };
	const lookup = async (
		outcome: { ok: true; data: LookupResult } | { ok: false; error: Error },
	) => {
		let action: (() => Promise<void>) | undefined;
		runResettingSearch<LookupResult, Error>(
			(r) => {
				current = r;
			},
			(a) => {
				action = a;
			},
			async () => outcome,
			() => {
				selection = {};
			},
		);
		// What Apply would write while the lookup is still pending.
		const pendingPatch = buildLookupPatch(book, current, selection, false);
		await action?.();
		return pendingPatch;
	};
	return {
		lookup,
		get candidates() {
			return current;
		},
		get patch() {
			return buildLookupPatch(book, current, selection, false);
		},
	};
}

describe('diff view lookup reset', () => {
	it('Apply has nothing to write while a re-run is pending', async () => {
		const h = harness();
		expect(Object.keys(h.patch)).toEqual(['publisher', 'isbn', 'primary_isbn']);
		const pending = await h.lookup({ ok: true, data: candidates });
		expect(pending).toEqual({});
	});

	it('a failed re-run leaves no candidates and an empty patch', async () => {
		const h = harness();
		await h.lookup({ ok: false, error: new Error('Failed to find Server Action') });
		expect(h.candidates).toBeNull();
		expect(h.patch).toEqual({});
	});

	it('a successful re-run restores the kept selections', async () => {
		const h = harness();
		await h.lookup({ ok: true, data: candidates });
		expect(h.candidates).toBe(candidates);
		expect(Object.keys(h.patch)).toEqual(['publisher', 'isbn', 'primary_isbn']);
	});
});
