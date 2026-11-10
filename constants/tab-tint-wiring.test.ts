import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Vitest is node-only (no render tests), so assert the wiring in source. The
// `<NativeTabs …>` opening tag is matched across lines so Biome wrapping its
// props can't break the check.
const layout = readFileSync(resolve(__dirname, '..', 'app/(tabs)/_layout.tsx'), 'utf8');
const openingTag = layout.match(/<NativeTabs\b(?![.\w])([^>]*)>/)?.[1] ?? '';

describe('native tab bar selected tint', () => {
	it('passes tokens.accent.primary as tintColor', () => {
		expect(openingTag).toMatch(/\btintColor=\{\s*tokens\.accent\.primary\s*\}/);
	});

	it('imports tokens from the design tokens module', () => {
		expect(layout).toMatch(
			/import\s*\{[^}]*\btokens\b[^}]*\}\s*from\s*['"]@\/constants\/tokens['"]/,
		);
	});

	it('uses no hex literal for the tab bar colours', () => {
		expect(layout).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
	});
});
