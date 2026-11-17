const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for a canonical 8-4-4-4-12 hex uuid. `books.id` is a Postgres `uuid`, so any other route
 * id (a slug, a typo) can only fail there; callers treat it as not-found without a request.
 */
export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_RE.test(value);
}
