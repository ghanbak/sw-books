import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Drives the real admin book page with a fake Supabase client. The terminal
// methods reply as the installed postgrest-js does: for zero rows `.single()`
// returns a PGRST116 error, while `.maybeSingle()` returns no error and null data.

type Reply = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({
	single: { data: null, error: null } as { data: unknown; error: unknown },
	maybeSingle: { data: null, error: null } as { data: unknown; error: unknown },
}));

const nav = vi.hoisted(() => ({
	notFound: vi.fn((): never => {
		throw new Error('NEXT_NOT_FOUND');
	}),
}));

vi.mock('../../admin/lib/supabase-admin', () => ({
	getSupabaseAdmin: async () => {
		const q = {
			from: () => q,
			select: () => q,
			eq: () => q,
			single: async () => db.single,
			maybeSingle: async () => db.maybeSingle,
		};
		return q;
	},
}));

// Root has no `next` or `lucide-react`. Bare ids cover CI (no admin deps, imports
// stay unresolved); the paths cover a local run where admin's install resolves them.
vi.mock('next/navigation', () => nav);
vi.mock('../../admin/node_modules/next/navigation.js', () => nav);
vi.mock('next/link', () => ({ default: 'a' }));
vi.mock('../../admin/node_modules/next/link.js', () => ({ default: 'a' }));
vi.mock('lucide-react', () => ({ ArrowLeft: 'svg' }));
vi.mock('../../admin/node_modules/lucide-react', () => ({ ArrowLeft: 'svg' }));

// Child components carry the admin form and action imports; the page only places them.
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

// Non-literal path keeps the admin file out of the root typecheck (its
// `@app/*` aliases only resolve under admin/tsconfig.json).
const pagePath = resolve(__dirname, '../../admin/app/admin/books/[slug]/page.tsx');

type Node = {
	type?: unknown;
	props?: { children?: unknown; book?: unknown; href?: string };
};
type Page = {
	default: (props: { params: Promise<{ slug: string }> }) => Promise<Node>;
};

function nodes(root: unknown): Node[] {
	if (Array.isArray(root)) return root.flatMap(nodes);
	if (root === null || typeof root !== 'object') return [];
	const node = root as Node;
	return [node, ...nodes(node.props?.children)];
}

function text(root: unknown): string {
	if (typeof root === 'string' || typeof root === 'number') return String(root);
	if (Array.isArray(root)) return root.map(text).join('');
	if (root === null || typeof root !== 'object') return '';
	return text((root as Node).props?.children);
}

async function renderPage(): Promise<Node | null> {
	const page = (await import(/* @vite-ignore */ pagePath)) as Page;
	try {
		return await page.default({ params: Promise.resolve({ slug: 'dark-force-rising' }) });
	} catch (e) {
		if (e instanceof Error && e.message === 'NEXT_NOT_FOUND') return null;
		throw e;
	}
}

function reply(both: Reply, single: Reply = both) {
	db.maybeSingle = both;
	db.single = single;
}

const logged = vi.spyOn(console, 'error');

beforeEach(() => {
	nav.notFound.mockClear();
	logged.mockReset();
	logged.mockImplementation(() => {});
});

afterEach(() => {
	reply({ data: null, error: null });
});

describe('admin book page load (#235)', () => {
	it.each([
		['unreachable database', { message: 'TypeError: fetch failed', code: '' }],
		['PostgREST failure', { message: 'relation is broken', code: 'XX000' }],
	])('shows an error and logs through dbError on %s', async (_name, error) => {
		reply({ data: null, error });

		const page = await renderPage();

		expect(nav.notFound).not.toHaveBeenCalled();
		expect(text(page)).toContain('Failed to load book:');
		expect(text(page)).not.toContain(error.message);
		expect(nodes(page).some((n) => n.props?.href === '/admin/books')).toBe(true);
		expect(logged).toHaveBeenCalledWith(
			'[admin:BookDiffPage]',
			expect.objectContaining({ message: error.message }),
		);
	});

	it('404s when no row matches the slug', async () => {
		reply(
			{ data: null, error: null },
			{ data: null, error: { code: 'PGRST116', message: 'no rows' } },
		);

		expect(await renderPage()).toBeNull();
		expect(nav.notFound).toHaveBeenCalledTimes(1);
		expect(logged).not.toHaveBeenCalled();
	});

	it('renders an existing book', async () => {
		const book = {
			id: 'b1',
			slug: 'dark-force-rising',
			title: 'Dark Force Rising',
			updated_at: 't',
		};
		reply({ data: book, error: null });

		const page = await renderPage();

		expect(nav.notFound).not.toHaveBeenCalled();
		expect(nodes(page).find((n) => n.type === 'diff-view')?.props?.book).toBe(book);
		expect(text(page)).not.toContain('Failed to load');
		expect(logged).not.toHaveBeenCalled();
	});
});
