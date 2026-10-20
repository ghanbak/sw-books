/**
 * Sync Wookieepedia in-universe enrichment into `book_enrichment`. DRY-RUN BY DEFAULT.
 *
 *   npm run catalog:enrich                                   # dry-run vs LOCAL
 *   npm run catalog:enrich -- --apply                        # write LOCAL
 *   npm run catalog:enrich -- --production                   # dry-run vs PROD (read-only)
 *   npm run catalog:enrich -- --production --apply           # write PROD (typed project-ref prompt)
 *   …  --allow-shrink   accept rows whose appearances shrink by more than half
 *   …  --verbose        list every insert/update/unchanged row
 *
 * Writes ONLY `book_enrichment` (never `books`), upserting on `book_id`, and only
 * rows whose `content_hash` changed — a re-run with no wiki changes writes nothing.
 *
 * Mapping (lib/wookieepedia/enrich-sync.ts): existing `book_enrichment.source_pageid`
 * rows are the persisted mapping; books without one are mapped from the
 * discovery CSV + `classify` (MATCHED / DIFFERS only; AMBIGUOUS and NEW skipped).
 * Pages are fetched by pageid (serial, ≤50 per request, compliant UA, 429
 * backoff — lib/wookieepedia/client.ts). Missing / redirected / emptied pages
 * are flagged and their last good row kept.
 *
 * No backup step: the table is re-derivable from the wiki at any time.
 * Partial failure: each batch is its own upsert; rows already written stay
 * written, and a re-run skips them (hash gate) and resumes.
 */
import { createInterface } from 'node:readline/promises';
import { parsePageEnrichment } from '../lib/wookieepedia/appearances';
import { type PageFetch, fetchPagesByIds } from '../lib/wookieepedia/client';
import {
	type ExistingRow,
	type MapBook,
	type SyncStep,
	batchRows,
	buildMapping,
	countEntries,
	isMissingTableError,
	planStep,
} from '../lib/wookieepedia/enrich-sync';
import { type CatalogBook, classify } from '../lib/wookieepedia/match';
import { isLocal, makeClient, resolveCredentials } from './_supabase';
import { discoveryPageIds, loadDiscovered } from './lib/load-discovered';

const args = process.argv.slice(2);
const PROD = args.includes('--production');
const APPLY = args.includes('--apply');
const ALLOW_SHRINK = args.includes('--allow-shrink');
const VERBOSE = args.includes('--verbose');
const PAGE_SIZE = 100;

