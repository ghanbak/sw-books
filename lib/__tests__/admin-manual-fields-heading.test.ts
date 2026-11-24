// The "Edit fields" card on /admin/books/[slug] is a level-2 heading that labels its
// region (issue 404), so heading navigation reaches the main edit form and the outline
// reads h1 title, h2 Edit fields, h2 Wookieepedia enrichment, h3 Manual page pin (the pin
// editor renders inside the enrichment section). The heading keeps CardTitle's classes so
// nothing moves visually. Source-level check: this suite has no DOM.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FORM = resolve(
	__dirname,
	'../../admin/app/admin/books/[slug]/_components/manual-fields-form.tsx',
);
const CARD = resolve(__dirname, '../../admin/components/ui/card.tsx');

const read = (path: string) => (existsSync(path) ? readFileSync(path, 'utf-8') : '');
const form = read(FORM);
const card = read(CARD);

/** Source between two unique anchors, or '' when either is missing. */
function between(src: string, start: string, end: string): string {
	const from = src.indexOf(start);
	if (from < 0) return '';
	const to = src.indexOf(end, from + start.length);
	return to < 0 ? '' : src.slice(from + start.length, to);
}

const classTokens = (s: string) => s.split(/\s+/).filter(Boolean).sort();

// The component's JSX from its return through the end of the card header.
const header = between(
	between(form, 'export function ManualFieldsForm', 'function Field('),
	'return (',
	'</CardHeader>',
);
const heading = header.match(/<h2\b([^>]*)>\s*Edit fields\s*<\/h2>/);
const headingAttrs = heading?.[1] ?? '';
const headingId = headingAttrs.match(/\bid="([^"]+)"/)?.[1];

describe('manual-fields-form heading', () => {
	it('finds the form and card sources and the header JSX', () => {
		expect(existsSync(FORM)).toBe(true);
		expect(existsSync(CARD)).toBe(true);
		expect(header).toContain('<CardHeader');
	});

	it('renders "Edit fields" as an h2 with an id', () => {
		expect(heading).not.toBeNull();
		expect(headingId).toBeTruthy();
		expect(header).not.toMatch(/<CardTitle\b[^>]*>\s*Edit fields/);
	});

	it('labels the card region with that heading', () => {
		const labelled = header.match(/<(section|Card)\b[^>]*\baria-labelledby="([^"]+)"/);
		expect(labelled).not.toBeNull();
		expect(labelled?.[2]).toBe(headingId);
	});

	it('keeps CardTitle classes exactly (no visual change)', () => {
		const cardTitle = between(card, 'function CardTitle(', '\n}');
		const base = cardTitle.match(/cn\(\s*"([^"]+)"/)?.[1];
		expect(base).toBeTruthy();
		const own = headingAttrs.match(/\bclassName="([^"]+)"/)?.[1] ?? '';
		expect(classTokens(own)).toEqual(classTokens(base ?? ''));
		expect(headingAttrs).toMatch(/\bdata-slot="card-title"/);
	});
});
