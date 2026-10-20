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
	continue?: { cmcontinue?: string; continue?: string };
	query?: {
		categorymembers?: Array<{ pageid: number; ns: number; title: string }>;
		pages?: Array<{
			pageid?: number;
			ns?: number;
			title: string;
			missing?: boolean;
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

/**
 * All namespace-0 page members of a category (`cmtype=page`), following
 * `cmcontinue` defensively. Order follows the API (sortkey) — callers sort.
 */
export async function fetchCategoryMembers(category: string): Promise<CategoryMember[]> {
	const title = category.replace(/^category:/i, '');
	const members: CategoryMember[] = [];
	let cmcontinue: string | undefined;
	do {
		const body = await request({
			action: 'query',
			list: 'categorymembers',
			cmtitle: `Category:${title}`,
			cmlimit: '500',
			cmtype: 'page',
			cmnamespace: '0',
			...(cmcontinue ? { cmcontinue } : {}),
		});
		for (const m of body.query?.categorymembers ?? []) {
			members.push({ pageid: m.pageid, title: m.title });
		}
		cmcontinue = body.continue?.cmcontinue;
	} while (cmcontinue);
	return members;
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
			if (p.missing || p.pageid == null) continue;
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
