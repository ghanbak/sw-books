import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Next's route announcer only speaks when document.title changes, so every admin
// route needs its own title (#448). Static titles are read from source: importing
// those pages pulls admin-only deps that CI's root install doesn't have. The book
// page's generateMetadata is driven for real with a fake Supabase client.

const APP = resolve(__dirname, '../../admin/app');
const ROOT_TITLE = 'Ossus Archives — Admin';

// A missing file reads as empty so it fails on the assertions below.
function read(path: string) {
	const file = resolve(APP, path);
	return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function pagesUnder(dir: string): string[] {
	const abs = resolve(APP, dir);
	if (!existsSync(abs)) return [];
	return readdirSync(abs, { recursive: true, encoding: 'utf8' })
		.filter((f) => f === 'page.tsx' || f.endsWith('/page.tsx'))
		.map((f) => relative(APP, resolve(abs, f)))
		.sort();
}

const STATIC_TITLE = /export const metadata(?::\s*Metadata)?\s*=\s*\{[^}]*?\btitle:\s*'([^']*)'/s;
const TEMPLATE = /\btemplate:\s*'([^']*%s[^']*)'/;

function staticTitle(path: string): string {
	return STATIC_TITLE.exec(read(path))?.[1] ?? '';
}

function template(): string {
	return TEMPLATE.exec(read('admin/layout.tsx'))?.[1] ?? '';
}

const applyTemplate = (title: string) => template().replace('%s', title);

// /admin only redirects to /admin/books; it never renders, so it needs no title.
const REDIRECT_ONLY = 'admin/page.tsx';
const BOOK_PAGE = 'admin/books/[slug]/page.tsx';

const EXPECTED: Record<string, string> = {
	'admin/books/page.tsx': 'Catalog',
	'admin/books/new/page.tsx': 'Add a book',
	'admin/diff/page.tsx': 'Unsaved changes',
};

// --- generateMetadata harness (mirrors book-page-load.test.ts) ---

const db = vi.hoisted(() => ({
	reply: { data: null, error: null } as { data: unknown; error: unknown },
	from: vi.fn(),
}));

const nav = vi.hoisted(() => ({
	notFound: vi.fn((): never => {
		throw new Error('NEXT_NOT_FOUND');
	}),
}));

vi.mock('../../admin/lib/supabase-admin', () => ({
	getSupabaseAdmin: async () => {
		const q = {
			from: (table: string) => {
				db.from(table);
				return q;
			},
			select: () => q,
			eq: () => q,
			single: async () => db.reply,
			maybeSingle: async () => db.reply,
		};
		return q;
	},
}));

vi.mock('next/navigation', () => nav);
vi.mock('../../admin/node_modules/next/navigation.js', () => nav);
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('../../admin/node_modules/next/link.js', () => ({ default: 'a' }));
vi.mock('lucide-react', () => ({ ArrowLeft: 'svg' }));
vi.mock('../../admin/node_modules/lucide-react', () => ({ ArrowLeft: 'svg' }));
vi.mock('../../admin/app/admin/books/[slug]/_components/diff-view', () => ({
	DiffView: 'diff-view',
}));
vi.mock('../../admin/app/admin/books/[slug]/_components/enrichment-card', () => ({
	EnrichmentCard: 'enrichment-card',
	EnrichmentShell: 'enrichment-shell',
}));
vi.mock('../../admin/app/admin/books/[slug]/_components/manual-fields-form', () => ({
	ManualFieldsForm: 'manual-fields-form',
}));

const bookPagePath = resolve(APP, BOOK_PAGE);

type BookPage = {
	generateMetadata?: (props: {
		params: Promise<{ slug: string }>;
	}) => Promise<{ title?: unknown }>;
};

async function bookTitle(reply: { data: unknown; error: unknown }): Promise<unknown> {
	db.reply = reply;
	const page = (await import(/* @vite-ignore */ bookPagePath)) as BookPage;
	if (typeof page.generateMetadata !== 'function') return undefined;
	const meta = await page.generateMetadata({
		params: Promise.resolve({ slug: 'dark-force-rising' }),
	});
	return meta.title;
}

beforeEach(() => {
	db.from.mockClear();
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('admin route titles (#448)', () => {
	it('admin layout sets a title template for its child routes', () => {
		expect(template()).toMatch(/^%s\b.+Ossus Archives/);
		// Server component: metadata can't be exported from a client module.
		expect(read('admin/layout.tsx')).not.toMatch(/['"]use client['"]/);
	});

	it('public titles keep their own strings (no root template)', () => {
		expect(staticTitle('layout.tsx')).toBe(ROOT_TITLE);
		expect(read('layout.tsx')).not.toMatch(TEMPLATE);
		expect(staticTitle('privacy/page.tsx')).toBe('Privacy Policy — Ossus Archives');
	});

	it('every titled admin page is covered by this test', () => {
		const covered = [...Object.keys(EXPECTED), BOOK_PAGE, REDIRECT_ONLY].sort();
		expect(pagesUnder('admin')).toEqual(covered);
	});

	it.each(Object.entries(EXPECTED))('%s exports title %j', (path, title) => {
		expect(staticTitle(path)).toBe(title);
	});

	it('login page has an absolute title matching the admin template', () => {
		expect(read('login/page.tsx')).not.toMatch(/['"]use client['"]/);
		const title = staticTitle('login/page.tsx');
		expect(title).toMatch(/^Sign in\b.+Ossus Archives/);
		expect(title).toBe(applyTemplate('Sign in'));
	});

	it('book page generateMetadata resolves to the book title', async () => {
		const title = await bookTitle({
			data: { id: 'b1', slug: 'dark-force-rising', title: 'Dark Force Rising' },
			error: null,
		});
		expect(title).toBe('Dark Force Rising');
		expect(db.from).toHaveBeenCalledWith('books');
	});

	it.each([
		['missing row', { data: null, error: null }],
		['read error', { data: null, error: { message: 'fetch failed', code: '' } }],
	])('book page generateMetadata falls back to a non-empty title on %s', async (_n, reply) => {
		const title = await bookTitle(reply);
		expect(typeof title).toBe('string');
		expect(title).not.toBe('');
		expect(nav.notFound).not.toHaveBeenCalled();
	});

	it('book page shares one cached query between page and metadata', () => {
		const src = read(BOOK_PAGE);
		expect(src).toMatch(/import\s*\{[^}]*\bcache\b[^}]*\}\s*from\s*'react'/);
		const getter = /const\s+(\w+)\s*=\s*cache\(/.exec(src)?.[1] ?? '';
		expect(getter).not.toBe('');
		// Called from both the page and generateMetadata; no second inline query.
		expect(src.match(new RegExp(`\\b${getter}\\(\\s*slug\\s*\\)`, 'g'))?.length ?? 0).toBe(2);
		expect(src.match(/\.from\(\s*'books'\s*\)/g)?.length ?? 0).toBe(1);
	});

	it('no two admin routes share a title, and none falls back to the root title', async () => {
		const titles = [
			...Object.keys(EXPECTED).map((p) => applyTemplate(staticTitle(p))),
			staticTitle('login/page.tsx'),
			applyTemplate(String((await bookTitle({ data: { title: 'Heir' }, error: null })) ?? '')),
		];
		for (const t of titles) {
			expect(t.trim()).not.toBe('');
			expect(t).not.toBe(ROOT_TITLE);
		}
		expect(new Set(titles).size).toBe(titles.length);
	});
});
