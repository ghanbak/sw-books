---
title: "fix: Multi-format ISBNs + Bad Covers"
type: fix
date: 2026-04-22
brainstorm: docs/brainstorms/2026-04-22-db-multi-format-isbn-brainstorm.md
---

# Multi-format ISBNs + Bad Covers

## Overview

Two related data-quality problems, one plan.

1. **Wrong covers.** 24 rows in `data/books.csv` use `lumiere-a.akamaihd.net` URLs with fabricated 8-char hashes walking the alphabet (`_a1b2c3d4`, `_e5f6g7h8`, …). They 404. Plus one ISBN collision (`9780593157718`) means `Light of the Jedi` and `Thrawn Ascendancy: Lesser Evil` share a cover URL.
2. **Scanner misses paperbacks.** Each row has one ISBN (usually hardcover). Scanning a paperback barcode returns "Not in Catalog" even though the book is present. User chose **Option A** from the brainstorm: keep `books.isbn text[]`, populate it with every edition's ISBN. Paperback cover is acceptable for every format — no per-edition cover work.

Scope: **data + one script, no schema change.** Preserve a clean migration path to a future `book_editions` table.

---

## Problem Statement

- Scanner query `.contains('isbn', [isbn])` works against a GIN-indexed `text[]` but only one ISBN is populated per book. Any non-hardcover scan fails.
- 24 cover URLs 404 and 1 ISBN collision makes two books share the wrong cover.
- Per-edition metadata (cover, page count, release date) is a future concern, not MVP. Schema should not encode assumptions that make the `book_editions` migration painful later.

---

## Research: ISBN Sourcing — Recommended Approach

Investigated four options against Star Wars tie-in coverage. Test books: `Light of the Jedi` (Del Rey adult, mainstream), `Path of Deceit` (Disney Lucasfilm YA, obscurer), `Padawan`, `Most Wanted` (YA).

| Source | Cost | Rate limit | Per-format in one call? | SW coverage |
|---|---|---|---|---|
| **Open Library** | Free | Polite (no hard limit, back off on 429) | **Yes** — `/works/{OLID}/editions.json` returns every edition with `physical_format` (`hardcover`, `paperback`, `ebook`, `audio cd`) | Excellent for Del Rey (9 editions returned for Light of the Jedi, cleanly labeled). Thin for Disney Lucasfilm YA/MG (often 1 edition) — but that's usually **accurate**: those books frequently never got paperback. |
| **Google Books** | Free. Unkeyed usage works for a one-shot job (~400 requests across ~200 books is well under the shared quota). | 1000/day keyed; keyless is shared but plenty for one pass | No — each format is a **separate** volume entry. Requires title+author search then manual reconciliation by `industryIdentifiers`. | Good fill-in for ebooks OL misses. |
| **ISBNdb** | $14.99/mo (Basic) → $99.99/mo (Pro) | 2.5k–50k/day depending on tier | Yes | Broad. Overkill for a one-time ~200-book job. |
| **Penguin Random House pages** | Free | N/A scrape | Lists formats but exposes only hardcover ISBN on the product page | Useless as a primary source. |
| **Library of Congress** | Free | Generous | Per-edition records, but requires LCCN lookups first and its UX is 1998. | Not worth the complexity. |

### Recommendation: **Open Library primary, Google Books fallback.**

- Two-step: (1) title+author search → `works/{OLID}/editions.json`; (2) if ≤1 edition returned or no paperback/ebook found, fall back to Google Books `q=intitle:X+inauthor:Y` (keyless) and reconcile.
- Results cached per-book in a local JSON file (`scripts/isbn-cache.json`, gitignored) so re-runs cost nothing.
- **Keyless, one-shot.** No Google Books API key required. The entire run is ~400 requests across the shared anonymous quota — well within headroom for a single pass. If we ever re-run and get throttled, add a key later.
- **Total cost to source all ~200 books: $0.** One evening of script runtime. Output is a new `data/isbn-overrides.json` file committed to the repo — authoritative, reviewable, no live API dependency at seed time.

