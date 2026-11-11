// Static regression checks for the admin's a11y fixes (#166). The admin package has its
// own toolchain and no test runner, and its `@/` alias collides with the app's, so its
// components can't be imported here; these tests read the source instead.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '../../admin', p), 'utf-8');

/** The JSX source of the first `function <name>(` declaration, up to the next top-level function. */
function fnBody(src: string, name: string): string {
	const start = src.indexOf(`function ${name}`);
	if (start < 0) throw new Error(`function ${name} not found`);
	const next = src.indexOf('\nfunction ', start + 1);
	return src.slice(start, next < 0 ? undefined : next);
}

describe('new-book form labels', () => {
	const src = read('app/admin/books/new/_components/new-book-form.tsx');

	it('Field links its Label to the control with one useId() id', () => {
		const field = fnBody(src, 'Field');
		expect(field).toMatch(/const id = useId\(\)/);
		expect(field).toMatch(/<Label htmlFor=\{id\}/);
		expect(field).toMatch(/\{children\(id\)\}/);
	});

	it('every Field passes the id to its control', () => {
		const fields = [...src.matchAll(/<Field label="([^"]+)">([\s\S]*?)<\/Field>/g)];
		expect(fields.length).toBeGreaterThanOrEqual(20);
		for (const [, label, body] of fields) {
			expect(body, label).toMatch(
				/^\s*\{\(id\) =>\s*\(?\s*<(Input|EnumSelect|textarea)\s+id=\{id\}/,
			);
		}
	});

	it('EnumSelect forwards the id to SelectTrigger', () => {
		const select = fnBody(src, 'EnumSelect');
		expect(select).toMatch(/<SelectTrigger id=\{id\}>/);
	});
});

describe('placeholder-only inputs get accessible names', () => {
	const table = read('app/admin/books/_components/books-table.tsx');
	const diff = read('app/admin/books/[slug]/_components/diff-view.tsx');

	it('catalog filter is a labelled search input', () => {
		expect(table).toMatch(/<Input\s+type="search"\s+aria-label="Filter catalog"/);
	});

	it('delete confirm input names what to type', () => {
		expect(table).toContain('aria-label={`Type ${slug} to confirm deletion`}');
	});

	it('replace-ISBN confirm input is labelled', () => {
		expect(diff).toContain('aria-label="Confirm slug to replace ISBNs"');
	});
});

describe('diff-view cover zoom', () => {
	const src = read('app/admin/books/[slug]/_components/diff-view.tsx');

	it('no clickable <img>: zoom is a keyboard-reachable button with an accessible name', () => {
		expect(src).not.toMatch(/<img[^>]*onClick/);
		expect(src).toMatch(/<button\s+type="button"\s+aria-label=\{`Enlarge cover/);
	});

	it('each zoom button names its source, so the three per row are distinct (#178)', () => {
		expect(src).toContain('aria-label={`Enlarge cover from ${SOURCE_LABELS[source]}`}');
		expect(src).not.toContain('aria-label="Enlarge cover"');
	});

	it('the radio takes its name from the wrapping <label> content, not an override (#178)', () => {
		// The zoom button sits in that <label>, so the cover radio reads "Enlarge cover from
		// <source>"; an aria-label on the item would replace that with a fixed string.
		const row = fnBody(src, 'FieldRow');
		expect(row).toMatch(/<label[\s\S]*?<RadioGroupItem[\s\S]*?<\/label>/);
		const item = /<RadioGroupItem\b[^>]*>/.exec(row)?.[0] ?? '';
		expect(item).not.toMatch(/aria-label/);
	});

	it('zoom click does not select the radio in the wrapping <label>', () => {
		const button = /aria-label=\{`Enlarge cover[\s\S]*?onClick=\{\(e\) => \{([\s\S]*?)\}\}/.exec(
			src,
		);
		expect(button?.[1]).toBeDefined();
		const handler = button?.[1] ?? '';
		// preventDefault cancels the label's activation (radio toggle); stopPropagation keeps
		// the click out of the row. Both must run before opening the preview.
		const opens = handler.indexOf('setEnlarged(');
		expect(handler.indexOf('e.preventDefault()')).toBeGreaterThan(-1);
		expect(handler.indexOf('e.stopPropagation()')).toBeGreaterThan(-1);
		expect(handler.indexOf('e.preventDefault()')).toBeLessThan(opens);
		expect(handler.indexOf('e.stopPropagation()')).toBeLessThan(opens);
	});

	it('cover images have meaningful alt text', () => {
		expect(src).toContain('alt={`Cover from ${SOURCE_LABELS[source]}`}');
	});

	it('each source RadioGroup is named by its field label', () => {
		expect(fnBody(src, 'FieldRow')).toMatch(/<RadioGroup\s+aria-label=\{label\}/);
	});
});

describe('books page', () => {
	it('"New book" is a Button asChild wrapping the Link, not a button nested in a link', () => {
		const src = read('app/admin/books/page.tsx');
		expect(src).not.toMatch(/<Link[^>]*>\s*<Button/);
		expect(src).toMatch(/<Button size="sm" asChild>\s*<Link href="\/admin\/books\/new">/);
	});
});

describe('books-table inline edit (#178)', () => {
	const src = read('app/admin/books/_components/books-table.tsx');
	const editable = fnBody(src, 'EditableText');

	it('the inline-edit input is named by field and book', () => {
		expect(editable).toMatch(
			/<Input\s+autoFocus\s+aria-label=\{`\$\{FIELD_LABELS\[field\]\} of \$\{bookTitle\}`\}/,
		);
		for (const f of ['title', 'publisher', 'era', 'date_published']) {
			expect(src).toMatch(
				new RegExp(`FIELD_LABELS: Record<EditableField, string> = \\{[\\s\\S]*?\\b${f}: '`),
			);
		}
	});

	it('every EditableText call site passes the field and the row title', () => {
		const sites = [...src.matchAll(/<EditableText\b([\s\S]*?)\/>/g)];
		expect(sites.length).toBe(2);
		for (const [, props] of sites) {
			expect(props).toMatch(/\bfield=\{?["\w]/);
			expect(props).toContain('bookTitle={row.original.title}');
		}
	});

	// No DOM test environment (vitest runs in node, no jsdom), so focus return is checked
	// at the source: Enter/Escape set the refocus flag, and the display button's ref
	// focuses itself when it mounts with the flag set.
	it('Enter and Escape return focus to the cell button', () => {
		expect(editable).toMatch(/const refocus = useRef\(false\)/);
		expect(editable).toMatch(/if \(e\.key === 'Enter'\) commit\(true\)/);
		expect(editable).toMatch(/if \(e\.key === 'Escape'\) close\(true\)/);
		expect(editable).toMatch(
			/const close = \(restoreFocus: boolean\) => \{\s*refocus\.current = restoreFocus;\s*setEditing\(\s*false\s*\)/,
		);
		expect(editable).toMatch(/commit = \(restoreFocus: boolean\) => \{\s*close\(restoreFocus\)/);
		const button = /<button\s+ref=\{\(el\) => \{([\s\S]*?)\}\}\s+type="button"/.exec(editable);
		expect(button?.[1]).toMatch(
			/if \(el && refocus\.current\) \{\s*refocus\.current = false;\s*el\.focus\(\);/,
		);
	});

	it('blur commits without pulling focus back', () => {
		expect(editable).toMatch(
			/onBlur=\{\(\) => \{\s*if \(!refocus\.current\) commit\(false\);\s*\}\}/,
		);
		expect(editable).not.toMatch(/onBlur=\{\(\) => \{?\s*(if \([^)]*\) )?commit\(true\)/);
		expect(editable).not.toMatch(/onBlur=\{[^}]*close\(true\)/);
	});
});
