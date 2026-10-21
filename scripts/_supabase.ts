/**
 * Shared Supabase credential resolution for catalog scripts.
 *
 * Default target is the local stack; `--production` reads creds from the
 * gitignored `.env.production` (same convention as scripts/seed.ts). Kept
 * separate so the export/restore scripts share one source of truth without
 * touching the frozen seed script.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
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

export function isLocal(url: string): boolean {
	return url.includes('127.0.0.1') || url.includes('localhost');
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
