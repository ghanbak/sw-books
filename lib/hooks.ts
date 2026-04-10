import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Database } from './types';

export type Book = Database['public']['Tables']['books']['Row'];
export type UserBook = Database['public']['Tables']['user_books']['Row'];

/**
 * Fetches the full book catalog from Supabase.
 * Returns all books sorted by timeline_order.
 */
export function useBooks() {
	const [books, setBooks] = useState<Book[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchBooks = useCallback(async () => {
		setLoading(true);
		setError(null);

		const { data, error: err } = await supabase
			.from('books')
			.select('*')
			.order('timeline_order', { ascending: true });

		if (err) {
			setError(err.message);
		} else {
			setBooks(data ?? []);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		fetchBooks();
	}, [fetchBooks]);

	return { books, loading, error, refetch: fetchBooks };
}
