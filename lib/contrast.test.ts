import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blend, contrastRatio, relativeLuminance } from '@/lib/contrast';

const ADMIN = resolve(__dirname, '../admin');
const css = readFileSync(join(ADMIN, 'app/globals.css'), 'utf-8');

/** Value of a custom property inside the first `:root { … }` block of the admin stylesheet. */
function token(name: string): string {
	const root = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
	const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(root)?.[1]?.trim();
	if (!value) throw new Error(`--${name} not found in :root`);
	return value;
}

describe('contrastRatio', () => {
	it('matches the WCAG reference points', () => {
		expect(relativeLuminance('#000000')).toBe(0);
		expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
		expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
		expect(contrastRatio('#777777', '#777777')).toBe(1);
		expect(contrastRatio('#ffffff', '#767676')).toBeCloseTo(4.54, 2);
	});

	it('is symmetric', () => {
		expect(contrastRatio('#c0392b', '#0a0a0c')).toBe(contrastRatio('#0a0a0c', '#c0392b'));
	});

	it('blends an alpha tint over an opaque base', () => {
		expect(blend('#ffffff', 0.5, '#000000')).toBe('#808080');
		expect(blend('#c0392b', 0, '#1a1a1e')).toBe('#1a1a1e');
	});
});

describe('admin destructive text token', () => {
	const text = token('destructive-text');
	const fill = token('destructive');
	const background = token('background');
	const card = token('card');

	it('the fill token is too dark for text (why the text token exists)', () => {
		expect(contrastRatio(fill, background)).toBeLessThan(4.5);
		expect(contrastRatio(fill, card)).toBeLessThan(4.5);
	});

	it('meets 4.5:1 on background, card, and the destructive tints used behind it', () => {
		const surfaces = {
			background,
			card,
			secondary: token('secondary'),
			'destructive/10 on background': blend(fill, 0.1, background),
			'destructive/10 on card': blend(fill, 0.1, card),
			'destructive/15 on background': blend(fill, 0.15, background),
			'destructive/15 on card': blend(fill, 0.15, card),
		};
		for (const [name, surface] of Object.entries(surfaces)) {
			expect(
				contrastRatio(text, surface),
				`${text} on ${name} (${surface})`,
			).toBeGreaterThanOrEqual(4.5);
		}
	});

	it('is declared identically under .dark and exposed as a Tailwind colour', () => {
		expect(css).toMatch(/\.dark\s*\{[\s\S]*?--destructive-text:\s*#ef6b5e;/);
		expect(css).toContain('--color-destructive-text: var(--destructive-text);');
	});

	it('admin text never uses the fill token (text-destructive) outside shadcn ui primitives', () => {
		const offenders: string[] = [];
		const walk = (dir: string) => {
			for (const entry of readdirSync(dir)) {
				if (entry === 'node_modules' || entry === '.next' || entry === 'ui') continue;
				const p = join(dir, entry);
				if (statSync(p).isDirectory()) walk(p);
				else if (
					/\.(tsx?|css)$/.test(entry) &&
					/(?<![\w-])text-destructive(?![\w/-])/.test(readFileSync(p, 'utf-8'))
				)
					offenders.push(p.slice(ADMIN.length + 1));
			}
		};
		for (const dir of ['app', 'components', 'lib']) walk(join(ADMIN, dir));
		expect(offenders).toEqual([]);
	});
});
