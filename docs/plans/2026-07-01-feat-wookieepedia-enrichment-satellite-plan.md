---
title: Wookieepedia In-Universe Enrichment (Satellite Table)
type: feat
date: 2026-07-01
---

# ✨ Wookieepedia In-Universe Enrichment (Satellite Table)

**Part 2 / follow-up to** [2026-07-01-feat-wookieepedia-book-enrichment-plan.md](2026-07-01-feat-wookieepedia-book-enrichment-plan.md) (the discovery/catalog-expansion plan). This plan was split out of that one during the reviewer pass — enrichment is a distinct project from discovery and should ship after it.

## Overview

Add in-universe context (characters, appearances, timeline detail) to book detail views, sourced from Wookieepedia and stored in a **1:1 satellite table** `book_enrichment` keyed on `books.id`. Surfaced on `app/book/[id].tsx` behind a "View on Wookieepedia" attribution backlink. Facts-first — no encumbered prose in MVP.

## Prerequisites / dependencies
- **v1 discovery landed** — books exist in the DB with stable ids; the enricher runs against promoted books.
- Reuses the v1 `lib/wookieepedia/{client,parse}.ts` (Action API client + wikitext parsing) and the `source_pageid` captured during discovery as the stable wiki anchor.

## Why a satellite table (not columns, not a separate DB)
Data-vault raw-vs-business split: wiki-owned, sparse, licensed, differently-refreshed data stays out of the curated `books` row.

| Option | Verdict | Why |
| --- | --- | --- |
| Columns on `books` | ❌ | Mixes provenance/license/RLS into curated rows; `books_updated_at` trigger destroys the enrichment-freshness signal; widens the hot catalog row. |
| **Satellite (same DB)** | ✅ | Independent RLS (public read / service-role write), provenance columns, own `updated_at`, no catalog bloat. |
| Separate database | ❌ | No cross-DB FK/joins (needs `postgres_fdw`); RLS/auth don't span DBs. |

## ERD

```mermaid
erDiagram
    books ||--o| book_enrichment : "1:1 enriches"
    books ||--o{ user_books : shelves
    book_enrichment {
        uuid book_id PK_FK "→ books.id ON DELETE CASCADE"
        bigint source_pageid "stable wiki anchor"
        text source_url "attribution backlink"
        bigint source_revision_id "staleness"
        text license "CC-BY-SA-3.0"
        text attribution
        timestamptz fetched_at
        text content_hash "idempotent re-sync gate"
        text era_detail
        text timeline_notes
        jsonb characters
        jsonb appearances
        jsonb related_media
        timestamptz updated_at
    }
```

## Design decisions (carried from the Part-1 reviewer pass)
- **RLS:** mirror the base table's **dual read policies** — SELECT for both `authenticated` *and* `anon` (or a single `TO public`), or the anon PostgREST embed returns null enrichment. **No** INSERT/UPDATE/DELETE policy for client roles (writes go through the service role, which bypasses RLS). Attach the shared `update_updated_at` trigger.
- **Merge:** **no `merge_books()` change needed** — `ON DELETE CASCADE` drops a duplicate loser's enrichment; if the survivor lacked enrichment, a re-sync repopulates it. (Folding the satellite into the row-merge is the wrong tool.)
- **App read:** embed `book_enrichment(*)` **only on the `book/[id]` detail query**, never the shelf list (jsonb payload bloat). Handle supabase-js inferring a 1:1 relation as an array (`[0]`, a `!left` hint, or a flattening DB view).
- **Types:** `npm run db:types` generates `jsonb` as the recursive `Json` type. Narrow it at a `parseEnrichment(row): Enrichment` boundary (explicit `Character[]`, etc.) so `app/book/[id].tsx` never indexes raw `Json`.
- **`content_hash`** hashes the **normalized stored fields**, not raw wikitext — cosmetic wiki edits to prose we don't store must not churn `fetched_at`/`updated_at`.
- **`pageid` lifecycle:** if a mapped `source_pageid` returns `missing` or is reached via `redirects`, **quarantine it** (flag stale) — never silently drop or re-point to the wrong article.

## Licensing
CC BY-SA 3.0 (text only). **Facts free; prose encumbered** (attribution + backlink + ShareAlike). MVP ships **facts + a "View on Wookieepedia" backlink** (the backlink doubles as attribution). Any prose is gated behind `components/wookieepedia-attribution.tsx`. **Cover art is publisher-copyright — do not rehost;** keep the OpenLibrary cover pipeline.

## Implementation Phases

### Phase 1 — Satellite migration
- `supabase/migrations/<ts>_add_book_enrichment.sql` — table per ERD, `updated_at` trigger, dual-read RLS, service-role-only writes.
- `npm run db:reset` + `npm run db:types` (regenerates `lib/types.ts`).
- **Acceptance:** reseed leaves the satellite untouched; deleting a book cascades its enrichment; anon can read via embed; client roles cannot write.

### Phase 2 — Enrichment sync
- `scripts/enrich-wookieepedia.ts` — for promoted books, fetch `{{Book}}` + section content via the v1 client/parse, extract characters/appearances/timeline detail, upsert on `book_id` gated by `content_hash`. Writes **only** the satellite. Compliant UA, ≤3 concurrent, honor 429.
- **Acceptance:** re-sync with no wiki change is a no-op (hash gate); missing/redirected pageids flagged, not silently dropped.

### Phase 3 — App integration
- `lib/hooks.ts` — detail-only embed `from('books').select('*, book_enrichment(*)')`; `parseEnrichment` narrowing.
- `app/book/[id].tsx` — conditional cards (In-Universe: era/timeline; Characters: chips; Appearances/Related) + "View on Wookieepedia" attribution row. `components/wookieepedia-attribution.tsx`.
- **Acceptance:** enriched books show new cards + backlink; non-enriched render exactly as today; zero client-side Fandom calls.

### Phase 4 — Admin surfacing (optional)
- Show `fetched_at`/`source_url`/match status + a manual `source_pageid` pin in the local admin.

## Acceptance Criteria
- [ ] `book_enrichment` migration + dual-read RLS + service-role writes; reseed-safe; delete cascades.
- [ ] Sync writes only the satellite, content-hash-gated, idempotent; stale/missing pageids flagged.
- [ ] Detail-only embed; `Json` narrowed via `parseEnrichment`; 1:1-as-array handled.
- [ ] Detail screen shows enrichment + attribution backlink when present; unchanged otherwise.
- [ ] Facts + backlink only in MVP; any prose behind the attribution component.

## Risks
- **CC BY-SA ShareAlike** on prose → facts-first MVP defers it.
- **jsonb schema drift** as the wiki changes → `parseEnrichment` is the single narrowing point; tolerate missing fields.
- **Embed payload bloat** → detail-only embed, list stays lean.

## References
- Parent plan: [2026-07-01-feat-wookieepedia-book-enrichment-plan.md](2026-07-01-feat-wookieepedia-book-enrichment-plan.md)
- Schema/RLS precedent: [supabase/migrations/20260410000000_create_books_and_user_books.sql](supabase/migrations/20260410000000_create_books_and_user_books.sql)
- Generated `Json` type: [lib/types.ts](lib/types.ts)
- Detail screen: [app/book/[id].tsx](app/book/[id].tsx)
- Licensing: [Wookieepedia:Copyrights](https://starwars.fandom.com/wiki/Wookieepedia:Copyrights) · [Fandom Licensing](https://www.fandom.com/licensing)