**Honest tradeoff:** Open Library's Disney Lucasfilm YA coverage is thin, so many of our 75 Disney Lucasfilm titles may end up with only the hardcover ISBN even after Google Books fallback. That's usually correct (no paperback was ever printed). Per the user's explicit direction, **we do not manually fill gaps** — if neither API knows a paperback/ebook ISBN for a title, we leave the array as-is. Some books will permanently retain single-ISBN arrays. Acceptable.

---

## Solution

### Priority 1: Fix broken covers (data-only, immediate)

**Independent from Priority 2.** Cover audit + replacement runs as its own script (`scripts/audit-covers.ts` + manual CSV patch). A failure in cover sourcing does not block or corrupt the ISBN sourcing script, and vice versa. They may ship in separate PRs.

The fabricated hashes are deterministic — every row whose `cover_image` matches `lumiere-a\.akamaihd\.net/.*_[a-z0-9]{8}\.jpeg` with a hash that walks the alphabet sequentially is fabricated. Also audit real-URL rows by HEAD-request bucketing.

- [ ] Write `scripts/audit-covers.ts`: `HEAD` every unique `cover_image` URL, print `{ url, status, title, slug }`. Bucket by status.
- [ ] For each 404'd Disney URL, source a replacement:
  - Primary: query Open Library for the work, pull the edition's `covers` array → Open Library serves `https://covers.openlibrary.org/b/id/{coverId}-L.jpg`.
  - Fallback: PRH URL `https://images2.penguinrandomhouse.com/cover/{isbn13}` if a PRH ISBN exists.
  - Last resort: host in Supabase Storage under `books/covers/{slug}.jpg`.
- [ ] Dedupe the `9780593157718` collision: `Thrawn Ascendancy: Lesser Evil` CSV row (line 37) should carry its correct ISBN — verify against the real printed edition. Zahn's Lesser Evil hardcover is `9780593157763`; confirm before editing.
- [ ] Patch `data/books.csv` with corrected `cover_image` and `isbn` values. Commit.

### Priority 2: Source multi-format ISBNs (additive + corrective — never blind-fill)

Per user direction: *"add isbn if it's missing or not correct. otherwise don't edit or update the isbn array."*

Semantics:
- **API-returned ISBN not already in the book's array → add it.**
- **Existing ISBN in the array flagged wrong → remove/replace.** "Wrong" is defined below in *Detection heuristic*.
- **Existing ISBN flagged correct → leave alone.**
- **API returns nothing for a format → skip. Do not fill. Do not delete.**
- Books whose array doesn't need to change **do not appear** in `data/isbn-overrides.json` at all. The override file is a change-set, not a full snapshot.

#### Detection heuristic: "is this existing ISBN wrong?"

