import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { Alert } from 'react-native';
import { useAuth } from './auth';
import { type Result, err } from './result';
import {
	type ShelfField,
	createOwnedAdder,
	createShelfToggler,
	createShelfWriteScope,
	createShelfWriter,
	isFetchCurrent,
	mergeFetchedShelf,
	setShelfRow,
} from './shelf';
import { supabase } from './supabase';
import type { Database } from './types';
import { type Enrichment, parseEnrichment } from './wookieepedia/enrichment';

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
	error: string | null;
	refetch: () => Promise<void>;
	toggleShelf: (bookId: string, field: ShelfField) => Promise<void>;
	addOwned: (bookIds: string[]) => Promise<Result<{ rows: UserBook[] }>>;
};

const UserBooksContext = createContext<UserBooksContextValue>({
	userBooks: new Map(),
	loading: true,
	error: null,
	refetch: async () => {},
	toggleShelf: async () => {},
	addOwned: async () => err({ code: 'no_provider', message: 'UserBooksProvider missing' }),
});

/**
 * Provides the current user's shelf entries to the app. Single source of truth —
 * any screen that toggles a shelf updates this state and every other screen sees it.
 *
 * Refetches when the signed-in user id changes (sign-in, sign-out, account switch) —
 * not on token refresh, which hands out a new `user` object for the same id.
 */
