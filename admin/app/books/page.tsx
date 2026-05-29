import { supabaseAdmin } from '@/lib/supabase-admin';
import { type BookListRow, BooksTable } from './_components/books-table';

// Always read live from the local DB; never cache/pre-render the catalog.
export const dynamic = 'force-dynamic';

export default async function BooksPage() {
	// Project only the columns the table renders — synopsis is large and unused here.
	const { data, error } = await supabaseAdmin
		.from('books')
		.select(
			'id, slug, title, author, canon, era, type, series_name, series_order, primary_isbn, isbn, format, publisher, date_published, cover_image',
		)
		.order('title', { ascending: true });

	if (error) {
		return (
			<main className="p-8">
				<p className="text-destructive">Failed to load catalog: {error.message}</p>
			</main>
		);
	}

	const rows = (data ?? []) as BookListRow[];

	return (
		<main className="mx-auto max-w-[1600px] p-6">
			<header className="mb-6">
				<h1 className="font-semibold text-2xl tracking-tight">Catalog</h1>
				<p className="text-muted-foreground text-sm">
					{rows.length} books · sourced from <code className="text-saber-blue">data/books.csv</code>
				</p>
			</header>
			<BooksTable rows={rows} />
		</main>
	);
}
