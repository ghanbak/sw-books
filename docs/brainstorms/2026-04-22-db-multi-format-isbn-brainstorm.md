# Multi-format ISBN + Wrong Covers — Brainstorm

Date: 2026-04-22
Author: Backend (brainstorm, not a plan)

## Current State

### Schema (`supabase/migrations/20260410000000_create_books_and_user_books.sql`)

```sql
CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  cover_image text,
  format text[] DEFAULT '{}',     -- e.g. {'Hardcover','Paperback','eBook','Audiobook'}
  isbn text[] DEFAULT '{}',       -- GIN-indexed
  ...
);
CREATE INDEX idx_books_isbn ON books USING gin (isbn);
```

`format` and `isbn` are both `text[]`, but they are not aligned arrays — the app has no way to know which ISBN corresponds to which format.

### What the `isbn` array actually contains today

In `scripts/seed.ts` (line 129):

```ts
isbn: fields[col('isbn')] ? [fields[col('isbn')]] : [],
```

The CSV has exactly **one** ISBN per row. Seed wraps it into a single-element array. So every row in `books.isbn` currently holds **one ISBN** — usually the hardcover edition's ISBN-13, matching the Penguin Random House cover URL path. The array shape was designed forward-looking for multi-format, but it isn't populated that way yet.

The scanner at `app/(tabs)/scan.tsx:51` queries `.contains('isbn', [isbn])`, which works correctly against the GIN index on a `text[]`.

### Where covers come from

Covers are URLs stored per-book in `cover_image`. Two providers in `data/books.csv`:
- **Penguin Random House** (147 rows): `https://images2.penguinrandomhouse.com/cover/{isbn13}` — deterministic, generally stable.
- **Disney/Lumiere CDN** (24 rows): `https://lumiere-a.akamaihd.net/v1/images/{slug}-cover_{hash}.jpeg` — requires a specific hash slug that Disney rotates.

Scanning `data/books.csv` for the Disney URLs reveals a smoking gun. The 8-character "hash" suffixes are fabricated: `_a1b2c3d4`, `_e5f6g7h8`, `_i9j0k1l2`, `_m3n4o5p6`, `_q7r8s9t0`, `_u1v2w3x4`, `_y5z6a7b8`, `_c9d0e1f2`, `_g3h4i5j6`, `_k7l8m9n0`, `_o1p2q3r4`… — sequential alphabet walk, not real CDN hashes. Those URLs will 404.

Separately, **two rows share ISBN `9780593157718`**: `Light of the Jedi` (row 2) and `Thrawn Ascendancy: Lesser Evil` (row 37). They'll also share the PRH cover URL. Scanning either prints title "Light of the Jedi" depending on which row wins `.limit(1)`.

---

## Problem 1: Multi-format ISBNs

**Goal:** a hardcover, paperback, and ebook (and ideally audiobook) of the same book all share one catalog row, but each has its own scannable ISBN (and potentially its own cover/page count/publish date).

### Option A — Keep `isbn text[]`, populate with all formats

Expand the seed/catalog to put all format ISBNs into the existing `text[]`. Scanner keeps `.contains('isbn', [isbn])`.

- **Query ergonomics:** unchanged, already indexed.
- **Migration cost:** zero schema change. Need a catalog backfill (source ISBNs per edition from ISBNdb / Open Library / Google Books).
- **Per-format metadata:** none. Can't store hardcover-specific pages, release date, or cover.
- **Extensibility:** fine for more formats, but you lose the mapping from ISBN → format type.
- **Verdict:** cheapest. Fine if every edition shares metadata (cover, title, pages) and you only need "does this barcode match any edition of this book?"

### Option B — Parallel columns (`isbn_hardcover`, `isbn_paperback`, `isbn_ebook`, `isbn_audiobook`)

- **Query ergonomics:** scanner needs an `.or('isbn_hardcover.eq.X,isbn_paperback.eq.X,isbn_ebook.eq.X,isbn_audiobook.eq.X')` — ugly and 4 indexes.
- **Migration cost:** 4 new columns + 4 indexes + CSV column additions.
- **Per-format metadata:** none unless you also add parallel columns for each (combinatorial explosion).
- **Extensibility:** every new format is a schema migration. Rigid.
- **Verdict:** avoid. Denormalized and painful.

### Option C — JSONB map `isbns jsonb` = `{hardcover: "…", paperback: "…", …}`

- **Query ergonomics:** can GIN-index the whole JSONB, or index extracted text values. Scanner could do `.or('isbns->>hardcover.eq.X,…')` or a stored generated column `isbn_values text[] GENERATED ALWAYS AS (…)` GIN-indexed. Workable but fussier than `text[]`.
- **Migration cost:** one column swap + backfill. Can keep the existing `text[]` as a generated column for backwards compat.
- **Per-format metadata:** limited — can store per-format ISBN, maybe a per-format cover URL as another JSONB column. Starts to feel like you're reinventing a row.
- **Extensibility:** any new format key, no migration.
- **Verdict:** reasonable middle ground. Best when per-format metadata stays minimal.

### Option D — Normalized `book_editions` table (one row per format)

```
books (id, title, slug, canon, series, timeline_order, synopsis, …)
book_editions (id, book_id FK, format, isbn UNIQUE, cover_image, pages, publisher, release_date, asin)
```

Scanner: `select book_editions.*, books.* from book_editions join books where isbn = $1`.

