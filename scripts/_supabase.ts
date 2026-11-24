/**
 * Shared Supabase credential resolution for catalog scripts.
 *
 * Default target is the local stack; `--production` reads creds from the
 * gitignored `.env.production`. Kept separate so the export/restore scripts
 * share one source of truth without touching the frozen, local-only seed script.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { isLocalUrl } from '../lib/seed-guard';
import type { Database } from '../lib/types';

function parseEnvFile(path: string): Record<string, string> {
	const out: Record<string, string> = {};
	try {
		for (const line of readFileSync(path, 'utf-8').split('\n')) {
			const t = line.trim();
			if (!t || t.startsWith('#')) continue;
			const i = t.indexOf('=');
			if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
		}
	} catch {
		// file absent — fall through
	}
	return out;
}

/** The gitignored `.env.production` as a key → value map (empty when absent). */
export function productionEnv(): Record<string, string> {
	return parseEnvFile(resolve(__dirname, '..', '.env.production'));
}

/** Exact-hostname local check (lib/seed-guard.ts); unparseable URLs count as non-local. */
export function isLocal(url: string): boolean {
	return isLocalUrl(url);
}

export function resolveCredentials(prod: boolean): { url: string; key: string } {
	if (prod) {
		const env = parseEnvFile(resolve(__dirname, '..', '.env.production'));
		const url = env.SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
		const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
		if (!url || !key) {
			console.error(
				'Error: --production needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.production.',
			);
			process.exit(1);
		}
		return { url, key };
	}
	const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? '';
	if (!key) {
		console.error(
			'Error: SUPABASE_SERVICE_ROLE_KEY not set.\n' +
				'For local dev: supabase status, then SUPABASE_SERVICE_ROLE_KEY=<secret> npm run <script>.',
		);
		process.exit(1);
	}
	return { url, key };
}

export function makeClient(prod: boolean): SupabaseClient<Database> {
	const { url, key } = resolveCredentials(prod);
	return createClient<Database>(url, key, { auth: { persistSession: false } });
}

/**
 * PostgREST truncates an unranged response at `max_rows` (1000 locally, see
 * supabase/config.toml, and the hosted default) with no error. Keep this at or below
 * `max_rows`: a lower server cap would end the loop early on a short page.
 */
export const BOOKS_PAGE_SIZE = 1000;

type BooksClient = Pick<SupabaseClient<Database>, 'from'>;

export type FetchAllBooksOptions = {
	/** PostgREST column list; default `*`. */
	columns?: string;
	/** Sort columns, ascending. `slug` (unique) is appended as the tiebreaker so paging is stable. */
	orderBy?: string[];
	/** Columns that must be non-null (`.not(col, 'is', null)`). */
	notNull?: string[];
};

/**
 * Every `books` row, read in `.range()` pages until a short page. Rejects on any page
 * error, so a caller never sees a partial catalog.
 */
export async function fetchAllBooks<T = Record<string, unknown>>(
	client: BooksClient,
	{ columns = '*', orderBy = [], notNull = [] }: FetchAllBooksOptions = {},
): Promise<T[]> {
	const order = orderBy.includes('slug') ? orderBy : [...orderBy, 'slug'];
	const out: T[] = [];
	for (let from = 0; ; from += BOOKS_PAGE_SIZE) {
		const to = from + BOOKS_PAGE_SIZE - 1;
		let q = client.from('books').select(columns);
		for (const col of notNull) q = q.not(col, 'is', null);
		for (const col of order) q = q.order(col);
		const { data, error } = await q.range(from, to);
		if (error) throw new Error(`books read failed (rows ${from}–${to}): ${error.message}`);
		const page = (data ?? []) as unknown as T[];
		for (const row of page) out.push(row);
		if (page.length < BOOKS_PAGE_SIZE) return out;
	}
}

/** Exact `books` row count (`count: 'exact', head: true`), unaffected by `max_rows`. */
export async function countBooks(client: BooksClient): Promise<number> {
	const { count, error } = await client.from('books').select('*', { count: 'exact', head: true });
	if (error) throw new Error(`books count failed: ${error.message}`);
	if (count == null) throw new Error('books count failed: no count returned');
	return count;
}

/** Refusal message when a backup is stale or its row count differs from the live count; null when OK. */
export function backupRefusal(b: {
	ageMs: number;
	rows: number;
	liveCount: number;
	maxAgeMs: number;
}): string | null {
	if (b.ageMs <= b.maxAgeMs && b.rows === b.liveCount) return null;
	return `Refusing: backup not fresh/complete (age ${Math.round(b.ageMs / 1000)}s, ${b.rows} rows vs ${b.liveCount} live) — no changes written.`;
}
