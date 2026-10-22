import 'server-only';
import type { Database } from '@app/types';
import { type PageInfo, fetchPageInfo } from '@app/wookieepedia/client';
import type { MapBook } from '@app/wookieepedia/enrich-sync';
import {
	type BookEnrichmentState,
	deriveEnrichmentStates,
} from '@app/wookieepedia/enrichment-states';
import { type EnrichmentPin, PINS_FILE, parsePins, serializePins } from '@app/wookieepedia/pins';
import type { SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { ADMIN_ENFORCED } from './admin-allowlist';
import { DataDirUnavailableError, safeRead, safeWrite } from './safe-fs';

/**
 * Enrichment read side for the admin. The admin NEVER writes `book_enrichment`
 * (local or prod) — that stays behind `npm run catalog:enrich`. The only write
 * is the git-tracked pin file `data/enrichment-pins.json`, and only from the
 * local admin: hosted deploys have no data/ and are read-only.
 */

/** Pins are editable only in local `next dev` (data/ isn't on the hosted deploy). */
export const PINS_WRITABLE = !ADMIN_ENFORCED;

export const WIKI_INFO_TAG = 'wiki-info';
const WIKI_INFO_TTL_S = 6 * 60 * 60;

export type PinsLoad =
	| { available: true; pins: Map<string, EnrichmentPin>; errors: string[] }
	| { available: false; pins: Map<string, EnrichmentPin>; errors: [] };

/** The pin file; empty when absent, `available: false` when data/ is not on this deploy. */
export async function loadPins(): Promise<PinsLoad> {
	let text: string | null;
	try {
		text = await safeRead(PINS_FILE);
	} catch (err) {
		if (err instanceof DataDirUnavailableError) {
			return { available: false, pins: new Map(), errors: [] };
		}
		throw err;
	}
	if (text === null) return { available: true, pins: new Map(), errors: [] };
	try {
		return { available: true, ...parsePins(JSON.parse(text)) };
	} catch (err) {
		return {
			available: true,
			pins: new Map(),
			errors: [`not valid JSON: ${(err as Error).message}`],
		};
	}
}

export async function writePins(pins: ReadonlyMap<string, EnrichmentPin>): Promise<void> {
	await safeWrite(PINS_FILE, serializePins(pins));
}

// `prop=info` for many pageids, no wikitext. Cached across requests (the args
// are the cache key; Maps don't serialize, so entries go through as an array).
const cachedPageInfo = unstable_cache(
	async (pageids: number[]) => [...(await fetchPageInfo({ pageids }))] as [number, PageInfo][],
	['wiki-page-info'],
	{ revalidate: WIKI_INFO_TTL_S, tags: [WIKI_INFO_TAG] },
);

/** Cap on how long a page render waits for the wiki (the client retries with backoff). */
const WIKI_INFO_TIMEOUT_MS = 8000;

/**
 * Live page health for these pageids, or null when the wiki is unreachable or
 * slower than the timeout (the render degrades to "health unchecked"; a late
 * result still lands in the cache for the next request).
 */
export async function getWikiInfo(
	pageids: readonly number[],
): Promise<Map<number | string, PageInfo> | null> {
	const ids = [...new Set(pageids)].sort((a, b) => a - b);
	if (ids.length === 0) return new Map();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const entries = await Promise.race([
			cachedPageInfo(ids),
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), WIKI_INFO_TIMEOUT_MS);
			}),
		]);
		return entries ? new Map(entries) : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export type EnrichmentContext = {
	catalog: MapBook[];
	existing: { book_id: string; source_pageid: number }[];
	pins: PinsLoad;
};

/**
 * Everything the status derivation needs from the selected DB target + the pin
 * file: the catalog keys and the persisted mapping columns only (no
 * `appearances` — that jsonb is ~36 KB per row).
 */
export async function loadEnrichmentContext(
	supabase: SupabaseClient<Database>,
): Promise<{ ok: true; data: EnrichmentContext } | { ok: false; message: string }> {
	const [books, rows, pins] = await Promise.all([
		supabase.from('books').select('id, slug, title, canon'),
		supabase.from('book_enrichment').select('book_id, source_pageid'),
		loadPins(),
	]);
	if (books.error) return { ok: false, message: books.error.message };
	if (rows.error) return { ok: false, message: `book_enrichment: ${rows.error.message}` };
	return { ok: true, data: { catalog: books.data ?? [], existing: rows.data ?? [], pins } };
}

/** Pageids whose health matters: every persisted row and every pin. */
export function contextPageIds(ctx: EnrichmentContext): number[] {
	return [
		...ctx.existing.map((r) => r.source_pageid),
		...[...ctx.pins.pins.values()].map((p) => p.pageid),
	];
}

export function deriveStates(
	ctx: EnrichmentContext,
	wiki: ReadonlyMap<number | string, PageInfo> | null,
): Map<string, BookEnrichmentState> {
	return deriveEnrichmentStates({
		catalog: ctx.catalog,
		existing: ctx.existing,
		pins: ctx.pins.pins,
		wiki,
	}).states;
}
