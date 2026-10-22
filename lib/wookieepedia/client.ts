/**
 * Wookieepedia (Fandom) MediaWiki Action API client — the single network edge.
 *
 * This is the ONLY module that knows the shape of the nested `formatversion=2`
 * response; everything downstream consumes the flat `CategoryMember` / `RawPage`
 * types below and never touches `response.query?.pages?.[0]?…`.
 *
 * Etiquette (Fandom ToU + MediaWiki API:Etiquette): a descriptive User-Agent,
 * serial requests (≤3 concurrent — we stay serial), and 429/Retry-After backoff.
 * Volume is tiny (~8–10 requests per crawl).
 */

const API_ENDPOINT = 'https://starwars.fandom.com/api.php';
const USER_AGENT = 'OssusArchives/1.0 (+https://github.com/; ghanbak@gmail.com)';

/** Polite gap between requests (ms). Serial by design. */
const REQUEST_DELAY_MS = 250;
/** Max titles per revisions|pageimages batch (MediaWiki caps multi-title at 50). */
const MAX_TITLES_PER_BATCH = 50;
const MAX_RETRIES = 4;
const DEFAULT_RETRY_AFTER_MS = 2000;

/** A category member page (namespace 0). */
export type CategoryMember = {
	readonly pageid: number;
	readonly title: string;
};

/** A fetched page: raw main-slot wikitext plus the bits we derive from. */
export type RawPage = {
	readonly pageid: number;
	readonly title: string;
	readonly wikitext: string;
	readonly revid: number | null;
	/** `pageimages` original-source URL (reference only; may be absent). */
	readonly imageUrl: string | null;
};

// --- Typed formatversion=2 envelope (named once, here) ---

type QueryEnvelope = {
	batchcomplete?: boolean;
	continue?: { cmcontinue?: string; rvcontinue?: string; continue?: string };
	query?: {
		categorymembers?: Array<{ pageid: number; ns: number; title: string }>;
		search?: Array<{ pageid: number; ns: number; title: string }>;
		/** Title normalization applied to `titles=` input (e.g. `_` → space). */
		normalized?: Array<{ from: string; to: string }>;
		pages?: Array<{
			pageid?: number;
			ns?: number;
			title?: string;
			missing?: boolean;
			invalid?: boolean;
			/** `prop=info`: the page is a redirect. */
			redirect?: boolean;
			/** `prop=info`: current revision id. */
			lastrevid?: number;
			revisions?: Array<{
				revid?: number;
				slots?: { main?: { content?: string } };
			}>;
			original?: { source?: string; width?: number; height?: number };
		}>;
	};
};

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function buildUrl(params: Record<string, string>): string {
	const search = new URLSearchParams({
		format: 'json',
		formatversion: '2',
		...params,
	});
	return `${API_ENDPOINT}?${search.toString()}`;
}

