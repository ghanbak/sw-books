import { describe, expect, it } from 'vitest';
import type { PageEnrichmentContent } from './appearances';
import type { PageFetch } from './client';
import type { DiscoveredBook } from './derive';
import {
	type EnrichmentContent,
	type ExistingRow,
	type MapBook,
	type MapTarget,
	batchRows,
	buildEnrichmentRow,
	buildMapping,
	canonicalJson,
	contentHash,
	countEntries,
	isMissingTableError,
	planStep,
	wikiUrl,
} from './enrich-sync';
import type { Classification, MatchClass } from './match';

const book = (slug: string, id = `id-${slug}`): MapBook => ({
	id,
	slug,
	title: slug,
	canon: 'Legends',
});

function cls(cl: MatchClass, pageid: number, matchSlug: string | null, candidates: string[] = []) {
	return {
		discovered: { title: `page ${pageid}`, source_pageid: pageid } as DiscoveredBook,
		class: cl,
		method: 'title-author',
		reason: '',
		matchSlug,
		candidates,
		diffs: [],
		proposedSlug: null,
	} as Classification;
}

const existingRow = (bookId: string, pageid: number, extra: Partial<ExistingRow> = {}) => ({
	book_id: bookId,
	source_pageid: pageid,
	source_title: 'T',
	content_hash: 'h',
	entryCount: 100,
	...extra,
});

describe('wikiUrl', () => {
	it('builds the MediaWiki article URL', () => {
		expect(wikiUrl('Heir to the Empire')).toBe(
			'https://starwars.fandom.com/wiki/Heir_to_the_Empire',
		);
		expect(wikiUrl('The New Jedi Order: Star by Star')).toBe(
			'https://starwars.fandom.com/wiki/The_New_Jedi_Order:_Star_by_Star',
		);
		expect(wikiUrl('Tarkin (novel)')).toBe('https://starwars.fandom.com/wiki/Tarkin_(novel)');
	});
});

describe('contentHash', () => {
	const content: EnrichmentContent = {
		source_pageid: 759,
		source_title: 'Heir to the Empire',
		source_url: wikiUrl('Heir to the Empire'),
		license: 'CC-BY-SA-3.0',
		attribution: 'Wookieepedia contributors',
		timeline_notes: '9 ABY',
		appearances: { characters: [{ name: 'Talon Karrde', markers: ['first'] }] },
	};

	it('is stable across key order', () => {
		expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: null } })).toBe(
			'{"a":{"c":null,"d":[2,{"x":0,"y":1}]},"b":1}',
		);
		const reordered = JSON.parse(
			'{"appearances":{"characters":[{"markers":["first"],"name":"Talon Karrde"}]},"timeline_notes":"9 ABY","attribution":"Wookieepedia contributors","license":"CC-BY-SA-3.0","source_url":"https://starwars.fandom.com/wiki/Heir_to_the_Empire","source_title":"Heir to the Empire","source_pageid":759}',
		) as EnrichmentContent;
		expect(contentHash(reordered)).toBe(contentHash(content));
	});

	it('ignores fetched_at and revid but changes with stored content', () => {
		const parsed = {
			appearances: content.appearances,
			timeline_notes: '9 ABY',
		} as PageEnrichmentContent;
		const page = {
			pageid: 759,
			title: 'Heir to the Empire',
			wikitext: '',
			revid: 1,
			imageUrl: null,
		};
		const a = buildEnrichmentRow('b', page, parsed, '2026-01-01T00:00:00Z');
		const b = buildEnrichmentRow('b', { ...page, revid: 2 }, parsed, '2026-02-02T00:00:00Z');
		expect(a.content_hash).toBe(b.content_hash);
		expect(a.content_hash).toBe(contentHash(content));
		const renamed = buildEnrichmentRow('b', { ...page, title: 'Heir' }, parsed, 'x');
		expect(renamed.content_hash).not.toBe(a.content_hash);
		expect(contentHash({ ...content, timeline_notes: '10 ABY' })).not.toBe(contentHash(content));
	});
});

