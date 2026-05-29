---
title: "feat: Catalog Data Quality Pass — primary_isbn, missing books, cover accuracy"
type: feat
date: 2026-05-05
parent: docs/plans/2026-05-04-feat-ios-testflight-launch-roadmap-plan.md
deepened: 2026-05-05 (5 research + 5 review agents)
---

# Catalog Data Quality Pass

## Enhancement summary (post-deepening)

Restructured after the multi-agent pass converged on three things: (1) Phase 3 collapses into Phase 2, (2) the wrong-cover detection apparatus was over-engineered for 184 books with a dev who knows the catalog, (3) several technical specifics needed pinning (cache schema versioning, BookFormat types, ISBN library choice, concurrency limits).

**Material changes from v1:**

- **Phase 3 folded into Phase 2** as a verification subsection (DHH, Architecture, Simplicity converged). The body of v1's Phase 3 explicitly said "mostly handled by re-running Phase 2's script."
- **Cover refresh folded into Phase 2** — since the pipeline picks a canonical `primary_isbn` per book, the OL covers API gives a deterministic URL for that ISBN. Re-sourcing covers in the same run is essentially free and ensures every cover is anchored to the canonical edition. Phase 4 shrinks to verification (dup-URL audit + manual scroll for content-mismatches).
- **Phase 5 cover work simplified** — kept duplicate-URL audit (deterministic, cheap) + optional dHash flagging via CLI report. Dropped OCR + the generated HTML review page (DHH + Simplicity: "scroll the simulator catalog for 15 min" beats "build a tool you use once for 20 min").
- **Selection priority chain shortened** — paperback → hardcover → first ISBN. The 8-level chain over-fit a catalog that's 95% novels.
- **Acceptance criteria pruned** — dropped the made-up percentage targets (`≥90%`, `≥80%`, `<2 min`) and the process-note items (`tsc passes`, `lint doesn't regress`).
- **Cache schema versioning added** — Phase 2's refactor changes cache shape; without a version bump the existing 63KB `isbn-cache.json` reads as malformed. Discard-on-version-mismatch is the simplest correct path.
- **`pickPrimaryIsbn` as a pure function** with `BookFormat` union, not `string | null` (Kieran).
- **`p-limit` concurrency 3-5** for OL fetches (Performance: cuts cold run from ~10 min to ~3 min).
- **ISBN library: `isbn3` v2.0.7** recommended over home-grown helpers — proper mod-11 validation catches user-input typos, handles unicode hyphens (ISBN research).
- **Per-phase cloud-push checkpoint** added (Architecture: don't accumulate 9-10h of local-cloud drift in one go).
- **Estimate revised** — 9-10h → 5-7h after cuts. (Two reviewers said v1 was 2x optimistic; I think the cuts reclaim that.)

**New empirical findings to act on:**
- `physical_format` is ~91% populated in this catalog (per April source-isbns run) — primary_isbn priority chain will work for ~91% of books out of the box
- 109 ISBN collisions exist post-merge in the current `isbn-collisions.json` (X-Wing series, omnibi) — Phase 2 won't surface new ones, but worth knowing the existing dirty surface
- Cold OL run is 8-15 min realistic, not 20-30 min (Performance)
- `isbn3` is actively maintained (release May 1, 2026)

---

## Overview

Local-first sweep of three data-quality issues:

1. **Format-aware primary ISBN** — add a `primary_isbn` column. Buy button lands on paperback by default. Closes the open question from [docs/plans/2026-05-04-feat-amazon-affiliate-buy-buttons-plan.md](docs/plans/2026-05-04-feat-amazon-affiliate-buy-buttons-plan.md).
2. **Catalog completeness** — fill in missing editions/ISBNs on existing books (Red Harvest is present but missing the `9780099542650` printing) AND add books truly missing (Legacy of the Jedi / Secrets of the Jedi).
3. **Cover accuracy** — re-source broken (existing pipeline catches) and detect duplicate-URL wrong covers (cheap SQL); for the long tail of "loads fine but is wrong," manual visual scroll is faster than tooling.

Migrations accumulate locally; cloud push is gated **per-phase**, not deferred to the end.

## Problem Statement

- **Wrong cover on book X** — visually obvious; reads as broken
- **Searched/scanned for a book that should exist, didn't find it** — completeness gap
- **Buy button lands on hardcover variant when paperback exists** — invisible-but-degrades-the-affiliate-flow

The first two are user-visible and reduce TestFlight credibility. The third is silent. All share the same backend pipeline (OL editions, Google Books fallback) and the same data model.

## Technical Approach

### Phase 1 — Schema foundation

- [ ] Migration: `supabase/migrations/<timestamp>_add_primary_isbn_to_books.sql`
  ```sql
  ALTER TABLE public.books ADD COLUMN primary_isbn text;
  ```
- [ ] `supabase migration up`
- [ ] `npm run db:types`
- [ ] No app change — column nullable, buy button's `book.primary_isbn ?? book.isbn[0]` already handles null

**Acceptance:** local schema has the column; type-check passes.

**Estimate:** 15 minutes.

### Phase 2 — Format-aware ISBN pipeline + edition + cover refresh

**Goal:** [scripts/source-isbns.ts](scripts/source-isbns.ts) preserves format-per-ISBN AND emits a refreshed `cover_image` derived from the chosen `primary_isbn`. One pipeline run produces three outputs: `data/primary-isbn.json` (slug → preferred ISBN), `data/isbn-overrides.json` (existing), and `data/cover-overrides.json` (slug → preferred cover URL). Seed populates `books.primary_isbn` AND replaces `books.cover_image` for every slug present in the cover-overrides file. Buy button reads `primary_isbn`. Re-running the script also picks up missing editions on existing books (Red Harvest case) — verification is bundled in.

**Why fold covers into this pipeline:** we're already fetching OL editions per book and selecting a canonical ISBN. The OL covers API takes that same ISBN and returns a deterministic URL — re-sourcing covers here is essentially free, and ensures every book's cover URL is anchored to its `primary_isbn` (not an arbitrary edition that may have been wrong from CSV import). This also subsumes most of what Phase 4's bulk-replacement step would have done.

#### Type signatures (per Kieran review)

```ts
type BookFormat =
  | 'paperback'
  | 'hardcover'
  | 'mass market paperback'
  | 'trade paperback'
  | 'ebook'
  | 'audiobook'
  | 'library binding';

type EditionRecord = {
  isbn: string;                  // ISBN-13, normalized
  format: BookFormat | null;     // closed union, NOT free-form string
  publish_date: string | null;
  cover_url: string | null;      // best cover URL for THIS edition (OL covers API or Google Books imageLinks)
  source: 'ol' | 'google-books';
};

type CacheEntry = {
  schema_version: 2;             // bump from v1; discard older entries
  fetched_at: string;
  current_isbn: string;
  ol_work_id: string | null;
  editions: EditionRecord[];     // replaces v1's api_isbns: string[]
  source: 'ol' | 'google-books' | 'none';
};
```

**Cache migration:** on read, if entry is missing `schema_version` or `< 2`, treat as cache miss and re-fetch. Don't write a one-shot upgrader — discard-and-rebuild is simpler and the cache is gitignored. Cold first run after refactor: ~10-15 min one-time cost.

#### Pure function for selection

```ts
// scripts/lib/pick-primary-isbn.ts
const FORMAT_PRIORITY: readonly BookFormat[] = [
  'paperback',
  'trade paperback',
  'mass market paperback',
  'hardcover',
  'ebook',
  'audiobook',
  'library binding',
] as const;

export function pickPrimaryIsbn(editions: readonly EditionRecord[]): string | null {
  if (editions.length === 0) return null;
  for (const fmt of FORMAT_PRIORITY) {
    const matches = editions.filter((e) => e.format === fmt);
    if (matches.length === 0) continue;
    return matches.sort((a, b) =>
      (b.publish_date ?? '').localeCompare(a.publish_date ?? '')
      || a.isbn.localeCompare(b.isbn)  // deterministic tiebreaker
    )[0].isbn;
  }
  return editions[0].isbn; // fallback when no format match
}
```

#### Concurrency

- [ ] Use `p-limit` (already in npm; tiny dep) with concurrency 3 for OL fetches. Sequential is the dominant wall-time cost; this cuts cold run from ~10 min to ~3 min.

#### ISBN library swap (optional but recommended)

- [ ] Replace home-grown `normalizeIsbn13` / `isbn10to13` ([scripts/source-isbns.ts:99-119](scripts/source-isbns.ts)) with `isbn3` v2.0.7. Catches mod-11 typos in user-provided ISBNs (Phase 4); handles unicode hyphens. Zero dependencies, 127KB unpacked, last release 2026-05-01.

#### `format[]` column resync

- [ ] When the refactored script writes `data/primary-isbn.json` it also writes `data/format-overrides.json` (slug → distinct format[] derived from EditionRecord set). Seed reads both. Prevents `format[]` and the new edition map from drifting apart.

#### Cover URL resolution

For each book, after `pickPrimaryIsbn` selects the canonical edition, resolve `cover_image` in this order:

1. **Picked edition's `cover_url`** (from EditionRecord — set during fetch from OL editions endpoint or Google Books imageLinks)
2. **OL covers API on `primary_isbn`** — `https://covers.openlibrary.org/b/isbn/<primary_isbn>-L.jpg?default=false`. The `?default=false` flag returns 404 (not the OL placeholder) when no cover exists, so HEAD-check before accepting.
3. **Existing `cover_image` in CSV/DB** — preserve if no better source available (some publisher-direct URLs like `images2.penguinrandomhouse.com` are higher quality than OL)

The output is `data/cover-overrides.json`:

```json
{
  "red-harvest": "https://covers.openlibrary.org/b/isbn/9780099542650-L.jpg?default=false",
  "darth-bane-path-of-destruction": "https://images2.penguinrandomhouse.com/cover/9780345477361"
}
```

**HEAD-check covers before writing the override:** the script does `fetch(url, { method: 'HEAD' })` and only writes the URL if status is 200 and `content-length > 1024` (filters out tiny placeholder responses some CDNs serve instead of 404). Same pattern the existing [scripts/audit-covers.ts](scripts/audit-covers.ts) uses.

**Don't overwrite manually-curated covers:** add `data/cover-manual-overrides.json` (parallel to `isbn-manual-overrides.json`) for hand-picked URLs that survive regeneration. Seed merge order: pipeline → manual (manual wins).

#### Manual override seam

- [ ] `data/isbn-overrides.json` is regenerated wholesale every run (existing behavior). Add `data/isbn-manual-overrides.json` for hand-edits that survive regeneration. Seed merges manual last (highest precedence).
- [ ] Same pattern for covers: pipeline writes `data/cover-overrides.json`, hand-edits live in `data/cover-manual-overrides.json`. Seed merges manual last.

#### Seed changes

[scripts/seed.ts](scripts/seed.ts) reads three new override files: `primary-isbn.json`, `cover-overrides.json` (+ its manual sibling), and the existing `isbn-overrides.json`. For each book:

- `primary_isbn`: from `primary-isbn.json[slug]`, falls back to first ISBN
- `cover_image`: from `cover-manual-overrides.json[slug]` ?? `cover-overrides.json[slug]` ?? CSV's existing `cover_image`
- `isbn[]`: existing logic (overrides file or `[csv_isbn]`)
- `format[]`: from `format-overrides.json[slug]` ?? CSV's parsed format

#### Verification (the old Phase 3, now a subsection)

- [ ] After re-run, query: does `Red Harvest`'s `isbn[]` include `9780099542650` (or its OL-canonical sibling)?
- [ ] Spot check: 10 random books — does `primary_isbn` resolve to a paperback edition on Amazon?
- [ ] Cover spot-check: 10 random books — visually scan covers on simulator (the same pass that anchors Phase 4)
- [ ] Review `scripts/isbn-report.txt` — Tier-2 suspects + new collisions
- [ ] Run the existing duplicate-URL audit (Phase 4 SQL); should already be down to zero or near-zero given covers are now keyed off primary_isbn

**Acceptance:**
- Local books table has `primary_isbn` populated for the books where OL returns a format-tagged paperback edition
- `cover_image` refreshed for every book where the pipeline produced a HEAD-200 URL; manual overrides preserved
- Buy button on book detail uses the new column with graceful fallback
- 10 spot-checked books land on paperback variants on Amazon and show correct covers

**Estimate:** ~3.5 hours (refactor ~1.5h, cold run ~10-15 min wall time including HEAD-checks for covers, verification ~1.5h).

#### Cloud push checkpoint after Phase 2

- [ ] Review accumulated migrations + sample data drift
- [ ] User authorizes `supabase db push` (or via mcp tool with consent)
- [ ] Re-seed cloud with the new pipeline outputs

### Phase 3 — Truly missing books (was Phase 4)

**Goal:** add books known to be missing entirely.

**Approach (post-Simplicity review):** append rows to `data/books.csv` by hand. The CSV is 184 rows; adding 5-10 more by hand is faster than building a script that runs once.

For each known-missing book:
- [ ] Look up via OL: `https://openlibrary.org/isbn/<isbn>.json` → title, authors, publish date, cover, work key
- [ ] If OL silent: Google Books `/volumes?q=isbn:<isbn>`
- [ ] Compose CSV row matching existing schema:
  - `title`, `slug` (kebab-case from title; check existing for collisions before adding)
  - `author` (semicolon-separated)
  - `cover_image` (`https://covers.openlibrary.org/b/isbn/<isbn>-L.jpg?default=false`)
  - `canon` (Canon / Legends — manual)
  - `date_published`, `format`, `isbn` (the user's ISBN, the script's Phase-2 re-run will fill in siblings later)
  - `language` (English unless otherwise)
  - `publisher`, `series_name` (look up; null if standalone)
  - `series_order`, `timeline_order` (manual; null if unknown — UI handles null gracefully)
  - `synopsis` (from OL `description` or write 1-2 sentences manually)
  - `type` (Adult Novel / YA Novel / Middle Grade Novel)
- [ ] Append to `data/books.csv`
- [ ] `npm run db:seed` → upsert is idempotent on slug
- [ ] Run Phase 2's `source-isbns.ts` again to populate the new books' edition lists + primary_isbn

**Initial known-missing list (user-provided, May 2026):**
- `0439851467` — Star Wars: Legacy of the Jedi / Secrets of the Jedi (Jude Watson, Scholastic)
- `9780099542650` — Red Harvest UK printing (already in catalog under different ISBNs; confirm whether to add as a sibling ISBN to existing slug or as a separate row — most likely the former, handled by Phase 2 re-run rather than a new row)

User maintains a running list in `data/missing-books.txt` (free-form notes, not parsed) for future additions discovered during TestFlight.

**Acceptance:**
- Both example books are present in local catalog with full metadata
- New rows render correctly on book detail (no layout breakage from null `series_order` / `timeline_order`)

**Estimate:** ~1 hour for 5-10 books (mostly OL lookup + manual entry).

#### Cloud push checkpoint after Phase 3

- [ ] Re-seed cloud (no migration needed; just data delta)

### Phase 4 — Cover accuracy verification

**Goal:** the bulk cover refresh is already done in Phase 2 (every book's `cover_image` re-sourced from its `primary_isbn`). This phase is the residual sweep: confirm zero duplicate URLs, catch content-mismatches the pipeline can't see (OL has the wrong cover for an ISBN), record manual fixes.

#### Duplicate-URL audit

```sql
-- Books pointing at the same cover URL — at least one is wrong
SELECT cover_image, array_agg(slug) AS slugs, count(*) AS n
FROM public.books
WHERE cover_image IS NOT NULL
GROUP BY cover_image
HAVING count(*) > 1;
```

After Phase 2 this should already return zero or near-zero (covers keyed off unique primary_isbns). For any remaining: hand-pick a correct URL into `data/cover-manual-overrides.json`, re-seed.

#### Manual scroll for content-mismatch

Open the catalog in the simulator. Scroll the full list. For each cover that looks wrong vs the expected book:

1. Verify on Amazon/OL/publisher site what the correct cover should look like
2. Find a correct URL (publisher-direct preferred, then OL by a different ISBN of the same edition, then Google Books)
3. Add to `data/cover-manual-overrides.json`
4. Re-seed

**Why not OCR + dHash + HTML review page?** Quoting DHH and Simplicity reviewers: "184 books × 5 sec eyeballing = 15 minutes." Building 3-4 hours of detection apparatus to save those 15 minutes is poor ROI on a one-shot pass. The recurring scheduled-validator agent (post-TestFlight) is the long-term answer for ongoing drift.

**Acceptance:**
- Duplicate-URL audit returns zero rows
- Manual scroll on simulator catches obvious mismatches; recorded in `cover-manual-overrides.json`
- Existing broken/placeholder pipeline ([scripts/audit-covers.ts](scripts/audit-covers.ts), [scripts/detect-placeholder-covers.ts](scripts/detect-placeholder-covers.ts)) runs cleanly post-Phase 2

**Estimate:** ~1 hour (mostly scrolling + ~5-10 manual cover edits).

#### Cloud push checkpoint after Phase 4

- [ ] Re-seed cloud with new cover URLs

### Phase 5 (deferred) — Wookieepedia completeness sweep

**Status:** deferred to post-TestFlight. Out of scope for this plan beyond a one-line note.

**When pursued:** new script `scripts/wookieepedia-gaps.ts` queries Wookieepedia's MediaWiki API (`https://starwars.fandom.com/api.php`), enumerates `Category:Canon_novels` (recursive — has subcategories) and `Category:Legends_novels` (~86 pages, flat). For each title, parse infobox for ISBN(s) + author + publish date. Compare against local catalog by normalized title + author. Surface anything missing → append directly to `data/missing-books.txt` (the Phase 3 input file). User reviews and adds rows manually.

Estimate when scoped: ~3 hours.

---

## Implementation Phases (in order)

| Phase | Goal | Estimate | Cloud-push gate? |
|---|---|---|---|
| 1. Schema | `primary_isbn` column | 15 min | After |
| 2. Format-aware pipeline + edition + cover refresh | Buy button paperback default; existing books get missing editions; every cover re-sourced from primary_isbn | ~3.5h | After |
| 3. Missing books (manual) | Known-missing books added | ~1h | After |
| 4. Cover verification | Dup-URL audit (zero expected) + manual scroll for mismatches | ~1h | After |
| 5. Wookieepedia (deferred) | Comprehensive completeness | ~3h | N/A |

**Total commitment without Phase 5:** ~5.5-6.5 hours focused work, of which ~10-15 min is cold-run wall time you can do other things during.

## Acceptance Criteria

### Functional
- [ ] `books.primary_isbn` column exists and populated for books where OL returns a format-tagged paperback
- [ ] Buy button on book detail uses `book.primary_isbn ?? book.isbn[0]`
- [ ] Every book's `cover_image` re-sourced from its `primary_isbn` (or higher-priority fallback per resolution chain); manual overrides preserved
- [ ] Both example missing books (Legacy of the Jedi / Secrets of the Jedi; Red Harvest UK ISBN) are accounted for (added or covered by edition completion)
- [ ] No two books share the same `cover_image` URL (duplicate audit returns zero)
- [ ] Spot-check 10 random books on simulator: covers look correct; primary_isbn resolves to a paperback variant on Amazon

### Hygiene
- [ ] Cache schema bumped to v2; old entries discarded gracefully
- [ ] `pickPrimaryIsbn` is a pure exported function with deterministic output (test fixtures cover empty array, no-format-match, multi-format)
- [ ] No `asin` references reintroduced
- [ ] Cloud is reseeded after each phase, not just at the end

## Risks (compressed — was 6 rows, kept 3)

| Risk | Mitigation |
|---|---|
| OL `physical_format` missing on some editions (~9% per empirical April run) | Priority chain falls through; first-ISBN fallback when no format match |
| Cache schema-version mismatch causes cold re-run on first Phase 2 execution | Documented; expected one-time cost (~10-15 min) |
| Slug collision when adding missing books with similar titles to existing | Manual check against existing slugs before append; no script auto-dedup magic |

## Alternative Approaches Considered

| Alternative | Why Rejected |
|---|---|
| **`editions(book_id, format, isbn)` related table** instead of `primary_isbn` column | Cleaner long-term but a much bigger refactor (types, hooks, UI). Single denormalized column is the smallest change that solves the immediate problem. Revisit if format-per-ISBN becomes user-facing. |
| **OCR + dHash + generated HTML review page** for wrong-cover detection | Reviewers converged: 3-4 hours of tooling to replace 15 min of manual scroll on a 184-book catalog. Defer to recurring scheduled validator (post-TestFlight). |
| **`add-missing-books.ts` script** | Reviewers: hand-appending 5-10 rows to a 184-row CSV is faster than designing schema files (`missing-books.json` → `added-books.json`) for a one-shot run. |
| **8-level format priority chain** | Catalog is 95% novels — 3 levels (paperback → hardcover → first ISBN) handles all real cases; the longer chain was speculative completeness. |
| **PA-API for cover/edition sourcing** | Requires sales-quota qualification + paid + rate-limited. OL + Google Books are sufficient. |
| **Push schema changes immediately** | Honoring user's local-first directive; per-phase push is the compromise. |

## References

### Internal
- Master plan: [docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md](docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md)
- Multi-format ISBN migration (the seed merge pattern this builds on): [docs/plans/2026-04-22-db-multi-format-isbn-and-covers-plan.md](docs/plans/2026-04-22-db-multi-format-isbn-and-covers-plan.md)
- Amazon buy button (consumer of `primary_isbn`): [docs/plans/2026-05-04-feat-amazon-affiliate-buy-buttons-plan.md](docs/plans/2026-05-04-feat-amazon-affiliate-buy-buttons-plan.md)
- Launch roadmap (this plan executes Phase 5 data hygiene): [docs/plans/2026-05-04-feat-ios-testflight-launch-roadmap-plan.md](docs/plans/2026-05-04-feat-ios-testflight-launch-roadmap-plan.md)
- Existing pipeline: [scripts/source-isbns.ts](scripts/source-isbns.ts), [scripts/audit-covers.ts](scripts/audit-covers.ts), [scripts/refresh-covers.ts](scripts/refresh-covers.ts), [scripts/detect-placeholder-covers.ts](scripts/detect-placeholder-covers.ts), [scripts/source-cover-replacements.ts](scripts/source-cover-replacements.ts), [scripts/apply-cover-replacements.ts](scripts/apply-cover-replacements.ts)
- Seed: [scripts/seed.ts](scripts/seed.ts)
- ASIN drop migration (precedent): [supabase/migrations/20260505000000_drop_asin_column.sql](supabase/migrations/20260505000000_drop_asin_column.sql)

### External
- [OpenLibrary `/isbn/{isbn}.json`](https://openlibrary.org/dev/docs/api/books)
- [OpenLibrary `/works/{key}/editions.json`](https://openlibrary.org/dev/docs/api/books)
- [OpenLibrary covers API](https://openlibrary.org/dev/docs/api/covers) — `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false`
- [Google Books API](https://developers.google.com/books/docs/v1/using)
- [`isbn3`](https://www.npmjs.com/package/isbn3) — TS-friendly ISBN library, mod-11 validation
- [`p-limit`](https://www.npmjs.com/package/p-limit) — concurrency control for the pipeline
- [Wookieepedia MediaWiki API](https://starwars.fandom.com/api.php) — Phase 5 deferred
