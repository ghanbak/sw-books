import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * PostgREST truncates an unranged response at `max_rows` (1000 locally, see
 * supabase/config.toml, and the hosted default) with no error. Keep this at or below
 * `max_rows`: a lower server cap would end the loop early on a short page.
 * Mirrors `BOOKS_PAGE_SIZE` in scripts/_supabase.ts (the app can't import scripts/).
 */
export const PAGE_SIZE = 1000;

type PageResponse<T, E> = { data: T[] | null; error: E | null };

/** A query with a deterministic order, awaiting only once `.range()` is applied. */
export type RangeableQuery<T, E> = {
	range(from: number, to: number): PromiseLike<PageResponse<T, E>>;
};

export type AllPagesResult<T, E> = { data: T[]; error: null } | { data: null; error: E };

/**
 * Every row of `buildQuery()`, read in `.range()` pages until a short page. On any page
 * error, resolves `{ data: null, error }` with that page's error unchanged, so a caller
 * never sees a partial result. `buildQuery` must order by a unique key, or rows can repeat
 * or drop across page boundaries.
 */
export async function fetchAllPages<T, E>(
	buildQuery: () => RangeableQuery<T, E>,
	pageSize: number = PAGE_SIZE,
): Promise<AllPagesResult<T, E>> {
	const out: T[] = [];
	for (let from = 0; ; from += pageSize) {
		const { data, error } = await buildQuery().range(from, from + pageSize - 1);
		if (error) return { data: null, error };
		const page = data ?? [];
		for (const row of page) out.push(row);
		if (page.length < pageSize) return { data: out, error: null };
	}
}

type BooksClient = Pick<SupabaseClient<Database>, 'from'>;

/**
 * The full `books` catalog in timeline order. `slug` (UNIQUE NOT NULL) breaks
 * `timeline_order` ties so pages are stable; it matches scripts' `fetchAllBooks`.
 */
export function fetchAllCatalogBooks(client: BooksClient) {
	return fetchAllPages(() =>
		client
			.from('books')
			.select('*')
			.order('timeline_order', { ascending: true })
			.order('slug', { ascending: true }),
	);
}
