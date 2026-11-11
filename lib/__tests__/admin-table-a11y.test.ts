// Books-table sort state and row-checkbox names for screen readers (#287). The helpers
// are pure; the wiring is checked at the source (no DOM in this suite).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ariaSortFor, selectRowLabel } from '../../admin/lib/table-a11y';

const table = readFileSync(
	resolve(__dirname, '../../admin/app/admin/books/_components/books-table.tsx'),
	'utf-8',
);

describe('ariaSortFor', () => {
	it('maps tanstack sort state to aria-sort', () => {
		expect(ariaSortFor('asc')).toBe('ascending');
		expect(ariaSortFor('desc')).toBe('descending');
		expect(ariaSortFor(false)).toBe('none');
	});
});

describe('selectRowLabel', () => {
	it('names the checkbox by book title', () => {
		expect(selectRowLabel('Thrawn')).toBe('Select Thrawn');
		expect(selectRowLabel('Thrawn: Alliances')).not.toBe(selectRowLabel('Thrawn'));
	});
});

describe('books-table wiring', () => {
	it('each sortable <TableHead> gets aria-sort from ariaSortFor', () => {
		const head = /<TableHead\b([^>]*?)>\s*\{header\.isPlaceholder/.exec(table)?.[1] ?? '';
		expect(head).toMatch(
			/aria-sort=\{\s*header\.column\.getCanSort\(\)\s*\?\s*ariaSortFor\(\s*header\.column\.getIsSorted\(\)\s*\)\s*:\s*undefined\s*\}/,
		);
	});

	it('only SortHeader columns can sort, so plain headers carry no aria-sort', () => {
		// Each accessor column's source, from its `columnHelper.accessor(` to the next column.
		const columns = table.slice(table.indexOf('const columns = ['));
		const accessors = columns
			.split(/columnHelper\.(?=accessor\(|display\()/)
			.filter((chunk) => chunk.startsWith('accessor('));
		expect(accessors.length).toBeGreaterThanOrEqual(13);
		for (const body of accessors) {
			const sortable = body.includes('<SortHeader');
			expect(sortable || /enableSorting: false/.test(body), body.slice(0, 60)).toBe(true);
		}
	});

	it('row checkbox is named via selectRowLabel; header keeps "Select all"', () => {
		expect(table).toMatch(/aria-label=\{selectRowLabel\(\s*row\.original\.title\s*\)\}/);
		expect(table).not.toContain('aria-label="Select row"');
		expect(table).toContain('aria-label="Select all"');
	});

	it('sort icons stay decorative (no a11y props, so lucide sets aria-hidden)', () => {
		const icons = [...table.matchAll(/<(ArrowUp|ArrowDown|ChevronsUpDown)\b([^>]*)\/>/g)];
		expect(icons.length).toBe(3);
		for (const [, , props] of icons) expect(props).not.toMatch(/aria-|title=/);
	});
});
