import { describe, expect, it } from 'vitest';

import type { Book } from '@/lib/hooks';
import { groupBooksByYear } from '@/lib/timeline';
import { type TimelineAnchor, estimatePillWidth, layoutAnchorPills } from '@/lib/timeline-anchors';

function book(title: string, timeline_order: number): Book {
	return { id: title, title, author: [], series_order: null, timeline_order } as unknown as Book;
}

// 40 notches at orders 0..39 → plenty of room to test spacing (28pt apart).
const groups = groupBooksByYear(Array.from({ length: 40 }, (_, i) => book(`b${i}`, i))).groups;

describe('layoutAnchorPills', () => {
	it('merges markers at the same date into one "+N" pill', () => {
		const anchors: TimelineAnchor[] = [
			{ title: 'The Mandalorian', kind: 'series', timeline_order: 9 },
			{ title: 'Ahsoka', kind: 'series', timeline_order: 9 },
			{ title: 'Skeleton Crew', kind: 'series', timeline_order: 9 },
		];
		const pills = layoutAnchorPills(anchors, groups, 9);
		expect(pills).toHaveLength(1);
		expect(pills[0]?.label).toBe('The Mandalorian +2');
		expect(pills[0]?.expanded).toBe(true);
	});

	it('gives the label to the marker nearest the current date when two collide', () => {
		const anchors: TimelineAnchor[] = [
			{ title: 'A Very Long Film Title Here', kind: 'film', timeline_order: 10 },
			{ title: 'Another Long Series Title', kind: 'series', timeline_order: 11 },
		];
		const nearFirst = layoutAnchorPills(anchors, groups, 10);
		expect(nearFirst.find((p) => p.label.startsWith('A Very'))?.expanded).toBe(true);
		const nearSecond = layoutAnchorPills(anchors, groups, 11);
		expect(nearSecond.find((p) => p.label.startsWith('Another'))?.expanded).toBe(true);
		// the loser is never also labeled
		expect(nearSecond.filter((p) => p.expanded)).toHaveLength(1);
	});

	it('labels markers that are far enough apart', () => {
		const anchors: TimelineAnchor[] = [
			{ title: 'Solo', kind: 'film', timeline_order: 2 },
			{ title: 'Andor', kind: 'series', timeline_order: 20 },
		];
		expect(layoutAnchorPills(anchors, groups, 0).every((p) => p.expanded)).toBe(true);
	});

	it('truncates very long titles', () => {
		const [pill] = layoutAnchorPills(
			[{ title: 'X'.repeat(60), kind: 'film', timeline_order: 5 }],
			groups,
			5,
		);
		expect(pill?.label.length).toBeLessThanOrEqual(24);
		expect(pill?.label.endsWith('…')).toBe(true);
	});

	it('returns nothing for an empty rail', () => {
		expect(layoutAnchorPills([{ title: 'Solo', kind: 'film', timeline_order: 1 }], [], 0)).toEqual(
			[],
		);
	});

	it('estimates wider pills for longer labels', () => {
		expect(estimatePillWidth('Andor')).toBeLessThan(estimatePillWidth('The Empire Strikes Back'));
	});
});
