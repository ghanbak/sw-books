import { supabaseAdmin } from '@/lib/supabase-admin';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DiffView } from './_components/diff-view';

export const dynamic = 'force-dynamic';

export default async function BookDiffPage({ params }: { params: Promise<{ slug: string }> }) {
	const { slug } = await params;
	const { data, error } = await supabaseAdmin.from('books').select('*').eq('slug', slug).single();
	if (error || !data) notFound();

	return (
		<main className="mx-auto max-w-6xl p-6">
			<Link
				href="/books"
				className="mb-4 inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
			>
				<ArrowLeft className="size-4" /> Catalog
			</Link>
			<DiffView book={data} />
		</main>
	);
}
