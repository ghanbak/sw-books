import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { missingAsUndefined } from '../../admin/lib/sort-missing';

// #457: sorting the catalog by Timeline or Wiki put null rows mid-list.
// table-core 8.21.3 `sortUndefined: 'last'` only checks `=== undefined`.

type Row = { name: string; value: number | string | null };

// Mirror of table-core 8.21.3 getSortedRowModel with `sortUndefined: 'last'`
// and the `basic` sortingFn (root has no @tanstack; admin-only dependency).
function sortLikeTableCore(rows: Row[], accessor: (r: Row) => unknown, desc: boolean): string[] {
	return [...rows]
		.sort((a, b) => {
			const av = accessor(a);
			const bv = accessor(b);
			const aU = av === undefined;
			const bU = bv === undefined;
			if (aU || bU) return aU ? 1 : -1;
			const basic =
				(av as number) === (bv as number) ? 0 : (av as number) > (bv as number) ? 1 : -1;
			return desc ? -basic : basic;
		})
		.map((r) => r.name);
}

const timeline: Row[] = [
	{ name: 'A', value: -25793 },
	{ name: 'None', value: null },
	{ name: 'B', value: -19 },
	{ name: 'C', value: 4 },
	{ name: 'D', value: 45 },
];
const accessor = (r: Row) => missingAsUndefined(r.value);

describe('missingAsUndefined (#457)', () => {
	it('maps null and undefined to undefined', () => {
		expect(missingAsUndefined(null)).toBeUndefined();
		expect(missingAsUndefined(undefined)).toBeUndefined();
	});

	it('keeps falsy real values', () => {
		expect(missingAsUndefined(0)).toBe(0);
		expect(missingAsUndefined('')).toBe('');
		expect(missingAsUndefined(-19)).toBe(-19);
		expect(missingAsUndefined('ok')).toBe('ok');
	});

	it('a null timeline_order sorts last ascending', () => {
		expect(sortLikeTableCore(timeline, accessor, false)).toEqual(['A', 'B', 'C', 'D', 'None']);
	});

	it('a null timeline_order sorts last descending', () => {
		expect(sortLikeTableCore(timeline, accessor, true)).toEqual(['D', 'C', 'B', 'A', 'None']);
	});
});

const tablePath = resolve(__dirname, '../../admin/app/admin/books/_components/books-table.tsx');
const src = existsSync(tablePath) ? readFileSync(tablePath, 'utf-8') : '';
// Each `columnHelper.` call is one column definition.
const columnBlocks = src.split(/\bcolumnHelper\./).slice(1);
const columnScope = (key: string) =>
	columnBlocks.find((b) =>
		new RegExp(`^accessor\\(\\s*'${key}'|\\bid:\\s*'${key}'`).test(b.trimStart()),
	) ?? '';

describe('books table wires missingAsUndefined into nullable sort columns (#457)', () => {
	it('imports the helper', () => {
		expect(src).toMatch(
			/import\s*\{[^}]*\bmissingAsUndefined\b[^}]*\}\s*from\s*'@\/lib\/sort-missing'/,
		);
	});

	for (const key of ['timeline_order', 'enrichment']) {
		it(`${key} column reads through the helper, keeps its id and sortUndefined: 'last'`, () => {
			const scope = columnScope(key);
			expect(scope, `${key} column not found`).not.toBe('');
			expect(scope).toMatch(
				new RegExp(
					`^accessor\\(\\s*\\(\\s*(\\w+)\\s*\\)\\s*=>\\s*missingAsUndefined\\(\\s*\\1\\.${key}\\s*\\)`,
				),
			);
			expect(scope).toMatch(new RegExp(`\\bid:\\s*'${key}'`));
			expect(scope).toMatch(/sortUndefined:\s*'last'/);
		});
	}

	it('other sortable columns keep their plain accessors', () => {
		for (const key of ['title', 'canon', 'type', 'publisher', 'date_published']) {
			const scope = columnScope(key);
			expect(scope, `${key} column not found`).toMatch(new RegExp(`^accessor\\(\\s*'${key}'`));
			expect(scope).not.toContain('missingAsUndefined');
		}
	});
});