const supabase = makeClient(PROD);
const w = (s: string) => process.stdout.write(`${s}\n`);
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`;

/** Stop before anything else when the migration has not been applied to the target. */
async function requireTable(url: string): Promise<void> {
	// A GET, not `head: true`: a HEAD 404 has no body, so supabase-js reports no
	// error and a missing table would slip past this probe.
	const { error } = await supabase.from('book_enrichment').select('book_id').limit(1);
	if (!error) return;
	if (isMissingTableError(error)) {
		console.error(
			`\nStopping: table public.book_enrichment does not exist on ${isLocal(url) ? 'LOCAL' : 'PRODUCTION'} (${url}).`,
		);
		console.error(
			'Run `supabase db push` first (applies supabase/migrations/20261020221839_add_book_enrichment.sql). Nothing written.',
		);
		process.exit(1);
	}
	throw new Error(`book_enrichment probe failed: ${error.code ?? ''} ${error.message}`);
}

async function readCatalog(): Promise<CatalogBook[]> {
	const { data, error } = await supabase.from('books').select('*').order('slug');
	if (error) throw new Error(`books read failed: ${error.message}`);
	return (data ?? []) as unknown as CatalogBook[];
}

/** Existing rows, paged (each carries a 14–50 KB `appearances`). */
async function readExisting(): Promise<ExistingRow[]> {
	const out: ExistingRow[] = [];
	for (let from = 0; ; from += PAGE_SIZE) {
		const { data, error } = await supabase
			.from('book_enrichment')
			.select('book_id, source_pageid, source_title, content_hash, appearances')
			.order('book_id')
			.range(from, from + PAGE_SIZE - 1);
		if (error) throw new Error(`book_enrichment read failed: ${error.message}`);
		for (const r of data ?? []) {
			out.push({
				book_id: r.book_id,
				source_pageid: r.source_pageid,
				source_title: r.source_title,
				content_hash: r.content_hash,
				entryCount: countEntries(r.appearances),
			});
		}
		if ((data ?? []).length < PAGE_SIZE) return out;
	}
}

/** Typed project-ref guard for any non-local write (same as apply-catalog-changeset.ts). */
async function confirmTarget(url: string): Promise<void> {
	if (isLocal(url)) return;
	const ref = url.match(/https?:\/\/([^.]+)\./)?.[1] ?? url;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(
		`\n⚠️  About to WRITE book_enrichment to a NON-LOCAL database:\n    ${url}\n` +
			`Type the project ref "${ref}" to continue (anything else aborts): `,
	);
	rl.close();
	if (answer.trim() !== ref) {
		console.error('Aborted — no changes written.');
		process.exit(1);
	}
}

function describe(s: SyncStep): string {
	if (s.kind === 'flag') {
		return `  ⚑ ${s.book.slug}: ${s.reason.toUpperCase()} — ${s.detail}${s.keptExisting ? ' (last good row kept)' : ' (no row)'}`;
	}
	const mark = s.kind === 'insert' ? '+' : s.kind === 'update' ? '~' : '·';
	const renamed = s.kind !== 'unchanged' && s.renamed ? ' [page renamed]' : '';
	return `  ${mark} ${s.book.slug}: ${s.kind} · ${s.entryCount} entries · ${kb(s.bytes)}${renamed}`;
}

async function main(): Promise<void> {
	const { url } = resolveCredentials(PROD);
	const target = isLocal(url) ? 'LOCAL' : 'PRODUCTION';
	await requireTable(url);

	const catalog = await readCatalog();
	const existing = await readExisting();
	const discovered = loadDiscovered();
	const classifications = classify(discovered, catalog);
	const books: MapBook[] = catalog.map((b) => ({
		id: b.id as string,
		slug: b.slug,
		title: b.title,
		canon: b.canon,
	}));
	const mapping = buildMapping({
		catalog: books,
		existing,
		classifications,
		validPageIds: discoveryPageIds(),
	});

	w(`\n═══ Wookieepedia enrichment ${APPLY ? 'APPLY' : 'DRY-RUN'} ═══`);
	w(
		`Target: ${target} · ${catalog.length} books · ${existing.length} existing enrichment rows · ${discovered.length} discovered pages`,
	);
	const persisted = mapping.targets.filter((t) => t.origin === 'persisted').length;
	w(
		`Mapping: ${mapping.targets.length} mapped (${persisted} persisted, ${mapping.targets.length - persisted} from discovery) · ${mapping.noPage.length} no page · ${mapping.ambiguous.length} AMBIGUOUS skipped · ${mapping.issues.length} issue(s)`,
	);
	for (const i of mapping.issues) w(`  ! ${i.slug}: ${i.kind} — ${i.detail}`);

	w(`\nFetching ${mapping.targets.length} page(s) by pageid …`);
	const fetches = await fetchPagesByIds(mapping.targets.map((t) => t.pageid));
	const byPage = new Map<number, PageFetch>(
		fetches.map((f) => [f.status === 'ok' ? f.page.pageid : f.pageid, f]),
	);
	const existingByBook = new Map(existing.map((e) => [e.book_id, e]));
	const fetchedAt = new Date().toISOString();

	const unknownTemplates = new Map<string, number>();
	const unknownParams = new Map<string, number>();
	let subheadings = 0;
	let skippedLines = 0;
	const parse = (wikitext: string) => {
		const p = parsePageEnrichment(wikitext);
		for (const [k, n] of Object.entries(p.diagnostics.unknownTemplates))
			unknownTemplates.set(k, (unknownTemplates.get(k) ?? 0) + n);
		for (const k of p.diagnostics.unknownParams)
			unknownParams.set(k, (unknownParams.get(k) ?? 0) + 1);
		subheadings += p.diagnostics.subheadings;
		skippedLines += p.diagnostics.skippedLines;
		return p;
	};
	const steps = mapping.targets.map((t) =>
		planStep(
			t,
			byPage.get(t.pageid) ?? { status: 'missing', pageid: t.pageid },
			existingByBook.get(t.book.id),
			parse,
			{ fetchedAt, allowShrink: ALLOW_SHRINK },
		),
	);

	const writes = steps.filter(
		(s): s is Extract<SyncStep, { kind: 'insert' | 'update' }> =>
			s.kind === 'insert' || s.kind === 'update',
	);
	const flags = steps.filter((s) => s.kind === 'flag');
	const sized = steps.filter((s): s is Exclude<SyncStep, { kind: 'flag' }> => s.kind !== 'flag');
	const count = (k: SyncStep['kind']) => steps.filter((s) => s.kind === k).length;

	if (VERBOSE) for (const s of sized) w(describe(s));
	if (flags.length) {
		w(`\nFLAGGED (${flags.length}) — not written:`);
		for (const s of flags) w(describe(s));
	}

	const totalBytes = sized.reduce((n, s) => n + s.bytes, 0);
	const writeBytes = writes.reduce((n, s) => n + s.bytes, 0);
	const largest = [...sized].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
	const empty = sized.filter((s) => s.entryCount === 0);
	w('\nPlan:');
	w(
		`  insert ${count('insert')} · update ${count('update')} · unchanged ${count('unchanged')} · flagged ${flags.length}`,
	);
	w(
		`  payload: ${mb(writeBytes)} to write · ${mb(totalBytes)} across all ${sized.length} rows · avg ${kb(sized.length ? totalBytes / sized.length : 0)}`,
	);
	if (largest.length)
		w(`  largest: ${largest.map((s) => `${s.book.slug} ${kb(s.bytes)}`).join(' · ')}`);
	if (empty.length)
		w(`  rows with no {{App}} entries: ${empty.map((s) => s.book.slug).join(', ')}`);
	if (subheadings) w(`  sub-group headings skipped (structure only): ${subheadings}`);
	if (unknownTemplates.size || unknownParams.size || skippedLines) {
		w(
			`  parser drift: unknown templates ${JSON.stringify(Object.fromEntries(unknownTemplates))} · unknown params ${JSON.stringify(Object.fromEntries(unknownParams))} · unbulleted lines ${skippedLines}`,
		);
	}

	w(`\nNo page (${mapping.noPage.length}) — catalog books not enriched:`);
	for (const b of mapping.noPage) {
		const hint = mapping.noPageAmbiguousCandidates.has(b.slug)
			? '  [AMBIGUOUS/conflict candidate]'
			: '';
		w(`  - ${b.slug} [${b.canon}] ${b.title}${hint}`);
	}

	if (!APPLY) {
		w(
			`\nDry-run only — nothing written. Real writes need --apply${PROD ? ' (and the typed project ref)' : ''}.`,
		);
		return;
	}
	if (writes.length === 0) {
		w('\nNothing to write — every mapped row is unchanged (hash gate).');
		return;
	}

	await confirmTarget(url);
	const batches = batchRows(writes);
	w(`\nWriting ${writes.length} row(s) in ${batches.length} batch(es) …`);
	let done = 0;
	for (const [i, batch] of batches.entries()) {
		const { data, error } = await supabase
			.from('book_enrichment')
			.upsert(
				batch.map((s) => s.row),
				{ onConflict: 'book_id' },
			)
			.select('book_id');
		if (error || (data ?? []).length !== batch.length) {
			console.error(
				`\n✗ STOPPED at batch ${i + 1}/${batches.length}: ${error ? `${error.code ?? ''} ${error.message}` : `wrote ${(data ?? []).length}/${batch.length} rows`}`,
			);
			console.error(
				`  ${done} row(s) committed before it. Re-run the same command to resume (hash gate skips them).`,
			);
			process.exit(1);
		}
		done += batch.length;
		w(
			`  ✓ batch ${i + 1}/${batches.length}: ${batch.length} row(s), ${kb(batch.reduce((n, s) => n + s.bytes, 0))}`,
		);
	}
	w(`\nDone — ${done} row(s) written to book_enrichment (${target}).`);
}

main().catch((err) => {
	console.error(`\n${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
