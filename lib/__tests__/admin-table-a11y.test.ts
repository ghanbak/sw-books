// Books-table sort state and row-checkbox names for screen readers (#287). The helpers
// are pure; the wiring is checked at the source (no DOM in this suite).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ariaSortFor, focusTargetAfterRemove, selectRowLabel } from '../../admin/lib/table-a11y';

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

// #387: deleting a row or saving a pin unmounts the focused control. Focus must land on
// a control that is still on the page, not fall to <body>.
describe('focusTargetAfterRemove', () => {
	it('middle row → next row', () => {
		expect(focusTargetAfterRemove(['a', 'b', 'c'], 'b')).toBe('c');
	});

	it('last row → previous row', () => {
		expect(focusTargetAfterRemove(['a', 'b', 'c'], 'c')).toBe('b');
	});

	it('first row → next row', () => {
		expect(focusTargetAfterRemove(['a', 'b', 'c'], 'a')).toBe('b');
	});

	it('only row → null (focus the filter input)', () => {
		expect(focusTargetAfterRemove(['a'], 'a')).toBeNull();
		expect(focusTargetAfterRemove([], 'a')).toBeNull();
	});

	it('follows the visible (sorted/filtered) order, not data order', () => {
		// Data order a,b,c,d,e; sorted desc and filtered to e,c,a.
		const visible = ['e', 'c', 'a'];
		expect(focusTargetAfterRemove(visible, 'c')).toBe('a');
		expect(focusTargetAfterRemove(visible, 'a')).toBe('c');
		expect(focusTargetAfterRemove(visible, 'e')).toBe('c');
	});

	it('an id not in the visible rows → null', () => {
		expect(focusTargetAfterRemove(['a', 'b'], 'z')).toBeNull();
	});
});

/** Source between two unique anchors; throws if either is missing or not unique. */
function scope(src: string, start: string, end: string): string {
	const from = src.indexOf(start);
	expect(from, `anchor ${start}`).toBeGreaterThanOrEqual(0);
	expect(src.indexOf(start, from + 1), `anchor ${start} unique`).toBe(-1);
	const to = src.indexOf(end, from + start.length);
	expect(to, `anchor ${end}`).toBeGreaterThan(from);
	return src.slice(from, to);
}

describe('books-table focus after delete (#387)', () => {
	const cell = () => scope(table, 'function DeleteBookCell(', 'function EditableText(');
	const books = () => scope(table, 'export function BooksTable(', '<TableHeader>');

	it('AlertDialogContent takes over close focus with preventDefault, only after a delete', () => {
		const content = scope(cell(), '<AlertDialogContent', '<AlertDialogHeader>');
		expect(content).toMatch(
			/onCloseAutoFocus=\{\s*\(\s*(\w+)\s*\)\s*=>\s*\{[\s\S]*?if\s*\(\s*!deleted\.current\s*\)\s*return;[\s\S]*?\1\.preventDefault\(\s*\);[\s\S]*?onFocusAfterDelete\(\s*\);/,
		);
		// The flag is set on success, before the dialog closes.
		expect(cell()).toMatch(
			/if\s*\(\s*res\.ok\s*\)\s*\{[\s\S]*?deleted\.current\s*=\s*true;\s*setOpen\(\s*false\s*\);\s*onDeleted\(\s*\);/,
		);
	});

	it('Delete trigger is findable by row id; the actions cell wires focusAfterRemove', () => {
		const trigger = scope(cell(), '<AlertDialogTrigger asChild>', '</AlertDialogTrigger>');
		expect(trigger).toMatch(/data-row-delete=\{id\}/);
		const actions = scope(table, "id: 'actions',", 'export function BooksTable(');
		expect(actions).toMatch(
			/onFocusAfterDelete=\{\(\)\s*=>\s*table\.options\.meta\?\.focusAfterRemove\(\s*\)\}/,
		);
	});

	it('removeRow picks the target from the visible row model before removing', () => {
		const remove = scope(books(), 'const removeRow = ', 'const focusAfterRemove = ');
		expect(remove).toMatch(
			/focusAfterRemoveId\.current\s*=\s*focusTargetAfterRemove\(\s*table\.getRowModel\(\)\.rows\.map\(\(r\)\s*=>\s*r\.id\),\s*id,?\s*\)/,
		);
		expect(remove.indexOf('focusTargetAfterRemove(')).toBeLessThan(remove.indexOf('setData('));
		expect(books()).toMatch(/meta:\s*\{[^}]*\bfocusAfterRemove\b[^}]*\}/);
	});

	it('focusAfterRemove finds the row control after unmount, else the filter input', () => {
		const focus = scope(books(), 'const focusAfterRemove = ', 'const table = useReactTable(');
		expect(focus).toMatch(
			/querySelector<HTMLElement>\(\s*`\[data-row-delete="\$\{CSS\.escape\(targetId\)\}"\]`/,
		);
		expect(focus).toMatch(/\(\s*target\s*\?\?\s*filterRef\.current\s*\)\?\.focus\(\)/);
		// The filter <Input>'s own props, whatever their order.
		const filter = /<Input\b((?:(?!\/>)[\s\S])*?aria-label="Filter catalog"[\s\S]*?)\/>/.exec(
			books(),
		)?.[1];
		expect(filter, 'filter <Input> found').toBeDefined();
		expect(filter).toMatch(/\bref=\{filterRef\}/);
		expect(books()).toMatch(/<div ref=\{tableWrapRef\}/);
	});
});

describe('pin-editor focus after Pin / Remove pin (#387)', () => {
	const pin = readFileSync(
		resolve(__dirname, '../../admin/app/admin/books/[slug]/_components/pin-editor.tsx'),
		'utf-8',
	);

	it('the section heading is a programmatic focus target', () => {
		expect(pin).toMatch(
			/<h3\s+ref=\{headingRef\}\s+tabIndex=\{-1\}\s+className="[^"]*\boutline-none\b[^"]*">\s*Manual page pin\s*<\/h3>/,
		);
	});

	it('Pin moves focus to the heading before clearing the results list', () => {
		const save = scope(pin, 'function save(', 'function remove(');
		const focusAt = save.search(/headingRef\.current\?\.focus\(\s*\)/);
		expect(focusAt).toBeGreaterThan(save.indexOf('toast.success('));
		expect(focusAt).toBeLessThan(save.indexOf('setResults(null)'));
	});

	it('Remove pin moves focus to the heading before the refresh unmounts the button', () => {
		const remove = scope(pin, 'function remove(', 'const conflict');
		const focusAt = remove.search(/headingRef\.current\?\.focus\(\s*\)/);
		expect(focusAt).toBeGreaterThan(remove.indexOf("toast.success('Pin removed')"));
		expect(focusAt).toBeLessThan(remove.indexOf('router.refresh()'));
	});
});
