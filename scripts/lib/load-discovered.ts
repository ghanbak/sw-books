/**
 * Load data/discovery/books-discovered.csv into `DiscoveredBook[]`. Shared by
 * scripts/classify-discovery.ts and scripts/build-catalog-changeset.ts so both
 * read the staging CSV identically.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseCsv } from '../../lib/csv/read';
import type { DiscoveredBook } from '../../lib/wookieepedia/derive';
import { cleanTitle } from '../../lib/wookieepedia/parse';

const ROOT = resolve(__dirname, '..', '..');
export const DISCOVERY_CSV = resolve(ROOT, 'data', 'discovery', 'books-discovered.csv');
const DISCOVERY_META = resolve(ROOT, 'data', 'discovery', 'discovery-meta.json');

/** Split a `;`-joined discovery CSV cell into a trimmed, non-empty list. */
function splitCell(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(';')
		.map((s) => s.trim())
		.filter(Boolean);
}

type MetaPage = { pageid: number; title: string };

/** Map cleaned page title → source_pageid from the gitignored meta sidecar. */
function loadPageIdByTitle(): Map<string, number> {
	const out = new Map<string, number>();
	try {
		const meta = JSON.parse(readFileSync(DISCOVERY_META, 'utf-8')) as { pages?: MetaPage[] };
		for (const p of meta.pages ?? []) {
			const key = cleanTitle(p.title);
			if (!out.has(key)) out.set(key, p.pageid);
		}
	} catch {
		// Sidecar absent (gitignored) — source_pageid falls back to a stable index.
	}
	return out;
}

/**
 * Real Wookieepedia pageids from the meta sidecar. `loadDiscovered` falls back
 * to a synthetic `1_000_000 + index` id when the sidecar is absent; anything
 * that must address the wiki by id (the enrichment sync) checks membership here.
 */
export function discoveryPageIds(): Set<number> {
	return new Set(loadPageIdByTitle().values());
}

/** sha256 of the discovery CSV, so a changeset records exactly what it was built from. */
export function discoveryCsvSha256(): string {
	return createHash('sha256').update(readFileSync(DISCOVERY_CSV)).digest('hex');
}

/** Load data/discovery/books-discovered.csv into `DiscoveredBook[]`. */
export function loadDiscovered(): DiscoveredBook[] {
	const records = parseCsv(readFileSync(DISCOVERY_CSV, 'utf-8'));
	const pageIdByTitle = loadPageIdByTitle();
	return records.map((rec, index) => {
		const isbn = splitCell(rec.isbn);
		const format = splitCell(rec.format);
		const seriesOrder = (rec.series_order ?? '').trim();
		const timelineOrder = (rec.timeline_order ?? '').trim();
		const title = (rec.title ?? '').trim();
		return {
			title,
			slug: (rec.slug ?? '').trim(),
			author: splitCell(rec.author),
			cover_image: (rec.cover_image ?? '').trim() || null,
			canon: (rec.canon ?? '').trim(),
			date_published: (rec.date_published ?? '').trim() || null,
			format: format.length ? format : null,
			isbn,
			primary_isbn: isbn[0] ?? null,
			language: (rec.language ?? '').trim() || 'English',
			publisher: (rec.publisher ?? '').trim() || null,
			series_name: (rec.series_name ?? '').trim() || null,
			series_order: seriesOrder ? Number.parseInt(seriesOrder, 10) : null,
			timeline_order: timelineOrder ? Number.parseFloat(timelineOrder) : null,
			synopsis: (rec.synopsis ?? '').trim() || null,
			type: (rec.type ?? '').trim(),
			era: (rec.era ?? '').trim() || null,
			// Stable fallback keeps the slug tiebreaker deterministic without the sidecar.
			source_pageid: pageIdByTitle.get(cleanTitle(title)) ?? 1_000_000 + index,
		};
	});
}
