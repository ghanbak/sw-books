/**
 * Phase 1 of the Wookieepedia discovery pipeline: crawl the four novel
 * categories, derive catalog-shaped rows, and emit a deterministic discovery
 * CSV we can build promotion against.
 *
 *   npx tsx scripts/discover-wookieepedia.ts --dry-run   # per-category counts, writes nothing
 *   npx tsx scripts/discover-wookieepedia.ts             # crawl → data/discovery/books-discovered.csv
 *
 * The CSV mirrors data/books.csv (same header + order, catalog-shape only — no
 * match_class column), is sorted by slug (C-locale) with multi-value cells
 * sorted, and is byte-identical on a no-change re-run. Volatile crawl metadata
 * (timestamp, per-page revid, cover URLs) goes to the gitignored sidecar
 * data/discovery/discovery-meta.json.
 *
 * Drift guard: if any category's live member count falls outside its committed
 * band, the run fails loudly (non-zero exit) and does NOT overwrite the CSV.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringifyBooksCsv } from '../lib/csv/write';
import {
	CATEGORY_BUCKETS,
	type CategoryBucket,
	checkDrift,
	isExcludedCategory,
} from '../lib/wookieepedia/categories';
import {
	type CategoryMember,
	fetchCategoryMembers,
	fetchPages,
	fetchSubcategories,
} from '../lib/wookieepedia/client';
import { type DiscoveredBook, deriveBook } from '../lib/wookieepedia/derive';
import { parseBook } from '../lib/wookieepedia/parse';

const DISCOVERY_DIR = resolve(__dirname, '..', 'data', 'discovery');
const CSV_PATH = resolve(DISCOVERY_DIR, 'books-discovered.csv');
const META_PATH = resolve(DISCOVERY_DIR, 'discovery-meta.json');

const DRY_RUN = process.argv.includes('--dry-run');

/** A bucket's full enumeration: flat members ∪ one-level kept-subcat members
 *  (de-duped on `pageid`), plus the subcat bookkeeping for the report + sidecar. */
type BucketCrawl = {
	readonly bucket: CategoryBucket;
	/** Flat + recursed members, de-duped on pageid (order: API/sortkey). */
	readonly members: CategoryMember[];
	readonly directCount: number;
	readonly keptSubcats: string[];
	readonly skippedSubcats: string[];
};

type CrawlResult = {
	readonly buckets: BucketCrawl[];
	/** pageid → the bucket that claimed it (first bucket in order wins). */
	readonly byPageId: Map<number, { member: CategoryMember; bucket: CategoryBucket }>;
};

/** Enumerate one bucket: flat page members plus, when `recurseSubcats`, the page
 *  members of each non-excluded direct sub-category. De-duped on pageid within
 *  the bucket; every member inherits the bucket's canon + type downstream. */
async function crawlBucket(bucket: CategoryBucket): Promise<BucketCrawl> {
	process.stdout.write(`Fetching Category:${bucket.category} … `);
	const byId = new Map<number, CategoryMember>();
	for (const m of await fetchCategoryMembers(bucket.category)) {
		if (!byId.has(m.pageid)) byId.set(m.pageid, m);
	}
	const directCount = byId.size;

	const keptSubcats: string[] = [];
	const skippedSubcats: string[] = [];
	if (bucket.recurseSubcats) {
		const subcats = await fetchSubcategories(bucket.category);
		for (const sc of subcats) {
			const name = sc.title.replace(/^category:/i, '');
			if (isExcludedCategory(sc.title)) {
				skippedSubcats.push(name);
				continue;
			}
			keptSubcats.push(name);
			for (const m of await fetchCategoryMembers(sc.title)) {
				if (!byId.has(m.pageid)) byId.set(m.pageid, m);
			}
		}
	}

	const members = [...byId.values()];
	const suffix = bucket.recurseSubcats
		? ` + ${keptSubcats.length} subcat(s) → ${members.length} union`
		: '';
	process.stdout.write(`${directCount} flat${suffix}\n`);
	return {
		bucket,
		members,
		directCount,
		keptSubcats: keptSubcats.sort(),
		skippedSubcats: skippedSubcats.sort(),
	};
}

async function crawl(): Promise<CrawlResult> {
	// Sanity: a committed bucket must never match an excluded category.
	for (const b of CATEGORY_BUCKETS) {
		if (isExcludedCategory(b.category)) {
			throw new Error(`Bucket "${b.category}" matches an exclusion pattern — fix categories.ts`);
		}
	}

	const buckets: BucketCrawl[] = [];
	const byPageId = new Map<number, { member: CategoryMember; bucket: CategoryBucket }>();
	for (const bucket of CATEGORY_BUCKETS) {
		const crawled = await crawlBucket(bucket);
		buckets.push(crawled);
		for (const member of crawled.members) {
			if (!byPageId.has(member.pageid)) byPageId.set(member.pageid, { member, bucket });
		}
	}
	return { buckets, byPageId };
}

