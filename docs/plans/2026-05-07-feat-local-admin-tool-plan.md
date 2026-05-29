---
title: Local admin tool for catalog management
type: feat
date: 2026-05-07
brainstorm: docs/brainstorms/2026-05-07-local-admin-tool-brainstorm.md
deepened: 2026-05-07
trimmed: 2026-05-07
---

# feat: Local admin tool for catalog management

## What this plan is (and isn't)

A local-only Next.js admin UI for editing a 184-row catalog with API-assisted lookups against Open Library + Google Books, exporting back to `data/books.csv` (plus four manual-override JSONs). Single user, localhost, no auth.

This plan went through brainstorm → plan → deepen → review. The reviewer pass (DHH, Kieran, Simplicity) caught that deepening absorbed too much hardening for a solo local tool. This document is the trimmed version.

### Cut after review (over-engineered for context)

- `.export.lock.json` + `verifyConsistency()` — `git diff data/` is the recovery story
- `updated_at` trigger + If-Match optimistic concurrency — single user, last-write-wins is fine
- Idempotency keys + state machine + `visibilitychange` polling — sequential `await` loop is fine
- AbortController + requestId for lookups — clicked one row at a time
- CSRF middleware + `Sec-Fetch-Site` check — `--hostname 127.0.0.1` already isolates
- Postgres views for issues queue — inline SQL is the same query, easier to change
- `books_merge_isbns` Postgres RPC — `[...new Set([...existing, ...incoming])]` is one line
- TS project references with `composite: true` — `paths` map alone is enough
- `lib/native/` quarantine + Biome import-blocking rule — discipline + occasional grep

### Kept after review

- Service-role key server-only with `import 'server-only'` + CI grep
- Zod-parsed env at module load (no `process.env.X!`)
- csv-stringify with explicit knobs + round-trip regression test against current CSV
- User-Agent header + `fetchWithRetry` with exponential backoff + Retry-After
- Two API concurrency pools (`pLimit(5)` for OL/GB; `pLimit(1)+200ms` for `covers.openlibrary.org`)
- `Result<T, E>` discriminated unions for server actions
- `revalidateTag('books')` over `revalidatePath`
- All factual corrections from the deepening pass (cache version 9, override file names, `.env` not `.env.local`, `lib/isbn.ts` exists, kebab-case)

### Kieran nits applied

- `BookCandidate = Pick<BookPatch, ...>` so the relationship is explicit
- `safe-fs.ts` (was `fs-safe.ts`)
- `renameBookSlug` (was `renameSlug`)
- CI grep lives in Phase 1 only (was duplicated in Phase 5)

## Overview

A Next.js 15 sibling app at `admin/` reads/writes the local Supabase `books` table directly via `@supabase/supabase-js` with the service-role key (server-side only). The UI is a TanStack-Table v8 + shadcn/ui Data Table block. Per-row actions fetch candidates from Open Library + Google Books and render a 3-column diff (Current | OL | GB) with per-field RadioGroup selection. An Export-to-CSV action writes `data/books.csv` and patches four manual-override JSONs that the existing pipeline (`scripts/seed.ts`) layers in.

CSV stays canonical and version-controlled. `db:reset && db:seed` round-trips cleanly as the safety net.

## Problem Statement

Today, fixing bad catalog data means hand-editing `data/books.csv`, re-running `npm run db:seed`, and visually checking the app — slow, error-prone. Two backlogs are blocked on this loop:

- 40 books in [docs/plans/2026-05-05-data-manual-isbn-review-plan.md](docs/plans/2026-05-05-data-manual-isbn-review-plan.md) (28 weak + 12 no-data) flagged for human verification
- [docs/csv-isbn-corrections.md](docs/csv-isbn-corrections.md) — 79+ corrections caught by the pipeline; same flow needs to keep happening

Supabase Studio inspects but can't run author/title API lookups, can't render cover candidates, can't apply selected fields, can't write back to CSV.

## Architecture

