import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INVALID_CREDENTIALS_COPY, authErrorCopy, reportAuthError } from './auth-error-copy';
import { CONNECTIVITY_ERROR_COPY, GENERIC_ERROR_COPY } from './error-copy';

// #398: sign-in and sign-out alerts never show a supabase-js / GoTrue `error.message`.
const invalidCredentials = () =>
	new AuthApiError('Invalid login credentials', 400, 'invalid_credentials');
const offline = () => new AuthRetryableFetchError('Network request failed', 0);
const gateway = () => new AuthRetryableFetchError('Bad Gateway', 502);
const networkTypeError = () => new TypeError('Network request failed');
const serverError = () => new AuthApiError('relation "auth.users" does not exist', 500, undefined);

describe('authErrorCopy', () => {
	it('maps invalid_credentials to the credentials copy', () => {
		expect(authErrorCopy(invalidCredentials())).toBe(INVALID_CREDENTIALS_COPY);
	});

	it('maps network failures to the connectivity copy', () => {
		expect(authErrorCopy(offline())).toBe(CONNECTIVITY_ERROR_COPY);
		expect(authErrorCopy(gateway())).toBe(CONNECTIVITY_ERROR_COPY);
		expect(authErrorCopy(networkTypeError())).toBe(CONNECTIVITY_ERROR_COPY);
	});

	it('falls back to the generic copy for anything else', () => {
		expect(authErrorCopy(serverError())).toBe(GENERIC_ERROR_COPY);
		expect(authErrorCopy(new Error('Google did not return an ID token.'))).toBe(GENERIC_ERROR_COPY);
		expect(authErrorCopy('weird')).toBe(GENERIC_ERROR_COPY);
		expect(authErrorCopy(null)).toBe(GENERIC_ERROR_COPY);
	});

	it('never returns the raw message', () => {
		for (const e of [invalidCredentials(), offline(), networkTypeError(), serverError()]) {
			expect(authErrorCopy(e)).not.toBe(e.message);
		}
	});
});

describe('reportAuthError', () => {
	let warn: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => {
		warn.mockRestore();
	});

	it('sign-in with invalid credentials: friendly copy shown, raw text only in console.warn', () => {
		expect(reportAuthError('Google sign-in', invalidCredentials())).toBe(INVALID_CREDENTIALS_COPY);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith('[auth] Google sign-in failed:', 'Invalid login credentials');
	});

	it('sign-in with a network TypeError: connectivity copy, raw text in console.warn', () => {
		expect(reportAuthError('Apple sign-in', networkTypeError())).toBe(CONNECTIVITY_ERROR_COPY);
		expect(warn).toHaveBeenCalledWith('[auth] Apple sign-in failed:', 'Network request failed');
	});

	it('sign-out failure: generic copy, raw text in console.warn', () => {
		expect(reportAuthError('sign-out', new Error('storage unavailable'))).toBe(GENERIC_ERROR_COPY);
		expect(warn).toHaveBeenCalledWith('[auth] sign-out failed:', 'storage unavailable');
	});

	it('logs non-Error throws as text', () => {
		expect(reportAuthError('sign-out', 'boom')).toBe(GENERIC_ERROR_COPY);
		expect(warn).toHaveBeenCalledWith('[auth] sign-out failed:', 'boom');
	});
});

describe('auth error copy wiring', () => {
	const source = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');
	const profile = source('app/profile.tsx');
	const login = source('app/(auth)/login.tsx');
	const importsHelper =
		/import\s*\{[^}]*\breportAuthError\b[^}]*\}\s*from\s*'@\/lib\/auth-error-copy'/;

	it('profile sign-out alerts with mapped copy', () => {
		expect(profile).toMatch(importsHelper);
		expect(profile).toMatch(
			/Alert\.alert\(\s*'Sign-out failed',\s*reportAuthError\(\s*'sign-out',\s*error\s*\)\s*\)/,
		);
		expect(profile).not.toMatch(/'Sign-out failed',\s*error\.message/);
	});

	it('login alerts with mapped copy for Google and Apple', () => {
		expect(login).toMatch(importsHelper);
		expect(login).toMatch(
			/Alert\.alert\(\s*'Google sign-in failed',\s*reportAuthError\(\s*'Google sign-in',\s*error\s*\)\s*\)/,
		);
		expect(login).toMatch(
			/Alert\.alert\(\s*'Apple sign-in failed',\s*reportAuthError\(\s*'Apple sign-in',\s*error\s*\)\s*\)/,
		);
		expect(login).not.toMatch(/error\.message/);
		expect(login).not.toMatch(/errorMessage\(/);
	});

	it('login keeps a cancelled Apple sign-in silent', () => {
		expect(login).toMatch(/if\s*\(\s*isAppleCancellation\(\s*error\s*\)\s*\)\s*return;/);
	});
});
