import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	type LookupBook,
	buildFillEmptyArrayPatch,
	buildFillEmptyScalarPatch,
	fillEmptySource,
} from '../sources/lookup-selection';
import type { LookupResult } from '../sources/types';

// #348: bulk Fill empty used `ol.isbn ?? gb.isbn`, so an empty OL list never
// fell through to Google Books. Both Fill empty paths now share one rule.

const ISBN = '9780593157718';

const emptyBook: LookupBook = {
	cover_image: 'https://example.com/c.jpg',
	publisher: 'Del Rey',
	date_published: '2020-01-01',
	language: 'en',
	synopsis: 's',
	format: [],
	isbn: [],
	primary_isbn: null,
};

const cand = (ol: LookupResult['ol'], gb: LookupResult['gb']): LookupResult => ({
	ol,
	gb,
	fetchedAt: '2026-11-20T00:00:00Z',
});

describe('fillEmptySource / buildFillEmptyArrayPatch', () => {
	it('falls through an empty OL isbn list to GB', () => {
		const c = cand({ isbn: [] }, { isbn: [ISBN] });
		expect(fillEmptySource(c, 'isbn')).toBe('gb');
		const patch = buildFillEmptyArrayPatch(emptyBook, c);
		expect(patch.isbn).toEqual([ISBN]);
		expect(patch.primary_isbn).toBe(ISBN);
	});

	it('falls through an empty OL format list to GB', () => {
		const c = cand({ format: [] }, { format: ['Hardcover'] });
		expect(fillEmptySource(c, 'format')).toBe('gb');
		expect(buildFillEmptyArrayPatch(emptyBook, c).format).toEqual(['Hardcover']);
	});

	it('takes OL when it has values', () => {
		const c = cand(
			{ isbn: ['9780345511508'], format: ['Paperback'] },
			{ isbn: [ISBN], format: ['Hardcover'] },
		);
		expect(fillEmptySource(c, 'isbn')).toBe('ol');
		expect(buildFillEmptyArrayPatch(emptyBook, c)).toEqual({
			isbn: ['9780345511508'],
			primary_isbn: '9780345511508',
			format: ['Paperback'],
		});
	});

	it('keeps a primary_isbn that is in the chosen list', () => {
		const c = cand({}, { isbn: ['9780345511508', ISBN] });
		const patch = buildFillEmptyArrayPatch({ ...emptyBook, primary_isbn: ISBN }, c);
		expect(patch.primary_isbn).toBe(ISBN);
	});

	it('writes nothing when both sources are empty or the field is filled', () => {
		expect(fillEmptySource(cand({ isbn: [] }, { isbn: [] }), 'isbn')).toBeNull();
		expect(buildFillEmptyArrayPatch(emptyBook, cand({ isbn: [] }, {}))).toEqual({});
		const filled = { ...emptyBook, isbn: ['9780345511508'], format: ['Paperback'] };
		expect(buildFillEmptyArrayPatch(filled, cand({}, { isbn: [ISBN], format: ['x'] }))).toEqual({});
	});
});

// #350: bulk scalars used `ol[f] ?? gb[f]`, so an OL '' blocked GB. Scalars now
// share fillEmptySource too; a blank (empty or whitespace-only) string is no value.
const blankScalars: LookupBook = {
	...emptyBook,
	cover_image: null,
	publisher: null,
	date_published: null,
	language: null,
	synopsis: null,
};

describe('fillEmptySource / buildFillEmptyScalarPatch (#350)', () => {
	it("falls through an OL '' scalar to GB", () => {
		const c = cand({ publisher: '' }, { publisher: 'X' });
		expect(fillEmptySource(c, 'publisher')).toBe('gb');
		expect(buildFillEmptyScalarPatch(blankScalars, c)).toEqual({ publisher: 'X' });
	});

	it('falls through a whitespace-only OL scalar to GB', () => {
		const c = cand({ synopsis: '  \n\t' }, { synopsis: 'X' });
		expect(fillEmptySource(c, 'synopsis')).toBe('gb');
		expect(buildFillEmptyScalarPatch(blankScalars, c)).toEqual({ synopsis: 'X' });
	});

	it('takes OL when it has a value', () => {
		const c = cand(
			{ publisher: 'Del Rey', language: 'en' },
			{ publisher: 'Random House', language: 'fr' },
		);
		expect(fillEmptySource(c, 'publisher')).toBe('ol');
		expect(buildFillEmptyScalarPatch(blankScalars, c)).toEqual({
			publisher: 'Del Rey',
			language: 'en',
		});
	});

	it('writes no key when both sources are blank or the field is filled', () => {
		const c = cand({ publisher: '', synopsis: ' ' }, { publisher: '  ', language: 'en' });
		expect(fillEmptySource(c, 'publisher')).toBeNull();
		expect(fillEmptySource(c, 'cover_image')).toBeNull();
		expect(buildFillEmptyScalarPatch(blankScalars, c)).toEqual({ language: 'en' });
		expect(buildFillEmptyScalarPatch(emptyBook, cand({}, { publisher: 'X' }))).toEqual({});
	});
});

