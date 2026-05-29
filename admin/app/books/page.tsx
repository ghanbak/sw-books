import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Link from 'next/link';
import { getDriftReport } from '@/app/_actions/export';
import { Badge } from '@/components/ui/badge';
import { type IssueKey, ISSUE_DEFS, issuesFor } from '@/lib/issues';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { type BookListRow, BooksTable } from './_components/books-table';

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
	const [{ data, error }, placeholderSlugs] = await Promise.all([
		supabaseAdmin
			.from('books')
			.select(
				'id, slug, title, author, canon, era, type, series_name, series_order, primary_isbn, isbn, format, publisher, date_published, cover_image, synopsis',
			)
			.order('title', { ascending: true }),
		loadPlaceholderSlugs(),
	]);

	if (error) {
		return (
			<main className="p-8">
				<p className="text-destructive">Failed to load catalog: {error.message}</p>
			</main>
		);
	}

	// Compute issues server-side, then drop the heavy synopsis text from the payload.
	const rows = (data ?? []).map((b) => {
		const { synopsis, ...rest } = b;
		return {
			...rest,
			issues: issuesFor(b, placeholderSlugs),
		} satisfies BookListRow & { issues: IssueKey[] };
	});

	const counts = Object.fromEntries(ISSUE_DEFS.map((d) => [d.key, 0])) as Record<IssueKey, number>;
	for (const r of rows) for (const k of r.issues) counts[k]++;

	const drift = await getDriftReport();
	const driftRows = drift.ok ? drift.data.summary.rows : 0;

	return (
		<main className="mx-auto max-w-[1600px] p-6">
			<header className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">Catalog</h1>
					<p className="text-muted-foreground text-sm">
						{rows.length} books · sourced from <code className="text-saber-blue">data/books.csv</code>
					</p>
				</div>
				<Link href="/diff">
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
			</header>
			<BooksTable rows={rows} counts={counts} />
		</main>
	);
}