describe('buildMapping', () => {
	const valid = new Set([1, 2, 3, 4, 5, 6]);

	it('maps MATCHED/DIFFERS, skips AMBIGUOUS/NEW, lists books with no page', () => {
		const catalog = [book('a'), book('b'), book('c'), book('d')];
		const m = buildMapping({
			catalog,
			existing: [],
			classifications: [
				cls('MATCHED', 1, 'a'),
				cls('DIFFERS', 2, 'b'),
				cls('AMBIGUOUS', 3, null, ['c']),
				cls('NEW', 4, null),
			],
			validPageIds: valid,
		});
		expect(m.targets.map((t) => [t.book.slug, t.pageid, t.origin])).toEqual([
			['a', 1, 'discovery'],
			['b', 2, 'discovery'],
		]);
		expect(m.noPage.map((b) => b.slug)).toEqual(['c', 'd']);
		expect([...m.noPageAmbiguousCandidates]).toEqual(['c']);
		expect(m.ambiguous).toHaveLength(1);
		expect(m.issues).toEqual([]);
	});

	it('persisted rows take precedence and are never re-pointed', () => {
		const m = buildMapping({
			catalog: [book('a')],
			existing: [existingRow('id-a', 5)],
			classifications: [cls('MATCHED', 1, 'a')],
			validPageIds: valid,
		});
		expect(m.targets).toEqual([{ book: book('a'), pageid: 5, origin: 'persisted' }]);
		expect(m.issues.map((i) => i.kind)).toEqual(['persisted_differs']);
	});

	it('refuses synthetic pageids, pageids owned by another book, and books matched twice', () => {
		const m = buildMapping({
			catalog: [book('a'), book('b'), book('c'), book('d')],
			existing: [existingRow('id-a', 1)],
			classifications: [
				cls('MATCHED', 1_000_007, 'b'), // fallback id, not a real page
				cls('MATCHED', 1, 'c'), // pageid already stored for a
				cls('MATCHED', 2, 'd'),
				cls('DIFFERS', 3, 'd'), // two pages → one book
			],
			validPageIds: valid,
		});
		expect(m.targets.map((t) => t.book.slug)).toEqual(['a']);
		expect(m.issues.map((i) => [i.slug, i.kind])).toEqual([
			['b', 'synthetic_pageid'],
			['c', 'pageid_conflict'],
			['d', 'multiple_pages'],
		]);
		expect(m.noPage.map((b) => b.slug)).toEqual(['b', 'c', 'd']);
	});

	it('refuses one page claimed by two unmapped books', () => {
		const m = buildMapping({
			catalog: [book('a'), book('b')],
			existing: [],
			classifications: [cls('MATCHED', 4, 'a'), cls('MATCHED', 4, 'b')],
			validPageIds: valid,
		});
		expect(m.targets).toEqual([]);
		expect(m.issues.map((i) => i.kind)).toEqual(['pageid_conflict', 'pageid_conflict']);
	});
});

