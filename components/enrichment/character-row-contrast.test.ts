import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The trailing chevron marks a linked row as navigable, so it is a meaningful graphic
// (WCAG 1.4.11, 3:1). text.hint misses that on the dark surfaces; text.tertiary meets it
// (pinned in constants/tokens.test.ts).
const path = resolve(__dirname, 'character-row.tsx');
const source = existsSync(path) ? readFileSync(path, 'utf8') : '';
const chevron = source.match(/<SymbolView\s[^>]*?name="chevron\.forward"[^>]*?\/>/)?.[0] ?? '';

describe('character-row chevron contrast', () => {
	it('renders the chevron.forward symbol', () => {
		expect(chevron).not.toBe('');
	});

	it('tints it with text.tertiary', () => {
		expect(chevron).toMatch(/tintColor=\{\s*tokens\.text\.tertiary\s*\}/);
	});

	it('does not tint it with text.hint', () => {
		expect(chevron).not.toMatch(/tokens\.text\.hint\b/);
	});
});
