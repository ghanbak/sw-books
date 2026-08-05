import type { Book } from '@/lib/hooks';

/**
 * Timeline helpers. `eraLabel` formats a signed `timeline_order` as a Star Wars
 * dating label (BBY before the Battle of Yavin, ABY after) — shared by the book
 * card, book detail, and the Timeline tab so they always agree. `groupBooksByYear`
 * powers the Timeline tab's horizontal scroll + notch rail.
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

/** One date with at least one book — a notch on the rail. */
export type TimelineGroup = {
	order: number;
	label: string;
	count: number;
	/** Page index of this group's first book — lets the rail scroll the pager to a group. */
	firstPage: number;
};

export type TimelineData = {
	/** Books with a timeline_order, oldest -> newest. One per horizontal page. */
	books: Book[];
	/** One entry per year-with-books (the rail notches), oldest -> newest. */
	groups: TimelineGroup[];
	/** pageToGroup[pageIndex] = index into `groups` for that page's book. */
	pageToGroup: number[];
};

/**
 * Order books chronologically and bucket them by date. Books without a
 * `timeline_order` are excluded (they have no place on the axis). Books that share
 * a `timeline_order` form one group (one notch) — paging through them keeps the same
 * notch active; the notch only advances when the date changes. Within a date, books
 * are ordered by series order then title so paging is stable across reloads.
 */
export function groupBooksByYear(books: Book[]): TimelineData {
	const ordered = books
		.filter((b): b is Book & { timeline_order: number } => b.timeline_order != null)
		.slice()
		.sort(
			(a, b) =>
				a.timeline_order - b.timeline_order ||
				(a.series_order ?? 0) - (b.series_order ?? 0) ||
				a.title.localeCompare(b.title),
		);

	const groups: TimelineGroup[] = [];
	const pageToGroup: number[] = [];
	let lastOrder: number | null = null;

	for (const b of ordered) {
		if (lastOrder === null || b.timeline_order !== lastOrder) {
			// firstPage = this book's page index. pageToGroup holds one entry per already-placed
			// page, so its current length IS the page index of the book about to be pushed.
			groups.push({
				order: b.timeline_order,
				label: eraLabel(b.timeline_order),
				count: 0,
				firstPage: pageToGroup.length,
			});
			lastOrder = b.timeline_order;
		}
		const group = groups[groups.length - 1];
		group.count += 1;
		pageToGroup.push(groups.length - 1);
	}

	return { books: ordered, groups, pageToGroup };
}

/**
 * Rail geometry — shared by the rail's transform and the tap/scrub gestures. The rail is
 * index-spaced: one notch per group, `RAIL_PITCH` points apart (gaps between dates can be
 * millennia, so it is NOT to-scale). All helpers are pure and marked `'worklet'` so the scrub
 * gesture can call them on the UI thread; they run identically on the JS thread.
 */
export const RAIL_PITCH = 28;

/** Row-local x of a group's tick center. */
export function groupCenterX(index: number): number {
	'worklet';
	return index * RAIL_PITCH + RAIL_PITCH / 2;
}

/** The row translateX that centers a (possibly fractional) group index under the hero. */
export function railTranslateX(width: number, groupIndex: number): number {
	'worklet';
	return width / 2 - groupCenterX(groupIndex);
}

/**
 * Inverse of the rail transform: the (fractional) group index sitting under screen-x `x` for a
 * given `translateX`. `indexAtScreenX(width/2, railTranslateX(width, k)) === k`.
 */
export function indexAtScreenX(x: number, translateX: number): number {
	'worklet';
	return (x - translateX - RAIL_PITCH / 2) / RAIL_PITCH;
}

/** Clamp a group index into `[0, count - 1]`. */
export function clampIndex(index: number, count: number): number {
	'worklet';
	return Math.min(Math.max(index, 0), count - 1);
}
