import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { NewBookForm } from './_components/new-book-form';

export const dynamic = 'force-dynamic';

export default function NewBookPage() {
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
				<Link href="/admin/books">
					<Button variant="ghost">Back</Button>
				</Link>
			</header>
			<NewBookForm />
		</main>
	);
}
