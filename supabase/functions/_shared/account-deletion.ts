/**
 * Pure account-deletion logic shared by the `delete-account` Edge Function (Deno) and
 * the app (`lib/account.ts`). No imports and no runtime-specific globals beyond Web
 * Crypto, so it runs under Deno, Hermes-free Node (Vitest) and Metro alike.
 */

/** Error codes the function returns. Generic on purpose: no raw upstream messages. */
export type DeleteAccountErrorCode =
	| 'method_not_allowed'
	| 'unauthorized'
	| 'reauth_required'
	| 'bad_request'
	| 'delete_failed';

export type DeleteAccountResponse =
	| { ok: true; appleRevoked: boolean }
	| { ok: false; code: DeleteAccountErrorCode };

export const DELETE_ACCOUNT_STATUS: Record<DeleteAccountErrorCode, number> = {
	method_not_allowed: 405,
	unauthorized: 401,
	reauth_required: 401,
	bad_request: 400,
	delete_failed: 500,
};

/** User-safe copy for each code (shown by the app). */
export const DELETE_ACCOUNT_ERROR_MESSAGES: Record<DeleteAccountErrorCode | 'unknown', string> = {
	method_not_allowed: 'Your account could not be deleted. Update the app and try again.',
	unauthorized: 'Your session has expired. Sign in again, then delete your account.',
	reauth_required: 'Please sign in again, then delete your account.',
	bad_request: 'Your account could not be deleted. Update the app and try again.',
	delete_failed: 'Your account could not be deleted. Try again in a moment.',
	unknown: 'Your account could not be deleted. Check your connection and try again.',
};

const ERROR_CODES = new Set<string>(Object.keys(DELETE_ACCOUNT_STATUS));

export function isDeleteAccountErrorCode(value: unknown): value is DeleteAccountErrorCode {
	return typeof value === 'string' && ERROR_CODES.has(value);
}

/** Map any function response body (or nothing) to the user-safe message. */
export function deleteAccountErrorMessage(body: unknown): string {
	const code =
		body && typeof body === 'object' ? (body as { code?: unknown }).code : (undefined as unknown);
	return DELETE_ACCOUNT_ERROR_MESSAGES[isDeleteAccountErrorCode(code) ? code : 'unknown'];
}

// --- Re-auth guard -----------------------------------------------------------------

/**
 * The access token must have been minted within this window. The app refreshes its
 * session immediately before calling, which needs the refresh token, so a leaked
 * access token alone (valid up to the JWT expiry, 1h by default) can't delete the account.
 */
export const MAX_TOKEN_AGE_SECONDS = 10 * 60;
/** Tolerate small clock drift between Auth and the function host. */
export const CLOCK_SKEW_SECONDS = 60;

export function isTokenFresh(iat: unknown, nowSeconds: number): boolean {
	if (typeof iat !== 'number' || !Number.isFinite(iat)) return false;
	if (iat > nowSeconds + CLOCK_SKEW_SECONDS) return false;
	return nowSeconds - iat <= MAX_TOKEN_AGE_SECONDS;
}

// --- Request parsing ---------------------------------------------------------------

/** Apple authorization codes are short opaque tokens; cap length to reject junk early. */
const MAX_APPLE_CODE_LENGTH = 1024;

export type ParsedDeleteRequest =
	| { ok: true; appleAuthorizationCode?: string }
	| { ok: false; code: 'bad_request' };

/** Body is optional; when present it must be an object with an optional string code. */
export function parseDeleteRequest(body: unknown): ParsedDeleteRequest {
	if (body === null || body === undefined) return { ok: true };
	if (typeof body !== 'object' || Array.isArray(body)) return { ok: false, code: 'bad_request' };
	const raw = (body as { appleAuthorizationCode?: unknown }).appleAuthorizationCode;
	if (raw === undefined || raw === null || raw === '') return { ok: true };
	if (typeof raw !== 'string' || raw.length > MAX_APPLE_CODE_LENGTH || /\s/.test(raw)) {
		return { ok: false, code: 'bad_request' };
	}
	return { ok: true, appleAuthorizationCode: raw };
}

// --- Identity helpers --------------------------------------------------------------

type IdentityLike = { provider?: string | null; id?: string | null; identity_data?: unknown };
type UserLike = {
	app_metadata?: { provider?: unknown; providers?: unknown } | null;
	identities?: IdentityLike[] | null;
};

/** True when the account has a Sign in with Apple identity linked. */
export function isAppleUser(user: UserLike | null | undefined): boolean {
	if (!user) return false;
	if (user.identities?.some((i) => i.provider === 'apple')) return true;
	const meta = user.app_metadata;
	if (!meta) return false;
	if (meta.provider === 'apple') return true;
	return Array.isArray(meta.providers) && meta.providers.includes('apple');
}

/** Apple's stable user identifier (`sub`) for the account's Apple identity, if any. */
export function findAppleSubject(user: UserLike | null | undefined): string | undefined {
	const identity = user?.identities?.find((i) => i.provider === 'apple');
	if (!identity) return undefined;
	const data = identity.identity_data as { sub?: unknown } | null | undefined;
	if (data && typeof data.sub === 'string' && data.sub) return data.sub;
	return identity.id ?? undefined;
}

// --- Sign in with Apple (TN3194) ---------------------------------------------------

