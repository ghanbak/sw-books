import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Accessibility primitives for the shelf scanner (plan Phase 6). Kept in `hooks/`
 * (not `lib/`) because they depend on React Native's `AccessibilityInfo`.
 *
 * The scanner's hero interaction is *silent auto-capture* driven by a visual ghost
 * overlay and a flash flourish — invisible to a screen-reader user and jarring under
 * reduce-motion. These hooks let the UI speak its state changes and tone its motion
 * down without sprinkling listener boilerplate through the components.
 */

/** True while the OS "Reduce Motion" setting is on; live-updates on change. */
export function useReduceMotion(): boolean {
	const [reduceMotion, setReduceMotion] = useState(false);
	useEffect(() => {
		let alive = true;
		AccessibilityInfo.isReduceMotionEnabled().then((value) => {
			if (alive) setReduceMotion(value);
		});
		const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
		return () => {
			alive = false;
			sub.remove();
		};
	}, []);
	return reduceMotion;
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
