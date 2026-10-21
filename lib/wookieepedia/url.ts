/**
 * Wookieepedia URLs. Dependency-free so the app bundle can import it (the sync
 * module `enrich-sync.ts` pulls in `node:crypto` and must stay out of the app).
 */

export const WIKI_BASE_URL = 'https://starwars.fandom.com/wiki/';

/** Wiki article URL for a page title (MediaWiki `_` form; `/` and `:` kept literal). */
export function wikiUrl(title: string): string {
	const path = encodeURIComponent(title.replace(/ /g, '_'))
		.replace(/%2F/g, '/')
		.replace(/%3A/g, ':');
	return `${WIKI_BASE_URL}${path}`;
}
