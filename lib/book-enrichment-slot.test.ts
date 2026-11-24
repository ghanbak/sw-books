import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { enrichmentSlot } from './book-enrichment-slot';

const source = (path: string) => {
	const p = resolve(__dirname, '..', path);
	return existsSync(p) ? readFileSync(p, 'utf8') : '';
};

const row = { id: 'row' };

describe('enrichmentSlot (#361)', () => {
	it('shows the error + Retry when the fetch failed and nothing is cached', () => {
		expect(enrichmentSlot('error', null)).toEqual({ kind: 'error' });
	});

	it('error -> retry (loading) -> ready shows the cards without leaving the screen', () => {
		const steps = [
			enrichmentSlot('error', null),
			enrichmentSlot('loading', null),
			enrichmentSlot('ready', row),
		];
		expect(steps.map((s) => s.kind)).toEqual(['error', 'none', 'content']);
		expect(steps[2]).toEqual({ kind: 'content', enrichment: row });
	});

	it('a failed refetch keeps cached enrichment on screen', () => {
		expect(enrichmentSlot('error', row)).toEqual({ kind: 'content', enrichment: row });
	});

	it('a book with no enrichment row shows nothing', () => {
		expect(enrichmentSlot('ready', null)).toEqual({ kind: 'none' });
	});

	it('loading shows nothing, as before', () => {
		expect(enrichmentSlot('loading', null)).toEqual({ kind: 'none' });
	});
});

describe('book detail wiring (#361)', () => {
	const screen = source('app/book/[id].tsx');

	it('reads status and retry from useBookEnrichment', () => {
		expect(screen).toMatch(/const\s*\{[^}]*\bstatus\b[^}]*\}\s*=\s*useBookEnrichment\(\s*id\s*\)/);
		expect(screen).toMatch(/const\s*\{[^}]*\bretry\b[^}]*\}\s*=\s*useBookEnrichment\(\s*id\s*\)/);
	});

	it('decides the enrichment slot with enrichmentSlot(status, enrichment)', () => {
		expect(screen).toMatch(/enrichmentSlot\(\s*status\s*,\s*enrichment\s*\)/);
	});

	it('renders an inline ErrorState wired to retry', () => {
		expect(screen).toMatch(
			/<ErrorState[^>]*variant="inline"[^>]*onRetry=\{\s*retryEnrichment\s*\}|<ErrorState[^>]*onRetry=\{\s*retryEnrichment\s*\}[^>]*variant="inline"/,
		);
		expect(screen).toMatch(/retry:\s*retryEnrichment/);
	});
});