/** Single GET with UA, 429/Retry-After backoff, and a polite post-request gap. */
async function request(params: Record<string, string>): Promise<QueryEnvelope> {
	const url = buildUrl(params);
	let lastError: unknown;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
			if (res.status === 429) {
				const retryAfter = res.headers.get('retry-after');
				const waitMs = retryAfter
					? Number.parseInt(retryAfter, 10) * 1000 || DEFAULT_RETRY_AFTER_MS
					: DEFAULT_RETRY_AFTER_MS * (attempt + 1);
				await sleep(waitMs);
				continue;
			}
			if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
			const body = (await res.json()) as QueryEnvelope & { error?: { info?: string } };
			if (body.error) throw new Error(`API error: ${body.error.info ?? 'unknown'}`);
			await sleep(REQUEST_DELAY_MS);
			return body;
		} catch (err) {
			lastError = err;
			await sleep(DEFAULT_RETRY_AFTER_MS * (attempt + 1));
		}
	}
	throw new Error(
		`Request failed after ${MAX_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
	);
}

/** Shared `list=categorymembers` fetch for one `cmtype`, following `cmcontinue`
 *  defensively. Order follows the API (sortkey) — callers sort. */
async function fetchMembers(
	category: string,
	cmtype: 'page' | 'subcat',
): Promise<CategoryMember[]> {
	const title = category.replace(/^category:/i, '');
	const members: CategoryMember[] = [];
	let cmcontinue: string | undefined;
	do {
		const body = await request({
			action: 'query',
			list: 'categorymembers',
			cmtitle: `Category:${title}`,
			cmlimit: '500',
			cmtype,
			// Pages live in ns 0; sub-categories in ns 14.
			cmnamespace: cmtype === 'subcat' ? '14' : '0',
			...(cmcontinue ? { cmcontinue } : {}),
		});
		for (const m of body.query?.categorymembers ?? []) {
			members.push({ pageid: m.pageid, title: m.title });
		}
		cmcontinue = body.continue?.cmcontinue;
	} while (cmcontinue);
	return members;
}

/**
 * All namespace-0 page members of a category (`cmtype=page`), following
 * `cmcontinue` defensively. Order follows the API (sortkey) — callers sort.
 */
export function fetchCategoryMembers(category: string): Promise<CategoryMember[]> {
	return fetchMembers(category, 'page');
}

/**
 * All direct sub-categories of a category (`cmtype=subcat`). Titles keep their
 * `Category:` namespace prefix (as the API returns them). Used to recurse one
 * level into a bucket's series sub-categories.
 */
export function fetchSubcategories(category: string): Promise<CategoryMember[]> {
	return fetchMembers(category, 'subcat');
}

function chunk<T>(items: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}

/**
 * Fetch pages by title in ≤50-title batches, pulling main-slot wikitext + revid
 * (`prop=revisions`) and the original cover URL (`prop=pageimages`). Pages the
 * API reports `missing` are dropped. `redirects=1` resolves redirect titles.
 */
export async function fetchPages(titles: readonly string[]): Promise<RawPage[]> {
	const pages: RawPage[] = [];
	for (const batch of chunk(titles, MAX_TITLES_PER_BATCH)) {
		if (batch.length === 0) continue;
		const body = await request({
			action: 'query',
			prop: 'revisions|pageimages',
			rvprop: 'content|ids',
			rvslots: 'main',
			piprop: 'original',
			titles: batch.join('|'),
			redirects: '1',
		});
		for (const p of body.query?.pages ?? []) {
			if (p.missing || p.pageid == null || p.title == null) continue;
			const rev = p.revisions?.[0];
			const wikitext = rev?.slots?.main?.content;
			if (!wikitext) continue;
			pages.push({
				pageid: p.pageid,
				title: p.title,
				wikitext,
				revid: rev?.revid ?? null,
				imageUrl: p.original?.source ?? null,
			});
		}
	}
	return pages;
}

/**
 * The fetch outcome for one requested pageid. Pageids are the stable anchor
 * (a page move keeps its id; the old title becomes a NEW redirect page), so the
 * enrichment sync fetches by id and never follows redirects: a stored id that
 * now IS a redirect (article merged/replaced) or is gone must be flagged, not
 * silently re-pointed at another article.
 */
export type PageFetch =
	| { readonly status: 'ok'; readonly page: RawPage }
	| { readonly status: 'missing'; readonly pageid: number }
	| {
			readonly status: 'redirect';
			readonly pageid: number;
			readonly title: string;
			/** Redirect target title from `#REDIRECT [[…]]`, when parseable. */
			readonly target: string | null;
	  };

const REDIRECT_LINE = /^\s*#REDIRECT\s*:?\s*\[\[([^\]|#]+)/i;

/**
 * Fetch pages by pageid in ≤50-id batches (`prop=revisions|info`, main-slot
 * wikitext + revid), WITHOUT `redirects=1`. Follows `rvcontinue` when the API
 * splits a large batch. Returns one result per requested id, in request order.
 */
