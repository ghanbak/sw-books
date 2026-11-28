import { getDbTarget, getSupabaseAdmin } from '@/lib/supabase-admin';
import { dbError } from '@app/action-errors';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense, cache } from 'react';
import { DiffView } from './_components/diff-view';
import { EnrichmentCard, EnrichmentShell } from './_components/enrichment-card';
import { ManualFieldsForm } from './_components/manual-fields-form';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

// One read per request, shared by generateMetadata and the page.
const loadBook = cache(async (slug: string) => {
	const supabaseAdmin = await getSupabaseAdmin();
	return supabaseAdmin.from('books').select('*').eq('slug', slug).maybeSingle();
});

// The page renders the error / 404. Browsers get this streamed title even when the
// page hits notFound(), so a missing row matches not-found.tsx's title.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const { data, error } = await loadBook(slug);
	if (!data && !error) return { title: 'Book not found' };
	return { title: data?.title || 'Book' };
}

const catalogLink = (
	<Link
		href="/admin/books"
		className="mb-4 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
	>
		<ArrowLeft className="size-4" /> Catalog
	</Link>
);

export default async function BookDiffPage({ params }: Props) {
	const { slug } = await params;
	// The target is sent back with each save so a switch in another tab is refused (#487).
	const [{ data, error }, target] = await Promise.all([loadBook(slug), getDbTarget()]);

	if (error) {
		return (
			<main className="p-8">
				{catalogLink}
				<p className="text-destructive-text">
					Failed to load book: {dbError('BookDiffPage', error).message}
				</p>
			</main>
		);
	}
	if (!data) notFound();

	return (
		<main className="mx-auto max-w-6xl p-6">
			{catalogLink}
			<DiffView book={data} dbTarget={target} />
			<div className="mt-10">
				{/* Keyed on updated_at: any save (here, diff apply, bulk) resets the drafts. */}
				<ManualFieldsForm
					key={data.updated_at ?? 'null'}
					bookId={data.id}
					updatedAt={data.updated_at}
					book={data}
					dbTarget={target}
				/>
			</div>
			<div className="mt-10">
				<Suspense
					fallback={
						<EnrichmentShell>
							<output className="block text-muted-foreground text-sm">
								Checking Wookieepedia…
							</output>
						</EnrichmentShell>
					}
				>
					<EnrichmentCard bookId={data.id} slug={data.slug} title={data.title} />
				</Suspense>
			</div>
		</main>
	);
}
