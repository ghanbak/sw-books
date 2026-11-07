# Ossus Archives — Admin

Next.js tool for editing the book catalog. Reads/writes the `books` table of the
selected database (Local or Prod switch, service-role key, server-side only).
The production DB is the catalog source of truth; `data/catalog-backup.csv` is
its committed mirror. `data/books.csv` + the override JSONs are frozen.

Runs on `http://127.0.0.1:3100` — loopback only, no auth.

## Setup

```sh
# from the repo root
npm run admin:install                         # installs admin/ deps
cp admin/.env.local.example admin/.env.local  # then paste your keys
```

Fill `admin/.env.local` with values from `supabase status` (local stack must be up):

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=sb_secret_…   # the "secret" key (RLS-bypassing)
```

Load the local DB from the backup (the full catalog):

```sh
supabase start
npm run db:reset
SUPABASE_SERVICE_ROLE_KEY=<secret> npm run catalog:restore
```

| Command | Source | Rows |
| --- | --- | --- |
| `npm run catalog:restore` | `data/catalog-backup.csv` (prod mirror, upsert on `id`) | 276 |
| `npm run db:seed` | frozen `data/books.csv` + override JSONs (upsert on `slug`, local only) | 185 |

`db:seed` predates the DB-as-source-of-truth switch and lacks every row added
since, so `/admin/diff` against a seeded DB lists those rows as "in backup → not in
DB". Use `catalog:restore` unless you need the legacy seed.

## Run

```sh
npm run admin            # → http://127.0.0.1:3100/books
```

## What you can do

- **`/admin/books`** — sort, filter, multi-select. Edit title / publisher / era /
  published inline (autosaves). Left rail filters by issue (missing primary
  ISBN, no cover, sparse, manual-review, …).
- **Bulk ops** (select rows) — re-fetch covers, validate ISBNs, fill empty
  fields from Open Library + Google Books.
- **`/admin/books/[slug]`** — run an OL + GB lookup and apply fields from a 3-column
  diff. ISBNs merge additively by default; destructive replace needs a typed
  confirmation.
- **`/admin/diff`** — review every field where the selected DB differs from
  `data/catalog-backup.csv`, then **Export to CSV** (Prod only).
- **Wookieepedia enrichment** — a **Wiki** status column + left-rail filter on
  `/admin/books` (Enriched / Pinned / Flagged / No page), and a Wookieepedia card
  on `/admin/books/[slug]` (mapped page, pageid, revision, `fetched_at`, counts,
  timeline) with a **manual page pin** editor. See below.

## Drift & export

`/admin/diff` and the drift chip on `/admin/books` compare the selected DB with
`data/catalog-backup.csv` (all catalog columns except `id` and `created_at`). Rows
only in the DB show as "not in backup → in DB"; rows only in the backup as "in
backup → not in DB".

- **Prod target** — drift = production edits not yet backed up. **Export to CSV**
  rewrites `data/catalog-backup.csv` from prod, the same bytes as
  `npm run catalog:export:prod`. Review `git diff data/catalog-backup.csv` and
  commit (or run `npm run catalog:backup`, which exports and commits in one
  step). Recover with `git checkout data/catalog-backup.csv`.
- **Local target** — drift = how the local DB differs from the backup. Export is
  disabled: the backup mirrors prod, so local-only state must not land in it.
  Reset with `npm run db:reset && SUPABASE_SERVICE_ROLE_KEY=<secret> npm run catalog:restore`;
  drift should then be **0**.

> Don't hand-edit `data/books.csv` or `data/catalog-backup.csv`. Catalog changes
> go into the prod DB (admin on Prod, or `catalog:changeset` / `catalog:apply`),
> then into the backup via export.

## Wookieepedia pins

The admin **never writes `book_enrichment`** (local or prod). It reads it from the
selected DB target, read-only. A pin is a request in the git-tracked
`data/enrichment-pins.json` (`slug → { pageid, title, note?, pinned_at }`):

1. On a book's page, search Wookieepedia (title, pageid or wiki URL). Each result
   shows redirect, `{{Book}}` infobox, `{{App}}` + entry count, timeline. Pages the
   sync would refuse (missing, redirect, not a book, owned by another book) can't
   be pinned.
2. Commit `data/enrichment-pins.json`.
3. `npm run catalog:enrich -- --production` (dry-run) → `--apply`.

A pin on a book that already has a row is reported as a conflict and ignored until
you run the sync with `--repin`. The status column's missing/redirect check is a
cached `prop=info` call (6 h; **Recheck** in the rail refreshes it). Pins are
read-only on the hosted deploy (no `data/` there).

## Troubleshooting

- **`ZodError … SUPABASE_SERVICE_ROLE_KEY` on load** — the key in
  `admin/.env.local` is missing/blank. Paste the **secret** key from
  `supabase status`, then restart `npm run admin` (env isn't hot-reloaded).
- **`npm error Missing script: "dev"`** — run `npm run admin` from the repo
  root, not `npm run dev` (the root has no `dev` script).
- **Catalog is empty / fetch fails** — the local Supabase stack isn't running or
  isn't loaded. `supabase start`, then `npm run db:reset && npm run catalog:restore`.
- **Port 3100 in use** — stop the other listener, or change the port in
  `admin/package.json` (`dev`/`start` scripts) and the root `admin` note.
- **Edited the schema** — regenerate types with `npm run db:types` so the admin
  picks up new columns.
- **Google Books returns nothing on lookup** — keyless Books API access is
  quota-limited (HTTP 429, ~0/day). Set `GOOGLE_BOOKS_API_KEY` in
  `admin/.env.local` (enable the "Books API" at console.cloud.google.com, make
  an API key), then restart. Open Library has no such limit and works keyless.
