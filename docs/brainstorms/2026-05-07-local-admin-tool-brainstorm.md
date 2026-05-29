---
date: 2026-05-07
topic: local-admin-tool
---

# Local Admin Tool for Catalog Management

## What We're Building

A local Next.js admin app at `admin/` that lets you inspect and edit the local Supabase `books` table through a spreadsheet-style table, cross-check rows against the Open Library and Google Books APIs, selectively apply API results to mismatched fields, and bulk-fill sparse rows. Edits live in the local DB for fast iteration and are exported back to `data/books.csv` (and the existing override JSONs) on demand, keeping git as the durable source of truth.

Scope: editing only — the existing pipeline scripts (`source-isbns.ts`, `refresh-covers.ts`, `seed.ts`) stay as-is and continue to drive bulk re-sourcing and prod seeding.

## Why This Approach

Considered four source-of-truth models (DB-first deprecating CSV, CSV-first, hybrid round-trip, DB-first + prod sync) and three form factors (web app, Expo route, CLI). Hybrid + Next.js wins because:

- DB is the natural editing surface (typed, queryable, fast). CSV is the natural review surface (git diffs, PR-able, already wired into the seed pipeline).
- A real UI is needed for multi-ISBN diffs, cover image previews, and filtered tables — CLI can't handle those well.
- Server actions remove the awkward "two processes" shape of a Vite + Node API setup.
- Extracting API-fetch logic into a shared `lib/sources/` module compounds value: the admin tool and the existing scripts both consume it.

## Key Decisions

- **Source of truth:** Hybrid. Edit DB freely; explicit "Export to CSV" commits to `data/books.csv` + `data/*-overrides.json`. `db:reset && db:seed` round-trips cleanly as the safety net.
- **Form factor:** Next.js (App Router) at `admin/`, separate `package.json`, served via `npm run admin`. Local-only, no auth, no deploy.
- **DB access:** Supabase service-role client against the local stack (`supabase start`). Direct read/write, no RLS in this surface.
- **Browse model:** Spreadsheet table (sort/filter by canon, era, format, type; search by title/author) + bulk-ops mode (multi-select rows → batch action with per-row confirm).
- **API workflow:** Per-row "Lookup" runs OL + Google Books by ISBN(s), and by author+title fallback. UI shows a side-by-side diff for ISBN list, primary_isbn, cover_image, publisher, date_published, language, format, synopsis. Each differing field has an "Apply" toggle. "Fill all empty fields" mode for sparse rows.
- **Code reuse:** Refactor API-fetching helpers out of `scripts/source-isbns.ts` and `scripts/refresh-covers.ts` into `lib/sources/{open-library,google-books}.ts`. Shared by admin app and scripts.
- **CSV export:** Stable ordering (preserve existing CSV row order — match by slug/id) so git diffs stay clean. Array fields keep semicolon-delimited convention.

## Open Questions

- Should the cover_image diff also surface PRH (Penguin Random House) candidates the way `refresh-covers.ts` does, or is OL + Google Books enough for the manual workflow?
- When "Apply" pulls a new ISBN candidate, does it auto-update `primary_isbn` per the existing format-priority rule (paperback → hardcover → first), or leave that for the user to choose explicitly?
- Should the admin tool also write to `data/isbn-manual-overrides.json` / `data/cover-manual-overrides.json` (preserving the override-layer model), or write directly to `data/books.csv`? Probably the former — keeps overrides as the explicit "human said so" layer.
- Auth-protected single-user assumption: the local Supabase service-role key is committed where? Need to confirm `.env.local` pattern and ensure the admin app reads from it without leaking.
- Re-seed safety: if a user edits the DB and forgets to export, `db:reset` wipes their work. Add a "you have unsaved DB edits vs CSV" indicator?

## Next Steps

→ `/workflows:plan` for implementation details (file structure, schema for shared sources module, server action shape, table component choice, CSV writer logic, override-file write strategy).