// Drives the real admin `fillEmpty` with a recording fake Supabase client (same
// harness as bulk-refetch-cover.test.ts); only I/O modules are mocked.
type Call = { op: string; args: unknown[] };
const db = vi.hoisted(() => ({
	calls: [] as Array<Array<{ op: string; args: unknown[] }>>,
	replies: [] as Array<{ data: unknown; error: unknown }>,
	look: null as unknown,
}));

function query(): Record<string, (...args: unknown[]) => unknown> {
	const calls: Call[] = [];
	db.calls.push(calls);
	const reply = () => Promise.resolve(db.replies.shift() ?? { data: null, error: null });
	const q: Record<string, (...args: unknown[]) => unknown> = {};
	for (const op of ['select', 'update', 'eq', 'is']) {
		q[op] = (...args: unknown[]) => {
			calls.push({ op, args });
			return q;
		};
	}
	q.single = reply;
	q.maybeSingle = reply;
	return q;
}

vi.mock('../../admin/lib/auth', () => ({ getAdmin: async () => ({ id: 'admin' }) }));
vi.mock('../../admin/lib/supabase-admin', () => ({
	getDbTarget: async () => 'prod',
	getSupabaseAdmin: async () => ({ from: () => query() }),
}));
vi.mock('next/cache', () => ({ revalidateTag: () => {} }));
vi.mock('../../admin/node_modules/next/cache.js', () => ({ revalidateTag: () => {} }));
vi.mock('../sources/covers', () => ({ headCheckCover: async () => false }));
vi.mock('../sources/google-books', () => ({ fetchVolumes: async () => null }));
vi.mock('../sources/open-library', () => ({ coverByIsbnUrl: (i: string) => i }));
vi.mock('../sources/lookup', () => ({ lookupCandidatesFor: async () => db.look }));

const bulkPath = resolve(__dirname, '../../admin/app/_actions/bulk.ts');
type Bulk = {
	fillEmpty: (
		slug: string,
		expectedTarget: string,
	) => Promise<{ slug: string; status: string; fields?: string[] }>;
};
const load = async (): Promise<Bulk> => (await import(/* @vite-ignore */ bulkPath)) as Bulk;

beforeEach(() => {
	db.calls.length = 0;
	db.replies.length = 0;
});

describe('bulk fillEmpty (#348)', () => {
	it('writes GB ISBNs when OL returns an empty list', async () => {
		db.look = cand({ isbn: [] }, { isbn: [ISBN] });
		const row = { id: 'b1', updated_at: '2026-11-01T00:00:00Z', ...emptyBook };
		db.replies.push({ data: row, error: null }, { data: { ...row }, error: null });
		const { fillEmpty } = await load();
		const res = await fillEmpty('some-book', 'prod');

		expect(res.status).toBe('updated');
		const update = db.calls.flat().find((x) => x.op === 'update');
		expect(update?.args[0]).toEqual({ isbn: [ISBN], primary_isbn: ISBN });
	});

	it("writes the GB scalar when OL returns '' (#350)", async () => {
		db.look = cand({ publisher: '' }, { publisher: 'X' });
		const row = { id: 'b1', updated_at: '2026-11-01T00:00:00Z', ...emptyBook, publisher: null };
		db.replies.push({ data: row, error: null }, { data: { ...row }, error: null });
		const { fillEmpty } = await load();
		const res = await fillEmpty('some-book', 'prod');

		expect(res.status).toBe('updated');
		const update = db.calls.flat().find((x) => x.op === 'update');
		expect(update?.args[0]).toEqual({ publisher: 'X' });
	});
});

// Wiring: bulk.ts and the per-book diff view both consume the shared rule.
const read = (p: string) => {
	const abs = resolve(__dirname, '../..', p);
	return existsSync(abs) ? readFileSync(abs, 'utf8') : '';
};

describe('Fill empty wiring (#348)', () => {
	it('bulk.ts uses buildFillEmptyArrayPatch, not `??` source picks', () => {
		const src = read('admin/app/_actions/bulk.ts');
		expect(src).toMatch(/buildFillEmptyArrayPatch\(\s*book,\s*candidates\s*\)/);
		expect(src).not.toMatch(/ol\.isbn\s*\?\?\s*gb\.isbn/);
		expect(src).not.toMatch(/ol\.format\s*\?\?\s*gb\.format/);
	});

	it('bulk.ts uses buildFillEmptyScalarPatch, not `??` scalar picks (#350)', () => {
		const src = read('admin/app/_actions/bulk.ts');
		expect(src).toMatch(/buildFillEmptyScalarPatch\(\s*book,\s*candidates\s*\)/);
		expect(src).not.toMatch(/\?\?\s*gb\[/);
	});

	it('the per-book diff view picks scalars with fillEmptySource (#350)', () => {
		const src = read('admin/app/admin/books/[slug]/_components/diff-view.tsx');
		expect(src).not.toMatch(/scalar\(\s*book,\s*candidates,\s*f,\s*'ol'\s*\)/);
		expect(src.match(/fillEmptySource\(\s*candidates,\s*f\s*\)/g)?.length).toBe(2);
	});

	it('the per-book diff view uses fillEmptySource', () => {
		const src = read('admin/app/admin/books/[slug]/_components/diff-view.tsx');
		expect(src).toMatch(/fillEmptySource\(\s*candidates,\s*f\s*\)/);
	});
});
