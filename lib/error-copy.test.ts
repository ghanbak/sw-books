import { describe, expect, it } from 'vitest';

import {
	ADD_FAILED_COPY,
	CONNECTIVITY_ERROR_COPY,
	GENERIC_ERROR_COPY,
	addFailureCopy,
	errorCopy,
} from '@/lib/error-copy';
import { classifyShelfWriteError } from '@/lib/shelf';

/** What a screen shows for a supabase-js `{ error, status }` (the hooks' composition). */
const shown = (error: { code?: string | null; message?: string | null }, status?: number) =>
	errorCopy(classifyShelfWriteError(error, status));

describe('errorCopy', () => {
	it('maps connectivity to the connection copy', () => {
		expect(errorCopy('connectivity')).toBe('Check your connection and try again.');
		expect(CONNECTIVITY_ERROR_COPY).toBe('Check your connection and try again.');
	});

	it.each(['retryable', 'auth', 'rejected'] as const)('maps %s to the generic copy', (failure) => {
		expect(errorCopy(failure)).toBe(GENERIC_ERROR_COPY);
	});
});

describe('screen copy for supabase-js errors (#393)', () => {
	it.each([
		['RN fetch failure (status 0)', { message: 'TypeError: Network request failed' }, 0],
		['Node fetch failure (status 0)', { message: 'TypeError: fetch failed' }, 0],
		['thrown fetch, no status', { message: 'TypeError: Network request failed' }, undefined],
		['gateway timeout', { message: '<html>504</html>' }, 504],
	])('%s reads as connectivity', (_label, error, status) => {
		expect(shown(error, status)).toBe(CONNECTIVITY_ERROR_COPY);
	});

	it.each([
		[
			'RLS rejection',
			{
				code: '42501',
				message: 'new row violates row-level security policy for table "user_books"',
			},
			403,
		],
		['expired JWT', { code: 'PGRST301', message: 'JWT expired' }, 401],
		['server error', { code: 'XX000', message: 'relation "books" does not exist' }, 500],
	])('%s gets generic copy with no Postgres text', (_label, error, status) => {
		const text = shown(error, status);
		expect(text).toBe(GENERIC_ERROR_COPY);
		expect(text).not.toContain(error.message);
		expect(text).not.toMatch(/user_books|books"|policy|JWT/);
	});
});

describe('addFailureCopy', () => {
	it('keeps the app-authored sign-in prompt', () => {
		expect(
			addFailureCopy({ code: 'not_signed_in', message: 'Sign in to add books to your shelf.' }),
		).toBe('Sign in to add books to your shelf.');
	});

	it.each(['add_failed', 'add_offline', 'no_provider'])('%s gets the shelf-scan copy', (code) => {
		const copy = addFailureCopy({ code, message: 'TypeError: Network request failed' });
		expect(copy).toBe(ADD_FAILED_COPY);
		expect(copy).toBe("Couldn't save — check your connection and try again.");
	});
});
