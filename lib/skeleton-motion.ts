/**
 * Motion props for `react-content-loader/native` skeletons. Pure (no React/native
 * imports) so the reduce-motion contract unit-tests in the node vitest env.
 *
 * The native loader reads `animate` only at mount and at the end of each sweep, and
 * `useReduceMotion()` resolves asynchronously (starts `false`). So `key` changes with
 * the mode: the loader remounts static instead of finishing one last sweep.
 */

export type SkeletonMotionProps = {
	key: 'static' | 'shimmer';
	animate: boolean;
	speed: number;
};

const SHIMMER_SPEED_S = 1.4;

export function skeletonMotionProps(reduceMotion: boolean): SkeletonMotionProps {
	return reduceMotion
		? { key: 'static', animate: false, speed: SHIMMER_SPEED_S }
		: { key: 'shimmer', animate: true, speed: SHIMMER_SPEED_S };
}
