/**
 * Leaving the scan modal for a tab. Scan is a root-stack `fullScreenModal` above the
 * mounted `(tabs)` anchor, so `push` would stack a second tab tree over the scanner
 * (Back would then return to the camera). `dismissTo` pops the root stack back to the
 * existing `(tabs)` route and selects the target tab; if `(tabs)` isn't in history
 * (cold deep link to /scan) it replaces the modal instead. Same pattern as AuthGate in
 * `app/_layout.tsx`. Type-only import keeps this testable in the node vitest env.
 */
import type { ImperativeRouter } from 'expo-router';

type ScanExitHref = Parameters<ImperativeRouter['dismissTo']>[0];

export function exitScanTo(router: Pick<ImperativeRouter, 'dismissTo'>, href: ScanExitHref): void {
	router.dismissTo(href);
}
