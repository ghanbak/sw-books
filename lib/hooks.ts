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

/**
 * Manages the current user's shelf entries.
 * Returns a map of bookId -> UserBook for quick lookup.
 */
export function useUserBooks() {
	const [userBooks, setUserBooks] = useState<Map<string, UserBook>>(new Map());
	const [loading, setLoading] = useState(true);

	const fetchUserBooks = useCallback(async () => {
		setLoading(true);
		const { data } = await supabase.from('user_books').select('*');
		const map = new Map<string, UserBook>();
		for (const ub of data ?? []) {
			map.set(ub.book_id, ub);
		}
		setUserBooks(map);
		setLoading(false);
	}, []);

	useEffect(() => {
		fetchUserBooks();
	}, [fetchUserBooks]);

	const toggleShelf = useCallback(
		async (bookId: string, field: 'owned' | 'read' | 'want_to_read') => {
			const existing = userBooks.get(bookId);

			if (existing) {
				const newValue = !existing[field];
				const updated = { ...existing, [field]: newValue };

				// If all false, delete the row
				if (!updated.owned && !updated.read && !updated.want_to_read) {
					setUserBooks((prev) => {
						const next = new Map(prev);
						next.delete(bookId);
						return next;
					});
					await supabase.from('user_books').delete().eq('id', existing.id);
				} else {
					setUserBooks((prev) => {
						const next = new Map(prev);
						next.set(bookId, updated);
						return next;
					});
					const updatePayload =
						field === 'owned'
							? { owned: newValue }
							: field === 'read'
								? { read: newValue }
								: { want_to_read: newValue };
					await supabase.from('user_books').update(updatePayload).eq('id', existing.id);
				}
			} else {
				// No row exists — create one with this field set to true
				const { data: user } = await supabase.auth.getUser();
				if (!user.user) return;

				const newEntry = {
					user_id: user.user.id,
					book_id: bookId,
					owned: field === 'owned',
					read: field === 'read',
					want_to_read: field === 'want_to_read',
				};

				// Optimistic
				const tempId = `temp-${Date.now()}`;
				const optimistic = { ...newEntry, id: tempId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as UserBook;
				setUserBooks((prev) => {
					const next = new Map(prev);
					next.set(bookId, optimistic);
					return next;
				});

				const { data } = await supabase.from('user_books').insert(newEntry).select().single();
				if (data) {
					setUserBooks((prev) => {
						const next = new Map(prev);
						next.set(bookId, data);
						return next;
					});
				}
			}
		},
		[userBooks],
	);

	return { userBooks, loading, refetch: fetchUserBooks, toggleShelf };
}
