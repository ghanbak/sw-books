import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// /admin/books/<missing-slug> calls notFound(); without a segment not-found file
// Next shows its bare 404 with no way back to the Catalog (#463). The not-found
// file is read from source: importing admin UI pulls deps CI's root install
// doesn't have. The book page's generateMetadata is driven with a fake client,
// because browsers get its streamed title even when the page hits notFound().

const APP = resolve(__dirname, '../../admin/app');
const NOT_FOUND = 'admin/books/[slug]/not-found.tsx';
const BOOK_PAGE = 'admin/books/[slug]/page.tsx';

// A missing file reads as empty so it fails on the assertions below.
function read(path: string) {
	const file = resolve(APP, path);
	return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

const STATIC_TITLE = /export const metadata(?::\s*Metadata)?\s*=\s*\{[^}]*?\btitle:\s*'([^']*)'/s;

const db = vi.hoisted(() => ({
	reply: { data: null, error: null } as { data: unknown; error: unknown },
}));

vi.mock('../../admin/lib/supabase-admin', () => ({
	getSupabaseAdmin: async () => {
		const q = {
			from: () => q,
			select: () => q,
			eq: () => q,
			maybeSingle: async () => db.reply,
		};
		return q;
	},
}));

const nav = vi.hoisted(() => ({
	notFound: (): never => {
		throw new Error('NEXT_NOT_FOUND');
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

type BookPage = {
	generateMetadata?: (props: {
		params: Promise<{ slug: string }>;
	}) => Promise<{ title?: unknown }>;
};

async function bookTitle(reply: { data: unknown; error: unknown }): Promise<unknown> {
	db.reply = reply;
	const page = (await import(/* @vite-ignore */ resolve(APP, BOOK_PAGE))) as BookPage;
	const meta = await page.generateMetadata?.({
		params: Promise.resolve({ slug: 'does-not-exist' }),
	});
	return meta?.title;
}

const notFoundTitle = () => STATIC_TITLE.exec(read(NOT_FOUND))?.[1] ?? '';

describe('admin book not-found state (#463)', () => {
	it('book page still sends a missing slug to notFound()', () => {
		expect(read(BOOK_PAGE)).toMatch(/if\s*\(\s*!data\s*\)\s*notFound\(\s*\)/);
	});

	it('the [slug] segment has a server-component not-found file', () => {
		const src = read(NOT_FOUND);
		expect(src).toMatch(/export default function \w+/);
		// Server component: metadata can't be exported from a client module.
		expect(src).not.toMatch(/['"]use client['"]/);
	});

	it('links back to the Catalog', () => {
		expect(read(NOT_FOUND)).toMatch(/<Link\s+href="\/admin\/books"\s*>/);
	});

	it('renders a heading and a 44px-tall back control', () => {
		const src = read(NOT_FOUND);
		expect(src).toMatch(/<h1[^>]*>\s*Book not found\s*<\/h1>/);
		expect(src).toMatch(/<Button[^>]*\basChild\b[^>]*>/);
		expect(src).toMatch(/<Button[^>]*\bmin-h-11\b[^>]*>/);
	});

	it('not-found file sets its own per-route title', () => {
		expect(notFoundTitle()).toBe('Book not found');
	});

	it('book page metadata for a missing row matches the not-found title', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await bookTitle({ data: null, error: null })).toBe('Book not found');
		expect(notFoundTitle()).toBe('Book not found');
	});

	it('a read error keeps the generic fallback, not the not-found title', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const title = await bookTitle({ data: null, error: { message: 'fetch failed', code: '' } });
		expect(title).toBe('Book');
	});
});
