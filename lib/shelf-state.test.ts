import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { UserBook } from './hooks';
import { shelfStateLabel, shelfStateOf, shelfStatesByBook } from './shelf-state';

function row(
	bookId: string,
	flags: Partial<Pick<UserBook, 'owned' | 'read' | 'want_to_read' | 'favorite'>>,
): UserBook {
	return {
		id: `row-${bookId}`,
		user_id: 'user-1',
		book_id: bookId,
		owned: false,
		read: false,
		want_to_read: false,
		favorite: false,
		created_at: null,
		updated_at: null,
		...flags,
	};
}

function shelf(rows: UserBook[]): Map<string, UserBook> {
	return new Map(rows.map((r) => [r.book_id, r]));
}

describe('shelfStatesByBook', () => {
	it('maps each shelved book id to its flags, with want_to_read as wishlist', () => {
		const states = shelfStatesByBook(
			shelf([
				row('a', { owned: true, favorite: true }),
				row('b', { read: true, want_to_read: true }),
			]),
		);
		expect(states.get('a')).toEqual({ owned: true, read: false, wishlist: false, favorite: true });
		expect(states.get('b')).toEqual({ owned: false, read: true, wishlist: true, favorite: false });
		expect(states.size).toBe(2);
	});

	it('leaves unshelved books absent, so their rows render as before', () => {
		const states = shelfStatesByBook(shelf([row('a', { owned: true }), row('empty', {})]));
		expect(states.get('missing')).toBeUndefined();
		expect(states.get('empty')).toBeUndefined();
		expect(states.has('empty')).toBe(false);
	});

	it('is empty for a signed-out (empty) shelf', () => {
		expect(shelfStatesByBook(new Map()).size).toBe(0);
	});

	it('returns the same object for an unchanged state across derivations (stable memo props)', () => {
		const before = shelfStatesByBook(shelf([row('a', { owned: true }), row('b', { read: true })]));
		// A refetch replaces every UserBook object; a toggle changes one book.
		const after = shelfStatesByBook(
			shelf([row('a', { owned: true }), row('b', { read: true, favorite: true })]),
		);
		expect(after.get('a')).toBe(before.get('a'));
		expect(after.get('b')).not.toBe(before.get('b'));
		expect(after.get('b')).toEqual({ owned: false, read: true, wishlist: false, favorite: true });
	});

	it('shares one object between books with the same state, and freezes it', () => {
		const states = shelfStatesByBook(shelf([row('a', { owned: true }), row('b', { owned: true })]));
		expect(states.get('a')).toBe(states.get('b'));
		expect(Object.isFrozen(states.get('a'))).toBe(true);
	});

	it('treats a null flag at runtime as off', () => {
		const r = row('a', { owned: true, read: null as unknown as boolean });
		expect(shelfStateOf(r)).toEqual({ owned: true, read: false, wishlist: false, favorite: false });
	});
});

describe('shelfStateLabel', () => {
	it('speaks the set flags in badge order', () => {
		expect(shelfStateLabel({ owned: true, read: true, wishlist: false, favorite: false })).toBe(
			'Owned, Read',
		);
		expect(shelfStateLabel({ owned: true, read: true, wishlist: true, favorite: true })).toBe(
			'Owned, Read, Wishlist, Favorite',
		);
		expect(shelfStateLabel({ owned: false, read: false, wishlist: true, favorite: false })).toBe(
			'Wishlist',
		);
	});

	it('is undefined with no state, so the row label is unchanged', () => {
		expect(shelfStateLabel(undefined)).toBeUndefined();
		expect(shelfStateLabel({ owned: false, read: false, wishlist: false, favorite: false })).toBe(
			undefined,
		);
	});
});

function source(rel: string): string {
	return readFileSync(resolve(__dirname, '..', rel), 'utf8');
}

describe('shelf state wiring', () => {
	it.each(['app/(tabs)/archives/index.tsx', 'app/(tabs)/search/index.tsx'])(
		'%s derives shelf state once per list and passes it to BookCard',
		(path) => {
			const src = source(path);
			expect(src).toMatch(/import \{ shelfStatesByBook \} from '@\/lib\/shelf-state';/);
			expect(src).toMatch(
				/useMemo\(\s*\(\)\s*=>\s*shelfStatesByBook\(\s*userBooks\s*\),\s*\[\s*userBooks\s*\]\s*,?\s*\)/,
			);
			expect(src).toMatch(
				/<BookCard\s+book=\{item\}\s+shelf=\{shelfByBook\.get\(\s*item\.id\s*\)\}\s*\/>/,
			);
			// renderItem tracks the derived map, not a per-row derivation.
			expect(src).toMatch(/\[\s*shelfByBook\s*\]/);
		},
	);

	it('BookCard stays memoized and speaks shelf state through the helper', () => {
		const card = source('components/book-card.tsx');
		expect(card).toMatch(/export const BookCard = memo\(function BookCard/);
		expect(card).toMatch(/shelf\?: ShelfState;/);
		expect(card).toMatch(/const shelfLabel = shelfStateLabel\(\s*shelf\s*\);/);
		expect(card).toMatch(/accessibilityValue=\{shelfLabel \? \{ text: shelfLabel \} : undefined\}/);
		expect(card).toMatch(/\{shelf \? <ShelfBadges shelf=\{shelf\} \/> : null\}/);
	});

	it('shelf badges use SF Symbols, the primary accent, and stay out of the a11y tree', () => {
		const badges = source('components/shelf-badges.tsx');
		expect(badges).toMatch(/<SymbolView/);
		expect(badges).toContain('tintColor={tokens.accent.primary}');
		expect(badges).not.toContain('accent.secondary');
		expect(badges).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
		expect(badges).toContain('importantForAccessibility="no-hide-descendants"');
		expect(badges).toContain('accessibilityElementsHidden');
	});
});
