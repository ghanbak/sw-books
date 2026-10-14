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
// Pill layout. Every marker gets its own labeled pill. Markers sit on an index-spaced
// rail only RAIL_PITCH (28pt) apart and several share a year (four shows at 9 ABY), so
// pills that would overlap are stacked into rows: first-fit by left edge, which uses the
// fewest rows for a set of intervals. Row 0 sits right above the notches. The layout
// doesn't depend on the current date, so pills never reshuffle mid-scrub.
// Widths are estimated (no measurement pass), with a margin so real text never collides.
// ---------------------------------------------------------------------------

export type AnchorPill = {
	key: string;
	/** Row-local x of the marker's date (rides the rail's translateX). */
	x: number;
	kind: MediaKind;
	label: string;
	/** 0 = the row right above the notches; higher rows stack upward. */
	row: number;
};

export type AnchorLayout = { pills: AnchorPill[]; rows: number };

const PILL_PAD_X = 6;
const PILL_ICON = 10;
const PILL_GAP = 3;
const PILL_CHAR_W = 5.8; // ~10pt semibold glyph advance, rounded up for safety
const PILL_SPACING = 6;
const MAX_LABEL_CHARS = 24;

export function estimatePillWidth(label: string): number {
	return PILL_PAD_X * 2 + PILL_ICON + PILL_GAP + label.length * PILL_CHAR_W;
}

function truncate(title: string): string {
	return title.length > MAX_LABEL_CHARS ? `${title.slice(0, MAX_LABEL_CHARS - 1)}…` : title;
}

export function layoutAnchorPills(
	anchors: TimelineAnchor[],
	groups: TimelineGroup[],
): AnchorLayout {
	if (groups.length === 0 || anchors.length === 0) return { pills: [], rows: 0 };

	const placed = anchors
		.map((a, i) => {
			const label = truncate(a.title);
			const x = groupCenterX(fractionalIndexForOrder(a.timeline_order, groups));
			const half = estimatePillWidth(label) / 2;
			return { a, i, label, x, lo: x - half, hi: x + half };
		})
		.sort((p, q) => p.lo - q.lo || p.i - q.i);

	// rowEnds[r] = right edge (plus spacing) of the last pill placed in row r.
	const rowEnds: number[] = [];
	const pills = placed.map(({ a, label, x, lo, hi }) => {
		let row = rowEnds.findIndex((end) => lo >= end);
		if (row === -1) {
			row = rowEnds.length;
			rowEnds.push(0);
		}
		rowEnds[row] = hi + PILL_SPACING;
		return { key: `${a.kind}-${a.title}`, x, kind: a.kind, label, row };
	});

	return { pills, rows: rowEnds.length };
}
