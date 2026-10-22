'use server';

import { getAdmin } from '@/lib/auth';
import { PINS_WRITABLE, WIKI_INFO_TAG, loadPins, writePins } from '@/lib/enrichment';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { parsePageEnrichment } from '@app/wookieepedia/appearances';
import { fetchPageInfo, fetchPagesByIds, searchPages } from '@app/wookieepedia/client';
import type { EnrichmentPin } from '@app/wookieepedia/pins';
import { WIKI_BASE_URL, wikiUrl } from '@app/wookieepedia/url';
import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';

type ActionError = { code: string; message: string };
type Result<T> = { ok: true; data: T } | { ok: false; error: ActionError };
const fail = (code: string, message: string) => ({ ok: false as const, error: { code, message } });

/** Facts about one candidate page. No prose, no images. */
export type PinCandidate = {
	pageid: number;
	title: string;
	url: string;
	status: 'ok' | 'redirect' | 'missing';
	redirectTarget: string | null;
	hasBookInfobox: boolean;
	hasApp: boolean;
	entryCount: number;
	timeline: string | null;
	/** Another book that already owns this pageid (row on the selected target, or a pin). */
	claimedBy: string | null;
};

const SLUG = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

async function inspect(pageids: number[]): Promise<Omit<PinCandidate, 'claimedBy'>[]> {
	if (pageids.length === 0) return [];
	const fetched = await fetchPagesByIds(pageids);
	return fetched.map((f) => {
		if (f.status === 'missing') {
			return {
				pageid: f.pageid,
				title: `pageid ${f.pageid}`,
				url: `${new URL(WIKI_BASE_URL).origin}/?curid=${f.pageid}`,
				status: 'missing',
				redirectTarget: null,
				hasBookInfobox: false,
				hasApp: false,
				entryCount: 0,
				timeline: null,
			};
		}
		if (f.status === 'redirect') {
			return {
				pageid: f.pageid,
				title: f.title,
				url: wikiUrl(f.title),
				status: 'redirect',
				redirectTarget: f.target,
				hasBookInfobox: false,
				hasApp: false,
				entryCount: 0,
				timeline: null,
			};
		}
		const p = parsePageEnrichment(f.page.wikitext);
		return {
			pageid: f.page.pageid,
			title: f.page.title,
			url: wikiUrl(f.page.title),
			status: 'ok',
			redirectTarget: null,
			hasBookInfobox: p.hasBookInfobox,
			hasApp: p.diagnostics.appTemplates > 0,
			entryCount: p.entryCount,
			timeline: p.timeline_notes,
		};
	});
}

/** pageid → slug of the book that owns it (selected target's rows + pins), excluding `slug`. */
async function owners(pageids: number[], slug: string): Promise<Map<number, string>> {
	const out = new Map<number, string>();
	if (pageids.length === 0) return out;
	const supabase = await getSupabaseAdmin();
	const { data, error } = await supabase
		.from('book_enrichment')
		.select('source_pageid, books!inner(slug)')
		.in('source_pageid', pageids);
	if (error) throw new Error(`book_enrichment: ${error.message}`);
	for (const r of data ?? []) {
		if (r.books.slug !== slug) out.set(r.source_pageid, r.books.slug);
	}
	const { pins } = await loadPins();
	for (const [s, p] of pins) {
		if (s !== slug && pageids.includes(p.pageid) && !out.has(p.pageid))
			out.set(p.pageid, `${s} (pin)`);
	}
	return out;
}