export async function fetchPagesByIds(pageids: readonly number[]): Promise<PageFetch[]> {
	const byId = new Map<number, PageFetch>();
	for (const batch of chunk([...new Set(pageids)], MAX_TITLES_PER_BATCH)) {
		if (batch.length === 0) continue;
		const content = new Map<number, { wikitext: string; revid: number | null }>();
		const meta = new Map<number, { title: string; redirect: boolean; missing: boolean }>();
		let cont: Record<string, string> = {};
		do {
			const body = await request({
				action: 'query',
				prop: 'revisions|info',
				rvprop: 'content|ids',
				rvslots: 'main',
				pageids: batch.join('|'),
				...cont,
			});
			for (const p of body.query?.pages ?? []) {
				if (p.pageid == null) continue;
				meta.set(p.pageid, {
					title: p.title ?? '',
					redirect: p.redirect === true,
					missing: p.missing === true || p.invalid === true,
				});
				const rev = p.revisions?.[0];
				const wikitext = rev?.slots?.main?.content;
				if (wikitext != null) content.set(p.pageid, { wikitext, revid: rev?.revid ?? null });
			}
			const next = body.continue;
			cont = next?.rvcontinue ? { rvcontinue: next.rvcontinue, continue: next.continue ?? '' } : {};
		} while (cont.rvcontinue);

		for (const id of batch) {
			const m = meta.get(id);
			const c = content.get(id);
			if (!m || m.missing || !c) {
				byId.set(id, { status: 'missing', pageid: id });
				continue;
			}
			const redirectTo = c.wikitext.match(REDIRECT_LINE)?.[1]?.trim() ?? null;
			if (m.redirect || redirectTo) {
				byId.set(id, { status: 'redirect', pageid: id, title: m.title, target: redirectTo });
				continue;
			}
			byId.set(id, {
				status: 'ok',
				page: { pageid: id, title: m.title, wikitext: c.wikitext, revid: c.revid, imageUrl: null },
			});
		}
	}
	return pageids.map((id) => byId.get(id) ?? { status: 'missing', pageid: id });
}

/**
 * Full-text search of article titles/content (`list=search`, namespace 0).
 * Returns pageid + title only, in relevance order. Used by the admin pin editor.
 */
export async function searchPages(query: string, limit = 8): Promise<CategoryMember[]> {
	const q = query.trim();
	if (!q) return [];
	const body = await request({
		action: 'query',
		list: 'search',
		srsearch: q,
		srnamespace: '0',
		srlimit: String(Math.min(Math.max(limit, 1), 20)),
		srprop: '',
	});
	return (body.query?.search ?? []).map((r) => ({ pageid: r.pageid, title: r.title }));
}

/** Lightweight page state from `prop=info` (no wikitext). */
export type PageInfo =
	| {
			readonly status: 'ok' | 'redirect';
			readonly pageid: number;
			readonly title: string;
			readonly lastrevid: number | null;
	  }
	| { readonly status: 'missing'; readonly pageid: number | null; readonly title: string | null };

/**
 * `prop=info` for pageids or exact titles, ≤50 per request, redirects NOT
 * followed (a redirect title reports `redirect`). Cheap enough to check every
 * mapped page's health: no content is transferred. Results are keyed by the
 * requested pageid / title.
 */
export async function fetchPageInfo(
	ref: { readonly pageids: readonly number[] } | { readonly titles: readonly string[] },
): Promise<Map<number | string, PageInfo>> {
	const out = new Map<number | string, PageInfo>();
	const byIds = 'pageids' in ref;
	const keys: Array<number | string> = byIds ? [...new Set(ref.pageids)] : [...new Set(ref.titles)];
	for (const batch of chunk(keys, MAX_TITLES_PER_BATCH)) {
		if (batch.length === 0) continue;
		const body = await request({
			action: 'query',
			prop: 'info',
			...(byIds ? { pageids: batch.join('|') } : { titles: batch.join('|') }),
		});
		const normalized = new Map<string, string>();
		for (const n of body.query?.normalized ?? []) normalized.set(n.to, n.from);
		for (const p of body.query?.pages ?? []) {
			const key = byIds ? p.pageid : p.title ? (normalized.get(p.title) ?? p.title) : undefined;
			if (key == null) continue;
			if (p.missing || p.invalid || p.pageid == null || p.title == null) {
				out.set(key, { status: 'missing', pageid: p.pageid ?? null, title: p.title ?? null });
				continue;
			}
			out.set(key, {
				status: p.redirect ? 'redirect' : 'ok',
				pageid: p.pageid,
				title: p.title,
				lastrevid: p.lastrevid ?? null,
			});
		}
	}
	for (const k of keys) {
		if (!out.has(k))
			out.set(k, {
				status: 'missing',
				pageid: typeof k === 'number' ? k : null,
				title: typeof k === 'string' ? k : null,
			});
	}
	return out;
}
