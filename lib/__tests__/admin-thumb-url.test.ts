import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #470: the catalog table's 32×48 thumbnails loaded the full-size stored cover.
// thumbUrl() asks each cover host for a smaller rendition.

const adminPath = (rel: string) => resolve(__dirname, '../../admin', rel);
const adminSource = (rel: string) => {
	const p = adminPath(rel);
	return existsSync(p) ? readFileSync(p, 'utf-8') : '';
};

type ThumbUrl = (url: string | null | undefined) => string | null;
// A missing helper falls back to the old behavior (stored URL as-is), so the
// rewrite cases fail before the fix instead of the whole file erroring.
const loadThumbUrl = async (): Promise<ThumbUrl> => {
	const p = adminPath('lib/thumb-url.ts');
	if (!existsSync(p)) return (url) => url ?? null;
	const mod = (await import(/* @vite-ignore */ p)) as { thumbUrl?: ThumbUrl };
	return mod.thumbUrl ?? ((url) => url ?? null);
};

describe('thumbUrl (#470)', () => {
	it('Open Library -L.jpg becomes -M.jpg (id and isbn paths)', async () => {
		const thumbUrl = await loadThumbUrl();
		expect(thumbUrl('https://covers.openlibrary.org/b/id/7905485-L.jpg')).toBe(
			'https://covers.openlibrary.org/b/id/7905485-M.jpg',
		);
		expect(thumbUrl('https://covers.openlibrary.org/b/isbn/9780345279132-L.jpg')).toBe(
			'https://covers.openlibrary.org/b/isbn/9780345279132-M.jpg',
		);
	});

	it('Open Library keeps its query params', async () => {
		const thumbUrl = await loadThumbUrl();
		expect(
			thumbUrl('https://covers.openlibrary.org/b/isbn/9780345279132-L.jpg?default=false'),
		).toBe('https://covers.openlibrary.org/b/isbn/9780345279132-M.jpg?default=false');
	});

	it('Open Library -S/-M URLs are left alone', async () => {
		const thumbUrl = await loadThumbUrl();
		const m = 'https://covers.openlibrary.org/b/id/7905485-M.jpg';
		expect(thumbUrl(m)).toBe(m);
	});

	it('PRH /cover/<isbn> gets height=96', async () => {
		const thumbUrl = await loadThumbUrl();
		expect(thumbUrl('https://images2.penguinrandomhouse.com/cover/9780553392869')).toBe(
			'https://images2.penguinrandomhouse.com/cover/9780553392869?height=96',
		);
	});

	it('PRH keeps existing query params', async () => {
		const thumbUrl = await loadThumbUrl();
		expect(thumbUrl('https://images2.penguinrandomhouse.com/cover/9780553392869?alt=x&v=2')).toBe(
			'https://images2.penguinrandomhouse.com/cover/9780553392869?alt=x&v=2&height=96',
		);
	});

	it('PRH with an explicit height or width is left alone', async () => {
		const thumbUrl = await loadThumbUrl();
		const h = 'https://images2.penguinrandomhouse.com/cover/9780553392869?height=400';
		const w = 'https://images2.penguinrandomhouse.com/cover/9780553392869?width=200';
		expect(thumbUrl(h)).toBe(h);
		expect(thumbUrl(w)).toBe(w);
	});

	it('Google, other hosts and lookalike hosts pass through unchanged', async () => {
		const thumbUrl = await loadThumbUrl();
		for (const url of [
			'https://books.google.com/books/content?id=AsZaEQAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api',
			'https://example.com/b/id/1-L.jpg',
			'https://covers.openlibrary.org.evil.test/b/id/1-L.jpg',
			'https://evil.test/cover/9780553392869',
			'https://images2.penguinrandomhouse.com/other/9780553392869',
		]) {
			expect(thumbUrl(url)).toBe(url);
		}
	});

	it('empty, null and unparseable values are handled', async () => {
		const thumbUrl = await loadThumbUrl();
		expect(thumbUrl('')).toBeNull();
		expect(thumbUrl(null)).toBeNull();
		expect(thumbUrl(undefined)).toBeNull();
		expect(thumbUrl('not a url')).toBe('not a url');
	});
});

describe('the catalog table thumbnail uses thumbUrl (#470)', () => {
	const src = adminSource('app/admin/books/_components/books-table.tsx');

	it('imports the helper', () => {
		expect(src).toMatch(/import\s*\{[^}]*\bthumbUrl\b[^}]*\}\s*from\s*'@\/lib\/thumb-url'/);
	});

	it('the lazy thumbnail <img> src calls thumbUrl(', () => {
		const img = src.match(/<img\b[^>]*loading="lazy"[^>]*\/>/s)?.[0] ?? '';
		expect(img).toMatch(/src=\{\s*thumbUrl\(\s*url\s*\)/);
	});
});
