import { describe, expect, it } from 'vitest';
import {
	type LiveState,
	blockingProblems,
	planAll,
	planCoverFix,
	planInsert,
	planIsbnFix,
	planUpdate,
} from './apply-plan';
import {
	CHANGESET_VERSION,
	type Changeset,
	type CoverFix,
	type Insert,
	type IsbnFix,
	type Update,
} from './changeset';

const fix: IsbnFix = {
	id: 'id-rh',
	slug: 'red-harvest',
	title: 'Red Harvest',
	before: { isbn: ['A', 'B'], primary_isbn: 'A' },
	after: { isbn: ['B'], primary_isbn: 'B' },
	replacements: [],
	flags: [],
};

const coverFix: CoverFix = {
	id: 'id-rh',
	slug: 'red-harvest',
	title: 'Red Harvest',
	before: 'https://prh/cover/A',
	after: 'https://ol/b/id/1-L.jpg',
	source: 'openlibrary:isbn:B',
	reason: '',
};

const update: Update = {
	id: 'id-x',
	slug: 'x',
	title: 'X',
	wiki_title: 'X',
	match_method: 'isbn',
	changes: {
		date_published: { before: '1994-03-01', after: '1994-10-01' },
		format: { before: ['Paperback'], after: ['Paperback', 'Hardcover'] },
	},
	flags: [],
	review_status: null,
};

const insert: Insert = {
	slug: 'tatooine-ghost',
	wiki_title: 'Tatooine Ghost',
	source_pageid: 1,
	row: {
		title: 'Tatooine Ghost',
		slug: 'tatooine-ghost',
		author: ['Troy Denning'],
		cover_image: null,
		canon: 'Legends',
		date_published: '2003-03-04',
		format: [],
		isbn: ['9780345456687'],
		primary_isbn: '9780345456687',
		language: 'English',
		publisher: 'Del Rey',
		series_name: null,
		series_order: null,
		timeline_order: null,
		synopsis: null,
		type: 'Adult Novel',
		era: null,
	},
	type_source: 'lookup',
	type_reason: '',
	type_evidence: [],
	cover_source: null,
	flags: [],
};

function row(over: Partial<LiveState>): LiveState {
	return {
		id: 'id-x',
		slug: 'x',
		title: 'X',
		canon: 'Legends',
		isbn: [],
		primary_isbn: null,
		date_published: '1994-03-01',
		format: ['Paperback'],
		cover_image: null,
		synopsis: null,
		...over,
	};
}

function changeset(over: Partial<Changeset> = {}): Changeset {
	return {
		version: CHANGESET_VERSION,
		as_of: '2026-10-20',
		policy: {},
		summary: {
			inserts: 0,
			inserts_needs_type: 0,
			updates: 0,
			updates_flagged_pending: 0,
			isbn_fixes: 0,
			cover_fixes: 0,
			flagged_isbn_conflicts: 0,
			excluded: 0,
			review: 0,
		},
		isbn_fixes: [],
		cover_fixes: [],
		flagged_isbn_conflicts: [],
		updates: [],
		inserts: [],
		excluded: [],
		review: [],
		publisher_changes: [],
		...over,
	};
}

describe('apply plan', () => {
	it('isbn fix: apply from before, skip at after, conflict otherwise', () => {
		const at = (isbn: string[], p: string) =>
			planIsbnFix(fix, row({ id: 'id-rh', slug: 'red-harvest', isbn, primary_isbn: p }));
		expect(at(['A', 'B'], 'A').action).toBe('apply');
		expect(at(['A', 'B'], 'A').patch).toEqual({ isbn: ['B'], primary_isbn: 'B' });
		expect(at(['B'], 'B').action).toBe('skip');
		expect(at(['A', 'B', 'C'], 'A').action).toBe('conflict');
		expect(planIsbnFix(fix, null).action).toBe('conflict');
	});

	it('update: patches only the named columns still at `before`; idempotent', () => {
		const s = planUpdate(update, row({}));
		expect(s.action).toBe('apply');
		expect(s.patch).toEqual({ date_published: '1994-10-01', format: ['Paperback', 'Hardcover'] });
		// Half-applied (date done) → only format left.
		expect(planUpdate(update, row({ date_published: '1994-10-01' })).patch).toEqual({
			format: ['Paperback', 'Hardcover'],
		});
		expect(
			planUpdate(update, row({ date_published: '1994-10-01', format: ['Paperback', 'Hardcover'] }))
				.action,
		).toBe('skip');
		expect(planUpdate(update, row({ date_published: '2000-01-01' })).action).toBe('conflict');
		expect(planUpdate(update, row({ slug: 'renamed' })).action).toBe('conflict');
	});

	it('insert: plain insert when the slug is free, skip if already inserted, conflict if taken', () => {
		expect(planInsert(insert, null).action).toBe('apply');
		const same = row({
			slug: 'tatooine-ghost',
			title: 'Tatooine Ghost',
			isbn: ['9780345456687'],
		});
		expect(planInsert(insert, same).action).toBe('skip');
		expect(planInsert(insert, row({ slug: 'tatooine-ghost', title: 'Other' })).action).toBe(
			'conflict',
		);
	});

	it('cover fix: writes only cover_image, keyed by id; idempotent', () => {
		const at = (cover: string | null) =>
			planCoverFix(coverFix, row({ id: 'id-rh', slug: 'red-harvest', cover_image: cover }));
		expect(at('https://prh/cover/A').action).toBe('apply');
		expect(at('https://prh/cover/A').patch).toEqual({ cover_image: 'https://ol/b/id/1-L.jpg' });
		expect(at('https://prh/cover/A').id).toBe('id-rh');
		expect(at('https://ol/b/id/1-L.jpg').action).toBe('skip');
		expect(at('https://elsewhere/x.jpg').action).toBe('conflict');
		expect(planCoverFix(coverFix, null).action).toBe('conflict');
	});

	it('orders writes: isbn fixes, cover fixes, updates, inserts', () => {
		const plan = planAll(
			changeset({
				isbn_fixes: [fix],
				cover_fixes: [coverFix],
				updates: [update],
				inserts: [insert],
			}),
			[
				row({}),
				row({
					id: 'id-rh',
					slug: 'red-harvest',
					isbn: ['A', 'B'],
					primary_isbn: 'A',
					cover_image: 'https://prh/cover/A',
				}),
			],
		);
		expect(plan.map((s) => s.kind)).toEqual(['isbn_fix', 'cover_fix', 'update', 'insert']);
		expect(plan.every((s) => s.action === 'apply')).toBe(true);
	});

	it('blocks any write while an insert needs a type', () => {
		const { type: _t, ...untyped } = insert.row;
		const pending: Insert = { ...insert, needs_type: true, row: untyped };
		expect(blockingProblems(changeset({ inserts: [pending] }))[0]).toMatch(/needs_type/);
		expect(blockingProblems(changeset({ inserts: [insert] }))).toEqual([]);
		expect(blockingProblems(changeset({ version: 99 }))[0]).toMatch(/version/);
	});
});
