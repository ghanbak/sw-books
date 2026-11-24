// Static checks for the public /delete-account page (issue 416, Google Play account
// deletion URL). The admin package has no test runner and its modules need admin
// node_modules, so these read the source (fs only), like admin-a11y.test.ts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '../../admin', p), 'utf8');

const page = read('app/delete-account/page.tsx');
const shell = read('app/_components/info-page.tsx');

/** `--name: value;` pairs from the first `:root { … }` block of globals.css. */
function rootTokens(): Map<string, string> {
	const css = read('app/globals.css');
	const block = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
	return new Map([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
}

function luminance(hex: string): number {
	const digits = hex.replace('#', '');
	const channels = [0, 2, 4].map((i) => Number.parseInt(digits.slice(i, i + 2), 16) / 255);
	const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

describe('/delete-account renders signed out', () => {
	it('is statically rendered', () => {
		expect(page).toMatch(/export const dynamic = 'force-static'/);
	});

	it('is outside the middleware gate', () => {
		const matcher = read('middleware.ts').match(/matcher:\s*\[([^\]]*)\]/)?.[1] ?? '';
		expect(matcher).toMatch(/'\/admin'/);
		expect(matcher).not.toMatch(/delete-account/);
		for (const entry of matcher.matchAll(/'([^']+)'/g)) {
			expect(entry[1].startsWith('/admin')).toBe(true);
		}
	});

	it('uses no client-only code or auth', () => {
		expect(page).not.toMatch(/'use client'/);
		expect(page).not.toMatch(/from '[^']*supabase[^']*'|cookies\(|headers\(/);
	});
});

describe('/delete-account headings', () => {
	it('gets its one h1 from InfoPage and h2 sections from Section', () => {
		expect(page).toMatch(/<InfoPage\s+title="Delete your account"/);
		expect(page).not.toMatch(/<h[1-6][\s>]/);
		expect(shell.match(/<h1[\s>]/g)).toHaveLength(1);
		expect(shell).toMatch(/function Section[\s\S]*?<h2 /);
	});

	it('has a section for each Play requirement', () => {
		const sections = [...page.matchAll(/<Section\s+title="([^"]+)"/g)].map(([, t]) => t);
		expect(sections).toEqual(['In the app', 'By email', 'What gets deleted', 'What we keep']);
	});
});

describe('/delete-account contrast', () => {
	const tokens = rootTokens();
	const background = tokens.get('background') ?? '';

	it('uses only token text colors', () => {
		const colors = new Set(
			[...page.matchAll(/\btext-(?!sm\b|xs\b|lg\b)([a-z-]+)/g)].map((m) => m[1]),
		);
		for (const c of colors) expect(['muted-foreground', 'saber-blue', 'foreground']).toContain(c);
	});

	it.each(['foreground', 'muted-foreground', 'saber-blue'])(
		'%s on background is AA (4.5:1)',
		(name) => {
			const fg = tokens.get(name) ?? '';
			expect(fg).toMatch(/^#[0-9a-f]{6}$/i);
			expect(background).toMatch(/^#[0-9a-f]{6}$/i);
			expect(contrast(fg, background)).toBeGreaterThanOrEqual(4.5);
		},
	);

	it('underlines body links without hover', () => {
		const links = [...page.matchAll(/<Link[^>]*>/g)].map(([tag]) => tag);
		expect(links.length).toBeGreaterThan(0);
		for (const tag of links) {
			expect(tag).toMatch(/className="text-saber-blue underline underline-offset-2"/);
		}
	});
});

describe('/delete-account content and wiring', () => {
	it('uses the shared contact address, not a new one', () => {
		expect(page).toMatch(/<ContactLink\s*\/>/);
		expect(page).not.toMatch(/mailto:|@[a-z0-9-]+\.[a-z]/i);
	});

	it('names the in-app path the app uses', () => {
		const header = readFileSync(
			resolve(__dirname, '../../components/tab-header-actions.tsx'),
			'utf8',
		);
		// Anchor on the button that opens /profile: its icon prop is platform-mapped on Android.
		const label = header.match(
			/accessibilityLabel="([^"]+)"\s*onPress=\{\(\) => router\.push\('\/profile'\)\}/,
		)?.[1];
		expect(label).toBe('Account and settings');
		expect(page).toContain(`profile icon at the top right (${label})`);
		expect(page).toMatch(/Tap Delete account, then Delete to confirm/);
	});

	it('says revocation is attempted, not guaranteed', () => {
		expect(page).toMatch(/tries to revoke/);
		expect(page).not.toMatch(/also revokes/);
	});

	it('discloses provider logs and backups on both pages', () => {
		const disclosure = /Supabase\) may keep security logs and\s+backups for a limited period/;
		expect(page).not.toMatch(/Nothing tied to you/);
		expect(page).toMatch(/Nothing in the app’s database\./);
		expect(page).toMatch(disclosure);
		expect(read('app/privacy/page.tsx')).toMatch(disclosure);
	});

	it('is linked from /privacy', () => {
		expect(read('app/privacy/page.tsx')).toMatch(
			/<Link\s+className="text-saber-blue underline underline-offset-2"\s+href="\/delete-account"/,
		);
	});

	it('is in the sitemap', () => {
		expect(read('app/sitemap.ts')).toMatch(/url:\s*`\$\{BASE\}\/delete-account`/);
	});
});
