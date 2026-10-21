import {
	CHANGESET_VERSION,
	type Changeset,
	type CoverFix,
	type Insert,
	type InsertRow,
	type IsbnFix,
	type Update,
	isBookType,
} from './changeset';
/**
 * Pure planning for scripts/apply-catalog-changeset.ts: given the changeset
 * and the LIVE state of the rows it touches, decide per row whether to apply,
 * skip (already in the target state — makes re-runs idempotent), or stop on a
 * conflict (the row changed since the changeset was built). No DB access here.
 * Serves both the Wookieepedia changeset (`planAll`) and the sibling cleanup
 * changeset (`planCleanup`, ./cleanup.ts).
 *
 * Optimistic concurrency: every write carries the `before` values the operator
 * reviewed. A live value equal to `after` is done; equal to `before` is
 * applied; anything else is a conflict — rebuild the changeset and re-review.
 */
import {
	CLEANUP_KIND,
	CLEANUP_VERSION,
	type CleanupChangeset,
	type IsbnMembershipFix,
	type SynopsisFill,
	isWikiImage,
} from './cleanup';

/** The live columns the planner compares. */
export type LiveState = {
	readonly id: string;
	readonly slug: string;
	readonly title: string;
	readonly canon: string;
	readonly isbn: readonly string[] | null;
	readonly primary_isbn: string | null;
	readonly date_published: string | null;
	readonly format: readonly string[] | null;
	readonly cover_image: string | null;
	readonly synopsis: string | null;
};

export type StepKind = 'isbn_fix' | 'cover_fix' | 'synopsis_fill' | 'update' | 'insert';

export type Step = {
	readonly kind: StepKind;
	readonly slug: string;
	readonly action: 'apply' | 'skip' | 'conflict';
	readonly reason: string;
	/** Row id for isbn_fix / cover_fix / synopsis_fill / update writes (keyed by id, never slug). */
	readonly id: string | null;
	/** Only the columns to write (every kind but insert), or the full row (insert). */
	readonly patch: Readonly<Record<string, unknown>> | null;
};

