// In-app account deletion (App Store 5.1.1(v)) with Sign in with Apple token revocation
// (Apple TN3194). POST only; see README.md for secrets and deploy steps.
import { createSupabaseContext } from 'npm:@supabase/server@1.9.2';

import {
	APPLE_REVOKE_URL,
	APPLE_TOKEN_URL,
	type AppleConfig,
	DELETE_ACCOUNT_STATUS,
	type DeleteAccountErrorCode,
	type DeleteAccountResponse,
	appleRevokeBody,
	appleTokenExchangeBody,
	findAppleSubject,
	isTokenFresh,
	parseAppleTokenResponse,
	parseDeleteRequest,
	readAppleConfig,
	signAppleClientSecret,
} from '../_shared/account-deletion.ts';

const APPLE_TIMEOUT_MS = 8000;

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(body: DeleteAccountResponse, status = 200): Response {
	return Response.json(body, { status, headers: CORS_HEADERS });
}

function fail(code: DeleteAccountErrorCode): Response {
	return respond({ ok: false, code }, DELETE_ACCOUNT_STATUS[code]);
}

/** Logs carry a stage and an HTTP status at most: never tokens, codes, emails or user IDs. */
function warn(stage: string, detail?: string | number) {
	console.warn(`[delete-account] ${stage}${detail === undefined ? '' : `: ${detail}`}`);
}

async function postForm(url: string, body: URLSearchParams): Promise<Response> {
	return await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
		signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
	});
}

/**
 * Exchange the fresh authorization code for Apple's tokens. Runs before deletion
 * because the code expires five minutes after the sign-in sheet issued it.
 */
async function exchangeAppleCode(
	config: AppleConfig,
	clientSecret: string,
	code: string,
	expectedSubject: string | undefined,
) {
	try {
		const res = await postForm(APPLE_TOKEN_URL, appleTokenExchangeBody(config, clientSecret, code));
		if (!res.ok) {
			warn('apple token exchange failed', res.status);
			return undefined;
		}
		const parsed = parseAppleTokenResponse(await res.json());
		if (!parsed) {
			warn('apple token response missing token');
			return undefined;
		}
		// Only revoke the grant of the Apple ID linked to this account.
		if (!expectedSubject || parsed.subject !== expectedSubject) {
			warn('apple subject mismatch; skipping revocation');
			return undefined;
		}
		return parsed;
	} catch {
		warn('apple token exchange error');
		return undefined;
	}
}

async function revokeAppleToken(
	config: AppleConfig,
	clientSecret: string,
	token: { token: string; tokenTypeHint: 'refresh_token' | 'access_token' },
): Promise<boolean> {
	try {
		const res = await postForm(
			APPLE_REVOKE_URL,
			appleRevokeBody(config, clientSecret, token.token, token.tokenTypeHint),
		);
		if (!res.ok) warn('apple revoke failed', res.status);
		return res.ok;
	} catch {
		warn('apple revoke error');
		return false;
	}
}

async function handle(req: Request): Promise<Response> {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
	if (req.method !== 'POST') return fail('method_not_allowed');

	const { data: ctx, error: authError } = await createSupabaseContext(req, { auth: 'user' });
	if (authError || !ctx?.userClaims?.id) return fail('unauthorized');

	// Re-auth guard: the client refreshes right before calling (needs the refresh token).
	if (!isTokenFresh(ctx.jwtClaims?.iat, Math.floor(Date.now() / 1000))) {
		return fail('reauth_required');
	}

	let body: unknown;
	const text = await req.text();
	if (text.trim()) {
		try {
			body = JSON.parse(text);
		} catch {
			return fail('bad_request');
		}
	}
	const parsed = parseDeleteRequest(body);
	if (!parsed.ok) return fail(parsed.code);

	const userId = ctx.userClaims.id;
	const admin = ctx.supabaseAdmin;

	// Step 1 (Apple users with a fresh code): obtain the token to revoke.
	let apple:
		| {
				config: AppleConfig;
				clientSecret: string;
				token: { token: string; tokenTypeHint: 'refresh_token' | 'access_token' };
		  }
		| undefined;
	if (parsed.appleAuthorizationCode) {
		const config = readAppleConfig((name) => Deno.env.get(name));
		if (!config) {
			warn('apple secrets not configured; skipping revocation');
		} else {
			try {
				const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
				if (userError) warn('load user failed');
				const clientSecret = await signAppleClientSecret(config, Math.floor(Date.now() / 1000));
				const token = await exchangeAppleCode(
					config,
					clientSecret,
					parsed.appleAuthorizationCode,
					findAppleSubject(userData?.user),
				);
				if (token) apple = { config, clientSecret, token };
			} catch {
				warn('apple client secret signing failed');
			}
		}
	}

	// Step 2: delete the user. user_books cascades via its FK to auth.users.
	const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
	if (deleteError) {
		warn('delete user failed', deleteError.status);
		return fail('delete_failed');
	}

	// Step 3: revoke after the data is gone (TN3194: deletion must succeed regardless).
	const appleRevoked = apple
		? await revokeAppleToken(apple.config, apple.clientSecret, apple.token)
		: false;

	return respond({ ok: true, appleRevoked });
}

export default { fetch: handle };
