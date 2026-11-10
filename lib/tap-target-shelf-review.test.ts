import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MIN_TAP_TARGET, slopBoundsStyle, squareHitSlop, verticalHitSlop } from './tap-target';

// Vitest is node-only (no render tests), so assert the wiring in source and recompute the
// arithmetic from the component's real style values. A style change that invalidates a
// measured size fails here instead of silently shrinking a target.
const src = readFileSync(resolve(__dirname, '..', 'components/shelf-scan-review.tsx'), 'utf8');
const stylesSrc = src.slice(src.indexOf('StyleSheet.create('));

function styleBlock(name: string): string {
	const match = stylesSrc.match(new RegExp(`\\b${name}:\\s*\\{([^}]*)\\}`));
	expect(match, `style ${name}`).not.toBeNull();
	return match?.[1] ?? '';
}

function styleNumber(block: string, prop: string): number {
	const match = block.match(new RegExp(`\\b${prop}:\\s*(\\d+)`));
	expect(match, `style prop ${prop}`).not.toBeNull();
	return Number(match?.[1]);
}

function constant(name: string): number {
	const match = src.match(new RegExp(`const ${name} = (\\d+);`));
	expect(match, `constant ${name}`).not.toBeNull();
	return Number(match?.[1]);
}

function objectConstant(name: string): string {
	const match = src.match(new RegExp(`const ${name} = \\{([^}]*)\\}`));
	expect(match, `object constant ${name}`).not.toBeNull();
	return match?.[1] ?? '';
}

function iconSize(symbol: string): number {
	const match = src.match(new RegExp(`name="${symbol}"\\s+size=\\{(\\d+)\\}`));
	expect(match, `icon ${symbol}`).not.toBeNull();
	return Number(match?.[1]);
}

/** A `<Pressable …>`'s props: everything up to its first child element. */
function pressableProps(marker: string): string {
	const props = src
		.split('<Pressable')
		.slice(1)
		.map((segment) => segment.split('<')[0])
		.find((segment) => segment.includes(marker));
	expect(props, `Pressable with ${marker}`).toBeDefined();
	return props ?? '';
}

function passesHitSlop(props: string, name: string): boolean {
	return new RegExp(`hitSlop=\\{\\s*${name}\\s*\\}`).test(props);
}

describe('shelf-scan review swap button', () => {
	it('passes square slop from its real size', () => {
		expect(passesHitSlop(pressableProps('styles.swapButton'), 'SWAP_HIT_SLOP')).toBe(true);
		expect(src).toMatch(/const SWAP_HIT_SLOP = squareHitSlop\(\s*SWAP_BUTTON_SIZE\s*\)/);
	});

	it('reaches 44x44, and only the right slop passes the row', () => {
		const size =
			iconSize('arrow\\.left\\.arrow\\.right') +
			styleNumber(styleBlock('swapButton'), 'padding') * 2;
		expect(constant('SWAP_BUTTON_SIZE')).toBe(size);

		const slop = squareHitSlop(size);
		expect(size + slop.left + slop.right).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
		expect(size + slop.top + slop.bottom).toBeGreaterThanOrEqual(MIN_TAP_TARGET);

		// The row is at least as tall as its 66pt cover, so vertical slop stays inside it.
		const row = styleBlock('row');
		expect(src).toMatch(/<DecorativeCover book=\{book\} width=\{44\} height=\{66\} \/>/);
		expect(66 + styleNumber(row, 'paddingTop') * 2).toBeGreaterThanOrEqual(size + slop.top * 2);
	});

	it('grows the row on the right through slopBoundsStyle', () => {
		expect(src).toMatch(
			/const SWAP_ROW_BOUNDS = slopBoundsStyle\(\s*\{\s*right:\s*SWAP_HIT_SLOP\.right,?\s*\}\s*\)/,
		);
		expect(styleBlock('row')).toContain('...SWAP_ROW_BOUNDS');
	});

	it('keeps the 8pt row padding the helper would zero', () => {
		const row = styleBlock('row');
		const spread = row.indexOf('...SWAP_ROW_BOUNDS');
		expect(spread).toBeGreaterThanOrEqual(0);
		// Edge padding beats paddingVertical, and the helper writes every edge.
		expect(row).not.toMatch(/\bpaddingVertical:/);
		expect(row.indexOf('paddingTop: 8')).toBeGreaterThan(spread);
		expect(row.indexOf('paddingBottom: 8')).toBeGreaterThan(spread);
	});
});