Conservative two-tier design to minimize false positives (don't remove a correct ISBN just because an API index is stale):

**Tier 1 — auto-remove (high confidence wrong):**
- ISBN is in the known-collision list seeded from the brainstorm (currently: `9780593157718` shared between *Light of the Jedi* and *Thrawn Ascendancy: Lesser Evil*).
- ISBN returns a definitive 404 on **both** Open Library's `/isbn/{isbn}.json` AND Google Books `volumes?q=isbn:{isbn}` (after 3 retries with backoff on each).

**Tier 2 — flag for human review (medium confidence, do NOT auto-remove):**
- ISBN resolves on Open Library or Google Books to a book whose title fuzzy-matches the CSV row's title at **<0.5 Levenshtein similarity** AND whose author does not match any author in the CSV row.
- Write these to the script's final report (`scripts/isbn-report.txt`) under a `REVIEW` section. Human inspects and decides case-by-case.

**Tier 3 — leave alone (assume correct):**
- ISBN resolves to a title that fuzzy-matches our title at ≥0.5, OR resolves to a title we can't parse (anthology, omnibus — these are false-positive-prone), OR only one of the two APIs returns a result.

Rationale: the cost of wrongly removing a correct ISBN (scanner misses the book) is higher than the cost of leaving one wrong ISBN in place (scanner occasionally returns the wrong book — already a known issue we're explicitly fixing via the collision list). Bias toward preserving data.

#### Script flow

- [ ] Create `scripts/source-isbns.ts`:
  ```
  knownCollisions = loadCollisionsList()         // from the brainstorm; extensible
  overrides = {}                                 // change-set output
  report = { addedTo: [], removedFrom: [], review: [], unchanged: [] }

  for each book in data/books.csv:
    if cache has slug → reuse
    else:
      editions = openLibrary.fetchEditions(title, author)
      apiIsbns = editions
        .filter(e => e.physical_format in ['hardcover','paperback','ebook','mass market paperback'])
        .flatMap(e => [...(e.isbn_13 ?? []), ...(e.isbn_10 ?? [])].filter(Boolean))
      if apiIsbns.length === 0:
        googleResults = googleBooks.search(title, author)   // KEYLESS
        apiIsbns = googleResults.map(r => r.isbn_13 ?? r.isbn_10).filter(Boolean)
      apiIsbns = dedupe(apiIsbns.map(normalizeIsbn13))
      cache[slug] = { apiIsbns, fetched_at }

    current = normalizeAll(book.isbn)            // from CSV, normalized to ISBN-13

    toRemove = []
    for each existing in current:
      if isTier1Wrong(existing, knownCollisions, apis): toRemove.push(existing)
      else if isTier2Suspect(existing, apis): report.review.push({ slug, existing, reason })

    toAdd = apiIsbns.filter(i => !current.includes(i))

    if toRemove.length === 0 && toAdd.length === 0:
      report.unchanged.push(slug)
      continue                                   // do NOT write an override entry

    final = dedupe([...current.filter(i => !toRemove.includes(i)), ...toAdd])
    overrides[slug] = final
    if toAdd.length > 0: report.addedTo.push({ slug, added: toAdd })
    if toRemove.length > 0: report.removedFrom.push({ slug, removed: toRemove })

  # Post-merge collision scan
  finalPerSlug = { ...overrides }                 // slugs that changed
  for each book in data/books.csv not in overrides:
    finalPerSlug[book.slug] = [normalizeIsbn13(book.isbn)].filter(Boolean)

  isbnOwners = {}                                 // { isbn: [slug, slug, ...] }
  for each [slug, isbns] of finalPerSlug:
    for each i of isbns: (isbnOwners[i] ??= []).push(slug)

  collisions = entries(isbnOwners).filter(([_, owners]) => owners.length > 1)
  for each [isbn, owners] of collisions:
    report.collisions.push({ isbn, owners })
    knownCollisions.add(isbn)                     // persist to scripts/isbn-collisions.json
                                                  // (consulted on next run's Tier 1 check)

  write cache to scripts/isbn-cache.json
  write knownCollisions to scripts/isbn-collisions.json (committed, reviewable)
  write overrides to data/isbn-overrides.json (sort keys alpha for stable diffs)
  write report to scripts/isbn-report.txt

  # End-of-run ergonomics: if the REVIEW or COLLISIONS sections have entries,
  # print a one-line summary and open the report in Cursor.
  if report.review.length > 0 || report.collisions.length > 0:
    print(`⚠  ${report.review.length} Tier 2 suspects, ${report.collisions.length} collisions — opening report`)
    exec("cursor scripts/isbn-report.txt")
  ```
- [ ] Rate limiting: 100ms between Open Library calls, 200ms between Google Books calls. Exponential backoff on 429 (max 3 retries, start at 1s).
- [ ] Cache: `scripts/isbn-cache.json` (gitignore — contains raw API responses for debugging). Re-runs hit cache → zero API calls.
- [ ] Commit `data/isbn-overrides.json` — reviewable change-set artifact. Only contains slugs with actual changes. Alphabetized.
- [ ] Commit `scripts/isbn-report.txt` — the `REVIEW` section is the list of Tier 2 suspects for human inspection; the `COLLISIONS` section is the list of ISBNs appearing in 2+ slugs post-merge. The user can edit the collision list or override file directly after reviewing; those edits are respected on re-run because the override file is consulted before the API.
- [ ] Commit `scripts/isbn-collisions.json` — the persistent known-collision set, grown each run. Seeded with `9780593157718`. Consulted by Tier 1 on the next run.

### Priority 3: Update seed script

- [ ] `scripts/seed.ts` line 129: replace `isbn: fields[col('isbn')] ? [fields[col('isbn')]] : []` with a change-set merge from `data/isbn-overrides.json`. If the slug is in the override, use the override array verbatim (it's already the authoritative merged result). Otherwise fall back to the CSV's single ISBN:
  ```ts
  const override = overrides[slug];                // undefined if no change for this slug
  const isbns = override ?? (fields[col('isbn')]
    ? [normalizeIsbn13(fields[col('isbn')])]
    : []);
  ```
  Note: override is change-only — books not needing changes retain their CSV ISBN unmodified.
- [ ] Use the existing `normalizeIsbn` in `lib/isbn.ts` (already exists — scanner uses it). Extend to `normalizeIsbn13` that converts ISBN-10 to ISBN-13 if needed, so all stored ISBNs are canonical 13-digit.
- [ ] Upsert is already idempotent via `onConflict: 'slug'`. No changes needed.

### Priority 4: Verify code paths

No schema change → no type regeneration needed, but run `npm run db:types` anyway after re-seeding to confirm.

- [ ] **Scanner (`app/(tabs)/scan.tsx:51`):** `.contains('isbn', [isbn])` — already correct for `text[]` with GIN index. Verify by scanning a known paperback ISBN that's now in the array.
- [ ] **`lib/hooks.ts`:** no code assumes single-ISBN semantics. `Book.isbn` is already `string[] | null`. No edit needed.
- [ ] **`lib/types.ts`:** regenerate via `npm run db:types` — expected to be unchanged since no schema change. Commit any drift.
- [ ] **Book detail / list rendering:** audit any UI that renders `book.isbn[0]`. Grep the tree — if anything shows the first ISBN as "the" ISBN, either show all formats with labels or hide the field (can't say "paperback ISBN" without knowing the mapping).

### Priority 5: Preserve migration path to `book_editions`

Document the future normalization so today's decision doesn't trap us. Save to `docs/plans/_future/book-editions-migration.md` as a stub — not implemented, just captured.

**Migration sketch (for the future, not this plan):**
```sql
-- Phase 1 (this plan): books.isbn text[] holds all editions' ISBNs.
-- Phase 2 (future):
CREATE TABLE book_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books ON DELETE CASCADE,
  format text NOT NULL,      -- 'hardcover' | 'paperback' | 'ebook' | 'audiobook'
  isbn text UNIQUE NOT NULL,
  cover_image text,
  pages int,
  publisher text,
  release_date date,
  asin text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_book_editions_book_id ON book_editions (book_id);
-- Backfill: unnest books.isbn → book_editions, format='unknown' initially,
-- then a one-shot backfill script maps ISBN → format using the cached
-- Open Library/Google Books data from scripts/isbn-cache.json.
-- Keep books.isbn text[] as a generated column for backwards compat during rollout:
--   ALTER TABLE books ADD COLUMN isbn_generated text[] GENERATED ALWAYS AS
--     ((SELECT array_agg(isbn) FROM book_editions WHERE book_id = books.id)) STORED;
-- (or a view). Retire books.isbn only after all clients are migrated.
```

**Naming choices that would be painful later — calling them out now:**
- **Do NOT rename `books.isbn` to `books.isbns`** in this plan. The generated types and every existing query reference `isbn`. A rename is pure churn with no benefit until we have a normalized table.
- **Keep `scripts/isbn-cache.json` structured as `{ slug: { isbns: [...], editions: [{ isbn, format, source }] } }`** even though Phase 1 only uses `isbns`. The per-edition format mapping is the seed for the Phase 2 backfill — throwing it away now means re-sourcing later.
- **`user_books.book_id` stays.** When `book_editions` arrives, add optional `user_books.edition_id uuid REFERENCES book_editions(id)` — do not make it required. Ownership is still at the work level by default.

---

## Migration Safety

- **Idempotent.** The seed script uses `upsert onConflict: 'slug'` — re-running overwrites ISBN arrays, doesn't duplicate. Safe to re-run at will.
- **Local dev:** `npm run db:reset` applies migrations + reseeds from the local Supabase. Standard loop.
- **Production:** run `scripts/seed.ts` against the production Supabase with `SUPABASE_SERVICE_ROLE_KEY` exported. No migration to apply (no schema change). This is a data-only update. A single invocation rewrites `books.isbn` values; the scanner starts finding paperbacks within seconds of completion.
- **Rollback:** before running seed against production, snapshot via `pg_dump --data-only -t books > backup-books-$(date +%s).sql`. If the override file has a bug, restore: `psql < backup-books-*.sql` after truncating. Keep the backup for 14 days, then delete.
- **No downtime.** Scanner continues working during seed — `text[].contains()` queries against rows with the old (single-ISBN) array still match the hardcover barcode. Rows update one batch at a time (50/batch).

---

## Acceptance Criteria

- [ ] `curl -I` every `cover_image` URL in the seeded DB → **zero 404s**.
- [ ] `SELECT isbn, count(*) FROM books, unnest(isbn) isbn GROUP BY 1 HAVING count(*) > 1` → **zero rows** (no ISBN belongs to two books). Known collision `9780593157718` is resolved.
- [ ] Scanner finds the same book when scanning its **hardcover barcode** and its **paperback barcode** — *for books where the API returned both*. Books with only one edition in the APIs will still only match one barcode; that's expected and accepted.
- [ ] `data/isbn-overrides.json` is committed, alphabetized, and reviewable as a PR diff. Only contains slugs with actual changes.
- [ ] `scripts/isbn-report.txt` is committed. Both `REVIEW` (Tier 2 suspects) and `COLLISIONS` (post-merge) sections have been read; any actions the user wants to take are applied by hand-editing `data/isbn-overrides.json` or `scripts/isbn-collisions.json`.
- [ ] `scripts/isbn-collisions.json` is committed. Contains at minimum the seed collision `9780593157718` plus any new collisions discovered in the post-merge scan.
- [ ] `scripts/audit-covers.ts` and `scripts/source-isbns.ts` both run to completion independently against the local Supabase with documented env vars. A failure in one does not affect the other.
- [ ] `npm run db:types` produces no drift (schema unchanged). If it does, the drift is committed.
- [ ] `npm run lint` passes.
- [ ] Manual spot-check: pick 5 random books that had changes, verify each resulting ISBN resolves on isbnsearch.org to the expected title.
- [ ] Future-migration doc stub exists at `docs/plans/_future/book-editions-migration.md`.

---

## Non-Goals

- `book_editions` table (future).
- Per-edition covers, page counts, release dates (future — bundled with `book_editions`).
- Audiobook ISBNs as first-class (most audiobook ISBNs differ; sourcing is out of scope because our `format` array already lists Audiobook and we don't render it as a scannable edition).
- Supabase Storage migration of covers (only touch what 404s).
- UI changes to book detail to show "hardcover ISBN / paperback ISBN" separately — can't reliably without per-edition records.
- Rewriting the CSV parser.

---

## Resolved Questions

1. **Rollback window:** 14 days for the `pg_dump` backup retention. ✅
2. **Manual-fill:** No manual-fill pass. Script is additive + corrective only; books the APIs don't know stay as-is. ✅
3. **Google Books API key:** Keyless, one-shot. No setup step required. ✅
4. **Tier 2 tolerance:** Current two-tier threshold is acceptable. Tier 1 auto-removes; Tier 2 goes to the report. At end of run, if the report contains any Tier 2 entries, the script prints a clear count and opens `scripts/isbn-report.txt` in Cursor (`cursor scripts/isbn-report.txt`) for manual review. ✅
5. **Post-merge collision scan:** Run it. After all merges complete, re-scan the final override set for any ISBN appearing in more than one slug's array. Log every collision in `scripts/isbn-report.txt` under a `COLLISIONS` section. Auto-add the colliding ISBN to the known-collision list on the next run *and* flag it in the report so manual resolution can override the default behavior when the auto-handling would be wrong (e.g., anthology editions that legitimately share an ISBN across titles). ✅

## New Open Questions

None at this time. All script-behavior decisions resolved.

Sources:
- [ISBNdb API Pricing](https://isbndb.com/isbn-database)
- [Open Library Editions API](https://openlibrary.org/developers/api)
- [Google Books API](https://developers.google.com/books/docs/v1/using)
