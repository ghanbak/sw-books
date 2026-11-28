/**
 * Sort value for a nullable column. TanStack's `sortUndefined` only treats
 * `=== undefined` as missing, so a `null` from PostgREST would sort as 0 or ''
 * instead of last (#457).
 */
export function missingAsUndefined<T>(value: T | null | undefined): T | undefined {
	return value ?? undefined;
}
