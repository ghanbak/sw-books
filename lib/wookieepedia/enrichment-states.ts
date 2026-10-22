/**
 * One enrichment status per catalog book, for the admin. Derived with the SAME
 * `buildMapping` the sync uses (persisted rows + pins; discovery is a sync-time
 * input and not consulted here), plus an optional cheap `prop=info` health
 * check of each mapped/pinned page.
 *
 *   enriched — has a `book_enrichment` row; page still exists and isn't a redirect
 *   pinned   — no row yet; a valid pin waits for the next `catalog:enrich`
 *   flagged  — a pin conflict/refusal, or the page is now missing / a redirect
 *   no_page  — no row and no pin
 *
 * `not_book` / `emptied` / `shrunk` need the wikitext and stay sync-only.
 * Server-side only in the admin (pulls in enrich-sync → `node:crypto`); client
 * components import the labels from ./enrichment-status.
 */
import type { PageInfo } from './client';
import { type MapBook, type Mapping, buildMapping } from './enrich-sync';
import type { EnrichmentStatus } from './enrichment-status';
import type { EnrichmentPin, PinMap } from './pins';

export type BookEnrichmentState = {
	readonly status: EnrichmentStatus;
	/** The pageid the sync would use (stored row, or an applicable pin). */
	readonly pageid: number | null;
	/** The book's pin, if any (applied or not). */
	readonly pin: EnrichmentPin | null;
	/** Why it's flagged (mapping issues + page health). Empty unless flagged. */
	readonly reasons: readonly string[];
};

export function deriveEnrichmentStates(input: {
	readonly catalog: readonly MapBook[];
	readonly existing: readonly { readonly book_id: string; readonly source_pageid: number }[];
	readonly pins: PinMap;
	/** `prop=info` by pageid; null when the live check was unavailable. */
	readonly wiki: ReadonlyMap<number | string, PageInfo> | null;
}): { states: Map<string, BookEnrichmentState>; mapping: Mapping } {
	const mapping = buildMapping({
		catalog: input.catalog,
		existing: input.existing,
		classifications: [],
		validPageIds: new Set(),
		pins: input.pins,
	});
	const targetBySlug = new Map(mapping.targets.map((t) => [t.book.slug, t]));
	const issuesBySlug = new Map<string, string[]>();
	for (const i of mapping.issues) {
		if (i.kind !== 'pin_conflict' && i.kind !== 'pageid_conflict') continue;
		issuesBySlug.set(i.slug, [...(issuesBySlug.get(i.slug) ?? []), i.detail]);
	}

	const states = new Map<string, BookEnrichmentState>();
	for (const book of input.catalog) {
		const target = targetBySlug.get(book.slug);
		const reasons = [...(issuesBySlug.get(book.slug) ?? [])];
		const info = target ? input.wiki?.get(target.pageid) : undefined;
		if (target && info?.status === 'missing') reasons.push(`pageid ${target.pageid} not found`);
		if (target && info?.status === 'redirect') {
			reasons.push(`pageid ${target.pageid} ("${info.title}") is now a redirect`);
		}
		const status: EnrichmentStatus = reasons.length
			? 'flagged'
			: !target
				? 'no_page'
				: target.origin === 'pin'
					? 'pinned'
					: 'enriched';
		states.set(book.slug, {
			status,
			pageid: target?.pageid ?? null,
			pin: input.pins.get(book.slug) ?? null,
			reasons,
		});
	}
	return { states, mapping };
}