- **Query ergonomics:** cleanest. `isbn` is a `text UNIQUE`, unambiguous index. Join adds one hop.
- **Migration cost:** highest. New table, RLS policies, backfill from CSV (where most rows have only one ISBN so you create one edition row per book initially), type regeneration, and every existing query touching `books.isbn`/`books.format`/`books.cover_image` must be reconsidered. `Book` type in `lib/hooks.ts` changes. `user_books` stays on `book_id` — users still track a *work*, not a specific edition.
- **Per-format metadata:** full. Different cover per format, different ISBN, different page count, different release date. Audiobook can carry narrator, runtime.
- **Extensibility:** trivial — new format is a new row, not a schema change.
- **Verdict:** the "right" long-term model. Matches how Goodreads / Open Library / ISBNdb actually think about editions.

---

## Problem 2: Wrong Covers — hypotheses

**H1. Fabricated Disney CDN hashes (highest confidence).** 24 rows use `lumiere-a.akamaihd.net/v1/images/{slug}-cover_{hash}.jpeg` where the 8-char hash is a made-up sequential alphabet pattern (`a1b2c3d4`, `e5f6g7h8`, `i9j0k1l2`, …). These URLs almost certainly 404; React Native falls back to placeholder or broken-image state, which reads as "wrong cover."
- *Diagnose:* `curl -I` any three Disney URLs; if 404, confirmed. Or open one in a browser.

**H2. Duplicate ISBNs in the CSV.** `Light of the Jedi` and `Thrawn Ascendancy: Lesser Evil` both have ISBN `9780593157718`. Their PRH cover URLs are identical, so Lesser Evil displays the Jedi cover.
- *Diagnose:* `select isbn, count(*), array_agg(title) from books, unnest(isbn) isbn group by 1 having count(*) > 1`. Will likely surface more collisions.

**H3. Hotlink blocking / CORS on PRH or Disney.** Some CDNs block hotlinks or user-agent-less requests. Would show up as intermittent 403s, mostly on web clients.
- *Diagnose:* check RN Image `onError` events in dev, or `curl` with and without a `Referer` header.

**H4. Wrong ISBN→cover URL mapping.** The PRH URL is keyed by ISBN. If the CSV ISBN is the *paperback* ISBN but the cover at that path is the *hardcover* art (or vice versa), the cover displayed will be subtly wrong for the edition the user owns. User may perceive this as "wrong cover."
- *Diagnose:* spot-check five PRH URLs against published covers on Penguin's site.

**H5. Stale/renamed CDN paths.** `lumiere-a.akamaihd.net` is the legacy Disney image CDN. Even valid historical URLs have rotted as Disney migrated assets.
- *Diagnose:* try the same hash on `lumiere-a.akamaihd.net` vs a current Disney path; compare.

Cheapest first pass: one `curl` batch across every unique `cover_image` URL, bucket by HTTP status, and you'll instantly see which covers are dead.

---

## Open Questions

1. **Does the cover differ per format?** If hardcover and paperback share art (common for Star Wars novels), per-format covers aren't needed and Option A or C suffices. If users expect to see their *own edition's* cover, only Option D handles that cleanly.
2. **Should scanning any edition's ISBN surface the same `books` row?** Assumed yes. Worth confirming — alternative is a detail screen that defaults to the scanned edition and lets the user switch.
3. **Where are authoritative per-edition ISBNs going to come from?** ISBNdb (paid API), Open Library (free but patchy), Google Books (free, rate-limited), or manual CSV curation. This is the blocker for any of options A/C/D — schema is cheap, data is not.
4. **Do we care about audiobook today?** Audiobook ISBNs are often the same as print, but some have distinct ISBNs. Plus audiobooks want narrator/runtime metadata, which only Option D models well.
5. **Legends editions with multiple printings** (e.g., 1991 hardcover + 2005 paperback reissue with new cover art) — are those one book row or two? Affects whether editions are really (format × printing) or just (format).
6. **What does `user_books.owned` mean when a user owns the paperback but not the hardcover?** If we go to Option D, do we track ownership at edition granularity (`user_books.edition_id`) or keep it at book granularity?

---

## Recommendation

**Problem 2 first, independently of Problem 1.** The wrong-covers issue is mostly a bad-data problem (fabricated Disney hashes + one duplicate ISBN), not a schema problem. Fix it by running an HTTP-status audit across all `cover_image` URLs, replacing the fabricated Disney hashes with real cover URLs (PRH-style or hosting in Supabase Storage), and deduping the `9780593157718` collision. Cost: a script + CSV edits. No migration.

**Problem 1: go with Option D (`book_editions` table), but stage it.** Phase 1: ship Option A right now — backfill `books.isbn` with every format's ISBN so the scanner stops failing on paperback barcodes. This is a data change, zero schema change, and answers the user's stated pain (scanning finds the book). Phase 2, when per-edition covers or page counts become real requirements, migrate to Option D with `user_books.book_id` unchanged and an optional `user_books.edition_id` added later.

**Tradeoff I'm accepting:** Phase 1 temporarily conflates formats — we know an ISBN matches this book but not which format the user owns. That's fine for MVP because the UI already shows format as a list, not a selected edition. We pay the normalization cost only when the product actually needs per-edition state (owned-format tracking, per-format covers). Doing Option D now would be ~2 days of migration work for a feature the product hasn't committed to yet.
