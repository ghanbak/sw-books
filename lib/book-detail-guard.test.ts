import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createRequestGuard } from './request-guard';

const source = (path: string) => {
	const p = resolve(__dirname, '..', path);
	return existsSync(p) ? readFileSync(p, 'utf8') : '';
};

describe('createRequestGuard', () => {
	it('the latest request is current', () => {
		const guard = createRequestGuard();
		const isCurrent = guard.begin();
		expect(isCurrent()).toBe(true);
	});

	it('a newer request makes the older one stale', () => {
		const guard = createRequestGuard();
		const first = guard.begin();
		const second = guard.begin();
		expect(first()).toBe(false);
		expect(second()).toBe(true);
	});

	it('cancel (unmount, id change, cached book shown) makes every in-flight request stale', () => {
		const guard = createRequestGuard();
		const isCurrent = guard.begin();
		guard.cancel();
		expect(isCurrent()).toBe(false);
	});

	it('guards are independent per screen', () => {
		const a = createRequestGuard();
		const b = createRequestGuard();
		const isCurrent = a.begin();
		b.begin();
		b.cancel();
		expect(isCurrent()).toBe(true);
	});
});

describe('book detail id guard and stale-fetch wiring (#312)', () => {
	const detail = source('app/book/[id].tsx');
	const characters = source('app/characters/[id].tsx');
	const hooks = source('lib/hooks.tsx');

	it('the detail screen validates the id before any network call', () => {
		expect(detail).toMatch(/import \{ isUuid \} from '@\/lib\/uuid';/);
		expect(detail).toMatch(/const validId = isUuid\(\s*id\s*\);/);
		const guard = detail.indexOf('if (!validId)');
		const query = detail.indexOf(".from('books')");
		expect(guard).toBeGreaterThan(-1);
		expect(query).toBeGreaterThan(guard);
	});

	it('the detail screen ignores stale fetch results', () => {
		expect(detail).toMatch(/createRequestGuard/);
		expect(detail).toMatch(/const isCurrent = requests\.begin\(\);/);
		expect(detail).toMatch(/\.maybeSingle\(\);\s*if \(!isCurrent\(\)\) return;/);
		expect(detail).toMatch(/return \(\) => requests\.cancel\(\);/);
	});

	it('no raw Postgres text reaches the error state', () => {
		expect(detail).not.toMatch(/setError\(\s*fetchError\.message\s*\)/);
		expect(detail).toMatch(/<ErrorState title="Couldn't load this book" onRetry=\{fetchBook\} \/>/);
		expect(detail).not.toMatch(/<ErrorState[^>]*message=/);
	});

	it('the not-found state is the existing EmptyState', () => {
		expect(detail).toMatch(
			/<EmptyState\s+message="If an item does not appear in our records, it does not exist\."/,
		);
	});

	it('useBookEnrichment skips the network for a non-uuid id', () => {
		expect(hooks).toMatch(/import \{ isUuid \} from '(?:\.|@\/lib)\/uuid';/);
		// Both the initial state and the fetch effect short-circuit before fetchBookEnrichment.
		expect(hooks).toMatch(/if \(bookId !== undefined && !isUuid\(\s*bookId\s*\)\) \{/);
		expect(hooks).toMatch(/if \(!isUuid\(\s*bookId\s*\) \|\| enrichmentCache\.has\(bookId\)\) \{/);
	});

	it('the characters sheet falls through to its empty state for a non-uuid id', () => {
		expect(characters).toMatch(/const validId = isUuid\(\s*id\s*\);/);
		expect(characters).toMatch(/validId && status === 'loading'/);
		expect(characters).toMatch(/validId && status === 'error'/);
		expect(characters).toMatch(/<EmptyState message="No characters" \/>/);
	});
});
