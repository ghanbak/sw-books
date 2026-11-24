import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// #393: every place a supabase-js error reaches visible text goes through lib/error-copy.
const source = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');

/** Text from `startPattern` to the first `endMarker` after it ('' when either is missing). */
function scope(src: string, startPattern: RegExp, endMarker: string): string {
	const start = src.search(startPattern);
	if (start < 0) return '';
	const end = src.indexOf(endMarker, start);
	return end > start ? src.slice(start, end) : '';
}

describe('error copy wiring', () => {
	const hooks = source('lib/hooks.tsx');
	const fetchBooks = scope(hooks, /const fetchBooks\s*=\s*useCallback\(/, '}, []);');
	const fetchUserBooks = scope(hooks, /const fetchUserBooks\s*=\s*useCallback\(/, '}, [writes]);');
	const adder = scope(source('lib/shelf.ts'), /export function createOwnedAdder\(/, '\n}\n');
	const addToLibrary = scope(
		source('components/barcode-scan-panel.tsx'),
		/const addToLibrary\s*=\s*useCallback\(/,
		'[addOwned, dismissResult]',
	);
	const shelfScan = source('hooks/useShelfScan.ts');
	const shelfAdd = scope(shelfScan, /const result\s*=\s*await addOwned\(\s*ids\s*\)/, 'finally {');

	it('finds every scope', () => {
		for (const s of [fetchBooks, fetchUserBooks, adder, addToLibrary, shelfAdd]) {
			expect(s).not.toBe('');
		}
	});

	it('the catalog load maps its error and logs the raw text', () => {
		expect(fetchBooks).toMatch(/console\.warn\(\s*'\[books\] fetch failed:',\s*err\.message\s*\)/);
		expect(fetchBooks).toMatch(
			/setError\(\s*errorCopy\(\s*classifyShelfWriteError\(\s*err\s*\)\s*\)\s*\)/,
		);
		expect(fetchBooks).not.toMatch(/setError\(\s*err\.message/);
	});

	it('the shelf load maps its error with the HTTP status and logs the raw text', () => {
		expect(fetchUserBooks).toMatch(/\{\s*data,\s*error:\s*fetchError,\s*status\s*\}\s*=\s*await/);
		expect(fetchUserBooks).toMatch(
			/console\.warn\(\s*'\[user_books\] fetch failed:',\s*fetchError\.message\s*\)/,
		);
		expect(fetchUserBooks).toMatch(
			/setError\(\s*errorCopy\(\s*classifyShelfWriteError\(\s*fetchError,\s*status\s*\)\s*\)\s*\)/,
		);
		expect(fetchUserBooks).not.toMatch(/setError\(\s*fetchError\.message/);
	});

	it('createOwnedAdder returns mapped copy, not the RPC message', () => {
		expect(adder).toMatch(/message:\s*errorCopy\(\s*failure\s*\)/);
		expect(adder).not.toMatch(/message:\s*error\.message/);
	});

	it('barcode Add alerts with the shelf-scan add copy', () => {
		expect(addToLibrary).toMatch(
			/Alert\.alert\(\s*'Could not add to library',\s*addFailureCopy\(\s*res\.error\s*\)\s*\)/,
		);
		expect(addToLibrary).not.toMatch(/res\.error\.message/);
	});

	it('shelf-scan Add builds its blocked copy from the shared constant', () => {
		expect(shelfAdd.match(/`\$\{ADD_FAILED_COPY\} Your scan is safe\.`/g)).toHaveLength(2);
		expect(shelfAdd).not.toMatch(/Couldn't save/);
	});
});
