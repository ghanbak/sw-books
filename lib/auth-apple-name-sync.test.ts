import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	signInWithIdToken: vi.fn(),
	getUser: vi.fn(),
	updateUser: vi.fn(),
	signInAsync: vi.fn(),
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
	signInAsync: mocks.signInAsync,
}));
vi.mock('expo-crypto', () => ({
	CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
	randomUUID: () => 'raw-nonce',
	digestStringAsync: async () => 'hashed-nonce',
}));
vi.mock('./supabase', () => ({
	supabase: {
		auth: {
			signInWithIdToken: mocks.signInWithIdToken,
			getUser: mocks.getUser,
			updateUser: mocks.updateUser,
		},
	},
}));

import { signInWithApple } from './auth';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.signInAsync.mockResolvedValue({
		identityToken: 'apple-token',
		fullName: { givenName: 'Luke', familyName: 'Skywalker' },
	});
	mocks.setItem.mockResolvedValue(undefined);
	mocks.removeItem.mockResolvedValue(undefined);
	mocks.getItem.mockResolvedValue('Luke Skywalker');
	mocks.signInWithIdToken.mockResolvedValue({ error: null });
	mocks.getUser.mockResolvedValue({ data: { user: { user_metadata: {} } } });
	mocks.updateUser.mockResolvedValue({ error: null });
});

describe('signInWithApple post-sign-in name sync', () => {
	it('resolves and keeps the pending name when AsyncStorage.getItem throws', async () => {
		mocks.getItem.mockRejectedValue(new Error('storage unavailable'));
		await expect(signInWithApple()).resolves.toBeUndefined();
		expect(mocks.signInWithIdToken).toHaveBeenCalledTimes(1);
		expect(mocks.removeItem).not.toHaveBeenCalled();
	});

	it('resolves and keeps the pending name when getUser throws', async () => {
		mocks.getUser.mockRejectedValue(new Error('offline'));
		await expect(signInWithApple()).resolves.toBeUndefined();
		expect(mocks.removeItem).not.toHaveBeenCalled();
	});

	it('still throws when signInWithIdToken returns an error', async () => {
		const error = new Error('invalid token');
		mocks.signInWithIdToken.mockResolvedValue({ error });
		await expect(signInWithApple()).rejects.toBe(error);
		expect(mocks.getItem).not.toHaveBeenCalled();
	});

	it('flushes the pending name on the happy path', async () => {
		await expect(signInWithApple()).resolves.toBeUndefined();
		expect(mocks.updateUser).toHaveBeenCalledWith({ data: { full_name: 'Luke Skywalker' } });
		expect(mocks.removeItem).toHaveBeenCalledWith('pendingAppleName');
	});
});
