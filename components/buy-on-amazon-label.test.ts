import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// WCAG 2.5.3 Label in Name: the spoken name must contain the visible text, so
// Voice Control's "Tap Find on Amazon" matches and VoiceOver reads the phrase
// the affiliate disclosure names. Extra context belongs in accessibilityHint.
function read(rel: string) {
	const path = resolve(__dirname, '..', rel);
	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

// JSX of BuyOnAmazonButton: from its declaration up to the StyleSheet.
function componentScope(source: string) {
	return source.match(/export function BuyOnAmazonButton\b([\s\S]*?)\nconst styles\b/)?.[1] ?? '';
}

function stringProp(scope: string, prop: string) {
	return scope.match(new RegExp(`\\b${prop}=\\s*"([^"]*)"`))?.[1];
}

describe('Find on Amazon button accessible name', () => {
	const scope = componentScope(read('components/buy-on-amazon-button.tsx'));
	const visible = scope.match(/<Text\b[^>]*>\s*([^<{}]+?)\s*<\/Text>/)?.[1];
	const label = stringProp(scope, 'accessibilityLabel');

	it('finds the component JSX and its visible label', () => {
		expect(scope).not.toBe('');
		expect(visible).toBe('Find on Amazon');
	});

	it('accessibility label contains the visible text', () => {
		// No override means the name is the visible text; an override must contain it.
		if (label === undefined) return;
		expect(label.toLowerCase()).toContain((visible ?? '').toLowerCase());
	});

	it('moves the destination into a hint', () => {
		expect(stringProp(scope, 'accessibilityHint')).toBe('Opens Amazon');
	});

	it('is announced as a link to an external page', () => {
		expect(stringProp(scope, 'accessibilityRole')).toBe('link');
	});
});
