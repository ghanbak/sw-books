import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDriftReport } from '@/app/_actions/export';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { contextPageIds, deriveStates, getWikiInfo, loadEnrichmentContext } from '@/lib/enrichment';
import { ISSUE_DEFS, type IssueKey, issuesFor } from '@/lib/issues';
import { getDbTarget, getSupabaseAdmin } from '@/lib/supabase-admin';
import { ENRICHMENT_STATUSES, type EnrichmentStatus } from '@app/wookieepedia/enrichment-status';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { BooksTable, type CatalogRow, type EnrichmentSummary } from './_components/books-table';
import { DbTargetSwitch } from './_components/db-target-switch';

// Always read live from the local DB; never cache/pre-render the catalog.
export const dynamic = 'force-dynamic';

// Slugs whose cover hash landed in a duplicate cluster (placeholder detector).
// The report is gitignored/optional — absent means the filter is simply empty.
async function loadPlaceholderSlugs(): Promise<Set<string>> {
	try {
		const p = path.resolve(process.cwd(), '../scripts/placeholder-report.json');
		const json = JSON.parse(await readFile(p, 'utf-8')) as {
			duplicate_clusters?: Array<{ slugs?: string[] }>;
		};
		const set = new Set<string>();
		for (const cluster of json.duplicate_clusters ?? []) {
			for (const slug of cluster.slugs ?? []) set.add(slug);
		}
		return set;
	} catch {
		return new Set();
	}
}

export default async function BooksPage() {
	const [supabaseAdmin, target] = await Promise.all([getSupabaseAdmin(), getDbTarget()]);
	const [{ data, error }, placeholderSlugs, enrichmentCtx, drift] = await Promise.all([
		supabaseAdmin
			.from('books')
			.select(
				'id, slug, title, author, canon, era, type, series_name, series_order, timeline_order, primary_isbn, isbn, format, publisher, date_published, cover_image, synopsis',
			)
			.order('title', { ascending: true }),
		loadPlaceholderSlugs(),
		loadEnrichmentContext(supabaseAdmin),
		getDriftReport(),
	]);

	if (error) {
		return (
			<main className="p-8">
				<p className="text-destructive">Failed to load catalog: {error.message}</p>
			</main>
		);
	}

	// Enrichment status (sync mapping rules + pins + cached wiki health check).
	// A failure here degrades to "unknown" rather than breaking the catalog.
	const wiki = enrichmentCtx.ok ? await getWikiInfo(contextPageIds(enrichmentCtx.data)) : null;
	const states = enrichmentCtx.ok ? deriveStates(enrichmentCtx.data, wiki) : null;

	// Compute issues server-side, then drop the heavy synopsis text from the payload.
	const rows = (data ?? []).map((b) => {
		const { synopsis, ...rest } = b;
		const state = states?.get(b.slug);
		return {
			...rest,
			issues: issuesFor(b, placeholderSlugs),
			enrichment: state?.status ?? null,
			enrichmentReason: state?.reasons.join(' · ') || null,
		} satisfies CatalogRow;
	});

	const counts = Object.fromEntries(ISSUE_DEFS.map((d) => [d.key, 0])) as Record<IssueKey, number>;
	for (const r of rows) for (const k of r.issues) counts[k]++;

	const enrichmentCounts = Object.fromEntries(ENRICHMENT_STATUSES.map((s) => [s, 0])) as Record<
		EnrichmentStatus,
		number
	>;
	for (const r of rows) if (r.enrichment) enrichmentCounts[r.enrichment]++;
	const enrichment: EnrichmentSummary = {
		counts: enrichmentCounts,
		error: enrichmentCtx.ok ? null : enrichmentCtx.message,
		wikiChecked: wiki !== null,
		pinsAvailable: enrichmentCtx.ok && enrichmentCtx.data.pins.available,
		pinErrors: enrichmentCtx.ok ? enrichmentCtx.data.pins.errors.length : 0,
	};

	const driftRows = drift.ok ? drift.data.summary.rows : 0;

	return (
		<main className="mx-auto max-w-[1600px] p-6">
			<header className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">Catalog</h1>
					<div className="mt-1 flex items-center gap-2 text-muted-foreground text-sm">
						<span className="tabular-nums">{rows.length} books ·</span>
						<DbTargetSwitch current={target} />
					</div>
				</div>
				<div className="flex items-center gap-3">
					<Link href="/admin/diff">
						<Badge
							variant="outline"
							className={
								driftRows > 0
									? 'border-saber-yellow/40 bg-saber-yellow/10 text-saber-yellow tabular-nums'
									: 'text-muted-foreground tabular-nums'
							}
						>
							{driftRows > 0 ? `${driftRows} unsaved` : 'Synced to books.csv'}
						</Badge>
					</Link>
					<Link href="/admin/books/new">
						<Button size="sm">
							<Plus className="size-4" />
							New book
						</Button>
					</Link>
				</div>
			</header>
			<BooksTable rows={rows} counts={counts} enrichment={enrichment} />
		</main>
	);
}
