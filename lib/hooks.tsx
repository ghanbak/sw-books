import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from 'react';
import { useAuth } from './auth';
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

type UserBooksContextValue = {
	userBooks: Map<string, UserBook>;
	loading: boolean;
	refetch: () => Promise<void>;
	toggleShelf: (bookId: string, field: 'owned' | 'read' | 'want_to_read') => Promise<void>;
};

const UserBooksContext = createContext<UserBooksContextValue>({
	userBooks: new Map(),
	loading: true,
	refetch: async () => {},
	toggleShelf: async () => {},
});

/**
 * Provides the current user's shelf entries to the app. Single source of truth —
 * any screen that toggles a shelf updates this state and every other screen sees it.
 *
 * Refetches when the auth user changes (sign-in, sign-out, account switch).
 */
export function UserBooksProvider({ children }: { children: ReactNode }) {
	const { user } = useAuth();
	const [userBooks, setUserBooks] = useState<Map<string, UserBook>>(new Map());
	const [loading, setLoading] = useState(true);

	const fetchUserBooks = useCallback(async () => {
		setLoading(true);
		const { data, error } = await supabase.from('user_books').select('*');
		if (error) {
			console.warn('[user_books] fetch failed:', error.message);
			setLoading(false);
			return;
		}
		const map = new Map<string, UserBook>();
		for (const ub of data ?? []) {
			map.set(ub.book_id, ub);
		}
		setUserBooks(map);
		setLoading(false);
	}, []);

	useEffect(() => {
		if (user) {
			fetchUserBooks();
		} else {
			setUserBooks(new Map());
			setLoading(false);
		}
	}, [user, fetchUserBooks]);

	const toggleShelf = useCallback(
		async (bookId: string, field: 'owned' | 'read' | 'want_to_read') => {
			if (!user) return;

			const existing = userBooks.get(bookId);

			if (existing) {
				const newValue = !existing[field];
				const updated = { ...existing, [field]: newValue };
				const allOff = !updated.owned && !updated.read && !updated.want_to_read;

				// Optimistic update
				setUserBooks((prev) => {
					const next = new Map(prev);
					if (allOff) {
						next.delete(bookId);
					} else {
						next.set(bookId, updated);
					}
					return next;
				});

				const updatePayload =
					field === 'owned'
						? { owned: newValue }
						: field === 'read'
							? { read: newValue }
							: { want_to_read: newValue };

				const { error } = allOff
					? await supabase.from('user_books').delete().eq('id', existing.id)
					: await supabase.from('user_books').update(updatePayload).eq('id', existing.id);

				if (error) {
					console.warn('[user_books] toggle failed, reverting:', error.message);
					setUserBooks((prev) => {
						const next = new Map(prev);
						next.set(bookId, existing);
						return next;
					});
				}
			} else {
				const newEntry = {
					user_id: user.id,
					book_id: bookId,
					owned: field === 'owned',
					read: field === 'read',
					want_to_read: field === 'want_to_read',
				};

				const { data, error } = await supabase
					.from('user_books')
					.insert(newEntry)
					.select()
					.single();

				if (error) {
					console.warn('[user_books] insert failed:', error.message);
					return;
				}
				if (data) {
					setUserBooks((prev) => {
						const next = new Map(prev);
						next.set(bookId, data);
						return next;
					});
				}
			}
		},
		[user, userBooks],
	);

	return (
		<UserBooksContext.Provider value={{ userBooks, loading, refetch: fetchUserBooks, toggleShelf }}>
			{children}
		</UserBooksContext.Provider>
	);
}

/**
 * Read the current user's shelf entries.
 * Map of bookId -> UserBook for quick lookup. Shared across all screens.
 */
export function useUserBooks() {
	return useContext(UserBooksContext);
}
