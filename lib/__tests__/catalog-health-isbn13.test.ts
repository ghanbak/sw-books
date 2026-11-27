import { describe, expect, it } from 'vitest';
import { type HealthRow, checkInvalidIsbns, checkIsbnCollisions } from '../catalog-health';

// #474: the scanner matches bare ISBN-13 exactly, so a stored ISBN-10 is unmatchable.
const row = (slug: string, isbn: string[], primary_isbn: string | null = null): HealthRow => ({
	slug,
	isbn,
	primary_isbn,
});

describe('checkInvalidIsbns: ISBN-13 form', () => {
	it('flags a stored ISBN-10 as invalid-isbn', () => {
		const f = checkInvalidIsbns([row('heir', ['0345391802'])]);
		expect(f).toHaveLength(1);
		expect(f[0]).toMatchObject({ severity: 'error', check: 'invalid-isbn', slugs: ['heir'] });
		expect(f[0]?.message).toBe(
			"heir: ISBN-10 0345391802 not in ISBN-13 form, scan can't match (isbn[])",
		);
	});

	it('labels an ISBN-10 primary_isbn', () => {
		const f = checkInvalidIsbns([row('heir', ['0345391802'], '0345391802')]);
		expect(f.map((x) => x.message)).toEqual([
			"heir: ISBN-10 0345391802 not in ISBN-13 form, scan can't match (primary_isbn)",
		]);
	});

	it('leaves a valid ISBN-13 row clean', () => {
		expect(checkInvalidIsbns([row('heir', ['9780345391803'], '9780345391803')])).toEqual([]);
	});

	it('still folds ISBN-10 into ISBN-13 for collisions', () => {
		const f = checkIsbnCollisions([row('a', ['0345391802']), row('b', ['9780345391803'])]);
		expect(f.map((x) => x.slugs)).toEqual([['a', 'b']]);
	});
});
