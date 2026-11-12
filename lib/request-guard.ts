export type RequestGuard = {
	/** Start a request; the returned check is true until a newer `begin` or a `cancel`. */
	begin: () => () => boolean;
	/** Make every in-flight request stale (unmount, id change, a cached result took over). */
	cancel: () => void;
};

/** Latest-wins token so a late async result can't overwrite newer screen state. */
export function createRequestGuard(): RequestGuard {
	let current = 0;
	return {
		begin() {
			current += 1;
			const token = current;
			return () => token === current;
		},
		cancel() {
			current += 1;
		},
	};
}