function reportCounts(crawlResult: CrawlResult): void {
	process.stdout.write('\nPer-bucket counts (flat ∪ one-level kept subcats, deduped):\n');
	for (const { bucket, members, directCount, keptSubcats } of crawlResult.buckets) {
		const drift = checkDrift(bucket, members.length);
		const flag = drift.ok ? 'ok' : `OUT OF BAND [${bucket.band[0]}–${bucket.band[1]}]`;
		process.stdout.write(
			`  ${bucket.category.padEnd(28)} ${String(members.length).padStart(4)}` +
				`  (flat ${directCount}, +${keptSubcats.length} subcat)  ${flag}\n`,
		);
		if (keptSubcats.length) {
			process.stdout.write(`      subcats: ${keptSubcats.join(' | ')}\n`);
		}
	}
	const unionTotal = crawlResult.byPageId.size;
	const rawTotal = crawlResult.buckets.reduce((n, b) => n + b.members.length, 0);
	process.stdout.write(`  ${'—'.repeat(28)}\n`);
	process.stdout.write(`  raw total ${rawTotal}, union (deduped) total ${unionTotal}\n`);
}

/** Throws (loud) if any category count is outside its band. */
function enforceDriftGuard(crawlResult: CrawlResult): void {
	const failures = crawlResult.buckets
		.map(({ bucket, members }) => checkDrift(bucket, members.length))
		.filter((d) => !d.ok);
	if (failures.length > 0) {
		const lines = failures.map(
			(d) => `  ${d.category}: ${d.count} outside band [${d.band[0]}–${d.band[1]}]`,
		);
		throw new Error(
			`Drift guard tripped — NOT overwriting the discovery CSV:\n${lines.join('\n')}\nA category collapsed or changed shape. Verify the Wookieepedia taxonomy before re-running.`,
		);
	}
}

function sortRows(rows: DiscoveredBook[]): DiscoveredBook[] {
	// C-locale (code-unit) sort by slug, tie-broken by pageid for stability.
	return [...rows].sort((a, b) => {
		if (a.slug < b.slug) return -1;
		if (a.slug > b.slug) return 1;
		return a.source_pageid - b.source_pageid;
	});
}

async function main(): Promise<void> {
	const crawlResult = await crawl();
	reportCounts(crawlResult);

	if (DRY_RUN) {
		process.stdout.write('\n--dry-run: no files written.\n');
		return;
	}

	enforceDriftGuard(crawlResult);

	// Fetch page wikitext + cover URLs for the deduped union.
	const entries = [...crawlResult.byPageId.values()];
	const titles = entries.map((e) => e.member.title);
	process.stdout.write(`\nFetching ${titles.length} pages (≤50/batch) …\n`);
	const pages = await fetchPages(titles);

	const bucketByPageId = new Map(
		[...crawlResult.byPageId].map(([pageid, { bucket }]) => [pageid, bucket]),
	);

	const rows: DiscoveredBook[] = [];
	const skipped: string[] = [];
	for (const page of pages) {
		const bucket = bucketByPageId.get(page.pageid);
		if (!bucket) continue; // defensive: redirect/merge not in our union
		const parsed = parseBook(page);
		if (!parsed) {
			skipped.push(page.title);
			continue;
		}
		rows.push(deriveBook(parsed, bucket));
	}

	const sorted = sortRows(rows);

	mkdirSync(DISCOVERY_DIR, { recursive: true });
	const csv = stringifyBooksCsv(sorted, { bom: true, recordDelimiter: '\r\n' });
	writeFileSync(CSV_PATH, csv);

	// Gitignored sidecar: volatile metadata kept out of the CSV for determinism.
	const meta = {
		crawled_at: new Date().toISOString(),
		categories: Object.fromEntries(
			crawlResult.buckets.map(({ bucket, members, directCount, keptSubcats, skippedSubcats }) => [
				bucket.category,
				{ union: members.length, flat: directCount, keptSubcats, skippedSubcats },
			]),
		),
		union_total: crawlResult.byPageId.size,
		rows: sorted.length,
		skipped_no_infobox: skipped.sort(),
		pages: [...pages]
			.sort((a, b) => a.pageid - b.pageid)
			.map((p) => ({ pageid: p.pageid, title: p.title, revid: p.revid, cover_image: p.imageUrl })),
	};
	writeFileSync(META_PATH, `${JSON.stringify(meta, null, 2)}\n`);

	process.stdout.write(
		`\nWrote ${sorted.length} rows → ${CSV_PATH}\nSidecar → ${META_PATH}\n${skipped.length ? `Skipped ${skipped.length} pages with no {{Book}} infobox.\n` : ''}`,
	);
}

main().catch((err) => {
	console.error(`\n${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
