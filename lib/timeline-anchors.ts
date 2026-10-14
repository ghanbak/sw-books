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
// several share a year (four shows at 9 ABY), so full-name pills can't all fit. Same-
// position markers merge into one pill ("The Mandalorian +3"); then pills nearest the
// current date claim their full label first, fanning outward, and any pill whose label
// would collide shrinks to an icon. Icon pills that would sit under a labeled pill are
// dropped. Widths are estimated (no measurement pass) — close enough for collision.
// ---------------------------------------------------------------------------

export type AnchorPill = {
	key: string;
	/** Row-local x of the pill's center (rides the rail's translateX). */
	x: number;
	kind: MediaKind;
	label: string;
	/** true = icon + label; false = icon only. */
	expanded: boolean;
};

const PILL_PAD_X = 6;
const PILL_ICON = 10;
const PILL_GAP = 3;
const PILL_CHAR_W = 5.6; // ~10pt semibold glyph advance
const PILL_SPACING = 4;
const CLUSTER_PX = 6;
const MAX_LABEL_CHARS = 24;

const ICON_PILL_W = PILL_PAD_X * 2 + PILL_ICON;

export function estimatePillWidth(label: string): number {
	return PILL_PAD_X * 2 + PILL_ICON + PILL_GAP + label.length * PILL_CHAR_W;
}

function truncate(title: string): string {
	return title.length > MAX_LABEL_CHARS ? `${title.slice(0, MAX_LABEL_CHARS - 1)}…` : title;
}

type Span = { lo: number; hi: number };
const overlaps = (a: Span, b: Span) => a.lo < b.hi && b.lo < a.hi;
const spanAt = (x: number, w: number): Span => ({
	lo: x - w / 2 - PILL_SPACING / 2,
	hi: x + w / 2 + PILL_SPACING / 2,
});

export function layoutAnchorPills(
	anchors: TimelineAnchor[],
	groups: TimelineGroup[],
	activeIndex: number,
): AnchorPill[] {
	if (groups.length === 0 || anchors.length === 0) return [];

	// 1. Position every marker, then merge markers that land on (nearly) the same spot.
	const placed = anchors
		.map((a, i) => ({ a, i, x: groupCenterX(fractionalIndexForOrder(a.timeline_order, groups)) }))
		.sort((p, q) => p.x - q.x || p.i - q.i);

	const clusters: { x: number; members: TimelineAnchor[] }[] = [];
	for (const p of placed) {
		const last = clusters[clusters.length - 1];
		if (last && p.x - last.x <= CLUSTER_PX) last.members.push(p.a);
		else clusters.push({ x: p.x, members: [p.a] });
	}

	const pills = clusters.map((c) => {
		const first = c.members[0] as TimelineAnchor;
		const extra = c.members.length - 1;
		return {
			key: c.members.map((m) => m.title).join('|'),
			x: c.x,
			kind: first.kind,
			label: extra > 0 ? `${truncate(first.title)} +${extra}` : truncate(first.title),
			expanded: false,
		};
	});

	// 2. Hand out full labels nearest-to-the-current-date first.
	const activeX = groupCenterX(activeIndex);
	const taken: Span[] = [];
	for (const pill of [...pills].sort((p, q) => Math.abs(p.x - activeX) - Math.abs(q.x - activeX))) {
		const span = spanAt(pill.x, estimatePillWidth(pill.label));
		if (!taken.some((t) => overlaps(t, span))) {
			pill.expanded = true;
			taken.push(span);
		}
	}

	// 3. Drop icon pills that would sit underneath a labeled pill.
	return pills.filter(
		(p) => p.expanded || !taken.some((t) => overlaps(t, spanAt(p.x, ICON_PILL_W))),
	);
}
