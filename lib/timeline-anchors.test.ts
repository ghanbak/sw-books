import { describe, expect, it } from 'vitest';

import type { Book } from '@/lib/hooks';
import { groupBooksByYear } from '@/lib/timeline';
import {
	type AnchorPill,
	type TimelineAnchor,
	estimatePillWidth,
	layoutAnchorPills,
} from '@/lib/timeline-anchors';

function book(title: string, timeline_order: number): Book {
	return { id: title, title, author: [], series_order: null, timeline_order } as unknown as Book;
}

// 40 notches at orders 0..39 → 28pt apart.
const groups = groupBooksByYear(Array.from({ length: 40 }, (_, i) => book(`b${i}`, i))).groups;

const span = (p: AnchorPill) => {
	const half = estimatePillWidth(p.label) / 2;
	return { lo: p.x - half, hi: p.x + half };
};

describe('layoutAnchorPills', () => {
	it('gives every marker its own labeled pill — no merging', () => {
		const anchors: TimelineAnchor[] = [
			{ title: 'The Mandalorian', kind: 'series', timeline_order: 9 },
			{ title: 'Ahsoka', kind: 'series', timeline_order: 9 },
			{ title: 'Skeleton Crew', kind: 'series', timeline_order: 9 },
		];
		const { pills, rows } = layoutAnchorPills(anchors, groups);
		expect(pills.map((p) => p.label).sort()).toEqual([
			'Ahsoka',
			'Skeleton Crew',
			'The Mandalorian',
		]);
		// all three sit on the same date, so they must stack into three rows
		expect(rows).toBe(3);
		expect(new Set(pills.map((p) => p.row)).size).toBe(3);
	});

	it('never lets two pills in the same row overlap', () => {
		const anchors: TimelineAnchor[] = Array.from({ length: 12 }, (_, i) => ({
			title: `Some Fairly Long Title ${i}`,
			kind: i % 2 ? 'film' : 'series',
			timeline_order: 5 + (i % 4),
		}));
		const { pills } = layoutAnchorPills(anchors, groups);
		for (const a of pills) {
			for (const b of pills) {
				if (a === b || a.row !== b.row) continue;
				const sa = span(a);
				const sb = span(b);
				expect(sa.lo < sb.hi && sb.lo < sa.hi).toBe(false);
			}
		}
	});

	it('keeps far-apart markers in a single row', () => {
		const { pills, rows } = layoutAnchorPills(
			[
				{ title: 'Solo', kind: 'film', timeline_order: 2 },
				{ title: 'Andor', kind: 'series', timeline_order: 20 },
			],
			groups,
		);
		expect(rows).toBe(1);
		expect(pills.every((p) => p.row === 0)).toBe(true);
	});

	it('truncates very long titles', () => {
		const { pills } = layoutAnchorPills(
			[{ title: 'X'.repeat(60), kind: 'film', timeline_order: 5 }],
			groups,
		);
		expect(pills[0]?.label.length).toBeLessThanOrEqual(24);
		expect(pills[0]?.label.endsWith('…')).toBe(true);
	});

	it('returns nothing for an empty rail', () => {
		expect(layoutAnchorPills([{ title: 'Solo', kind: 'film', timeline_order: 1 }], [])).toEqual({
			pills: [],
			rows: 0,
		});
	});
});
