/**
 * Sequential bulk runner for the admin's multi-row ops (Re-fetch covers, Fill empty).
 * A rejecting item counts as that item's failure and the run continues; a rejecting
 * probe is advisory and never blocks the run. `onSettled` always fires (finally), so
 * the caller can unlock its toolbar and refresh rows even if something throws.
 * An item that comes back with code TARGET_CHANGED stops the run: every later
 * item would be refused the same way, so the summary carries it as `stopped`.
 */
export type BulkItemResult = { status: string; code?: string; message?: string };

export type BulkSummary = {
	updated: number;
	failures: string[];
	total: number;
	/** Set when an item refused the whole run (TARGET_CHANGED, #487). */
	stopped?: { code: string; message: string };
};

const STOPS_RUN = new Set(['TARGET_CHANGED']);

export async function runBulkSequential<T extends { slug: string }>(opts: {
	items: readonly T[];
	fn: (item: T) => Promise<BulkItemResult>;
	/** Optional pre-flight check (e.g. Google Books availability). Rejections are reported, not thrown. */
	probe?: () => Promise<void>;
	onProbeError?: (error: unknown) => void;
	onItemError?: (item: T, error: unknown) => void;
	onProgress: (done: number, total: number) => void;
	onSettled: (summary: BulkSummary) => void;
}): Promise<BulkSummary> {
	const { items, fn, probe, onProbeError, onItemError, onProgress, onSettled } = opts;
	const summary: BulkSummary = { updated: 0, failures: [], total: items.length };
	try {
		onProgress(0, items.length);
		if (probe) {
			try {
				await probe();
			} catch (error) {
				onProbeError?.(error);
			}
		}
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (!item) continue;
			try {
				const res = await fn(item);
				if (res.code && STOPS_RUN.has(res.code)) {
					summary.stopped = { code: res.code, message: res.message ?? res.code };
					break;
				}
				if (res.status === 'updated') summary.updated++;
				if (res.status === 'error') summary.failures.push(item.slug);
			} catch (error) {
				summary.failures.push(item.slug);
				onItemError?.(item, error);
			}
			onProgress(i + 1, items.length);
		}
	} finally {
		onSettled(summary);
	}
	return summary;
}
