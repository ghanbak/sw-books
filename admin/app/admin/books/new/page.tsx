import { Button } from '@/components/ui/button';
import { getDbTarget } from '@/lib/supabase-admin';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NewBookForm } from './_components/new-book-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Add a book' };

export default async function NewBookPage() {
	// Sent back with createBook so a target switch in another tab can't redirect the insert (#483).
	const target = await getDbTarget();
	return (
		<main className="mx-auto max-w-3xl p-6">
			<header className="mb-6 flex items-center justify-between gap-4">
				<div>
					<h1 className="font-semibold text-2xl tracking-tight">Add a book</h1>
					<p className="text-muted-foreground text-sm">
						Search Open Library / Google Books to prefill, then create. Enrich further on the book
						page afterwards.
					</p>
				</div>
				<Button variant="ghost" asChild>
					<Link href="/admin/books">Back</Link>
				</Button>
			</header>
			<NewBookForm dbTarget={target} />
		</main>
	);
}
