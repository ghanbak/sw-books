import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Labels scale with iOS Larger Text (no font-scale caps in the app). A fixed `height`
// keeps the pill at 52pt while the label wraps, so the overflow spills outside the fill.
// The pills must grow (`minHeight` + vertical padding) and the labels must wrap inside them.
function read(rel: string) {
	const path = resolve(__dirname, '..', rel);
	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

// Body of `key: { ... }` inside StyleSheet.create (style objects here have no nested braces).
function styleBlock(source: string, key: string) {
	return source.match(new RegExp(`\\n\\t${key}:\\s*\\{([^{}]*)\\}`))?.[1] ?? '';
}

function expectGrowingPill(block: string) {
	expect(block).not.toBe('');
	expect(block).toMatch(/\bminHeight:\s*52\b/);
	expect(block).not.toMatch(/(^|[\s,{])height:/);
	expect(block).toMatch(/\bpaddingVertical:\s*1[2-4]\b/);
}

function expectWrappingLabel(block: string) {
	expect(block).not.toBe('');
	expect(block).toMatch(/\bflexShrink:\s*1\b/);
	expect(block).toMatch(/\btextAlign:\s*'center'/);
}

describe('login buttons grow with Dynamic Type', () => {
	const source = read('app/(auth)/login.tsx');

	it('shared button style uses minHeight, not a fixed height', () => {
		expectGrowingPill(styleBlock(source, 'button'));
	});

	it.each(['appleButtonText', 'googleButtonText', 'devButtonText'])(
		'%s wraps inside the pill',
		(key) => {
			expectWrappingLabel(styleBlock(source, key));
		},
	);
});

describe('Find on Amazon pill grows with Dynamic Type', () => {
	const source = read('components/buy-on-amazon-button.tsx');

	it('button style uses minHeight, not a fixed height', () => {
		expectGrowingPill(styleBlock(source, 'button'));
	});

	it('label wraps inside the pill', () => {
		expectWrappingLabel(styleBlock(source, 'label'));
	});
});
