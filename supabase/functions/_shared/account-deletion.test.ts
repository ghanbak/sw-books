import { describe, expect, it } from 'vitest';

import {
	APPLE_AUDIENCE,
	APPLE_CLIENT_SECRET_TTL_SECONDS,
	DELETE_ACCOUNT_ERROR_MESSAGES,
	MAX_TOKEN_AGE_SECONDS,
	appleRevokeBody,
	appleTokenExchangeBody,
	buildAppleClientSecretParts,
	decodeJwtPayload,
	deleteAccountErrorMessage,
	findAppleSubject,
	isAppleUser,
	isTokenFresh,
	parseAppleTokenResponse,
	parseDeleteRequest,
	pemToPkcs8,
	readAppleConfig,
	signAppleClientSecret,
} from './account-deletion';

const NOW = 1_800_000_000;
const CONFIG = {
	teamId: 'TEAM123456',
	keyId: 'KEY1234567',
	clientId: 'com.example.app',
};

function b64url(value: unknown) {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function fakeJwt(payload: unknown) {
	return `${b64url({ alg: 'none' })}.${b64url(payload)}.sig`;
}

async function generatePem() {
	const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify',
	]);
	const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
	const lines = pkcs8
		.toString('base64')
		.match(/.{1,64}/g)!
		.join('\n');
	return { pem: `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`, pair, pkcs8 };
}

describe('isTokenFresh', () => {
	it('accepts a token minted inside the window', () => {
		expect(isTokenFresh(NOW, NOW)).toBe(true);
		expect(isTokenFresh(NOW - MAX_TOKEN_AGE_SECONDS, NOW)).toBe(true);
	});

	it('rejects stale, far-future and missing iat', () => {
		expect(isTokenFresh(NOW - MAX_TOKEN_AGE_SECONDS - 1, NOW)).toBe(false);
		expect(isTokenFresh(NOW + 120, NOW)).toBe(false);
		expect(isTokenFresh(undefined, NOW)).toBe(false);
		expect(isTokenFresh('1800000000', NOW)).toBe(false);
		expect(isTokenFresh(Number.NaN, NOW)).toBe(false);
	});

	it('tolerates small clock skew', () => {
		expect(isTokenFresh(NOW + 30, NOW)).toBe(true);
	});
});

describe('parseDeleteRequest', () => {
	it('accepts an empty or code-less body', () => {
		expect(parseDeleteRequest(undefined)).toEqual({ ok: true });
		expect(parseDeleteRequest({})).toEqual({ ok: true });
		expect(parseDeleteRequest({ appleAuthorizationCode: '' })).toEqual({ ok: true });
	});

	it('returns the Apple code', () => {
		expect(parseDeleteRequest({ appleAuthorizationCode: 'c1a2.0.abc' })).toEqual({
			ok: true,
			appleAuthorizationCode: 'c1a2.0.abc',
		});
	});

	it('rejects malformed bodies', () => {
		for (const body of [
			'x',
			[],
			{ appleAuthorizationCode: 42 },
			{ appleAuthorizationCode: 'a b' },
			{ appleAuthorizationCode: 'a'.repeat(1025) },
		]) {
			expect(parseDeleteRequest(body)).toEqual({ ok: false, code: 'bad_request' });
		}
	});
});

describe('deleteAccountErrorMessage', () => {
	it('maps known codes and falls back for anything else', () => {
		expect(deleteAccountErrorMessage({ ok: false, code: 'reauth_required' })).toBe(
			DELETE_ACCOUNT_ERROR_MESSAGES.reauth_required,
		);
		expect(deleteAccountErrorMessage({ code: 'something raw' })).toBe(
			DELETE_ACCOUNT_ERROR_MESSAGES.unknown,
		);
		expect(deleteAccountErrorMessage(undefined)).toBe(DELETE_ACCOUNT_ERROR_MESSAGES.unknown);
	});
});

describe('Apple identity helpers', () => {
	const apple = { provider: 'apple', id: 'idfallback', identity_data: { sub: '001.abc.123' } };

	it('detects Apple via identities or app_metadata', () => {
		expect(isAppleUser({ identities: [apple] })).toBe(true);
		expect(isAppleUser({ app_metadata: { provider: 'apple' } })).toBe(true);
		expect(
			isAppleUser({ app_metadata: { provider: 'google', providers: ['google', 'apple'] } }),
		).toBe(true);
		expect(isAppleUser({ app_metadata: { provider: 'google', providers: ['google'] } })).toBe(
			false,
		);
		expect(isAppleUser(null)).toBe(false);
	});

	it('finds the Apple subject', () => {
		expect(findAppleSubject({ identities: [{ provider: 'google', id: 'g' }, apple] })).toBe(
			'001.abc.123',
		);
		expect(findAppleSubject({ identities: [{ provider: 'apple', id: 'only-id' }] })).toBe(
			'only-id',
		);
		expect(findAppleSubject({ identities: [{ provider: 'google', id: 'g' }] })).toBeUndefined();
	});
});