export const APPLE_AUDIENCE = 'https://appleid.apple.com';
export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
/** Apple allows up to 6 months; a secret is minted per request, so keep it short. */
export const APPLE_CLIENT_SECRET_TTL_SECONDS = 5 * 60;

export type AppleConfig = {
	teamId: string;
	keyId: string;
	/** PKCS#8 PEM of the Sign in with Apple key (.p8). */
	privateKey: string;
	/** The app's bundle ID: native authorization codes are issued to it. */
	clientId: string;
};

/** Read the four secrets; `null` when any is missing (revocation is then skipped). */
export function readAppleConfig(get: (name: string) => string | undefined): AppleConfig | null {
	const teamId = get('APPLE_TEAM_ID')?.trim();
	const keyId = get('APPLE_KEY_ID')?.trim();
	const privateKey = get('APPLE_PRIVATE_KEY')?.trim();
	const clientId = get('APPLE_CLIENT_ID')?.trim();
	if (!teamId || !keyId || !privateKey || !clientId) return null;
	return { teamId, keyId, privateKey, clientId };
}

export function buildAppleClientSecretParts(
	config: Pick<AppleConfig, 'teamId' | 'keyId' | 'clientId'>,
	nowSeconds: number,
) {
	return {
		header: { alg: 'ES256', kid: config.keyId, typ: 'JWT' },
		payload: {
			iss: config.teamId,
			iat: nowSeconds,
			exp: nowSeconds + APPLE_CLIENT_SECRET_TTL_SECONDS,
			aud: APPLE_AUDIENCE,
			sub: config.clientId,
		},
	};
}

/** Accept a .p8 pasted with real newlines, `\n` escapes, or as bare base64. */
export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
	const body = pem
		.replace(/\\n/g, '\n')
		.replace(/-----BEGIN [A-Z ]+-----/, '')
		.replace(/-----END [A-Z ]+-----/, '')
		.replace(/\s+/g, '');
	if (!body || !/^[A-Za-z0-9+/]+=*$/.test(body)) throw new Error('invalid_private_key');
	return base64ToBytes(body);
}

/** Mint the ES256 `client_secret` JWT for Apple's token/revoke endpoints. */
export async function signAppleClientSecret(
	config: AppleConfig,
	nowSeconds: number,
	subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<string> {
	const { header, payload } = buildAppleClientSecretParts(config, nowSeconds);
	const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
	const key = await subtle.importKey(
		'pkcs8',
		pemToPkcs8(config.privateKey),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign'],
	);
	// Web Crypto emits the raw r||s (IEEE P1363) signature JWS expects; no DER unwrap.
	const signature = await subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		new TextEncoder().encode(signingInput),
	);
	return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export function appleTokenExchangeBody(
	config: AppleConfig,
	clientSecret: string,
	code: string,
): URLSearchParams {
	return new URLSearchParams({
		client_id: config.clientId,
		client_secret: clientSecret,
		code,
		grant_type: 'authorization_code',
	});
}

export function appleRevokeBody(
	config: AppleConfig,
	clientSecret: string,
	token: string,
	tokenTypeHint: 'refresh_token' | 'access_token',
): URLSearchParams {
	return new URLSearchParams({
		client_id: config.clientId,
		client_secret: clientSecret,
		token,
		token_type_hint: tokenTypeHint,
	});
}

/**
 * Pick the token to revoke from Apple's /auth/token response (prefer the refresh token,
 * which revokes the whole grant) and the `sub` of its id_token for the ownership check.
 * The id_token came straight from Apple over TLS, so its payload is read, not re-verified.
 */
export function parseAppleTokenResponse(body: unknown):
	| {
			token: string;
			tokenTypeHint: 'refresh_token' | 'access_token';
			subject?: string;
	  }
	| undefined {
	if (!body || typeof body !== 'object') return undefined;
	const { refresh_token, access_token, id_token } = body as Record<string, unknown>;
	const subject = typeof id_token === 'string' ? decodeJwtPayload(id_token)?.sub : undefined;
	const sub = typeof subject === 'string' ? subject : undefined;
	if (typeof refresh_token === 'string' && refresh_token) {
		return { token: refresh_token, tokenTypeHint: 'refresh_token', subject: sub };
	}
	if (typeof access_token === 'string' && access_token) {
		return { token: access_token, tokenTypeHint: 'access_token', subject: sub };
	}
	return undefined;
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> | undefined {
	const part = jwt.split('.')[1];
	if (!part) return undefined;
	try {
		const json = new TextDecoder().decode(
			base64ToBytes(part.replace(/-/g, '+').replace(/_/g, '/')),
		);
		const parsed: unknown = JSON.parse(json);
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
	} catch {
		return undefined;
	}
}

// --- base64 (no Buffer/atob dependency differences across runtimes) -----------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64ToBytes(input: string): Uint8Array<ArrayBuffer> {
	const clean = input.replace(/=+$/, '');
	const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
	let buffer = 0;
	let bits = 0;
	let index = 0;
	for (const char of clean) {
		const value = B64.indexOf(char);
		if (value < 0) throw new Error('invalid_base64');
		buffer = (buffer << 6) | value;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			out[index++] = (buffer >> bits) & 0xff;
		}
	}
	return out.slice(0, index);
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let out = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
		out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
		if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
		if (i + 2 < bytes.length) out += B64[n & 63];
	}
	return out.replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlEncodeJson(value: unknown): string {
	return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}
