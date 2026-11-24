import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// #401: shared scan-flow action button. Pure style resolution (react-native mocked to
// identity StyleSheet; no RN renderer in node-env vitest) plus source-level wiring checks
// that the 8 capture/review/queued actions render it.
vi.mock('react-native', () => ({
	Pressable: () => null,
	StyleSheet: { create: <T>(s: T) => s },
}));
vi.mock('@/components/ui/text', () => ({ Text: () => null }));
vi.mock('@/hooks/useAccessibility', () => ({ useReduceMotion: () => false }));

import { resolveButtonLabelStyle, resolveButtonStyle } from '@/components/ui/button';
import { tokens } from '@/constants/tokens';

type Style = Record<string, unknown>;
const flatten = (styles: readonly unknown[]): Style =>
	Object.assign({}, ...styles.filter((s): s is Style => !!s && typeof s === 'object'));

const resolveFlat = (over: Partial<Parameters<typeof resolveButtonStyle>[0]> = {}): Style =>
	flatten(
		resolveButtonStyle({
			variant: 'primary',
			pressed: false,
			disabled: false,
			reduceMotion: false,
			...over,
		}),
	);

describe('resolveButtonStyle', () => {
	it('fills primary with the accent and secondary with card + subtle border', () => {
		expect(resolveFlat().backgroundColor).toBe(tokens.accent.primary);
		const secondary = resolveFlat({ variant: 'secondary' });
		expect(secondary.backgroundColor).toBe(tokens.surface.card);
		expect(secondary.borderColor).toBe(tokens.border.subtle);
	});

	it('uses one 24/12 padding pair and a min (not fixed) height for both variants', () => {
		for (const variant of ['primary', 'secondary'] as const) {
			const s = resolveFlat({ variant });
			expect(s.paddingHorizontal).toBe(24);
			expect(s.paddingVertical).toBe(12);
			expect(s.minHeight).toBeGreaterThanOrEqual(44);
			expect(s.height).toBeUndefined();
		}
	});

	it('is at rest with no transform or opacity', () => {
		const s = resolveFlat();
		expect(s.transform).toBeUndefined();
		expect(s.opacity).toBeUndefined();
	});

	it('scales to 0.96 on press', () => {
		const s = resolveFlat({ pressed: true });
		expect(s.transform).toEqual([{ scale: 0.96 }]);
		expect(s.opacity).toBeUndefined();
	});

	it('dims instead of scaling on press under Reduce Motion', () => {
		const s = resolveFlat({ pressed: true, reduceMotion: true });
		expect(s.transform).toBeUndefined();
		expect(s.opacity).toBe(0.7);
	});

	it('dims to 0.38 when disabled and ignores press', () => {
		for (const variant of ['primary', 'secondary'] as const) {
			const s = resolveFlat({ variant, disabled: true, pressed: true });
			expect(s.opacity).toBe(0.38);
			expect(s.transform).toBeUndefined();
		}
	});

	it('labels primary with text.inverse and secondary with text.primary, wrapping', () => {
		const primary = flatten(resolveButtonLabelStyle('primary'));
		const secondary = flatten(resolveButtonLabelStyle('secondary'));
		expect(primary.color).toBe(tokens.text.inverse);
		expect(secondary.color).toBe(tokens.text.primary);
		expect(primary.flexShrink).toBe(1);
		expect(primary.fontSize).toBe(16);
	});
});

const read = (file: string) => readFileSync(resolve(__dirname, '..', file), 'utf8');

const ACTIONS: { file: string; label: string; variant: 'primary' | 'secondary' }[] = [
	{ file: 'shelf-scan-capture.tsx', label: 'Scan Another', variant: 'secondary' },
	{ file: 'shelf-scan-capture.tsx', label: 'Keep Scanning', variant: 'primary' },
	{ file: 'shelf-scan-capture.tsx', label: 'Start Over', variant: 'secondary' },
	{ file: 'shelf-scan-review.tsx', label: 'View Shelf', variant: 'primary' },
	{ file: 'shelf-scan-review.tsx', label: 'Scan More', variant: 'secondary' },
	{ file: 'shelf-scan-review.tsx', label: 'Cancel', variant: 'secondary' },
	{ file: 'shelf-scan-queued.tsx', label: 'Done', variant: 'primary' },
	{ file: 'shelf-scan-queued.tsx', label: 'Scan More', variant: 'secondary' },
];

/** The `<Button …>` element (props only) whose label is `label`, or null. */
const buttonElement = (src: string, label: string) => {
	for (const m of src.matchAll(/<Button\b([^>]*?)\/>/gs)) {
		if (new RegExp(`label=\\{?\\s*["']${label}["']`).test(m[1])) return m[1];
	}
	return null;
};

describe('scan-flow actions render the shared Button', () => {
	for (const file of new Set(ACTIONS.map((a) => a.file))) {
		it(`${file} imports it and drops the per-file button styles`, () => {
			const src = read(file);
			expect(src).toMatch(/import\s*\{\s*Button\s*\}\s*from\s*['"]@\/components\/ui\/button['"]/);
			expect(src).not.toMatch(/\b(primary|secondary|dismiss)Button(Text)?\s*:/);
		});
	}

	for (const { file, label, variant } of ACTIONS) {
		it(`${file} "${label}" is a ${variant} Button`, () => {
			const src = read(file);
			const props = buttonElement(src, label);
			expect(props, `<Button label="${label}"> in ${file}`).not.toBeNull();
			if (variant === 'secondary') expect(props).toMatch(/variant=["']secondary["']/);
			else expect(props).not.toMatch(/variant=["']secondary["']/);
			expect(src).not.toMatch(new RegExp(`>\\s*${label}\\s*</Text>\\s*</Pressable>`));
		});
	}
});
