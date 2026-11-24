import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	getUser: vi.fn(),
	updateUser: vi.fn(),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
	default: {
		getItem: mocks.getItem,
		setItem: mocks.setItem,
		removeItem: mocks.removeItem,
	},
}));
vi.mock('@react-native-google-signin/google-signin', () => ({ GoogleSignin: {} }));
vi.mock('expo-apple-authentication', () => ({
	AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
	signInAsync: vi.fn(),
}));
vi.mock('expo-crypto', () => ({
	CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
	randomUUID: () => 'raw-nonce',
	digestStringAsync: async () => 'hashed-nonce',
}));
vi.mock('./supabase', () => ({
	supabase: { auth: { getUser: mocks.getUser, updateUser: mocks.updateUser } },
}));

import { resolveInitialSession } from './auth';

const session = { access_token: 'token', user: { id: 'u1' } } as unknown as Session;

/** Mirrors AuthProvider's handler: whatever the helper resolves to, loading clears. */
async function launch(getSession: Parameters<typeof resolveInitialSession>[0]) {
	const state = { session: undefined as Session | null | undefined, loading: true };
	const initial = await resolveInitialSession(getSession);
	state.session = initial;
	state.loading = false;
	return state;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.clearAllMocks();
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	mocks.getItem.mockResolvedValue('Luke Skywalker');
	mocks.removeItem.mockResolvedValue(undefined);
	mocks.getUser.mockResolvedValue({ data: { user: { user_metadata: {} } } });
	mocks.updateUser.mockResolvedValue({ error: null });
});

afterEach(() => {
	warn.mockRestore();
});

describe('resolveInitialSession', () => {
	it('resolves null and clears loading when getSession rejects', async () => {
		const err = new Error('AsyncStorage: database or disk is full');
		const state = await launch(() => Promise.reject(err));
		expect(state.session).toBeNull();
		expect(state.loading).toBe(false);
		expect(warn).toHaveBeenCalledWith('[auth] getSession failed:', err);
		expect(mocks.getItem).not.toHaveBeenCalled();
	});

	it('returns the stored session and flushes the pending Apple name', async () => {
		const state = await launch(async () => ({ data: { session } }));
		expect(state.session).toBe(session);
		expect(state.loading).toBe(false);
		await vi.waitFor(() => {
			expect(mocks.updateUser).toHaveBeenCalledWith({ data: { full_name: 'Luke Skywalker' } });
		});
		expect(mocks.getItem).toHaveBeenCalledWith('pendingAppleName');
		expect(warn).not.toHaveBeenCalled();
	});

	it('returns null without flushing when no session is stored', async () => {
		const state = await launch(async () => ({ data: { session: null } }));
		expect(state.session).toBeNull();
		expect(state.loading).toBe(false);
		expect(mocks.getItem).not.toHaveBeenCalled();
	});
});

describe('AuthProvider wiring', () => {
	it('reads the launch session through resolveInitialSession', () => {
		const src = readFileSync(resolve(__dirname, 'auth.tsx'), 'utf8');
		const body = src.match(/export function AuthProvider\([\s\S]*?\n\}\n/)?.[0];
		expect(body).toBeDefined();
		expect(body).toMatch(
			/resolveInitialSession\(\s*\(\)\s*=>\s*supabase\.auth\.getSession\(\)\s*\)\s*\.then\(/,
		);
		expect(body).toMatch(/setLoading\(false\)/);
		expect(body).not.toMatch(/supabase\.auth\.getSession\(\)\s*\.then\(/);
	});
});
