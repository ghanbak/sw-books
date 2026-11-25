import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// #431: at large text sizes the row's fixed 80pt data column broke "LEGENDS" / "TIMELINE"
// mid-word. The column now scales with the font and stacks under the row at accessibility
// sizes. Source-level so it runs without a React Native renderer.
function read(rel: string): string {
	const p = resolve(__dirname, rel);
	return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

const source = read('book-card.tsx');
const badgeSource = read('ui/canon-badge.tsx');

async function loadLayout() {
	return import('@/lib/label-column');
}

/** Body of a `name: { ... }` StyleSheet block, or null when the block is missing. */
function styleBlock(name: string): string | null {
	return source.match(new RegExp(`\\n\\t${name}:\\s*\\{([^}]*)\\}`))?.[1] ?? null;
}

// SF Pro widths at 1x (NSAttributedString, same weights and letter spacing as the styles).
const AT_1X = {
	timelineLabel: 58, // 'TIMELINE' 11pt semibold, letterSpacing 0.6
	legendsBadge: 53, // 'LEGENDS' 10pt bold, letterSpacing 0.5, before 12pt padding
	longestEraWord: 44, // '25,793' 13pt, from '25,793 BBY' (longest seed era)
};
const COLUMN_INSET = 12 + 0.5; // paddingLeft + hairline divider
const BADGE_PADDING = 12;

describe('labelColumnLayout (#431)', () => {
	it('keeps the base width at default and smaller text', async () => {
		const { labelColumnLayout } = await loadLayout();
		expect(labelColumnLayout({ width: 80, fontScale: 1 })).toEqual({ stacked: false, width: 80 });
		expect(labelColumnLayout({ width: 80, fontScale: 0.85 })).toEqual({
			stacked: false,
			width: 80,
		});
	});

	it('grows the column with the font below the stack size', async () => {
		const { labelColumnLayout } = await loadLayout();
		expect(labelColumnLayout({ width: 80, fontScale: 1.3 })).toEqual({
			stacked: false,
			width: 104,
		});
	});

	it('stacks at Android 200% and iOS AX1 through AX5', async () => {
		const { labelColumnLayout, LABEL_COLUMN_STACK_SCALE } = await loadLayout();
		expect(LABEL_COLUMN_STACK_SCALE).toBeLessThanOrEqual(1.5);
		for (const scale of [1.5, 1.786, 2, 3.571]) {
			expect(labelColumnLayout({ width: 80, fontScale: scale }).stacked).toBe(true);
		}
	});

	it('fits every unbreakable word in the scaled column up to the stack size', async () => {
		const { labelColumnLayout, LABEL_COLUMN_STACK_SCALE } = await loadLayout();
		for (const scale of [1, 1.118, 1.15, 1.235, 1.3, 1.353, LABEL_COLUMN_STACK_SCALE - 0.01]) {
			const inner = labelColumnLayout({ width: 80, fontScale: scale }).width - COLUMN_INSET;
			expect(AT_1X.timelineLabel * scale).toBeLessThanOrEqual(inner);
			expect(AT_1X.legendsBadge * scale + BADGE_PADDING).toBeLessThanOrEqual(inner);
			expect(AT_1X.longestEraWord * scale).toBeLessThanOrEqual(inner);
		}
	});
});

describe('book-card large text (#431)', () => {
	it('drops the fixed width from the data column style', () => {
		const data = styleBlock('data');
		expect(data).not.toBeNull();
		expect(data).not.toMatch(/\bwidth:/);
		expect(data).toMatch(/paddingLeft:\s*12\b/);
	});

	it('sizes the column from labelColumnLayout and the base constant', () => {
		expect(source).toMatch(/useWindowDimensions\(\)/);
		expect(source).toMatch(
			/labelColumnLayout\(\s*\{\s*width:\s*BOOK_CARD_DATA_WIDTH\s*,\s*fontScale\s*\}\s*\)/,
		);
		expect(source).toMatch(/width:\s*column\.width\b/);
	});

	it('has a stacked data style with no fixed width', () => {
		const stacked = styleBlock('dataStacked');
		expect(stacked).not.toBeNull();
		expect(stacked).not.toMatch(/\bwidth:/);
		expect(stacked).toMatch(/flexWrap:\s*'wrap'/);
		expect(stacked).toMatch(/borderTopWidth:/);
	});

	it('renders the stacked column when the layout says so', () => {
		expect(source).toMatch(/column\.stacked\s*\?[\s\S]*?style=\{\s*styles\.dataStacked\s*\}/);
	});

	it('renders the same fields in both layouts', () => {
		expect(source.match(/<BookCardData\b/g)).toHaveLength(2);
		const dataFn = source.slice(source.indexOf('function BookCardData'));
		expect(dataFn).toMatch(/<CanonBadge/);
		expect(dataFn).toMatch(/TIMELINE/);
		expect(dataFn).toMatch(/eraLabel\(\s*book\.timeline_order\s*\)/);
	});

	it('never caps or disables font scaling in the row or badge', () => {
		for (const src of [source, badgeSource]) {
			expect(src).not.toMatch(/maxFontSizeMultiplier|allowFontScaling/);
		}
	});
});
