import { MANUAL_REVIEW_NO_DATA, MANUAL_REVIEW_WEAK } from './manual-review';

export const ISSUE_DEFS = [
	{ key: 'missing-primary-isbn', label: 'Missing primary ISBN' },
	{ key: 'no-cover', label: 'No cover' },
	{ key: 'placeholder-cover', label: 'Placeholder cover' },
	{ key: 'sparse', label: 'Sparse row' },
	{ key: 'review-weak', label: 'Review · weak' },
	{ key: 'review-no-data', label: 'Review · no data' },
] as const;

export type IssueKey = (typeof ISSUE_DEFS)[number]['key'];

export type IssueInput = {
	slug: string;
	primary_isbn: string | null;
	cover_image: string | null;
	author: string[] | null;
	isbn: string[] | null;
	synopsis: string | null;
};

const weak = new Set(MANUAL_REVIEW_WEAK);
const noData = new Set(MANUAL_REVIEW_NO_DATA);

/** Compute which issue buckets a book belongs to. `placeholderSlugs` is the set
 * of slugs whose cover hash appeared in a duplicate cluster (may be empty). */
export function issuesFor(book: IssueInput, placeholderSlugs: ReadonlySet<string>): IssueKey[] {
	const out: IssueKey[] = [];
	if (!book.primary_isbn) out.push('missing-primary-isbn');
	if (!book.cover_image) out.push('no-cover');
	if (placeholderSlugs.has(book.slug)) out.push('placeholder-cover');
	if (
		(book.author?.length ?? 0) === 0 ||
		(book.isbn?.length ?? 0) === 0 ||
		!book.cover_image ||
		!book.synopsis
	) {
		out.push('sparse');
	}
	if (weak.has(book.slug)) out.push('review-weak');
	if (noData.has(book.slug)) out.push('review-no-data');
	return out;
}
