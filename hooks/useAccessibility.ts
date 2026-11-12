import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Accessibility primitives for the shelf scanner (plan Phase 6). Kept in `hooks/`
 * (not `lib/`) because they depend on React Native's `AccessibilityInfo`.
 *
 * The scanner's hero interaction is *silent auto-capture* driven by a visual ghost
 * overlay and a flash flourish — invisible to a screen-reader user and jarring under
 * reduce-motion. These hooks let the UI speak its state changes and tone its motion
 * down without sprinkling listener boilerplate through the components.
 */

/**
 * Last Reduce Motion value seen from `AccessibilityInfo`, shared app-wide so screens
 * mounted after the first resolve start with the live value (the setting can change
 * after launch, which Reanimated's launch-time snapshot doesn't track).
 */
let lastKnownReduceMotion: boolean | null = null;

/**
 * True while the OS "Reduce Motion" setting is on; live-updates on change.
 *
 * Correct on the first render: seeded synchronously from the app-wide cache, else from
 * Reanimated's `useReducedMotion()` (a launch-time read of the system setting), so
 * consumers never play a frame of motion before `AccessibilityInfo` resolves.
 */
export function useReduceMotion(): boolean {
	const systemAtLaunch = useReducedMotion();
	const [reduceMotion, setReduceMotion] = useState(() => lastKnownReduceMotion ?? systemAtLaunch);
	useEffect(() => {
		let alive = true;
		const update = (value: boolean) => {
			lastKnownReduceMotion = value;
			if (alive) setReduceMotion(value);
		};
		AccessibilityInfo.isReduceMotionEnabled().then(update);
		const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
		return () => {
			alive = false;
			sub.remove();
		};
	}, []);
	return reduceMotion;
}

/** Last Reduce Transparency value seen, shared app-wide like `lastKnownReduceMotion`. */
let lastKnownReduceTransparency: boolean | null = null;

/**
 * True while the iOS "Reduce Transparency" setting is on; live-updates on change.
 *
 * There is no synchronous read, so before the first resolve it returns `true` (the opaque
 * fallback): a blur never flashes on for someone who turned it off. Later mounts start from
 * the app-wide cache. Always `false` on Android, where `AccessibilityInfo` reports false.
 */
export function useReduceTransparency(): boolean {
	const [reduceTransparency, setReduceTransparency] = useState(
		() => lastKnownReduceTransparency ?? true,
	);
	useEffect(() => {
		let alive = true;
		const update = (value: boolean) => {
			lastKnownReduceTransparency = value;
			if (alive) setReduceTransparency(value);
		};
		AccessibilityInfo.isReduceTransparencyEnabled().then(update);
		const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', update);
		return () => {
			alive = false;
			sub.remove();
		};
	}, []);
	return reduceTransparency;
}

/** True while VoiceOver/TalkBack is active; live-updates on change. */
export function useScreenReaderEnabled(): boolean {
	const [enabled, setEnabled] = useState(false);
	useEffect(() => {
		let alive = true;
		AccessibilityInfo.isScreenReaderEnabled().then((value) => {
			if (alive) setEnabled(value);
		});
		const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
		return () => {
			alive = false;
			sub.remove();
		};
	}, []);
	return enabled;
}

/**
 * Speak a message through the active screen reader. A no-op (silently) when none is
 * running, so callers don't need to gate on `useScreenReaderEnabled`. Cross-platform:
 * `announceForAccessibility` posts a VoiceOver/TalkBack announcement on both OSes.
 */
export function announce(message: string): void {
	AccessibilityInfo.announceForAccessibility(message);
}