describe('readAppleConfig', () => {
	const env = {
		APPLE_TEAM_ID: CONFIG.teamId,
		APPLE_KEY_ID: CONFIG.keyId,
		APPLE_PRIVATE_KEY: 'pem',
		APPLE_CLIENT_ID: CONFIG.clientId,
	};

	it('returns the config when all secrets are set', () => {
		expect(readAppleConfig((k) => env[k as keyof typeof env])).toEqual({
			...CONFIG,
			privateKey: 'pem',
		});
	});

	it('returns null when any secret is missing or blank', () => {
		expect(
			readAppleConfig((k) => (k === 'APPLE_KEY_ID' ? undefined : env[k as keyof typeof env])),
		).toBeNull();
		expect(
			readAppleConfig((k) => (k === 'APPLE_CLIENT_ID' ? '  ' : env[k as keyof typeof env])),
		).toBeNull();
	});
});

describe('Apple client secret', () => {
	it('builds TN3194 claims', () => {
		expect(buildAppleClientSecretParts(CONFIG, NOW)).toEqual({
			header: { alg: 'ES256', kid: CONFIG.keyId, typ: 'JWT' },
			payload: {
				iss: CONFIG.teamId,
				iat: NOW,
				exp: NOW + APPLE_CLIENT_SECRET_TTL_SECONDS,
				aud: APPLE_AUDIENCE,
				sub: CONFIG.clientId,
			},
		});
	});

	it('parses PEM with real or escaped newlines', async () => {
		const { pem, pkcs8 } = await generatePem();
		expect(Buffer.from(pemToPkcs8(pem))).toEqual(pkcs8);
		expect(Buffer.from(pemToPkcs8(pem.replace(/\n/g, '\\n')))).toEqual(pkcs8);
		expect(() =>
			pemToPkcs8('-----BEGIN PRIVATE KEY-----\n!!\n-----END PRIVATE KEY-----'),
		).toThrow();
	});

	it('signs a verifiable ES256 JWT', async () => {
		const { pem, pair } = await generatePem();
		const jwt = await signAppleClientSecret({ ...CONFIG, privateKey: pem }, NOW);
		const [h, p, s] = jwt.split('.');

		expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({
			alg: 'ES256',
			kid: CONFIG.keyId,
			typ: 'JWT',
		});
		expect(decodeJwtPayload(jwt)).toMatchObject({ iss: CONFIG.teamId, sub: CONFIG.clientId });

		const signature = Buffer.from(s, 'base64url');
		expect(signature).toHaveLength(64); // raw r||s, not DER
		const valid = await crypto.subtle.verify(
			{ name: 'ECDSA', hash: 'SHA-256' },
			pair.publicKey,
			signature,
			new TextEncoder().encode(`${h}.${p}`),
		);
		expect(valid).toBe(true);
	});
});

describe('Apple request bodies', () => {
	const config = { ...CONFIG, privateKey: 'pem' };

	it('encodes the token exchange', () => {
		expect(Object.fromEntries(appleTokenExchangeBody(config, 'secret', 'code'))).toEqual({
			client_id: CONFIG.clientId,
			client_secret: 'secret',
			code: 'code',
			grant_type: 'authorization_code',
		});
	});

	it('encodes the revoke', () => {
		expect(Object.fromEntries(appleRevokeBody(config, 'secret', 'rt', 'refresh_token'))).toEqual({
			client_id: CONFIG.clientId,
			client_secret: 'secret',
			token: 'rt',
			token_type_hint: 'refresh_token',
		});
	});
});

describe('parseAppleTokenResponse', () => {
	const id_token = fakeJwt({ sub: '001.abc.123' });

	it('prefers the refresh token and reads the subject', () => {
		expect(parseAppleTokenResponse({ refresh_token: 'rt', access_token: 'at', id_token })).toEqual({
			token: 'rt',
			tokenTypeHint: 'refresh_token',
			subject: '001.abc.123',
		});
	});

	it('falls back to the access token', () => {
		expect(parseAppleTokenResponse({ access_token: 'at' })).toEqual({
			token: 'at',
			tokenTypeHint: 'access_token',
			subject: undefined,
		});
	});

	it('returns undefined without a token', () => {
		expect(parseAppleTokenResponse({ id_token })).toBeUndefined();
		expect(parseAppleTokenResponse(null)).toBeUndefined();
	});

	it('tolerates a garbage id_token', () => {
		expect(decodeJwtPayload('not-a-jwt')).toBeUndefined();
		expect(decodeJwtPayload('a.!!!.c')).toBeUndefined();
	});
});
