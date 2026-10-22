/**
 * Cover-image helpers: a lightweight HEAD validity check and a pure
 * dedupe utility for collapsing candidates that resolve to the same value.
 */

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MIN_BYTES = 1024;

/** Catalog cover floor: a smaller payload is almost certainly a placeholder
 *  (refresh-covers.ts). Shared by the changeset and cleanup builders. */
export const MIN_COVER_BYTES = 2048;

export type HeadCheckOptions = {
	minBytes?: number;
	timeoutMs?: number;
};

/**
 * True when `url` responds 200 and is not a suspiciously tiny payload. A
 * missing/zero Content-Length passes (many CDNs omit it on HEAD). Any non-OK
 * status, network error, or timeout fails closed.
 */
export async function headCheckCover(
	url: string,
	options: HeadCheckOptions = {},
): Promise<boolean> {
	const minBytes = options.minBytes ?? DEFAULT_MIN_BYTES;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
		if (!res.ok) return false;
		const len = Number(res.headers.get('content-length') ?? '0');
		if (len > 0 && len < minBytes) return false;
		return true;
	} catch {
		return false;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Given [key, value] entries, return the values claimed by more than one key,
 * mapped to their owning keys. Used to drop covers/ISBNs that can't be
 * unambiguously attributed to a single book.
 */
export function findSharedValues<V>(entries: Iterable<readonly [string, V]>): Map<V, string[]> {
	const owners = new Map<V, string[]>();
	for (const [key, value] of entries) {
		const list = owners.get(value);
		if (list) list.push(key);
		else owners.set(value, [key]);
	}
	for (const [value, keys] of owners) {
		if (keys.length < 2) owners.delete(value);
	}
	return owners;
}
