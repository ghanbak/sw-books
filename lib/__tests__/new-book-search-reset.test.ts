// New-book Search clears the previous results before each search (issue 362): a repeat
// search with the same outcome re-announces, and a failed search leaves no stale cards.
// The helper is pure; the form wiring is checked at the source (no DOM in this suite).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runResettingSearch } from '../../admin/lib/resetting-search';
import { searchStatusLabel } from '../../admin/lib/search-a11y';

type Results = Parameters<typeof searchStatusLabel>[0] & object;
type Outcome = { ok: true; data: Results } | { ok: false; error: { message: string } };

const match = { isbn: ['9780000000001'], publisher: 'Del Rey', date_published: '2017-04-11' };
const other = { isbn: ['9780000000002'], publisher: 'Disney', date_published: '2019-01-01' };

/** Drives the helper like the form does, recording each committed status text. */
function harness(initial: Results | null) {
	let results: Results | null = initial;
	const labels: string[] = [];
	const errors: string[] = [];
	const setResults = (r: Results | null) => {
		results = r;
		labels.push(searchStatusLabel(results));
	};
	const search = async (outcome: Outcome) => {
		let action: (() => Promise<void>) | undefined;
		runResettingSearch(
			setResults,
			(a) => {
				action = a;
			},
			async () => outcome,
			(e) => errors.push(e.message),
		);
		// The clear must land before the transition's action runs.
		const beforeAction = [...labels];
		await action?.();
		return beforeAction;
	};
	return {
		search,
		labels,
		errors,
		get results() {
			return results;
		},
	};
}

describe('runResettingSearch', () => {
	it('a repeat search with the same outcome goes empty, then the summary', async () => {
		const h = harness({ ol: match, gb: match });
		const summary = searchStatusLabel({ ol: match, gb: match });
		const beforeAction = await h.search({ ok: true, data: { ol: other, gb: other } });
		expect(beforeAction).toEqual(['']);
		expect(h.labels).toEqual(['', summary]);
		expect(h.results).toEqual({ ol: other, gb: other });
	});

	it('a failed search leaves results null and reports the error', async () => {
		const h = harness({ ol: match, gb: match });
		await h.search({ ok: false, error: { message: 'Invalid ISBN' } });
		expect(h.results).toBeNull();
		expect(h.labels).toEqual(['']);
		expect(h.errors).toEqual(['Invalid ISBN']);
	});
});

const form = (() => {
	try {
		return readFileSync(
			resolve(__dirname, '../../admin/app/admin/books/new/_components/new-book-form.tsx'),
			'utf-8',
		);
	} catch {
		return '';
	}
})();

describe('new-book form search wiring', () => {
	const runSearch = form.slice(
		form.indexOf('function runSearch('),
		form.indexOf('function prefill('),
	);

	it('the runSearch slice is found', () => {
		expect(runSearch.length).toBeGreaterThan(0);
	});

	it('runSearch goes through runResettingSearch with setResults and startSearch', () => {
		expect(form).toMatch(
			/import\s*\{\s*runResettingSearch\s*\}\s*from\s*'@\/lib\/resetting-search'/,
		);
		expect(runSearch).toMatch(/runResettingSearch\(\s*setResults,\s*startSearch,/);
		expect(runSearch).toMatch(/searchForNewBook\(\s*query\s*\)/);
	});

	it('runSearch does not start its own transition or set results itself', () => {
		expect(runSearch).not.toMatch(/startSearch\(\s*async/);
		expect(runSearch).not.toMatch(/setResults\(\s*res\.data\s*\)/);
	});
});
