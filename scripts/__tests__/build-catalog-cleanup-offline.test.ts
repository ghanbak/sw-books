import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every .env* path any module tries to read or stat (the offline path must read none).
const { envTouches } = vi.hoisted(() => ({ envTouches: [] as string[] }));

vi.mock('node:fs', async (importOriginal) => {
	const fs = await importOriginal<typeof import('node:fs')>();
	const watch = (p: unknown) => {
		if (/(^|[\\/])\.env/.test(String(p))) envTouches.push(String(p));
	};
	const readFileSync = ((p: Parameters<typeof fs.readFileSync>[0], ...rest: unknown[]) => {
		watch(p);
		return (fs.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
	}) as typeof fs.readFileSync;
	const existsSync = ((p: Parameters<typeof fs.existsSync>[0]) => {
		watch(p);
		return fs.existsSync(p);
	}) as typeof fs.existsSync;
	return { ...fs, default: { ...fs, readFileSync, existsSync }, readFileSync, existsSync };
});

// Wrap the real env loader + client factory so a call is observable (and still reads the file).
vi.mock('../_supabase', async (importOriginal) => {
	const real = await importOriginal<typeof import('../_supabase')>();
	return { ...real, productionEnv: vi.fn(real.productionEnv), makeClient: vi.fn(real.makeClient) };
});

import { offlineChangesetRefusal } from '../../lib/wookieepedia/apply-plan';
import { makeClient, productionEnv } from '../_supabase';
import { type CleanupPaths, LOOKUP_KINDS, parseArgs, runCleanup } from '../build-catalog-cleanup';

const HEADER =
	'id,slug,title,author,canon,type,era,series_name,series_order,timeline_order,date_published,publisher,language,isbn,primary_isbn,format,cover_image,synopsis,created_at';

// primary ∉ isbn[] (wiki + OL lookups), a null cover (cover + HEAD lookups), a null synopsis.
const BACKUP = [
	HEADER,
	'00000000-0000-4000-8000-000000000001,a-new-dawn,A New Dawn,John Jackson Miller,Canon,Adult Novel,,,0,-11,2014-09-02,Del Rey,English,9780553392876,9780553391473,Hardcover,https://covers.openlibrary.org/b/id/1-L.jpg,A fixture synopsis.,2026-01-01T00:00:00+00:00',
	'00000000-0000-4000-8000-000000000002,fixture-no-cover,Fixture No Cover,Jane Doe,Canon,Adult Novel,,,0,0,2015-09-22,Del Rey,English,9781484709122,9781484709122,Hardcover,,A fixture synopsis.,2026-01-01T00:00:00+00:00',
	'00000000-0000-4000-8000-000000000003,fixture-no-synopsis,Fixture No Synopsis,Jane Doe,Canon,Adult Novel,,,0,0,2016-01-01,Del Rey,English,9781484709139,9781484709139,Hardcover,https://covers.openlibrary.org/b/id/3-L.jpg,,2026-01-01T00:00:00+00:00',
	'',
].join('\n');

let dir: string;
let paths: CleanupPaths;
const fetchSpy = vi.fn(() => Promise.reject(new Error('network blocked in test')));

beforeEach(() => {
	envTouches.length = 0;
	vi.mocked(productionEnv).mockClear();
	vi.mocked(makeClient).mockClear();
	fetchSpy.mockClear();
	vi.stubGlobal('fetch', fetchSpy);
	vi.spyOn(console, 'log').mockImplementation(() => {});
	dir = mkdtempSync(join(tmpdir(), 'cleanup-offline-'));
	paths = {
		backup: join(dir, 'catalog-backup.csv'),
		drafts: join(dir, 'synopsis-drafts.json'),
		cache: join(dir, 'cleanup-cache.json'),
		outJson: join(dir, 'catalog-cleanup.json'),
		outMd: join(dir, 'catalog-cleanup.md'),
	};
	writeFileSync(paths.backup, BACKUP);
	writeFileSync(paths.drafts, JSON.stringify({ drafts: {}, skipped: {} }));
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	rmSync(dir, { recursive: true, force: true });
});

const offline = () => ({ ...parseArgs(['--from-backup', '--offline']), paths });

describe('build-catalog-cleanup --from-backup --offline', () => {
	it('reads no .env file and makes no network call', async () => {
		// Bounded: a path that does hit the network retries the blocked fetch for a while.
		const outcome = await Promise.race([
			runCleanup(offline()).then(
				() => null,
				(err: unknown) => err,
			),
			new Promise((r) => setTimeout(() => r('still running after 2s'), 2000)),
		]);
		expect(productionEnv).not.toHaveBeenCalled();
		expect(makeClient).not.toHaveBeenCalled();
		expect(envTouches).toEqual([]);
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(outcome).toBeNull();
	});

	it('notes the skipped lookups in the summary and leaves the cache untouched', async () => {
		const run = await runCleanup(offline());
		expect(run.skipped.wiki).toBe(1);
		expect(run.skipped.openlibrary).toBeGreaterThan(0);
		expect(run.skipped.covers).toBeGreaterThan(0);
		const md = readFileSync(paths.outMd, 'utf-8');
		expect(md).toContain('## Offline build — lookups skipped');
		expect(md).toMatch(/Wookieepedia pages \| 1 \|/);
		expect(() => readFileSync(paths.cache)).toThrow(); // never written offline
	});

	it('serves lookups from the cache when present', async () => {
		const url = 'https://covers.openlibrary.org/b/isbn/9781484709122-L.jpg';
		writeFileSync(
			paths.cache,
			JSON.stringify({
				covers: { '9781484709122': { ol: url, gb: null } },
				gbSearch: { 'fixture-no-cover': null },
				head: { [url]: true },
			}),
		);
		const run = await runCleanup(offline());
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(run.skipped.covers).toBe(0);
		expect(run.skipped.gbSearch).toBe(0);
		expect(run.changeset.cover_fills.map((c) => [c.slug, c.after])).toEqual([
			['fixture-no-cover', url],
		]);
	});

	it('marks the JSON offline with per-kind skip counts, and apply refuses it', async () => {
		const run = await runCleanup(offline());
		const json = JSON.parse(readFileSync(paths.outJson, 'utf-8'));
		expect(json.offline).toBe(true);
		expect(Object.keys(json.skipped).sort()).toEqual(Object.keys(LOOKUP_KINDS).sort());
		expect(json.skipped).toEqual(run.skipped);
		expect(json.skipped.wiki).toBe(1);
		expect(offlineChangesetRefusal(json)).toMatch(/built with --offline.*wiki 1/);
	});

	// Bounded: a gate that lets the lookup through retries the blocked fetch.
	const bounded = (p: Promise<unknown>) =>
		Promise.race([p, new Promise((r) => setTimeout(() => r('still running after 2s'), 2000))]);
	const WORK = '/works/OL1W';
	const AUTHOR = '/authors/OL1A';
	const edition = { '9781484709122': { title: 'Fixture No Cover', subtitle: null, work: WORK } };

	it('skips an uncached Open Library work behind a cached edition (olWorks gate)', async () => {
		writeFileSync(paths.cache, JSON.stringify({ ol: edition }));
		const run = (await bounded(runCleanup(offline()))) as Awaited<ReturnType<typeof runCleanup>>;
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(run.skipped?.olWorks).toBe(1);
		expect(run.skipped?.olAuthors).toBe(0);
	});

	it('skips an uncached Open Library author of a cached work (olAuthors gate)', async () => {
		writeFileSync(
			paths.cache,
			JSON.stringify({
				ol: edition,
				olWorks: {
					[WORK]: {
						title: 'Fixture No Cover',
						subtitle: null,
						author_keys: [AUTHOR],
						covers: [],
						first_publish_year: 2015,
					},
				},
			}),
		);
		const run = (await bounded(runCleanup(offline()))) as Awaited<ReturnType<typeof runCleanup>>;
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(run.skipped?.olWorks).toBe(0);
		expect(run.skipped?.olAuthors).toBe(1);
	});

	it('refuses --offline without --from-backup (a DB read is a network call)', async () => {
		await expect(runCleanup({ ...parseArgs(['--offline']), paths })).rejects.toThrow(
			/--offline needs --from-backup/,
		);
		expect(makeClient).not.toHaveBeenCalled();
	});
});