describe('planStep', () => {
	const target: MapTarget = { book: book('heir'), pageid: 759, origin: 'persisted' };
	const ok: PageFetch = {
		status: 'ok',
		page: { pageid: 759, title: 'Heir to the Empire', wikitext: 'W', revid: 9, imageUrl: null },
	};
	const parsed = (entryCount: number, extra: Partial<PageEnrichmentContent> = {}) =>
		(() =>
			({
				appearances: entryCount
					? { characters: Array.from({ length: entryCount }, (_, i) => ({ name: `c${i}` })) }
					: {},
				entryCount,
				timeline_notes: '9 ABY',
				hasBookInfobox: true,
				diagnostics: {
					appTemplates: 1,
					unknownParams: [],
					unknownTemplates: {},
					subheadings: 0,
					skippedLines: 0,
					emptyEntries: 0,
				},
				...extra,
			}) as PageEnrichmentContent) as (w: string) => PageEnrichmentContent;
	const opts = { fetchedAt: '2026-10-20T00:00:00Z' };

	it('inserts a new row, then is a no-op when the hash matches', () => {
		const first = planStep(target, ok, undefined, parsed(30), opts);
		expect(first.kind).toBe('insert');
		if (first.kind !== 'insert') return;
		expect(first.row).toMatchObject({
			book_id: 'id-heir',
			source_pageid: 759,
			source_url: 'https://starwars.fandom.com/wiki/Heir_to_the_Empire',
			source_revision_id: 9,
			license: 'CC-BY-SA-3.0',
		});
		const again = planStep(
			target,
			{ ...ok, page: { ...ok.page, revid: 10 } } as PageFetch,
			existingRow('id-heir', 759, { content_hash: first.row.content_hash, entryCount: 30 }),
			parsed(30),
			{ fetchedAt: '2026-10-21T00:00:00Z' },
		);
		expect(again.kind).toBe('unchanged');
	});

	it('updates when content changed and notes a page rename', () => {
		const s = planStep(
			target,
			ok,
			existingRow('id-heir', 759, { entryCount: 30 }),
			parsed(31),
			opts,
		);
		expect(s).toMatchObject({ kind: 'update', renamed: true, entryCount: 31 });
	});

	it('flags missing and redirected pages, keeping the last good row', () => {
		const ex = existingRow('id-heir', 759);
		expect(planStep(target, { status: 'missing', pageid: 759 }, ex, parsed(1), opts)).toMatchObject(
			{ kind: 'flag', reason: 'missing', keptExisting: true },
		);
		expect(
			planStep(
				target,
				{ status: 'redirect', pageid: 759, title: 'Heir to the Empire', target: 'Other' },
				undefined,
				parsed(1),
				opts,
			),
		).toMatchObject({ kind: 'flag', reason: 'redirect', keptExisting: false });
	});

	it('flags non-book pages, emptied and shrunk appearances; --allow-shrink accepts', () => {
		expect(
			planStep(
				target,
				ok,
				undefined,
				parsed(0, {
					hasBookInfobox: false,
					diagnostics: {
						appTemplates: 0,
						unknownParams: [],
						unknownTemplates: {},
						subheadings: 0,
						skippedLines: 0,
						emptyEntries: 0,
					},
				}),
				opts,
			),
		).toMatchObject({ kind: 'flag', reason: 'not_book' });
		const ex = existingRow('id-heir', 759, { entryCount: 100 });
		expect(planStep(target, ok, ex, parsed(0), opts)).toMatchObject({ reason: 'emptied' });
		expect(planStep(target, ok, ex, parsed(40), opts)).toMatchObject({ reason: 'shrunk' });
		expect(planStep(target, ok, ex, parsed(40), { ...opts, allowShrink: true }).kind).toBe(
			'update',
		);
		expect(planStep(target, ok, ex, parsed(60), opts).kind).toBe('update');
	});

	it('writes an empty-appearances row for a book page on first sync', () => {
		expect(planStep(target, ok, undefined, parsed(0), opts).kind).toBe('insert');
	});
});

describe('batchRows', () => {
	it('splits by bytes and row count, preserving order', () => {
		const items = [400, 400, 400, 100, 100].map((bytes, i) => ({ bytes, i }));
		expect(batchRows(items, 1000, 10).map((b) => b.map((x) => x.i))).toEqual([
			[0, 1],
			[2, 3, 4],
		]);
		expect(batchRows(items, 10_000, 2).map((b) => b.length)).toEqual([2, 2, 1]);
		expect(batchRows([{ bytes: 5000 }], 1000)).toHaveLength(1); // oversize row still goes alone
	});
});

describe('countEntries / isMissingTableError', () => {
	it('counts stored entries tolerantly', () => {
		expect(countEntries({ characters: [{}, {}], events: [{}], bogus: 'x' })).toBe(3);
		expect(countEntries(null)).toBe(0);
		expect(countEntries([1])).toBe(0);
	});

	it('recognizes a not-yet-pushed table', () => {
		expect(
			isMissingTableError({
				code: 'PGRST205',
				message: "Could not find the table 'public.book_enrichment' in the schema cache",
			}),
		).toBe(true);
		expect(isMissingTableError({ code: '42P01', message: 'relation does not exist' })).toBe(true);
		expect(
			isMissingTableError({ message: 'relation "public.book_enrichment" does not exist' }),
		).toBe(true);
		expect(isMissingTableError({ code: '42501', message: 'permission denied' })).toBe(false);
		expect(isMissingTableError(null)).toBe(false);
	});
});
