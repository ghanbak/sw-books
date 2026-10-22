import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DiffView } from './_components/diff-view';
import { EnrichmentCard, EnrichmentShell } from './_components/enrichment-card';

export const dynamic = 'force-dynamic';

export default async function BookDiffPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const supabaseAdmin = await getSupabaseAdmin();
	const { data, error } = await supabaseAdmin.from('books').select('*').eq('slug', slug).single();
	if (error || !data) notFound();

	return (
		<main className="mx-auto max-w-6xl p-6">
			<Link
				href="/admin/books"
				className="mb-4 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
			>
				<ArrowLeft className="size-4" /> Catalog
			</Link>
			<DiffView book={data} />
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
