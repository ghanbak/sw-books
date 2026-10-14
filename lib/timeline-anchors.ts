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
