/**
 * Shared HTTP client for the catalog sources (Open Library, Google Books).
 *
 * Every request carries a descriptive User-Agent (Open Library blocks
 * anonymous traffic) and retries transient failures (429 + 5xx) with
 * exponential backoff, honoring Retry-After when present. Genuine 4xx other
 * than 429 are returned as-is — a 404 means "no record", not "try again".
 */

const UA = 'OssusArchives/1.0 (ghanbak@gmail.com)';

export type FetchRetryOptions = {
	retries?: number;
	baseMs?: number;
	timeoutMs?: number;
};

const DEFAULTS: Required<FetchRetryOptions> = {
	retries: 4,
	baseMs: 1000,
	timeoutMs: 12_000,
};

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(
	url: string,
	init: RequestInit = {},
	options: FetchRetryOptions = {},
): Promise<Response> {
	const opts = { ...DEFAULTS, ...options };
	for (let attempt = 0; ; attempt++) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
		let res: Response;
		try {
			res = await fetch(url, {
				...init,
				signal: ctrl.signal,
				headers: { 'User-Agent': UA, ...init.headers },
			});
		} finally {
			clearTimeout(timer);
		}
		if (res.ok) return res;
		const retryable = res.status === 429 || res.status >= 500;
		if (retryable && attempt < opts.retries) {
			const retryAfter = Number(res.headers.get('retry-after'));
			const delay =
				Number.isFinite(retryAfter) && retryAfter > 0
					? retryAfter * 1000
					: opts.baseMs * 2 ** attempt + Math.random() * opts.baseMs;
			await sleep(Math.min(delay, 30_000));
			continue;
		}
		return res;
	}
}

/**
 * Fetch JSON, returning null on any non-OK status, network error, or timeout.
 * Mirrors the "json or null" contract the seed/source scripts rely on.
 */
export async function fetchJson<T = unknown>(
	url: string,
	init: RequestInit = {},
	options: FetchRetryOptions = {},
): Promise<T | null> {
	try {
		const res = await fetchWithRetry(
			url,
			{ ...init, headers: { Accept: 'application/json', ...init.headers } },
			options,
		);
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}
