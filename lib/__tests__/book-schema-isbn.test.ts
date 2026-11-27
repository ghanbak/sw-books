import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSchema, firstIssueMessage, issuesByField, patchSchema } from '../book-schema';
import { normalizeIsbn } from '../isbn';

// #474: admin writes must store the bare ISBN-13 the app scanner matches on.
const BASE = {
	title: 'Heir to the Empire',
	slug: 'heir-to-the-empire',
	canon: 'Legends',
	type: 'Adult Novel',
};
const SCAN = normalizeIsbn('9780345391803');

function createIssues(input: Record<string, unknown>) {
	const res = createSchema.safeParse({ ...BASE, ...input });
	if (res.success) throw new Error(`expected ${JSON.stringify(input)} to be rejected`);
	return res.error;
}

function patchIssues(input: Record<string, unknown>) {
	const res = patchSchema.safeParse(input);
	if (res.success) throw new Error(`expected ${JSON.stringify(input)} to be rejected`);
	return res.error;
}

describe('createSchema ISBN normalization', () => {
	it('collapses hyphenated 13, bare 10 and a duplicate to one ISBN-13, primary too', () => {
		const res = createSchema.safeParse({
			...BASE,
			isbn: ['0-345-39180-2', '978-0-345-39180-3', '0345391802'],
			primary_isbn: '0345391802',
		});
		expect(res.success).toBe(true);
		expect(res.data?.isbn).toEqual(['9780345391803']);
		expect(res.data?.primary_isbn).toBe('9780345391803');
	});

	it('stores what the scanner looks up', () => {
		const res = createSchema.parse({ ...BASE, isbn: ['0-345-39180-2'] });
		expect(SCAN).not.toBeNull();
		expect(res.isbn).toContain(SCAN);
	});

	it('accepts a lowercase x check digit and surrounding spaces', () => {
		expect(createSchema.parse({ ...BASE, isbn: [' 080442957x '] }).isbn).toEqual(['9780804429573']);
	});

	it('keeps an already-valid ISBN-13 list unchanged', () => {
		const isbn = ['9780553392869', '9780345391803'];
		const res = createSchema.parse({ ...BASE, isbn, primary_isbn: '9780345391803' });
		expect(res.isbn).toEqual(isbn);
		expect(res.primary_isbn).toBe('9780345391803');
	});

	it.each(['9780345391804', 'abc', '', 'UOM:39015039180'])('rejects %j on the isbn path', (bad) => {
		const err = createIssues({ isbn: ['9780553392869', bad] });
		expect(issuesByField(err).isbn).toBeDefined();
		expect(firstIssueMessage(err, '')).toMatch(/^isbn\.1: /);
	});

	it('rejects an invalid primary_isbn on the primary_isbn path', () => {
		const err = createIssues({ isbn: ['9780345391803'], primary_isbn: '9780345391804' });
		expect(firstIssueMessage(err, '')).toBe(
			'primary_isbn: expected a valid ISBN-10 or ISBN-13, got "9780345391804"',
		);
	});

	it('still rejects a valid primary_isbn that is not in isbn[]', () => {
		const err = createIssues({ isbn: ['9780345391803'], primary_isbn: '9780553392869' });
		expect(firstIssueMessage(err, '')).toBe('primary_isbn: primary_isbn must be one of isbn[]');
	});
});

describe('patchSchema ISBN normalization', () => {
	it('normalizes and dedupes isbn[] and primary_isbn', () => {
		const res = patchSchema.parse({
			isbn: ['0-345-39180-2', '978-0-345-39180-3'],
			primary_isbn: '0345391802',
		});
		expect(res.isbn).toEqual(['9780345391803']);
		expect(res.primary_isbn).toBe('9780345391803');
	});

	it.each(['9780345391804', 'abc'])('rejects %j on the isbn path', (bad) => {
		const err = patchIssues({ isbn: [bad] });
		expect(firstIssueMessage(err, '')).toMatch(/^isbn\.0: /);
	});

	it('normalizes a primary_isbn-only patch', () => {
		expect(patchSchema.parse({ primary_isbn: '0-345-39180-2' }).primary_isbn).toBe('9780345391803');
		expect(patchSchema.parse({ primary_isbn: null }).primary_isbn).toBeNull();
	});
});

describe('createBook wiring', () => {
	it('inserts the createSchema output, not the raw input', () => {
		const source = readFileSync(resolve(__dirname, '../../admin/app/_actions/books.ts'), 'utf8');
		expect(source).toMatch(/createSchema\.safeParse\(\s*raw\s*\)/);
		expect(source).toMatch(/const input = parsed\.data;/);
	});
});
