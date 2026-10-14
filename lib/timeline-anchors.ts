/**
 * Films and TV shows as fixed points on the Timeline rail — context for where a book
 * sits relative to the screen stories people already know. Static and hand-curated:
 * the set is small (~25) and changes a few times a decade, so a module beats a table
 * (no migration, RLS, types regen, or admin surface for rows nobody edits).
 *
 * `timeline_order` is the SAME signed axis as `books.timeline_order` — negative = BBY,
 * positive = ABY. Titles that span years (The Clone Wars, Andor, Rebels) use their
 * START year for v1; range bands are a future enhancement.
 *
 * NOTE: these dates are hand-entered and should be spot-checked against a canon
 * reference before shipping — a wrong value silently misplaces an anchor on the rail.
 */

import { type TimelineGroup, fractionalIndexForOrder, groupCenterX } from '@/lib/timeline';

export type MediaKind = 'film' | 'series';

export type TimelineAnchor = {
	title: string;
	kind: MediaKind;
	/** BBY negative, ABY positive — same axis as books.timeline_order. */
	timeline_order: number;
};

export const TIMELINE_ANCHORS: TimelineAnchor[] = [
	// --- High Republic era ---
	{ title: 'The Acolyte', kind: 'series', timeline_order: -132 },

	// --- Prequel era ---
	{ title: 'The Phantom Menace', kind: 'film', timeline_order: -32 },
	{ title: 'Attack of the Clones', kind: 'film', timeline_order: -22 },
	{ title: 'The Clone Wars', kind: 'series', timeline_order: -22 },
	{ title: 'Revenge of the Sith', kind: 'film', timeline_order: -19 },
	{ title: 'The Bad Batch', kind: 'series', timeline_order: -19 },

	// --- Reign of the Empire ---
	{ title: 'Solo', kind: 'film', timeline_order: -10 },
	{ title: 'Obi-Wan Kenobi', kind: 'series', timeline_order: -9 },
	{ title: 'Andor', kind: 'series', timeline_order: -5 },
	{ title: 'Rebels', kind: 'series', timeline_order: -5 },
	{ title: 'Rogue One', kind: 'film', timeline_order: 0 },

	// --- Galactic Civil War ---
	{ title: 'A New Hope', kind: 'film', timeline_order: 0 },
	{ title: 'The Empire Strikes Back', kind: 'film', timeline_order: 3 },
	{ title: 'Return of the Jedi', kind: 'film', timeline_order: 4 },

	// --- New Republic ---
	{ title: 'The Mandalorian', kind: 'series', timeline_order: 9 },
	{ title: 'The Book of Boba Fett', kind: 'series', timeline_order: 9 },
	{ title: 'Ahsoka', kind: 'series', timeline_order: 9 },
	{ title: 'Skeleton Crew', kind: 'series', timeline_order: 9 },

	// --- Sequel era ---
	{ title: 'The Force Awakens', kind: 'film', timeline_order: 34 },
	{ title: 'Resistance', kind: 'series', timeline_order: 34 },
	{ title: 'The Last Jedi', kind: 'film', timeline_order: 34 },
	{ title: 'The Rise of Skywalker', kind: 'film', timeline_order: 35 },
];

// ---------------------------------------------------------------------------
// Pill layout. Markers sit on an index-spaced rail only RAIL_PITCH (28pt) apart and
// several share a year (four shows at 9 ABY). Markers on the same date merge into one
// pill ("The Mandalorian +3") that the rail can expand on tap; pills on different dates
// that would still overlap are stacked into rows (first-fit by left edge — the fewest
// rows for a set of intervals), so nothing is hidden. Row 0 sits right above the
// notches. The layout doesn't depend on the current date, so pills never reshuffle
// mid-scrub. Widths are estimated (no measurement pass), with a margin for safety.
// ---------------------------------------------------------------------------

export type AnchorPill = {
	key: string;
	/** Row-local x of the markers' date (rides the rail's translateX). */
	x: number;
	kind: MediaKind;
	/** "Title" or "Title +N" when several markers share the date. */
	label: string;
	/** Every marker on this date, in curated order (first = the one named in `label`). */
	members: TimelineAnchor[];
	/** 0 = the row right above the notches; higher rows stack upward. */
	row: number;
};

export type AnchorLayout = { pills: AnchorPill[]; rows: number };

const PILL_PAD_X = 6;
const PILL_ICON = 10;
const PILL_GAP = 3;
const PILL_CHAR_W = 5.8; // ~10pt semibold glyph advance, rounded up for safety
const PILL_SPACING = 6;
const CLUSTER_PX = 6;
const MAX_LABEL_CHARS = 24;

export function estimatePillWidth(label: string): number {
	return PILL_PAD_X * 2 + PILL_ICON + PILL_GAP + label.length * PILL_CHAR_W;
}

export function truncateAnchorTitle(title: string): string {
	return title.length > MAX_LABEL_CHARS ? `${title.slice(0, MAX_LABEL_CHARS - 1)}…` : title;
}

export function layoutAnchorPills(
	anchors: TimelineAnchor[],
	groups: TimelineGroup[],
): AnchorLayout {
	if (groups.length === 0 || anchors.length === 0) return { pills: [], rows: 0 };

	// 1. Position every marker and merge those that land on (nearly) the same spot.
	const placed = anchors
		.map((a, i) => ({ a, i, x: groupCenterX(fractionalIndexForOrder(a.timeline_order, groups)) }))
		.sort((p, q) => p.x - q.x || p.i - q.i);
	const clusters: { x: number; members: TimelineAnchor[] }[] = [];
	for (const p of placed) {
		const last = clusters[clusters.length - 1];
		if (last && p.x - last.x <= CLUSTER_PX) last.members.push(p.a);
		else clusters.push({ x: p.x, members: [p.a] });
	}

	// 2. Stack any pills that still overlap into rows.
	const sized = clusters
		.map((c) => {
			const first = c.members[0] as TimelineAnchor;
			const extra = c.members.length - 1;
			const label =
				extra > 0
					? `${truncateAnchorTitle(first.title)} +${extra}`
					: truncateAnchorTitle(first.title);
			const half = estimatePillWidth(label) / 2;
			return { c, first, label, lo: c.x - half, hi: c.x + half };
		})
		.sort((p, q) => p.lo - q.lo);

	const rowEnds: number[] = [];
	const pills = sized.map(({ c, first, label, lo, hi }) => {
		let row = rowEnds.findIndex((end) => lo >= end);
		if (row === -1) {
			row = rowEnds.length;
			rowEnds.push(0);
		}
		rowEnds[row] = hi + PILL_SPACING;
		return {
			key: c.members.map((m) => `${m.kind}-${m.title}`).join('|'),
			x: c.x,
			kind: first.kind,
			label,
			members: c.members,
			row,
		};
	});

	return { pills, rows: rowEnds.length };
}
