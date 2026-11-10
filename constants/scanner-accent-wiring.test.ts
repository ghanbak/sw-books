import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Vitest is node-only (no render tests), so assert the wiring in source. Whitespace is
// collapsed so Biome re-wrapping a prop or ternary can't break the match.
function source(rel: string): string {
	return readFileSync(resolve(__dirname, '..', rel), 'utf8');
}

/** The `tokens.*` value of `prop` inside the StyleSheet entry `style`. */
function styleToken(src: string, style: string, prop: string): string | undefined {
	const block = src.match(new RegExp(`\\b${style}:\\s*\\{([^}]*)\\}`))?.[1] ?? '';
	return block.match(new RegExp(`\\b${prop}:\\s*(tokens\\.[\\w.]+)`))?.[1];
}

/** The expression of the first `color`/`tintColor` prop after `marker`. */
function colorPropAfter(src: string, marker: string): string | undefined {
	const start = src.indexOf(marker);
	if (start === -1) return undefined;
	return src
		.slice(start)
		.match(/\b(?:tintColor|color)=\{([^}]+)\}/)?.[1]
		.replace(/\s+/g, ' ')
		.trim();
}

describe('scanner content on accent.primary fills uses text.inverse', () => {
	const scan = 'app/scan.tsx';
	const capture = 'components/shelf-scan-capture.tsx';
	const review = 'components/shelf-scan-review.tsx';

	it.each([
		[scan, 'primaryButton', 'primaryButtonText'],
		[capture, 'finishButton', 'finishText'],
		[capture, 'introButton', 'introButtonText'],
		[capture, 'primaryButton', 'primaryButtonText'],
		[review, 'addButton', 'addButtonText'],
		[review, 'primaryButton', 'primaryButtonText'],
	])('%s: %s label', (file, fill, label) => {
		const src = source(file);
		expect(styleToken(src, fill, 'backgroundColor')).toBe('tokens.accent.primary');
		expect(styleToken(src, label, 'color')).toBe('tokens.text.inverse');
	});

	it.each([
		['done checkmark', 'doneCheck', 'style={styles.doneCheck}', 'tokens.text.inverse'],
		[
			'active list toggle',
			'viewToggleActive',
			'name="list.bullet"',
			"view === 'list' ? tokens.text.inverse : tokens.text.secondary",
		],
		[
			'active grid toggle',
			'viewToggleActive',
			'name="square.grid.2x2"',
			"view === 'grid' ? tokens.text.inverse : tokens.text.secondary",
		],
		['add-button spinner', 'addButton', '{adding ? (', 'tokens.text.inverse'],
		['checkbox checkmark', 'checkboxOn', 'styles.checkboxOn]}', 'tokens.text.inverse'],
		['tile checkmark', 'tileCheck', 'style={styles.tileCheck}', 'tokens.text.inverse'],
	])('shelf-scan-review: %s', (_name, fill, marker, expected) => {
		const src = source(review);
		expect(styleToken(src, fill, 'backgroundColor')).toBe('tokens.accent.primary');
		expect(colorPropAfter(src, marker)).toBe(expected);
	});
});
