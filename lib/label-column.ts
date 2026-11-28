/**
 * Layout for a narrow fixed-width label column beside flexible content (#431; reused by #405).
 *
 * At default and smaller text the column keeps its base width. Above default it grows in step
 * with the font, so a single word ("LEGENDS", "TIMELINE") never breaks mid-word: the fixed
 * inset (padding, divider) does not scale, so every word that fits at 1x still fits. From
 * `LABEL_COLUMN_STACK_SCALE` (Android 150%+, iOS AX1+) the column would crowd out the content
 * beside it, so callers stack it under that content at full width instead.
 */
export const LABEL_COLUMN_STACK_SCALE = 1.5;

export type LabelColumnLayout = { stacked: boolean; width: number };

/** `width` is the column's 1x width; `fontScale` is `useWindowDimensions().fontScale`. */
export function labelColumnLayout({
	width,
	fontScale,
}: {
	width: number;
	fontScale: number;
}): LabelColumnLayout {
	return {
		stacked: fontScale >= LABEL_COLUMN_STACK_SCALE,
		width: Math.round(width * Math.max(1, fontScale)),
	};
}
