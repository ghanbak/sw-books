# Ossus Archives — Admin

Local-only Next.js tool for editing the book catalog. Reads/writes the local
Supabase `books` table directly with the service-role key (server-side only),
then exports changes back to `data/books.csv` + the manual-override JSONs.

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

The DB must be seeded first:

```sh
supabase start
npm run db:reset
SUPABASE_SERVICE_ROLE_KEY=<secret> npm run db:seed
```

## Run

```sh
npm run admin            # → http://127.0.0.1:3100/books
```

## What you can do

- **`/books`** — sort, filter, multi-select. Edit title / publisher / era /
  published inline (autosaves). Left rail filters by issue (missing primary
  ISBN, no cover, sparse, manual-review, …).
- **Bulk ops** (select rows) — re-fetch covers, validate ISBNs, fill empty
  fields from Open Library + Google Books.
- **`/books/[slug]`** — run an OL + GB lookup and apply fields from a 3-column
  diff. ISBNs merge additively by default; destructive replace needs a typed
  confirmation.
- **`/diff`** — review every field that differs from `data/`, then **Export to
  CSV**.

## Export & verify

Edits live only in the local DB until you export. The drift chip on `/books`
shows the unsaved count; `/diff` lists the changes.

**Export** writes scalar fields to `data/books.csv` and routes
`isbn` / `primary_isbn` / `cover_image` / `format` to the four
`*-manual-overrides.json` files (so they survive a pipeline regen).

Verify a round-trip after exporting:

```sh
npm run db:reset && SUPABASE_SERVICE_ROLE_KEY=<secret> npm run db:seed
```

The drift count on `/books` should return to **0** — the seed reproduced your
edits from disk. If an export looks wrong, recover with `git checkout data/`.

> Don't hand-edit `data/books.csv` except for slug renames (slugs are read-only
> in the tool). Everything else flows through the admin → export loop.

## Troubleshooting

- **`ZodError … SUPABASE_SERVICE_ROLE_KEY` on load** — the key in
  `admin/.env.local` is missing/blank. Paste the **secret** key from
  `supabase status`, then restart `npm run admin` (env isn't hot-reloaded).
- **`npm error Missing script: "dev"`** — run `npm run admin` from the repo
  root, not `npm run dev` (the root has no `dev` script).
- **Catalog is empty / fetch fails** — the local Supabase stack isn't running or
  isn't seeded. `supabase start`, then `npm run db:reset && npm run db:seed`.
- **Port 3100 in use** — stop the other listener, or change the port in
  `admin/package.json` (`dev`/`start` scripts) and the root `admin` note.
- **Edited the schema** — regenerate types with `npm run db:types` so the admin
  picks up new columns.
- **Google Books returns nothing on lookup** — keyless Books API access is
  quota-limited (HTTP 429, ~0/day). Set `GOOGLE_BOOKS_API_KEY` in
  `admin/.env.local` (enable the "Books API" at console.cloud.google.com, make
  an API key), then restart. Open Library has no such limit and works keyless.
