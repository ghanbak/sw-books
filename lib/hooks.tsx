import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from 'react';
import { useAuth } from './auth';
import { type Result, err, ok } from './result';
import { applyOwnedOptimistic, mergeServerRows } from './shelf';
import { supabase } from './supabase';
import type { Database } from './types';

export type Book = Database['public']['Tables']['books']['Row'];
export type UserBook = Database['public']['Tables']['user_books']['Row'];

type BooksContextValue = {
	books: Book[];
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
};

const BooksContext = createContext<BooksContextValue>({
	books: [],
	loading: true,
	error: null,
	refetch: async () => {},
});

/**
 * Fetches the catalog once and shares it across every screen. Without this,
 * each consumer of useBooks() would refetch the whole catalog on mount.
 */
export function BooksProvider({ children }: { children: ReactNode }) {
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

	return (
		<BooksContext.Provider value={{ books, loading, error, refetch: fetchBooks }}>
			{children}
		</BooksContext.Provider>
	);
}

export function useBooks() {
	return useContext(BooksContext);
}

type UserBooksContextValue = {
	userBooks: Map<string, UserBook>;
	loading: boolean;
	refetch: () => Promise<void>;
	toggleShelf: (bookId: string, field: 'owned' | 'read' | 'want_to_read') => Promise<void>;
	addOwned: (bookIds: string[]) => Promise<Result<{ rows: UserBook[] }>>;
};

const UserBooksContext = createContext<UserBooksContextValue>({
	userBooks: new Map(),
	loading: true,
	refetch: async () => {},
	toggleShelf: async () => {},
	addOwned: async () => err({ code: 'no_provider', message: 'UserBooksProvider missing' }),
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

	// Mirror of userBooks for reads inside toggleShelf without re-creating the
	// callback on every shelf change (which would invalidate every memoized consumer).
	const userBooksRef = useRef(userBooks);
	userBooksRef.current = userBooks;

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

			const existing = userBooksRef.current.get(bookId);

			if (existing) {
				const newValue = !existing[field];
				const updated = { ...existing, [field]: newValue };
				const allOff = !updated.owned && !updated.read && !updated.want_to_read;

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
		[user],
	);

	/**
	 * Batch-adds books to the owned shelf via the `add_owned_books` RPC (one round-trip,
	 * atomic). The flag-merge is server-side — the RPC sets only `owned`, so a stale
	 * local Map can never clobber `read`/`want_to_read` toggled elsewhere. Optimistic:
	 * flips the Map immediately, replaces affected entries with the returned rows, and
	 * restores the pre-call snapshot if the RPC fails.
	 *
	 * Callers in the signed-out→sign-in-at-Add flow must wait until the post-sign-in
	 * `fetchUserBooks` has completed (not just the sign-in promise) — `addOwned` no-ops
	 * with an error before `user` propagates.
	 */
	const addOwned = useCallback(
		async (bookIds: string[]): Promise<Result<{ rows: UserBook[] }>> => {
			if (!user) {
				return err({ code: 'not_signed_in', message: 'Sign in to add books to your shelf.' });
			}
			// Dedupe defensively: duplicate ids inside ONE statement make Postgres reject
			// the whole insert ("ON CONFLICT DO UPDATE command cannot affect row a second
			// time") — idempotency only protects across calls, not within one.
			const ids = [...new Set(bookIds)];
			if (ids.length === 0) return ok({ rows: [] });

			// Snapshot BEFORE the optimistic flip — the whole-batch revert target.
			const snapshot = userBooksRef.current;
			setUserBooks(applyOwnedOptimistic(snapshot, ids, user.id));

			const { data, error } = await supabase.rpc('add_owned_books', { book_ids: ids });

			if (error) {
				console.warn('[user_books] addOwned failed, reverting:', error.message);
				setUserBooks(snapshot);
				return err({ code: 'add_failed', message: error.message });
			}

			const rows = data ?? [];
			setUserBooks((prev) => mergeServerRows(prev, rows));
			return ok({ rows });
		},
		[user],
	);

	return (
		<UserBooksContext.Provider
			value={{ userBooks, loading, refetch: fetchUserBooks, toggleShelf, addOwned }}
		>
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
