/**
 * Screen-reader strings for book rows. Pure so they unit-test in the node vitest env; the
 * components only wire them to `accessibilityLabel`. None of these are rendered as text.
 */

import { eraLabel } from '@/lib/timeline';

/**
 * Book row / Timeline hero. An explicit label replaces a Pressable's child text, so the
 * row has to speak its series name and `CanonBadge` itself, in reading order (#271).
 * Callers that don't show the series (the Timeline hero) omit `series_name`.
 * `canon` passes through as stored, as the badge does: the badge's all-caps is styling,
 * and spoken "CANON" can come out spelled.
 * `timeline_order` appends the era last, as the row's TIMELINE value (#449); null or missing
 * adds nothing, as the row hides it. Spoken as `eraLabel` shows it ("19 BBY"), matching the
 * Timeline rail's `accessibilityValue`. The Timeline hero omits it: its rail announces the date.
 */
export function bookRowLabel({
	title,
	author,
	canon,
	series_name,
	timeline_order,
}: {
	title: string;
	author: string[];
	canon: string;
	series_name?: string | null;
	timeline_order?: number | null;
}): string {
	let label = author.length > 0 ? `${title} by ${author.join(', ')}` : title;
	if (series_name) label += `, ${series_name}`;
	if (canon) label += `, ${canon}`;
	if (timeline_order != null) label += `, ${eraLabel(timeline_order)}`;
	return label;
}

/** ISBN-10 or ISBN-13 once hyphens and spaces are dropped; ISBN-10 may end in X. */
const ISBN_SHAPE = /^(\d{13}|\d{9}[\dX])$/;

/**
 * Book detail row (#403): one VoiceOver stop that speaks "<label>, <value>".
 * With `isbn`, the digits are spaced so they read one by one instead of as a
 * 13-digit number; a value that isn't ISBN-shaped passes through as shown.
 */
export function detailRowLabel(
	label: string,
	value: string | number,
	{ isbn = false }: { isbn?: boolean } = {},
): string {
	const text = String(value).trim();
	if (!text) return label;
	if (isbn) {
		const chars = text.replace(/[\s-]/g, '').toUpperCase();
		if (ISBN_SHAPE.test(chars)) return `${label}, ${chars.split('').join(' ')}`;
	}
	return `${label}, ${text}`;
}