export function UserBooksProvider({ children }: { children: ReactNode }) {
	const { user } = useAuth();
	const userId = user?.id ?? null;
	const [userBooks, setUserBooks] = useState<Map<string, UserBook>>(new Map());
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Mirror of userBooks for reads inside toggleShelf without re-creating the
	// callback on every shelf change (which would invalidate every memoized consumer).
	const userBooksRef = useRef(userBooks);
	userBooksRef.current = userBooks;
	// Read after an await to drop results that belong to a signed-out/switched user.
	const userIdRef = useRef(userId);
	userIdRef.current = userId;

	// Pending writes (toggles + addOwned), shared so they guard each other and so a
	// refetch knows which books changed locally while it was in flight. One tracker
	// per user: a write still pending for the previous user can't shadow this one's rows.
	const [writesFor] = useState(createShelfWriteScope);
	const writes = writesFor(userId);
	const latestFetchRef = useRef(0);

	const fetchUserBooks = useCallback(async () => {
		const requestUserId = userIdRef.current;
		if (!requestUserId) return;
		const requestId = ++latestFetchRef.current;
		const startSeq = writes.seq();
		setLoading(true);
		setError(null);
		const { data, error: fetchError } = await supabase.from('user_books').select('*');
		const current = isFetchCurrent({
			requestId,
			latestRequestId: latestFetchRef.current,
			requestUserId,
			currentUserId: userIdRef.current,
		});
		// A newer fetch or the user change owns `userBooks` and `loading` now.
		if (!current) return;
		if (fetchError) {
			console.warn('[user_books] fetch failed:', fetchError.message);
			setError(fetchError.message);
			setLoading(false);
			return;
		}
		const rows = data ?? [];
		writes.adoptFetched(rows); // rollback target for writes still pending (#146)
		setUserBooks((prev) =>
			mergeFetchedShelf(rows, prev, (bookId) => writes.touchedSince(bookId, startSeq)),
		);
		setLoading(false);
	}, [writes]);

	useEffect(() => {
		if (userId) {
			fetchUserBooks();
		} else {
			latestFetchRef.current += 1; // invalidate any fetch still in flight
			userBooksRef.current = new Map();
			setUserBooks(userBooksRef.current);
			setError(null);
			setLoading(false);
		}
	}, [userId, fetchUserBooks]);

	// One toggler per provider: holds the per-book in-flight guard (see createShelfToggler).
	// `get`/`set` go through the ref so a write is visible to the next tap before React
	// re-renders; `set` also updates state functionally so concurrent addOwned merges survive.
	const toggler = useMemo(
		() =>
			createShelfToggler({
				get: (bookId) => userBooksRef.current.get(bookId),
				set: (bookId, row) => {
					userBooksRef.current = setShelfRow(userBooksRef.current, bookId, row);
					setUserBooks((prev) => setShelfRow(prev, bookId, row));
				},
				write: createShelfWriter({
					insert: async (entry) =>
						await supabase.from('user_books').insert(entry).select().single(),
					update: async (id, patch) =>
						await supabase.from('user_books').update(patch).eq('id', id).select('id'),
					remove: async (id) => await supabase.from('user_books').delete().eq('id', id),
				}),
				readRow: async (uid, bookId) => {
					const { data, error } = await supabase
						.from('user_books')
						.select('*')
						.eq('user_id', uid)
						.eq('book_id', bookId)
						.maybeSingle();
					if (error) console.warn('[user_books] re-read failed:', error.message);
					return { row: data, error };
				},
				onError: (error) => {
					console.warn('[user_books] toggle failed, reverted:', error.message);
					Alert.alert('Couldn’t update shelf', 'Your change wasn’t saved. Try again.');
				},
				writes,
				isCurrentUser: (id) => userIdRef.current === id,
			}),
		[writes],
	);

	const toggleShelf = useCallback(
		async (bookId: string, field: ShelfField) => {
			if (!userId) return;
			await toggler(bookId, field, userId);
		},
		[userId, toggler],
	);

	const adder = useMemo(
		() =>
			createOwnedAdder({
				current: () => userBooksRef.current,
				update: (fn) => {
					userBooksRef.current = fn(userBooksRef.current);
					setUserBooks((prev) => fn(prev));
				},
				rpc: async (ids) => {
					const { data, error } = await supabase.rpc('add_owned_books', { book_ids: ids });
					if (error) console.warn('[user_books] addOwned failed, reverting:', error.message);
					return { rows: data, error };
				},
				writes,
				isCurrentUser: (id) => userIdRef.current === id,
			}),
		[writes],
	);

	/**
	 * Batch-adds books to the owned shelf via the `add_owned_books` RPC (one round-trip,
	 * atomic). The flag-merge is server-side — the RPC sets only `owned`, so a stale
	 * local Map can never clobber `read`/`want_to_read` toggled elsewhere. Optimistic:
	 * flips the Map immediately, replaces affected entries with the returned rows, and
	 * reverts only the batch's own books if the RPC fails (see createOwnedAdder).
	 *
	 * Callers in the signed-out→sign-in-at-Add flow must wait until the post-sign-in
	 * `fetchUserBooks` has completed (not just the sign-in promise) — `addOwned` no-ops
	 * with an error before `user` propagates.
	 */
	const addOwned = useCallback(
		async (bookIds: string[]): Promise<Result<{ rows: UserBook[] }>> => {
			if (!userId) {
				return err({ code: 'not_signed_in', message: 'Sign in to add books to your shelf.' });
			}
			return adder(bookIds, userId);
		},
		[userId, adder],
	);

	return (
		<UserBooksContext.Provider
			value={{ userBooks, loading, error, refetch: fetchUserBooks, toggleShelf, addOwned }}
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

// --- Book enrichment (Wookieepedia) ---------------------------------------------

/** Columns `parseEnrichment` reads. Never embedded in the catalog query (rows reach ~110 KB). */
const ENRICHMENT_COLUMNS =
	'book_id, source_pageid, source_title, source_url, source_revision_id, license, attribution, fetched_at, timeline_notes, appearances';

/** bookId → narrowed enrichment (null = the book has no row). Successful fetches only. */
const enrichmentCache = new Map<string, Enrichment | null>();
const enrichmentInflight = new Map<string, Promise<Enrichment | null>>();

function fetchBookEnrichment(bookId: string): Promise<Enrichment | null> {
	const pending = enrichmentInflight.get(bookId);
	if (pending) return pending;
	const request = (async () => {
		const { data, error } = await supabase
			.from('book_enrichment')
			.select(ENRICHMENT_COLUMNS)
			.eq('book_id', bookId)
			.maybeSingle();
		if (error) throw new Error(error.message);
		const enrichment = data ? parseEnrichment(data) : null;
		enrichmentCache.set(bookId, enrichment);
		return enrichment;
	})().finally(() => {
		enrichmentInflight.delete(bookId);
	});
	enrichmentInflight.set(bookId, request);
	return request;
}

export type BookEnrichmentStatus = 'loading' | 'ready' | 'error';

type BookEnrichmentState = {
	bookId: string | undefined;
	status: BookEnrichmentStatus;
	enrichment: Enrichment | null;
	/** True when the value came from the module cache on mount (skip the fade-in). */
	fromCache: boolean;
};

function stateFromCache(bookId: string | undefined): BookEnrichmentState {
	if (bookId !== undefined && enrichmentCache.has(bookId)) {
		return {
			bookId,
			status: 'ready',
			enrichment: enrichmentCache.get(bookId) ?? null,
			fromCache: true,
		};
	}
	return { bookId, status: 'loading', enrichment: null, fromCache: false };
}

/**
 * A book's `book_enrichment` row, narrowed through `parseEnrichment`. Module-level cache:
 * the Characters sheet reuses what the detail screen fetched. Errors aren't cached, so the
 * next mount (or `retry`) refetches.
 */
export function useBookEnrichment(bookId: string | undefined) {
	const [state, setState] = useState<BookEnrichmentState>(() => stateFromCache(bookId));
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		// `attempt` re-runs the fetch on retry.
		void attempt;
		if (bookId === undefined) return;
		if (enrichmentCache.has(bookId)) {
			setState((prev) =>
				prev.bookId === bookId && prev.status === 'ready' ? prev : stateFromCache(bookId),
			);
			return;
		}
		let alive = true;
		setState((prev) =>
			prev.bookId === bookId && prev.status === 'loading'
				? prev
				: { bookId, status: 'loading', enrichment: null, fromCache: false },
		);
		fetchBookEnrichment(bookId).then(
			(enrichment) => {
				if (alive) setState({ bookId, status: 'ready', enrichment, fromCache: false });
			},
			(e: unknown) => {
				console.warn('[book_enrichment] fetch failed:', e instanceof Error ? e.message : e);
				if (alive) setState({ bookId, status: 'error', enrichment: null, fromCache: false });
			},
		);
		return () => {
			alive = false;
		};
	}, [bookId, attempt]);

	const retry = useCallback(() => setAttempt((n) => n + 1), []);
	// A bookId change renders once before the effect runs: answer from the cache meanwhile.
	const current = state.bookId === bookId ? state : stateFromCache(bookId);
	return {
		status: current.status,
		enrichment: current.enrichment,
		fromCache: current.fromCache,
		retry,
	};
}
