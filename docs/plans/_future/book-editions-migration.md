---
title: "future: Normalize books.isbn[] into a book_editions table"
type: future
status: stub — not scheduled
parent: docs/plans/2026-04-22-db-multi-format-isbn-and-covers-plan.md
---

# Future: book_editions table

Captured so today's `books.isbn text[]` decision doesn't paint us into a corner when per-edition metadata becomes necessary.

## When this work is needed

Any of the following triggers the migration:

- **Per-edition covers.** Users want to see the specific cover for the edition they own (hardcover vs. paperback vs. foreign-language), not a single shared cover for the work.
- **Per-edition ownership in `user_books`.** The shelf view needs to distinguish "I own the US hardcover" from "I own the UK paperback".
- **Per-edition metadata.** Page counts, release dates, ASINs, publishers, or cover images differ per edition and need to surface in the UI.
- **Editions outlive the work.** If a book is revised, re-issued, or broken into omnibus collections often enough that the `isbn[]` array becomes unwieldy (say, >20 ISBNs per book).

Until one of those is a real product requirement, the `text[]` array is sufficient: the scanner uses `WHERE isbn @> ARRAY[scanned]`, GIN-indexed, against up to ~25 ISBNs per row.

## Target schema

```sql
CREATE TABLE book_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES books (id) ON DELETE CASCADE,
  format text NOT NULL,            -- 'hardcover' | 'paperback' | 'ebook' | 'mass market' | 'audiobook' | 'unknown'
  isbn text UNIQUE NOT NULL,
  cover_image text,
  pages int,
  publisher text,
  release_date date,
  asin text,
  language text DEFAULT 'English',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_book_editions_book_id ON book_editions (book_id);
CREATE INDEX idx_book_editions_format ON book_editions (format);
```

## Backfill strategy

1. Unnest `books.isbn` → `book_editions` with `format = 'unknown'` and `book_id` from the parent row.
2. Run a one-shot enrichment script that re-uses the cached `scripts/isbn-cache.json` from today's sourcing run: for each (book, isbn) pair, look up the edition's format from Open Library and set `format` accordingly.
3. For any ISBN where the cache doesn't have a format mapping, query OL `/isbn/{isbn}.json` and backfill.
4. For truly unknown formats, leave `format = 'unknown'` — the scanner doesn't care.

## Scanner query after migration

Current:
```ts
supabase.from('books').select('*').contains('isbn', [isbn]).limit(1);
```

After migration (two options, pick one at migration time):

**A. View-based backwards-compat (recommended during rollout):**
```sql
CREATE VIEW books_with_isbn AS
  SELECT b.*, array_agg(be.isbn) AS isbn
  FROM books b
  LEFT JOIN book_editions be ON be.book_id = b.id
  GROUP BY b.id;
```
Clients that query `books.isbn` keep working unchanged. Once all clients are migrated, drop the view + `books.isbn` column.

**B. Direct join at query time:**
```ts
supabase.from('book_editions').select('*, book:books(*)').eq('isbn', isbn).limit(1);
```

## Naming choices already locked in to make this cheap later

Captured here so future-us knows *why* things look the way they do:

- **`books.isbn` (not `books.isbns`)** — column name kept singular to avoid churn against the generated types. Rename would be pure friction with no benefit until the table is normalized.
- **`scripts/isbn-cache.json` structure** — each cache entry stores `api_isbns[]` plus the raw OL work + editions response. The OL editions response includes `physical_format`, which is exactly what the backfill script will need to populate `book_editions.format`. Don't delete the cache; it's the seed for this migration.
- **`scripts/isbn-collisions.json`** — the known-ambiguous ISBNs list. When migrating to `book_editions.isbn UNIQUE`, these need either exclusion or disambiguation (one book wins the ISBN, the others lose it). Keep the list up to date.
- **`user_books.book_id` stays** — when `book_editions` arrives, add optional `user_books.edition_id uuid REFERENCES book_editions(id)`. Do not make it required. Ownership defaults to the work level; edition-level ownership is an opt-in refinement.

## Migration is NOT needed for any of these

- Scanner performance at 184 books × ~6 ISBNs each. GIN on `text[]` handles tens of thousands of books with this density without breaking a sweat.
- Fuzzy scanner matching (ISBN-10 vs ISBN-13). Handled in `lib/isbn.ts` at scan time.
- Cover refresh. Single `cover_image` per book is the current design; that column stays even after edition normalization, as a "default cover for the work".

## Checklist when the time comes

- [ ] Confirm which trigger condition is live (per-edition covers / ownership / metadata).
- [ ] Write the migration SQL (schema + backfill).
- [ ] Stand up the backwards-compat view (`books_with_isbn`) so the scanner doesn't regress during rollout.
- [ ] Port `user_books` to optionally reference `book_editions.id`.
- [ ] Regenerate types (`npm run db:types`).
- [ ] Update the scanner to pick the edition when multiple match (probably: prefer the edition whose format matches a user preference, else any).
- [ ] Drop `books.isbn` column only after every reader is migrated and the view has been live for a release cycle.
