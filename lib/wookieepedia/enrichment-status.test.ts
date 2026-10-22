import { describe, expect, it } from 'vitest';
import type { PageInfo } from './client';
import type { MapBook } from './enrich-sync';
import { deriveEnrichmentStates } from './enrichment-status';
import type { EnrichmentPin } from './pins';

const book = (slug: string): MapBook => ({ id: `id-${slug}`, slug, title: slug, canon: 'Canon' });
const pin = (pageid: number): EnrichmentPin => ({
	pageid,
	title: `page ${pageid}`,
	pinned_at: '2026-10-22T00:00:00Z',
});
const ok = (pageid: number): PageInfo => ({
	status: 'ok',
	pageid,
	title: `page ${pageid}`,
	lastrevid: 1,
});

describe('deriveEnrichmentStates', () => {
	const catalog = ['enriched', 'pinned', 'none', 'conflict', 'gone', 'moved', 'clash'].map(book);
	const existing = [
		{ book_id: 'id-enriched', source_pageid: 1 },
		{ book_id: 'id-conflict', source_pageid: 4 },
		{ book_id: 'id-gone', source_pageid: 5 },
		{ book_id: 'id-moved', source_pageid: 6 },
	];
	const pins = new Map([
		['enriched', pin(1)],
		['pinned', pin(2)],
		['conflict', pin(40)],
		['clash', pin(1)], // pageid persisted for `enriched`
	]);
	const wiki = new Map<number | string, PageInfo>([
		[1, ok(1)],
		[2, ok(2)],
		[4, ok(4)],
		[5, { status: 'missing', pageid: 5, title: null }],
		[6, { status: 'redirect', pageid: 6, title: 'Old title', lastrevid: 2 }],
	]);

	it('derives one status per book from rows, pins and page health', () => {
		const { states } = deriveEnrichmentStates({ catalog, existing, pins, wiki });
		const summary = Object.fromEntries(
			[...states].map(([slug, s]) => [slug, [s.status, s.pageid, s.reasons.length]]),
		);
		expect(summary).toEqual({
			enriched: ['enriched', 1, 0],
			pinned: ['pinned', 2, 0],
			none: ['no_page', null, 0],
			conflict: ['flagged', 4, 1],
			gone: ['flagged', 5, 1],
			moved: ['flagged', 6, 1],
			clash: ['flagged', null, 1],
		});
		expect(states.get('enriched')?.pin?.pageid).toBe(1);
		expect(states.get('moved')?.reasons[0]).toContain('now a redirect');
	});

	it('without the live check, page health is unknown (not flagged)', () => {
		const { states } = deriveEnrichmentStates({ catalog, existing, pins, wiki: null });
		expect(states.get('gone')?.status).toBe('enriched');
		expect(states.get('conflict')?.status).toBe('flagged');
	});
});