```
admin/  (Next.js 15 App Router, http://127.0.0.1:3100, no auth)
├─ app/
│  ├─ books/
│  │  ├─ page.tsx                   server component, force-dynamic
│  │  ├─ [slug]/page.tsx            3-column diff page
│  │  └─ _components/books-table.tsx  TanStack v8 + shadcn block (client)
│  ├─ diff/page.tsx                 drift listing + Export button
│  ├─ _actions/
│  │  ├─ books.ts                   patchBook, batchPatch, lookupCandidates
│  │  └─ export.ts                  getDriftReport, exportToCsv, renameBookSlug
│  ├─ globals.css                   Star Wars CSS vars (lightsaber blue / SW yellow)
│  └─ layout.tsx                    <html class="dark">
├─ lib/
│  ├─ env.ts                        Zod-parsed env, server-only
│  ├─ supabase-admin.ts             service-role client, server-only
│  └─ safe-fs.ts                    atomic temp+rename, DATA_ROOT validated
├─ middleware.ts                    (deleted — loopback bind handles it)
├─ next.config.ts                   experimental.externalDir: true
└─ package.json                     own deps; "dev": next dev --hostname 127.0.0.1 --port 3100

lib/                                shared by admin app + scripts
├─ sources/
│  ├─ open-library.ts               fetchByIsbn, fetchEditionsByWork, searchByTitleAuthor
│  ├─ google-books.ts               with ?fields=… partial response
│  ├─ covers.ts                     HEAD-check + dedup
│  ├─ fetch-retry.ts                User-Agent + exp backoff + Retry-After
│  └─ types.ts                      BookPatch + BookCandidate (derived from generated types)
├─ csv/
│  ├─ read.ts                       csv-parse
│  ├─ write.ts                      csv-stringify with stable knobs
│  └─ __tests__/roundtrip.test.ts   live CSV byte-equal + edge fixtures
├─ isbn.ts                          extended with isbn3 (preserves normalizeIsbn for barcode scanner)
├─ types.ts                         Supabase-generated (existing)
└─ result.ts                        Result<T, E>

data/
├─ books.csv                        canonical
├─ isbn-manual-overrides.json       admin patches (slug-keyed)
├─ cover-manual-overrides.json      admin patches
├─ primary-isbn-manual-overrides.json  admin patches
└─ format-manual-overrides.json     admin patches
```

## Resolved decisions

| Question | Resolution |
|----------|------------|
| Source of truth | Hybrid. DB for editing, CSV + 4 manual-override JSONs for durability. |
| Override files written | All 4 manual JSONs (ISBN, primary_isbn, cover, format), plus CSV |
| Env file | Admin reads `admin/.env.local` (Next.js convention); root `.env` unchanged for scripts |
| `primary_isbn` validation | Zod refinement enforces `primary_isbn ∈ isbn[] ∨ null` |
| ISBN merge | Default = additive merge in JS (`[...new Set([...existing, ...new])]`). Explicit "Replace (destructive)" toggle requires typing the slug to confirm. |
| Slug renames | **Read-only in inline edit.** If you really need to rename, edit `data/books.csv` directly and `db:reset`. Saves writing a 4-file atomic rename action. |
| PRH cover candidates | Phase 6+ deferred |
| Hardcover.app fallback | Phase 6+ deferred |

## Technical decisions

### Type sharing (lightweight)

`paths` map in `admin/tsconfig.json` + `experimental.externalDir: true` in next.config. No project references, no `tsconfig.lib.json`. If type-check fidelity becomes a problem we add references later.

```jsonc
// admin/tsconfig.json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,
    "paths": {
      "@app/types": ["../lib/types.ts"],
      "@app/sources/*": ["../lib/sources/*"],
      "@app/csv/*": ["../lib/csv/*"],
      "@app/isbn": ["../lib/isbn.ts"],
      "@app/result": ["../lib/result.ts"]
    }
  }
}
```

### Types derive from Supabase generated

