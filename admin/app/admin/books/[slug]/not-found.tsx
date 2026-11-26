import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Book not found' };

export default function BookNotFound() {
	return (
		<main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
			<div className="flex flex-col gap-1">
				<h1 className="font-semibold text-xl">Book not found</h1>
				<p className="text-base text-muted-foreground">
					No book in the catalog has this slug. It may have been renamed or removed.
				</p>
			</div>
			<Button className="min-h-11" asChild>
				<Link href="/admin/books">Back to Catalog</Link>
			</Button>
		</main>
	);
}
