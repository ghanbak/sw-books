/**
 * Screen-reader strings for book rows. Pure so they unit-test in the node vitest env; the
 * components only wire them to `accessibilityLabel`. None of these are rendered as text.
 */

/**
 * Book row / Timeline hero. An explicit label replaces a Pressable's child text, so the
 * row has to speak its `CanonBadge` itself. `canon` passes through as stored, as the badge
 * does: the badge's all-caps is styling, and spoken "CANON" can come out spelled.
 */
export function bookRowLabel({
	title,
	author,
	canon,
}: {
	title: string;
	author: string[];
	canon: string;
}): string {
	let label = author.length > 0 ? `${title} by ${author.join(', ')}` : title;
	if (canon) label += `, ${canon}`;
	return label;
}
