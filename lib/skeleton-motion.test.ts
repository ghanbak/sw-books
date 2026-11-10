import { skeletonMotionProps } from '@/lib/skeleton-motion';
import { describe, expect, it } from 'vitest';

describe('skeletonMotionProps', () => {
	it('disables the shimmer sweep when Reduce Motion is on', () => {
		expect(skeletonMotionProps(true).animate).toBe(false);
	});

	it('keeps the shimmer unchanged when Reduce Motion is off', () => {
		expect(skeletonMotionProps(false)).toMatchObject({ animate: true, speed: 1.4 });
	});

	it('remounts the loader when the setting flips, so no in-flight sweep finishes', () => {
		expect(skeletonMotionProps(true).key).not.toBe(skeletonMotionProps(false).key);
	});
});
