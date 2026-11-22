// Manual-fields form moves focus to the first invalid field on a failed Save (#370), so
// keyboard and screen-reader users land on the error (read via aria-describedby). The
// helper is pure; the wiring is checked at the source (no DOM in this suite).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstInvalidField } from '../../admin/lib/form-a11y';

function read(path: string): string {
	try {
		return readFileSync(resolve(__dirname, path), 'utf-8');
	} catch {
		return '';
	}
}

const form = read('../../admin/app/admin/books/[slug]/_components/manual-fields-form.tsx');

/** Source between two unique anchors, or '' when either is missing. */
function between(src: string, start: string, end: string): string {
	const from = src.indexOf(start);
	if (from < 0) return '';
	const to = src.indexOf(end, from + start.length);
	return to < 0 ? '' : src.slice(from, to);
}

describe('firstInvalidField', () => {
	const order = ['title', 'publisher', 'date_published', 'cover_image', 'synopsis'] as const;

	it('returns the first invalid field in form order, not errors key order', () => {
		// Patch/schema order puts cover_image first; the layout puts date_published first.
		const errors = { cover_image: 'Must be a URL', date_published: 'Use YYYY-MM-DD' };
		expect(Object.keys(errors)[0]).toBe('cover_image');
		expect(firstInvalidField(errors, order)).toBe('date_published');
	});

	it('skips cleared (undefined) and empty messages', () => {
		expect(firstInvalidField({ title: undefined, synopsis: 'Too long' }, order)).toBe('synopsis');
		expect(firstInvalidField({ title: '', publisher: 'Required' }, order)).toBe('publisher');
	});

	it('returns null with no errors', () => {
		expect(firstInvalidField({}, order)).toBeNull();
		expect(firstInvalidField({ title: undefined }, order)).toBeNull();
	});

	it('ignores errors on fields outside the order', () => {
		expect(firstInvalidField({ slug: 'Bad' }, order)).toBeNull();
	});
});

describe('manual-fields-form wiring', () => {
	const fieldOrder = [...between(form, 'const FIELD_ORDER', ']').matchAll(/'(\w+)'/g)].map(
		(m) => m[1],
	);
	const rendered = [
		...between(form, '<form', '</form>').matchAll(
			/(?:text|enumSelect)\(\s*'(\w+)'|<Field\s+field="(\w+)"/g,
		),
	].map((m) => m[1] ?? m[2]);

	it('FIELD_ORDER lists every rendered field in render order', () => {
		expect(rendered.length).toBe(12);
		expect(fieldOrder).toEqual(rendered);
	});

	const save = between(form, 'function save(', 'const fieldProps');
	const failure = between(save, 'if (!parsed.success) {', 'return;');
	const afterFailure = save.slice(save.indexOf('setErrors({})'));

	it('finds the save() body and its failure branch', () => {
		expect(save).not.toBe('');
		expect(failure).not.toBe('');
		expect(save.indexOf('setErrors({})')).toBeGreaterThan(0);
	});

	it('failure branch renders errors synchronously, then focuses the first invalid field', () => {
		expect(failure).toMatch(/flushSync\(\s*\(\)\s*=>\s*setErrors\(\s*fieldErrors\s*\)\s*\)/);
		expect(failure).toMatch(/firstInvalidField\(\s*fieldErrors\s*,\s*FIELD_ORDER\s*\)/);
		expect(failure).toMatch(/getElementById\(\s*`manual-\$\{\w+\}`\s*\)\??\.focus\(\s*\)/);
		expect(failure.indexOf('flushSync(')).toBeLessThan(failure.indexOf('.focus('));
	});

	it('valid saves do not move focus', () => {
		expect(afterFailure).not.toBe('');
		expect(afterFailure).not.toContain('.focus(');
	});

	it('error text stays reachable via aria-describedby, no per-error alerts', () => {
		expect(form).toMatch(/'aria-describedby':\s*errors\[field\]\s*\?\s*`manual-\$\{field\}-error`/);
		expect(form).not.toContain('role="alert"');
	});
});