/** Turn the search box input into pageids: a pageid, a wiki URL, or free-text search. */
async function resolveQuery(query: string): Promise<number[]> {
	const q = query.trim();
	if (/^\d{1,9}$/.test(q)) return [Number(q)];
	const url = q.match(/^https?:\/\/starwars\.fandom\.com\/wiki\/([^?#]+)/i);
	if (url?.[1]) {
		const title = decodeURIComponent(url[1]).replace(/_/g, ' ');
		const info = (await fetchPageInfo({ titles: [title] })).get(title);
		return info?.pageid != null ? [info.pageid] : [];
	}
	return (await searchPages(q, 8)).map((r) => r.pageid);
}

export async function searchPinCandidates(
	slug: string,
	query: string,
): Promise<Result<PinCandidate[]>> {
	if (!(await getAdmin())) return fail('AUTH', 'not authorized');
	if (!SLUG.safeParse(slug).success) return fail('INVALID', 'bad slug');
	if (query.trim().length < 2) return fail('EMPTY', 'type at least 2 characters');
	try {
		const ids = await resolveQuery(query);
		const [pages, owned] = await Promise.all([inspect(ids), owners(ids, slug)]);
		return { ok: true, data: pages.map((p) => ({ ...p, claimedBy: owned.get(p.pageid) ?? null })) };
	} catch (err) {
		return fail('WIKI', err instanceof Error ? err.message : String(err));
	}
}

const pinInput = z.object({
	slug: SLUG,
	pageid: z.number().int().positive(),
	note: z.string().trim().max(300).optional(),
});

/**
 * Pin a page to a book in `data/enrichment-pins.json`. Re-checks the page
 * server-side and refuses what the sync would refuse (missing, redirect, not a
 * book, pageid owned by another book). A pin that differs from the book's
 * persisted row is allowed but returns a warning: the sync reports it as a
 * conflict until run with `--repin`. Never touches `book_enrichment`.
 */
export async function savePin(
	raw: unknown,
): Promise<Result<{ pin: EnrichmentPin; warning: string | null }>> {
	if (!(await getAdmin())) return fail('AUTH', 'not authorized');
	if (!PINS_WRITABLE)
		return fail('READ_ONLY', 'Pins are edited in the local admin (data/ is not on this deploy).');
	const parsed = pinInput.safeParse(raw);
	if (!parsed.success) return fail('INVALID', parsed.error.issues[0]?.message ?? 'invalid pin');
	const { slug, pageid, note } = parsed.data;

	const supabase = await getSupabaseAdmin();
	const { data: book, error } = await supabase
		.from('books')
		.select('id, slug, book_enrichment(source_pageid)')
		.eq('slug', slug)
		.maybeSingle();
	if (error) return fail('DB', error.message);
	if (!book) return fail('NOT_FOUND', `no book "${slug}" on this database`);

	let page: Omit<PinCandidate, 'claimedBy'> | undefined;
	let owner: string | undefined;
	try {
		[[page], owner] = await Promise.all([
			inspect([pageid]),
			owners([pageid], slug).then((m) => m.get(pageid)),
		]);
	} catch (err) {
		return fail('WIKI', err instanceof Error ? err.message : String(err));
	}
	if (!page || page.status === 'missing') return fail('MISSING', `pageid ${pageid} not found`);
	if (page.status === 'redirect') {
		return fail(
			'REDIRECT',
			`"${page.title}" is a redirect → ${page.redirectTarget ?? '?'}; pin the target page`,
		);
	}
	if (!page.hasBookInfobox && !page.hasApp) {
		return fail('NOT_BOOK', `"${page.title}" has no {{Book}} infobox and no {{App}}`);
	}
	if (owner) return fail('CONFLICT', `pageid ${pageid} already belongs to ${owner}`);

	const loaded = await loadPins();
	if (!loaded.available) return fail('READ_ONLY', 'data/ is not available');
	if (loaded.errors.length)
		return fail('PINS_INVALID', `fix data/enrichment-pins.json first: ${loaded.errors[0]}`);

	const pin: EnrichmentPin = {
		pageid,
		title: page.title,
		...(note ? { note } : {}),
		pinned_at: new Date().toISOString(),
	};
	const next = new Map(loaded.pins);
	next.set(slug, pin);
	await writePins(next);

	const stored = book.book_enrichment?.source_pageid ?? null;
	const warning =
		stored !== null && stored !== pageid
			? `Stored row points at pageid ${stored}. The sync reports this pin as a conflict until run with --repin.`
			: null;
	revalidatePath('/admin/books');
	revalidatePath(`/admin/books/${slug}`);
	return { ok: true, data: { pin, warning } };
}

export async function removePin(slug: string): Promise<Result<{ slug: string }>> {
	if (!(await getAdmin())) return fail('AUTH', 'not authorized');
	if (!PINS_WRITABLE)
		return fail('READ_ONLY', 'Pins are edited in the local admin (data/ is not on this deploy).');
	if (!SLUG.safeParse(slug).success) return fail('INVALID', 'bad slug');
	const loaded = await loadPins();
	if (!loaded.available) return fail('READ_ONLY', 'data/ is not available');
	if (loaded.errors.length)
		return fail('PINS_INVALID', `fix data/enrichment-pins.json first: ${loaded.errors[0]}`);
	if (!loaded.pins.has(slug)) return fail('NOT_FOUND', `no pin for "${slug}"`);
	const next = new Map(loaded.pins);
	next.delete(slug);
	await writePins(next);
	revalidatePath('/admin/books');
	revalidatePath(`/admin/books/${slug}`);
	return { ok: true, data: { slug } };
}

/** Drop the cached `prop=info` health check so statuses re-query the wiki. */
export async function recheckWiki(): Promise<Result<null>> {
	if (!(await getAdmin())) return fail('AUTH', 'not authorized');
	revalidateTag(WIKI_INFO_TAG);
	return { ok: true, data: null };
}