```ts
// lib/sources/types.ts
import type { Database } from '@app/types'

type BookRow = Database['public']['Tables']['books']['Row']

export type BookPatch = Partial<Pick<BookRow,
  'isbn' | 'primary_isbn' | 'cover_image' | 'publisher' |
  'date_published' | 'language' | 'format' | 'synopsis' |
  'title' | 'author' | 'canon' | 'era' | 'type' |
  'series_name' | 'series_order' | 'timeline_order'
>>

// Pick from BookPatch (not BookRow) so a divergence is impossible
export type BookCandidate = Pick<BookPatch,
  'isbn' | 'primary_isbn' | 'cover_image' | 'publisher' |
  'date_published' | 'language' | 'format' | 'synopsis'
>

export type LookupResult = {
  ol: BookCandidate
  gb: BookCandidate
  fetchedAt: string
}
```

### Service-role client + env

```ts
// admin/lib/env.ts
import 'server-only'
import { z } from 'zod'

export const env = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20)
}).parse(process.env)

// admin/lib/supabase-admin.ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@app/types'
import { env } from './env'

export const supabaseAdmin = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
)
```

`import 'server-only'` makes any client-component import a build error. Do not use `@supabase/ssr` (cookie collisions with service-role).

### Localhost binding

```json
// admin/package.json
{ "scripts": { "dev": "next dev --hostname 127.0.0.1 --port 3100" } }
```

That's the only network-isolation guard. No CSRF middleware (the loopback bind makes cross-origin requests structurally impossible).

### Server-action filesystem safety

```ts
// admin/lib/safe-fs.ts
import 'server-only'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const DATA_ROOT_REAL = await fs.realpath(path.resolve(process.cwd(), '../data'))

export async function safeWrite(rel: string, contents: string) {
  if (path.isAbsolute(rel)) throw new Error('absolute path rejected')
  const target = path.resolve(DATA_ROOT_REAL, rel)
  const parentReal = await fs.realpath(path.dirname(target))
  if (parentReal !== DATA_ROOT_REAL && !parentReal.startsWith(DATA_ROOT_REAL + path.sep)) {
    throw new Error('path escape via symlink')
  }
  const tmp = `${target}.${process.pid}.tmp`
  await fs.writeFile(tmp, contents, { mode: 0o600 })
  await fs.rename(tmp, target)
}
```

### CSV byte-stability

```ts
// lib/csv/write.ts
import { stringify } from 'csv-stringify/sync'

export const CSV_COLUMNS = [
  'title', 'id', 'slug', 'author', 'cover_image', 'canon', 'characters',
  'date_published', 'format', 'isbn', 'language', 'publisher', 'series',
  'series_name', 'series_order', 'timeline_order', 'synopsis', 'type',
  'asin', 'era', 'amazon_affiliate_link'
] as const

export function stringifyBooksCsv(rows: BookRow[]): string {
  const out = stringify(rows, {
    columns: CSV_COLUMNS,
    header: true,
    bom: false,
    quoted_match: /[",\n;]/,
    record_delimiter: '\n',
    cast: {
      object: (v) => {
        if (Array.isArray(v)) return v.join(';')
        throw new Error('non-array object cell — coerce upstream')
      },
      date: (v) => v.toISOString().slice(0, 10)
    }
  })
  return out.endsWith('\n') ? out : out + '\n'
}
```

Round-trip regression test: read `data/books.csv`, parse, re-stringify, assert byte-equal. Plus a handful of fixture tests for NULLs, accented titles (NFC), enum casing, dates without TZ, and empty arrays. Runs in `npm test`.

### Server actions: Result<T, E>

```ts
// lib/result.ts
export type Result<T, E = { code: string; message: string }> =
  | { ok: true; data: T }
  | { ok: false; error: E }
```

```ts
// admin/app/_actions/books.ts
'use server'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'

const patchSchema = z.object({
  isbn: z.array(z.string()).optional(),
  primary_isbn: z.string().nullable().optional(),
  canon: z.enum(['Canon', 'Legends']).optional(),
  type: z.enum(['Adult Novel', 'YA Novel', 'Middle Grade Novel']).optional(),
  // ... explicit z.enum for every enum column
}).refine(
  (p) => !p.isbn || !p.primary_isbn || p.isbn.includes(p.primary_isbn),
  { message: 'primary_isbn must be in isbn[]' }
)

export async function patchBook(id: string, raw: unknown) {
  const parsed = patchSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: { code: 'INVALID', message: parsed.error.message } }
  const { data, error } = await supabaseAdmin
    .from('books').update(parsed.data).eq('id', id).select().single()
  if (error) return { ok: false, error: { code: 'DB', message: error.message } }
  revalidateTag('books')
  return { ok: true, data }
}
```

