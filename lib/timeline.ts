/**
 * Timeline helpers. `eraLabel` formats a signed `timeline_order` as a Star Wars
 * dating label (BBY before the Battle of Yavin, ABY after) — shared by the book
 * card, book detail, and the Timeline tab so they always agree. The Timeline tab's
 * grouping helpers are added in a later step.
 */

function groupThousands(value: number): string {
	return Math.trunc(value)
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** e.g. -25793 -> "25,793 BBY", 5 -> "5 ABY", 0 -> "0 ABY". */
export function eraLabel(order: number): string {
	const era = order < 0 ? 'BBY' : 'ABY';
	return `${groupThousands(Math.abs(order))} ${era}`;
}
