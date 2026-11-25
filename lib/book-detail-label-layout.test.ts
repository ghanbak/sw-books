import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #405: the book-detail rows had a fixed 80pt label column, so "Continuity", "Publisher" and
// the rest broke mid-word at large text sizes. The column now scales with the font and stacks
// over the value at accessibility sizes, the same as the book row (#431). Source-level so it
// runs without a React Native renderer.
const source = readFileSync(resolve(__dirname, '../app/book/[id].tsx'), 'utf8');

async function loadLayout() {
	return import('@/lib/label-column');
}

/** Body of a `name: { ... }` StyleSheet block, or null when the block is missing. */
function styleBlock(name: string): string | null {
	return source.match(new RegExp(`\\n\\t${name}:\\s*\\{([^}]*)\\}`))?.[1] ?? null;
}

// SF Pro 13pt regular widths at 1x (NSString.size(withAttributes:)), every DetailRow label.
const LABELS_AT_1X: Record<string, number> = {
	Continuity: 61.9,
	Type: 29.5,
	Publisher: 56.5,
	Published: 59.5,
	Language: 59.6,
	Timeline: 51.0,
	Name: 35.3,
	Book: 30.7,
	ISBN: 29.6,
	'Timeline Era': 74.2,
};

describe('book-detail label column (#405)', () => {
	it('drops the fixed width from the detailLabel style', () => {
		const label = styleBlock('detailLabel');
		expect(label).not.toBeNull();
		expect(label).toMatch(/fontSize:\s*13\b/);
		expect(label).not.toMatch(/\bwidth:/);
	});

	it('sizes the label from labelColumnLayout and the 80pt base', () => {
		expect(source).toMatch(/const DETAIL_LABEL_WIDTH = 80;/);
		expect(source).toMatch(/useWindowDimensions\(\)/);
		expect(source).toMatch(
			/labelColumnLayout\(\s*\{\s*width:\s*DETAIL_LABEL_WIDTH\s*,\s*fontScale\s*\}\s*\)/,
		);
		expect(source).toMatch(/styles\.detailLabel\s*,\s*\{\s*width:\s*column\.width\s*\}/);
	});

	it('stacks label over value when the layout says so', () => {
		expect(source).toMatch(/column\.stacked\s*\?\s*\(\s*<View style=\{styles\.detailStack\}>/);
		const stacked = styleBlock('detailStack');
		expect(stacked).not.toBeNull();
		expect(stacked).not.toMatch(/flexDirection:\s*'row'/);
		expect(stacked).toMatch(/flex:\s*1\b/);
		const stackedLabel = styleBlock('detailLabelStacked');
		expect(stackedLabel).not.toBeNull();
		expect(stackedLabel).not.toMatch(/\bwidth:/);
	});

	it('renders the label and value in both layouts', () => {
		const row = source.slice(source.indexOf('function DetailRow'));
		const body = row.slice(0, row.indexOf('\nconst styles'));
		expect(body.match(/>\{label\}<\/Text>/g)).toHaveLength(2);
		expect(body.match(/\{value\}/g)).toHaveLength(2);
		expect(body.match(/\{leading\}/g)).toHaveLength(2);
	});

	it('fits every label word in the scaled column up to the stack size', async () => {
		const { labelColumnLayout, LABEL_COLUMN_STACK_SCALE } = await loadLayout();
		for (const scale of [1, 1.118, 1.235, 1.353, LABEL_COLUMN_STACK_SCALE - 0.01]) {
			const { width, stacked } = labelColumnLayout({ width: 80, fontScale: scale });
			expect(stacked).toBe(false);
			// Every label fits whole at 1x, so it fits whole in the column at any scale below stacking.
			for (const [label, w] of Object.entries(LABELS_AT_1X)) {
				expect(w * scale, `${label} @ ${scale}`).toBeLessThanOrEqual(width);
			}
		}
	});

	it('stacks at iOS AX1 through AX5', async () => {
		const { labelColumnLayout } = await loadLayout();
		for (const scale of [1.5, 1.786, 2.353, 3.118]) {
			expect(labelColumnLayout({ width: 80, fontScale: scale }).stacked).toBe(true);
		}
	});

	it('never caps or disables font scaling on the screen', () => {
		expect(source).not.toMatch(/maxFontSizeMultiplier|allowFontScaling/);
	});
});