Client uses `useActionState` for inline edits + `useFormStatus` for the pending dot. `useOptimistic` for single-cell edits only (cheap, revert on `!ok`); off for bulk + export.

### API hygiene

```ts
// lib/sources/fetch-retry.ts
const UA = 'OssusArchives/1.0 (ghanbak@gmail.com)'

export async function fetchWithRetry(url: string, init: RequestInit = {}, opts = { retries: 4, baseMs: 1000 }) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...init.headers }
    })
    if (res.ok) return res
    if ((res.status === 429 || res.status >= 500) && i < opts.retries) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const delay = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : opts.baseMs * 2 ** i + Math.random() * opts.baseMs
      await new Promise(r => setTimeout(r, Math.min(delay, 30_000)))
      continue
    }
    return res
  }
}
```

Concurrency: `pLimit(5)` for OL non-cover endpoints + Google Books; `pLimit(1) + 200ms` for `covers.openlibrary.org` (100 req / 5 min / IP bucket).

### Issues queue (inline SQL)

```ts
// admin/app/_actions/issues.ts
const ISSUE_QUERIES = {
  missingPrimaryIsbn: () => supabaseAdmin.from('books').select('id, slug', { count: 'exact', head: true }).is('primary_isbn', null),
  noCover: () => supabaseAdmin.from('books').select('id, slug', { count: 'exact', head: true }).is('cover_image', null),
  // ... 4 more
}
```

Inline. No views, no migration.

## Implementation Phases

### Phase 0 — Shared module refactor

Land separately from the admin app to keep blast radius bounded.

