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
	const shelfScan = source('hooks/useShelfScan.ts');
	// #74: a barcode match goes into the captured tray; it is added by the shelf-scan Add below.
	const scanBarcode = scope(shelfScan, /const scanBarcode\s*=\s*useCallback\(/, '\n\t);');
	const shelfAdd = scope(shelfScan, /const result\s*=\s*await addOwned\(\s*ids\s*\)/, 'finally {');

	it('finds every scope', () => {
		for (const s of [fetchBooks, fetchUserBooks, adder, scanBarcode, shelfAdd]) {
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

	it('barcode Add goes through the shelf-scan Add (no raw-error alert of its own)', () => {
		expect(scanBarcode).toMatch(/setCaptured\(\s*prependCaptured\([^)]*\[outcome\.book\]\s*\)\s*\)/);
		expect(scanBarcode).not.toMatch(/addOwned\(|Alert\.alert\(|\.error\.message/);
	});

	it('shelf-scan Add builds its blocked copy from the shared constant', () => {
		expect(shelfAdd.match(/`\$\{ADD_FAILED_COPY\} Your scan is safe\.`/g)).toHaveLength(2);
		expect(shelfAdd).not.toMatch(/Couldn't save/);
	});
});