function arraysEqual(a: readonly string[] | null, b: readonly string[] | null): boolean {
	const x = a ?? [];
	const y = b ?? [];
	return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Problems that block ANY real write (the dry-run still prints the plan). */
export function blockingProblems(cs: Changeset): string[] {
	const out: string[] = [];
	if (cs.version !== CHANGESET_VERSION) {
		out.push(`changeset version ${cs.version} ≠ supported ${CHANGESET_VERSION}`);
	}
	const slugs = new Set<string>();
	for (const i of cs.inserts) {
		if (i.needs_type) out.push(`insert "${i.slug}" has needs_type — set a type first`);
		else if (!isBookType(i.row.type))
			out.push(`insert "${i.slug}" has invalid type "${i.row.type}"`);
		if (i.row.slug !== i.slug) out.push(`insert "${i.slug}" row.slug mismatch`);
		if (i.row.primary_isbn != null && !i.row.isbn.includes(i.row.primary_isbn)) {
			out.push(`insert "${i.slug}" primary_isbn not in isbn[]`);
		}
		if (slugs.has(i.slug)) out.push(`duplicate insert slug "${i.slug}"`);
		slugs.add(i.slug);
	}
	for (const c of cs.cover_fixes ?? []) {
		if (!c.after) out.push(`cover_fix "${c.slug}" has no target URL`);
	}
	for (const f of cs.isbn_fixes) {
		const p = f.after.primary_isbn;
		const wasValid = f.before.primary_isbn == null || f.before.isbn.includes(f.before.primary_isbn);
		if (p != null && !f.after.isbn.includes(p) && wasValid) {
			out.push(`isbn_fix "${f.slug}" would break primary_isbn ∈ isbn[]`);
		}
	}
	return out;
}

type IsbnTarget = Pick<IsbnFix, 'id' | 'slug' | 'before' | 'after'>;

/** Optimistic-concurrency plan for an isbn[] / primary_isbn rewrite. */
function planIsbnChange(fix: IsbnTarget, live: LiveState | null, reason: string): Step {
	const base = { kind: 'isbn_fix' as const, slug: fix.slug, id: fix.id };
	if (!live) return { ...base, action: 'conflict', reason: 'row no longer exists', patch: null };
	if (live.slug !== fix.slug) {
		return {
			...base,
			action: 'conflict',
			reason: `row id now has slug "${live.slug}"`,
			patch: null,
		};
	}
	const atAfter =
		arraysEqual(live.isbn, fix.after.isbn) && live.primary_isbn === fix.after.primary_isbn;
	if (atAfter) return { ...base, action: 'skip', reason: 'already applied', patch: null };
	const atBefore =
		arraysEqual(live.isbn, fix.before.isbn) && live.primary_isbn === fix.before.primary_isbn;
	if (!atBefore) {
		return {
			...base,
			action: 'conflict',
			reason: 'isbn/primary_isbn changed since build',
			patch: null,
		};
	}
	return {
		...base,
		action: 'apply',
		reason,
		patch: { isbn: [...fix.after.isbn], primary_isbn: fix.after.primary_isbn },
	};
}

export function planIsbnFix(fix: IsbnFix, live: LiveState | null): Step {
	return planIsbnChange(
		fix,
		live,
		fix.replacements.map((r) => `${r.removed} → ${r.replacement}`).join(', '),
	);
}

/** Cleanup ISBN repair: add primary_isbn to isbn[], or reset primary_isbn. */
export function planIsbnMembershipFix(fix: IsbnMembershipFix, live: LiveState | null): Step {
	const reason =
		fix.action === 'add_primary_to_isbn'
			? `isbn[] += ${fix.after.primary_isbn}`
			: `primary_isbn ${fix.before.primary_isbn} → ${fix.after.primary_isbn}`;
	return planIsbnChange(fix, live, reason);
}

export function planCoverFix(fix: CoverFix, live: LiveState | null): Step {
	const base = { kind: 'cover_fix' as const, slug: fix.slug, id: fix.id };
	if (!live) return { ...base, action: 'conflict', reason: 'row no longer exists', patch: null };
	if (live.slug !== fix.slug) {
		return {
			...base,
			action: 'conflict',
			reason: `row id now has slug "${live.slug}"`,
			patch: null,
		};
	}
	if (live.cover_image === fix.after) {
		return { ...base, action: 'skip', reason: 'already applied', patch: null };
	}
	if (live.cover_image !== fix.before) {
		return { ...base, action: 'conflict', reason: 'cover_image changed since build', patch: null };
	}
	return {
		...base,
		action: 'apply',
		reason: `cover_image → ${fix.after}`,
		patch: { cover_image: fix.after },
	};
}

export function planUpdate(u: Update, live: LiveState | null): Step {
	const base = { kind: 'update' as const, slug: u.slug, id: u.id };
	if (!live) return { ...base, action: 'conflict', reason: 'row no longer exists', patch: null };
	if (live.slug !== u.slug) {
		return {
			...base,
			action: 'conflict',
			reason: `row id now has slug "${live.slug}"`,
			patch: null,
		};
	}
	const patch: Record<string, unknown> = {};
	const notes: string[] = [];
	const date = u.changes.date_published;
	if (date) {
		if (live.date_published === date.after) notes.push('date_published already set');
		else if (live.date_published === date.before) {
			patch.date_published = date.after;
			notes.push(`date_published ${date.before ?? '∅'} → ${date.after}`);
		} else {
			return {
				...base,
				action: 'conflict',
				reason: `date_published is ${live.date_published ?? '∅'}, expected ${date.before ?? '∅'}`,
				patch: null,
			};
		}
	}
	const format = u.changes.format;
	if (format) {
		if (arraysEqual(live.format, format.after)) notes.push('format already set');
		else if (arraysEqual(live.format, format.before)) {
			patch.format = [...format.after];
			notes.push(`format [${format.before.join(', ')}] → [${format.after.join(', ')}]`);
		} else {
			return {
				...base,
				action: 'conflict',
				reason: `format is [${(live.format ?? []).join(', ')}], expected [${format.before.join(', ')}]`,
				patch: null,
			};
		}
	}
	if (Object.keys(patch).length === 0) {
		return { ...base, action: 'skip', reason: 'already applied', patch: null };
	}
	return { ...base, action: 'apply', reason: notes.join('; '), patch };
}

/** Whether the live row at the insert's slug is the row a previous run inserted. */
function isSameInsert(live: LiveState, row: InsertRow): boolean {
	return live.title === row.title && live.canon === row.canon && arraysEqual(live.isbn, row.isbn);
}

export function planInsert(ins: Insert, liveAtSlug: LiveState | null): Step {
	const base = { kind: 'insert' as const, slug: ins.slug, id: null };
	if (liveAtSlug) {
		if (isSameInsert(liveAtSlug, ins.row)) {
			return { ...base, action: 'skip', reason: 'already inserted', patch: null };
		}
		return {
			...base,
			action: 'conflict',
			reason: `slug taken by "${liveAtSlug.title}" — rebuild the changeset for a fresh slug`,
			patch: null,
		};
	}
	return { ...base, action: 'apply', reason: `insert "${ins.row.title}"`, patch: { ...ins.row } };
}

/** The full plan in write order: ISBN fixes, cover fixes, updates, inserts. */
export function planAll(cs: Changeset, live: readonly LiveState[]): Step[] {
	const byId = new Map(live.map((r) => [r.id, r]));
	const bySlug = new Map(live.map((r) => [r.slug, r]));
	return [
		...cs.isbn_fixes.map((f) => planIsbnFix(f, byId.get(f.id) ?? null)),
		...(cs.cover_fixes ?? []).map((c) => planCoverFix(c, byId.get(c.id) ?? null)),
		...cs.updates.map((u) => planUpdate(u, byId.get(u.id) ?? null)),
		...cs.inserts.map((i) => planInsert(i, bySlug.get(i.slug) ?? null)),
	];
}

/** Fill a null/blank synopsis. Never overwrites text the row already has. */
export function planSynopsisFill(fill: SynopsisFill, live: LiveState | null): Step {
	const base = { kind: 'synopsis_fill' as const, slug: fill.slug, id: fill.id };
	if (!live) return { ...base, action: 'conflict', reason: 'row no longer exists', patch: null };
	if (live.slug !== fill.slug) {
		return {
			...base,
			action: 'conflict',
			reason: `row id now has slug "${live.slug}"`,
			patch: null,
		};
	}
	if (live.synopsis === fill.after) {
		return { ...base, action: 'skip', reason: 'already applied', patch: null };
	}
	if (live.synopsis !== fill.before) {
		return { ...base, action: 'conflict', reason: 'synopsis changed since build', patch: null };
	}
	return {
		...base,
		action: 'apply',
		reason: `synopsis (drafted) → "${fill.after}"`,
		patch: { synopsis: fill.after },
	};
}

const isBlank = (v: string | null) => v == null || v.trim() === '';

/** Problems that block ANY real write of a cleanup changeset. */
export function cleanupBlockingProblems(cs: CleanupChangeset): string[] {
	const out: string[] = [];
	if (cs.kind !== CLEANUP_KIND) out.push(`changeset kind "${cs.kind}" is not "${CLEANUP_KIND}"`);
	if (cs.version !== CLEANUP_VERSION) {
		out.push(`cleanup version ${cs.version} ≠ supported ${CLEANUP_VERSION}`);
	}
	const seen = new Set<string>();
	const once = (kind: string, id: string, slug: string) => {
		const k = `${kind}|${id}`;
		if (seen.has(k)) out.push(`duplicate ${kind} for "${slug}"`);
		seen.add(k);
	};
	for (const f of cs.isbn_fixes) {
		once('isbn_fix', f.id, f.slug);
		const p = f.after.primary_isbn;
		if (p != null && !f.after.isbn.includes(p)) {
			out.push(`isbn_fix "${f.slug}" leaves primary_isbn ∉ isbn[]`);
		}
		const dropped = f.before.isbn.filter((i) => !f.after.isbn.includes(i));
		if (dropped.length)
			out.push(`isbn_fix "${f.slug}" would remove curated ISBN(s) ${dropped.join(', ')}`);
	}
	const covers = new Map<string, string>();
	for (const c of cs.cover_fills) {
		once('cover_fill', c.id, c.slug);
		if (!isBlank(c.before)) out.push(`cover_fill "${c.slug}" would replace an existing cover`);
		if (!c.after) out.push(`cover_fill "${c.slug}" has no target URL`);
		else if (isWikiImage(c.after)) out.push(`cover_fill "${c.slug}" uses a Wookieepedia image`);
		const other = covers.get(c.after);
		if (other) out.push(`cover_fill "${c.slug}" reuses the cover proposed for "${other}"`);
		covers.set(c.after, c.slug);
	}
	for (const s of cs.synopsis_fills) {
		once('synopsis_fill', s.id, s.slug);
		if (!isBlank(s.before))
			out.push(`synopsis_fill "${s.slug}" would overwrite an existing synopsis`);
		if (isBlank(s.after)) out.push(`synopsis_fill "${s.slug}" is empty`);
		if (s.status !== 'drafted') out.push(`synopsis_fill "${s.slug}" is not marked drafted`);
	}
	return out;
}

/** The cleanup plan in write order: ISBN repairs, cover fills, synopsis fills. */
export function planCleanup(cs: CleanupChangeset, live: readonly LiveState[]): Step[] {
	const byId = new Map(live.map((r) => [r.id, r]));
	return [
		...cs.isbn_fixes.map((f) => planIsbnMembershipFix(f, byId.get(f.id) ?? null)),
		...cs.cover_fills.map((c) => planCoverFix(c, byId.get(c.id) ?? null)),
		...cs.synopsis_fills.map((s) => planSynopsisFill(s, byId.get(s.id) ?? null)),
	];
}
