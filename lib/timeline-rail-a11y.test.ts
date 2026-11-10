import { describe, expect, it } from 'vitest';

import { RAIL_A11Y_ACTIONS, railA11yStep } from '@/lib/timeline-rail-a11y';

describe('timeline rail a11y', () => {
	it('exposes increment and decrement', () => {
		expect(RAIL_A11Y_ACTIONS.map((a) => a.name)).toEqual(['increment', 'decrement']);
	});

	it('steps one date per action', () => {
		expect(railA11yStep('increment', 3, 10)).toBe(4);
		expect(railA11yStep('decrement', 3, 10)).toBe(2);
	});

	it('is a no-op at the ends, on unknown actions, and on an empty rail', () => {
		expect(railA11yStep('increment', 9, 10)).toBeNull();
		expect(railA11yStep('decrement', 0, 10)).toBeNull();
		expect(railA11yStep('activate', 3, 10)).toBeNull();
		expect(railA11yStep('increment', 0, 0)).toBeNull();
		expect(railA11yStep('increment', 0, 1)).toBeNull();
	});
});
