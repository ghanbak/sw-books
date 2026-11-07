import { describe, expect, it, vi } from 'vitest';

// Node-env vitest has no RN renderer, so the hook is called directly with React's hooks
// mocked to a single first-render pass: `useState` returns its initial value and
// `useEffect` never runs — exactly the frame before `AccessibilityInfo` resolves.
// Reanimated's synchronous system read is the mocked Reduce Motion source.
const { systemReduceMotion } = vi.hoisted(() => ({ systemReduceMotion: { value: true } }));

vi.mock('react', () => ({
	useState: <T>(init: T | (() => T)) => [
		typeof init === 'function' ? (init as () => T)() : init,
		() => {},
	],
	useEffect: () => {},
}));
vi.mock('react-native', () => ({
	AccessibilityInfo: {
		isReduceMotionEnabled: () => new Promise<boolean>(() => {}),
		addEventListener: () => ({ remove: () => {} }),
	},
}));
vi.mock('react-native-reanimated', () => ({
	useReducedMotion: () => systemReduceMotion.value,
}));

import { useReduceMotion } from '@/hooks/useAccessibility';

describe('useReduceMotion', () => {
	it('returns true on the first render when Reduce Motion is on', () => {
		systemReduceMotion.value = true;
		expect(useReduceMotion()).toBe(true);
	});

	it('returns false on the first render when Reduce Motion is off', () => {
		systemReduceMotion.value = false;
		expect(useReduceMotion()).toBe(false);
	});
});