- [x] Add to root `package.json`: `vitest`, `csv-stringify`, `csv-parse`, `isbn3@^2.0.7`, `p-limit`, `zod`. Add `"test": "vitest run"`. (`p-limit` already present; `isbn3` → dependencies since it's bundled via `lib/isbn.ts`, rest → devDependencies)
- [x] Create `lib/sources/types.ts` (BookPatch, BookCandidate derived; Pick-from-Pick relationship)
- [x] Create `lib/sources/fetch-retry.ts` (User-Agent + backoff; `Accept: application/json` lives in `fetchJson`, not `fetchWithRetry`, so byte fetches aren't forced to JSON)
- [x] Create `lib/sources/open-library.ts` — extract from `scripts/source-isbns.ts` + `scripts/refresh-covers.ts`. No caching here; caller decides.
- [x] Create `lib/sources/google-books.ts` — extract; `?fields=…` partial response opt-in (omitted by default to preserve exact legacy URLs)
- [x] Create `lib/sources/covers.ts` — HEAD check + `findSharedValues` dedup helper
- [x] **Extend** `lib/isbn.ts` with `isbn3` integration (`parseIsbn`, `isValidIsbn`, `toIsbn13`, `hyphenateIsbn`); preserve `normalizeIsbn` (barcode scanner contract). isbn3 verified node-builtin-free → Metro-safe.
- [x] Create `lib/csv/read.ts` (csv-parse) + `lib/csv/write.ts` (csv-stringify with explicit `CSV_COLUMNS`)
- [x] Create `lib/result.ts`
- [x] Update `scripts/source-isbns.ts`, `scripts/refresh-covers.ts`, `scripts/seed.ts`, `scripts/audit-covers.ts`, `scripts/detect-placeholder-covers.ts` to import from new `lib/` modules. **Deviation:** `source-isbns.ts` swaps only its CSV reader to `lib/csv`; its fetch stays local because its tier-1/2 probes hit the network even on cache hits, so adding UA/retry there would change pipeline output and break the byte-identical gate. `fetchWithRetry` adoption lands in `refresh-covers` + `detect-placeholder-covers` (gate-excluded); `audit-covers` keeps raw status probing by design.
- [x] Round-trip + JSON-emit determinism tests at `lib/csv/__tests__/` (11 tests: live `books.csv` byte round-trip modulo BOM/line-endings, quoting/escaping/NFC/array/date/null/enum fixtures). JSON-emit determinism is additionally proven by the byte-identical gate on the emitted override JSONs.
- [x] Verification (byte-identical gate): **PASSED** — all 5 `data/*.json` + `scripts/isbn-collisions.json` byte-identical pre/post refactor; `npm test` 11/11; `tsc --noEmit` clean. Live `db:reset && db:seed` confirmed locally: 185 books seeded (`Verification: 185 books in database`). Note: newer Supabase CLI issues **publishable/secret** keys — pass the **secret** key as `SUPABASE_SERVICE_ROLE_KEY` for the seed.
  1. On **pre-refactor** code, warm the cache by running the full pipeline once so `scripts/isbn-cache.json` exists (no cache today → first run is cold, ~10–15 min): `npx tsx scripts/source-isbns.ts`.
  2. Snapshot deterministic outputs preserving paths, and back up the cache so the after-run replays identical API responses:
     ```sh
     mkdir -p /tmp/preref/data /tmp/preref/scripts
     cp data/books.csv data/*.json /tmp/preref/data/
     cp scripts/isbn-collisions.json /tmp/preref/scripts/
     cp scripts/isbn-cache.json /tmp/preref-cache.json
     ```
  3. Apply the refactor, restore the cache (`cp /tmp/preref-cache.json scripts/isbn-cache.json`), then re-run `npx tsx scripts/source-isbns.ts`.
  4. Diff must be empty:
     ```sh
     diff -r /tmp/preref/data data
     diff /tmp/preref/scripts/isbn-collisions.json scripts/isbn-collisions.json
     ```
     Excluded from the diff because they embed timestamps (not byte-stable): `scripts/isbn-report.txt`, `scripts/isbn-cache.json`, `scripts/cover-resource-map.json`.
  5. `npm run db:reset && npm run db:seed` succeeds, `npm test` passes, Expo app `npx expo start` still loads.

**Acceptance:** byte-identical pipeline output before/after, all tests pass, Expo app unchanged.

### Phase 1 — Admin app skeleton

- [x] `admin/package.json` with `next@^15`, `react@^19`, `@supabase/supabase-js`, `@tanstack/react-table`, shadcn prerequisites, `csv-stringify`, `csv-parse`, `zod`, `p-limit`. **Added `isbn3`** too — `externalDir` resolves `@app/isbn`'s `isbn3` import from `admin/node_modules`.
- [x] `admin/next.config.ts` with `experimental.externalDir: true` (+ `outputFileTracingRoot` pinned to repo root to silence the multi-lockfile warning)
- [x] `admin/tsconfig.json` with paths map + `noUncheckedIndexedAccess`. **Deviation: standalone, NOT extending root** — `expo/tsconfig.base` sets `jsx: react-native` + RN `customConditions`, which are fatal for Next. Root `tsconfig`/Biome now `exclude`/`ignore` `admin/` so they don't fight the Next app.
- [x] `admin/.env.local.example` documenting `SUPABASE_URL=http://127.0.0.1:54321` + `SUPABASE_SERVICE_ROLE_KEY` (the "secret" key from `supabase status`). Added `!admin/.env.local.example` negation to `.gitignore`.
- [x] `admin/lib/env.ts`, `admin/lib/supabase-admin.ts`, `admin/lib/safe-fs.ts`
- [x] Root `package.json` scripts: `"admin"`, `"admin:install"`, `"admin:predev": "npm run db:types"`
- [x] shadcn configured. **Deviation:** skipped `init --preset radix-nova` (that scaffolds a *new* project); instead hand-wrote `components.json` (new-york, radix base) into the existing app, then ran `shadcn add`.
- [x] `npx shadcn@latest add button table badge checkbox input select dropdown-menu command` (pulled `dialog` too). No `data-table` block — the table is built directly on TanStack v8 per the books-table item below.
- [x] CSS variables in `admin/app/globals.css` for Star Wars tokens (lightsaber-blue, SW yellow, canon, legends, surfaces) — Tailwind v4 `@theme` mapping
- [x] `admin/app/layout.tsx` with `<html class="dark">` default
- [x] `admin/app/books/page.tsx` — server component, `force-dynamic`, projects only displayed columns (drops `synopsis`)
- [x] `admin/app/books/_components/books-table.tsx` — client; `createColumnHelper<BookListRow>()`, sort/filter/multi-select via local state
- [x] CI grep in `npm run lint` via `scripts/check-admin-bundle.sh`. **Updated patterns:** matches `sb_secret_` (current CLI key format) + `SUPABASE_SERVICE_ROLE_KEY`, dropped the plan's broad `eyJ` (false-positives on base64 / the safe anon JWT).

**Acceptance:** Build + type-check pass (`next build` clean; `/books` is `ƒ` dynamic). Service-role key NOT in `.next/static` — **verified in sandbox** (built with a dummy key; guard + explicit grep both clean). `npm run admin` opening `http://127.0.0.1:3100/books` with live data, and the `lsof` loopback-only check, require the local Supabase stack — **run locally to confirm** (dev script binds `--hostname 127.0.0.1`).

### Phase 2 — Edit + per-row API lookup + diff/apply

- [ ] `admin/app/_actions/books.ts`:
  - `patchBook(id, patch) → Result<BookRow, Err>` — Zod-validated with explicit enum schemas + `primary_isbn ∈ isbn[]` refinement; `revalidateTag('books')`
  - `lookupCandidates(slug) → Result<LookupResult, Err>` — calls OL + GB in parallel via `Promise.allSettled`; partial success returns whichever succeeded
- [ ] Inline cell editing using `useOptimistic` for single cells; revert on `!ok`. 300ms debounce before commit.
- [ ] `admin/app/books/[slug]/page.tsx`:
  - 3 `Card` columns (Current | OL | GB), `CardDescription` shows provenance ("OL · fetched 2m ago")
  - Per-field `RadioGroup` (3 items) inside `Field`; override via `Input` or `InputGroup`
  - Cover candidates: `Card` row in `ScrollArea`, 2:3 aspect ~180px tall; `new Image()` preload before enabling Apply; `Dialog` to enlarge
  - "Apply selected" `Button` in `CardFooter` with `AlertDialog` confirm; `useActionState` for pending
  - "Fill all empty" `Checkbox` at top — pre-selects candidate fields where current is null/empty
  - `pickPrimaryIsbn(newIsbn)` preview when ISBN array changes; user can override
  - ISBN merge default = JS Set union; "Replace (destructive)" toggle requires typing the slug. Replace path writes a removal entry to `data/isbn-manual-overrides.json`.
- [ ] Slug column is read-only in the table (non-editable cell)

**Acceptance:** edit any non-slug field inline; navigate to `/books/[slug]`, run lookup, see 3-column diff, apply selected fields. Two-tab last-write-wins is documented as accepted behavior.

### Phase 3 — Issues queue + bulk ops

- [ ] Left-rail filter list (shadcn `Sidebar` + `SidebarMenuBadge`) with live counts from inline SQL queries:
  - Missing primary_isbn (`primary_isbn IS NULL`)
  - No cover (`cover_image IS NULL`)
  - Placeholder cover (joins with set loaded once from `scripts/placeholder-report.json`)
  - Sparse row (`array_length(author,1)=0 OR array_length(isbn,1)=0 OR cover_image IS NULL OR synopsis IS NULL`)
  - Manual review weak (28 slugs from review plan doc)
  - Manual review no-data (12 slugs from review plan doc)
- [ ] Bulk-ops bar with sequential `await` loop (no FSM, no idempotency keys, no polling):
  - **Re-fetch covers** — `lib/sources/covers.ts` per row; `Progress` component shows N/total
  - **Validate ISBNs** — flags rows with bad check digits via `lib/isbn.ts`
  - **Fill empty fields** — `lookupCandidates` + auto-apply where current is null
  - Buttons disable while running
- [ ] `batchPatch(rows[]) → Result<Row[], Err>` — single Postgres `UPDATE … FROM (VALUES …)` for the bulk apply step

**Acceptance:** all 6 filters render correct counts; bulk re-fetch covers on a 5-row selection completes with a progress indicator.

### Phase 4 — Export to CSV + drift indicator

- [ ] `admin/app/_actions/export.ts`:
  - `getDriftReport()` — reads `data/books.csv`, queries DB ordered by id, builds `Map<id, row>` for both sides, single-pass O(n) diff. Returns `{ changedRows, summary }`.
  - `exportToCsv()` — atomic temp+rename of `data/books.csv`, then per-field-diff patches to the four manual-override JSONs. No lock file. If export fails, `git checkout data/` is the recovery.
- [ ] Header drift chip: `Badge` with `tabular-nums` count; updates via `revalidateTag('books')` after every mutation
- [ ] `admin/app/diff/page.tsx` — paginated changed rows, field-level diff, "Export to CSV" `Button`
- [ ] After-export verification doc in `admin/README.md`: "Run `npm run db:reset && npm run db:seed`. Drift should re-appear at 0."

**Acceptance:** make 3 edits → drift shows "3 unsaved" → export succeeds → drift = 0 → `git diff data/` shows minimal expected changes (only modified rows in CSV; only modified slugs in override JSONs).

### Phase 5 — Polish + docs

- [ ] `admin/README.md`: setup, env vars, troubleshooting, "edit slugs by hand if you really need to" note
- [ ] Top-level `README.md` reference under "Catalog management"
- [ ] CLAUDE.md addition: "Use `npm run admin` for catalog edits; review `/diff` before exporting; do not hand-edit `data/books.csv` except for slug renames"
- [ ] Star Wars themed empty states + microcopy ("All systems nominal", "Synced to books.csv · 3 rows changed")
- [ ] Biome inherits root config; admin lints clean

**Acceptance:** fresh checkout → `npm install && npm run admin:install && npm run admin` works in 5 minutes per README.

## Acceptance Criteria

### Functional

- [ ] `npm run admin` opens working tool at `http://127.0.0.1:3100`
- [ ] Loopback-only (no `*` or `[::1]` listener)
- [ ] Books table renders all 184 books with sort/filter/multi-select
- [ ] Inline cell edits commit with optimistic UI + rollback on `Result.ok=false`
- [ ] Per-row diff page shows OL + GB candidates with selectable apply
- [ ] ISBN apply default = additive merge; destructive replace requires typed-confirmation
- [ ] `primary_isbn ∈ isbn[]` invariant enforced
- [ ] Slug column is read-only in inline edit
- [ ] Issues queue counts match underlying SQL
- [ ] Export-to-CSV is byte-stable (round-trip test passes)
- [ ] Manual-override JSONs updated for ISBN/primary_isbn/cover/format changes only
- [ ] Drift indicator goes to 0 after export

### Non-Functional

- [ ] Round-trip CSV + JSON-emit fixture tests in CI
- [ ] No service-role key in any client bundle (CI grep on `.next/static`)
- [ ] Phase 0 produces byte-identical pipeline output (verification protocol)
- [ ] TS strict + `noUncheckedIndexedAccess`; no `any` in shared `lib/`; no `process.env.X!`
- [ ] All API calls send `User-Agent: OssusArchives/1.0 (ghanbak@gmail.com)`
- [ ] No DB transactions wrap HTTP calls

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Phase 0 refactor breaks existing pipeline | Snapshot test of CSV + 5 override JSONs + cache; ship as standalone PR |
| Service-role key leaks to client bundle | `import 'server-only'` + CI grep on `.next/static` |
| LAN exposure | `--hostname 127.0.0.1` + `lsof` check rejects `*` and `[::1]` |
| Path traversal via symlinks | `fs.realpath` on both DATA_ROOT and target dir + reject absolute paths |
| `primary_isbn` orphaning | Zod refinement: must be in `isbn[]` or null |
| ISBN wholesale replace violates additive rule | Default = additive merge; explicit destructive-replace requires typed-confirmation |
| Round-trip drift (timezones, NFC, enums) | Fixture-based round-trip tests + explicit `csv-stringify` knobs |
| OL covers bucket rate-limit (100 / 5min / IP) | Separate `pLimit(1) + 200ms` pool for `covers.openlibrary.org` |
| OL anonymous-blocker | `User-Agent` header on every request |
| Two-tab stale-write | **Accepted.** Single user; close one tab. Documented in README. |
| Mid-export crash leaves CSV inconsistent | `git checkout data/` is the recovery story |

## Dependencies

- Local Supabase running (`supabase start`)
- `admin/.env.local` with `SUPABASE_URL=http://127.0.0.1:54321` + `SUPABASE_SERVICE_ROLE_KEY` from `supabase status`
- New root deps: `vitest`, `csv-stringify`, `csv-parse`, `isbn3@^2.0.7`, `p-limit`, `zod`
- New admin deps: `next@^15`, `react@^19`, `@supabase/supabase-js`, `@tanstack/react-table`, shadcn prerequisites
- Network access to `openlibrary.org`, `covers.openlibrary.org`, `www.googleapis.com`

## References

### Internal

- Brainstorm: [docs/brainstorms/2026-05-07-local-admin-tool-brainstorm.md](docs/brainstorms/2026-05-07-local-admin-tool-brainstorm.md)
- Data quality plan: [docs/plans/2026-05-05-feat-catalog-data-quality-pass-plan.md](docs/plans/2026-05-05-feat-catalog-data-quality-pass-plan.md)
- Multi-format ISBN plan: [docs/plans/2026-04-22-db-multi-format-isbn-and-covers-plan.md](docs/plans/2026-04-22-db-multi-format-isbn-and-covers-plan.md)
- Manual review queue: [docs/plans/2026-05-05-data-manual-isbn-review-plan.md](docs/plans/2026-05-05-data-manual-isbn-review-plan.md)
- ISBN corrections log: [docs/csv-isbn-corrections.md](docs/csv-isbn-corrections.md)
- Existing pipeline: [scripts/source-isbns.ts](scripts/source-isbns.ts), [scripts/refresh-covers.ts](scripts/refresh-covers.ts), [scripts/seed.ts](scripts/seed.ts)
- `pickPrimaryIsbn`: [scripts/lib/pick-primary-isbn.ts:55](scripts/lib/pick-primary-isbn.ts)
- Existing `lib/isbn.ts` (extend, don't replace): [lib/isbn.ts](lib/isbn.ts)
- Cache schema constant `CACHE_SCHEMA_VERSION = 9`: [scripts/source-isbns.ts:71](scripts/source-isbns.ts)

### External

- Next.js Server Actions: https://nextjs.org/docs/app/getting-started/updating-data
- Supabase service-role on server: https://supabase.com/docs/guides/troubleshooting/performing-administration-tasks-on-the-server-side-with-the-servicerole-secret-BYM4Fa
- shadcn/ui Data Table: https://ui.shadcn.com/docs/components/data-table
- TanStack Table v8: https://tanstack.com/table/latest
- csv-stringify options: https://csv.js.org/stringify/options/
- isbn3: https://www.npmjs.com/package/isbn3
- Open Library API: https://openlibrary.org/developers/api
- Open Library Covers API: https://openlibrary.org/dev/docs/api/covers
- Google Books API: https://developers.google.com/books/docs/v1/using
- Google Books partial response: https://developers.google.com/books/docs/v1/performance

## Future (deferred)

- PRH cover sourcing in diff UI
- Hardcover.app as tertiary fallback
- Add new books workflow (currently catalog-only)
- Production sync (push admin edits to prod Supabase)
- Audit log
- Cover image upload (host locally instead of linking)
- `nuqs` URL state for filters
- Keyboard shortcuts
- TS project references (if type-check fidelity becomes a problem)
- `lib/native/` quarantine + lint rule (if cross-import bugs actually happen)
- `updated_at` + optimistic concurrency (if multi-user ever happens)