describe('shelf-scan review view toggles', () => {
	it('each toggle passes its own slop', () => {
		expect(
			passesHitSlop(pressableProps('accessibilityLabel="List view"'), 'LIST_TOGGLE_HIT_SLOP'),
		).toBe(true);
		expect(
			passesHitSlop(pressableProps('accessibilityLabel="Grid view"'), 'GRID_TOGGLE_HIT_SLOP'),
		).toBe(true);
	});

	it('slop goes vertical plus the outer edge only, so the toggles never overlap', () => {
		const list = objectConstant('LIST_TOGGLE_HIT_SLOP');
		const grid = objectConstant('GRID_TOGGLE_HIT_SLOP');
		for (const body of [list, grid]) {
			expect(body).toMatch(/\.\.\.verticalHitSlop\(\s*VIEW_TOGGLE_HEIGHT\s*\)/);
		}
		expect(list).toMatch(/\bleft:\s*VIEW_TOGGLE_OUTER_SLOP/);
		expect(list).not.toMatch(/\bright:/);
		expect(grid).toMatch(/\bright:\s*VIEW_TOGGLE_OUTER_SLOP/);
		expect(grid).not.toMatch(/\bleft:/);
		expect(styleBlock('viewToggle')).not.toMatch(/\bgap:/);
	});

	it('reaches 44x44 from the real styles', () => {
		const button = styleBlock('viewToggleButton');
		const icon = iconSize('list\\.bullet');
		expect(iconSize('square\\.grid\\.2x2')).toBe(icon);

		const width = icon + styleNumber(button, 'paddingHorizontal') * 2;
		const height = icon + styleNumber(button, 'paddingVertical') * 2;
		expect(constant('VIEW_TOGGLE_WIDTH')).toBe(width);
		expect(constant('VIEW_TOGGLE_HEIGHT')).toBe(height);

		const vertical = verticalHitSlop(height);
		expect(height + vertical.top + vertical.bottom).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
		expect(width + constant('VIEW_TOGGLE_OUTER_SLOP')).toBeGreaterThanOrEqual(MIN_TAP_TARGET);
	});

	it('grows the toggle bounds through slopBoundsStyle, reaching every slop', () => {
		expect(src).toMatch(
			/const VIEW_TOGGLE_BOUNDS = slopBoundsStyle\(\s*\{\s*top:\s*VIEW_TOGGLE_OUTSET,\s*bottom:\s*VIEW_TOGGLE_OUTSET,\s*left:\s*VIEW_TOGGLE_OUTSET,\s*right:\s*VIEW_TOGGLE_OUTSET,?\s*\}\s*\)/,
		);
		expect(styleBlock('viewToggle')).toContain('...VIEW_TOGGLE_BOUNDS');

		const reach = constant('VIEW_TOGGLE_OUTSET') + constant('VIEW_TOGGLE_PILL_INSET');
		expect(reach).toBeGreaterThanOrEqual(constant('VIEW_TOGGLE_OUTER_SLOP'));
		expect(reach).toBeGreaterThanOrEqual(verticalHitSlop(constant('VIEW_TOGGLE_HEIGHT')).top);
	});

	it('nets to the original 2pt pill footprint', () => {
		const block = styleBlock('viewToggle');
		const spread = block.indexOf('...VIEW_TOGGLE_BOUNDS');
		expect(spread).toBeGreaterThanOrEqual(0);
		for (const edge of ['Top', 'Bottom', 'Left', 'Right']) {
			const padding = block.search(
				new RegExp(`padding${edge}:\\s*VIEW_TOGGLE_OUTSET\\s*\\+\\s*VIEW_TOGGLE_PILL_INSET`),
			);
			expect(padding, `padding${edge} added back after the spread`).toBeGreaterThan(spread);
		}

		const outset = constant('VIEW_TOGGLE_OUTSET');
		const inset = constant('VIEW_TOGGLE_PILL_INSET');
		const bounds = slopBoundsStyle({ top: outset, bottom: outset, left: outset, right: outset });
		expect(inset).toBe(2);
		expect(bounds.paddingTop + inset + bounds.marginTop).toBe(inset);
		expect(bounds.paddingLeft + inset + bounds.marginLeft).toBe(inset);
	});

	it('keeps the card background at the original size', () => {
		const block = styleBlock('viewToggle');
		expect(block).not.toContain('backgroundColor');
		expect(block).not.toContain('borderRadius');

		const pill = styleBlock('viewTogglePill');
		expect(pill).toMatch(/position:\s*'absolute'/);
		expect(pill).toMatch(/backgroundColor:\s*tokens\.surface\.card/);
		expect(pill).toMatch(/borderRadius:\s*8/);
		for (const edge of ['top', 'bottom', 'left', 'right']) {
			expect(pill).toMatch(new RegExp(`\\b${edge}:\\s*VIEW_TOGGLE_OUTSET`));
		}
		// First child, so it paints behind the toggles and their active fill.
		expect(src).toMatch(
			/<View style=\{styles\.viewToggle\}>\s*<View style=\{styles\.viewTogglePill\} \/>\s*<Pressable/,
		);
	});
});

describe('shelf-scan review Discard & start over', () => {
	it('passes vertical slop sized from its real height', () => {
		expect(passesHitSlop(pressableProps('styles.startOver'), 'START_OVER_HIT_SLOP')).toBe(true);
		expect(src).toMatch(/const START_OVER_HIT_SLOP = verticalHitSlop\(\s*START_OVER_HEIGHT\s*\)/);
	});

	it('reaches 44pt tall and stretches the footer width', () => {
		// 13pt system text renders about 15.5pt tall. Floored so sub-point rounding can't
		// leave the target short of 44.
		const line = Math.floor(styleNumber(styleBlock('startOverText'), 'fontSize') * 1.19);
		const height = line + styleNumber(styleBlock('startOver'), 'paddingVertical') * 2;
		expect(constant('START_OVER_HEIGHT')).toBe(height);

		const slop = verticalHitSlop(height);
		expect(height + slop.top + slop.bottom).toBeGreaterThanOrEqual(MIN_TAP_TARGET);

		expect(styleBlock('footer')).not.toMatch(/\balignItems:/);
		expect(styleBlock('startOver')).not.toMatch(/\b(alignSelf|width):/);
	});

	it('fits the footer without overlapping the Add button', () => {
		const slop = verticalHitSlop(constant('START_OVER_HEIGHT'));
		expect(slop.top).toBeLessThan(styleNumber(styleBlock('footer'), 'gap'));
		expect(pressableProps('styles.addButton')).not.toContain('hitSlop');

		const paddingBottom = src.match(/styles\.footer, \{ paddingBottom: insets\.bottom \+ (\d+) \}/);
		expect(paddingBottom).not.toBeNull();
		expect(slop.bottom).toBeLessThanOrEqual(Number(paddingBottom?.[1]));
	});
});
