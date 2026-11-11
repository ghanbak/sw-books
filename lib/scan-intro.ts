import type { SFSymbol } from 'expo-symbols';

/**
 * "Introduce scan mode" first-run intro (#74/#105): the four ways scan mode adds books.
 * Pure so the copy, icons and spoken labels unit-test in the node vitest env;
 * `ShelfIntro` only lays them out.
 */

export type ScanIntroPoint = {
	/** Stable key for list rendering and tests. */
	id: 'shelf' | 'cover' | 'barcode' | 'review';
	/** SF Symbol shown in the row's icon tile (decorative; the row label carries meaning). */
	icon: SFSymbol;
	title: string;
	body: string;
	/** One VoiceOver stop per row: title and body read together. */
	accessibilityLabel: string;
};

export const SCAN_INTRO_TITLE = 'Scan mode';
export const SCAN_INTRO_BUTTON = 'Start Scanning';
export const SCAN_INTRO_BUTTON_HINT = 'Opens the camera';

function point(id: ScanIntroPoint['id'], icon: SFSymbol, title: string, body: string) {
	return { id, icon, title, body, accessibilityLabel: `${title}. ${body}` };
}

/**
 * @param shelfHowTo the shelf-scan instruction from `shelfIntroCopy` — it already
 *   switches to the manual-shutter wording when a screen reader is on.
 * @param screenReaderEnabled VoiceOver users double-tap instead of tap.
 */
export function scanIntroPoints({
	shelfHowTo,
	screenReaderEnabled,
}: {
	shelfHowTo: string;
	screenReaderEnabled: boolean;
}): readonly ScanIntroPoint[] {
	const tap = screenReaderEnabled ? 'Double-tap' : 'Tap';
	return [
		point('shelf', 'books.vertical', 'Scan your shelf', shelfHowTo),
		point(
			'cover',
			'book.closed',
			'Scan a book cover',
			"Hold a single cover in view and we'll find it in the Archive.",
		),
		point(
			'barcode',
			'barcode.viewfinder',
			'Scan an ISBN barcode',
			'Line up the barcode on the back. Keep scanning to add one book after another.',
		),
		point(
			'review',
			'checklist',
			'Review and add',
			`${tap} Finish to check what we found, then add the books to your library.`,
		),
	];
}
