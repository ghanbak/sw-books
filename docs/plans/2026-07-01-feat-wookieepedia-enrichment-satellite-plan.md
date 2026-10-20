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
        bigint source_pageid "NOT NULL UNIQUE, stable wiki anchor"
        text source_title
        text source_url "NOT NULL, attribution backlink"
        bigint source_revision_id "staleness"
        text license "NOT NULL DEFAULT CC-BY-SA-3.0"
        text attribution
        timestamptz fetched_at "NOT NULL"
        text content_hash "NOT NULL, idempotent re-sync gate"
        jsonb appearances "NOT NULL DEFAULT {}, CHECK object"
        text timeline_notes "raw display timeline"
        timestamptz created_at
        timestamptz updated_at "update_updated_at trigger"
    }
```

Final schema (Phase 1, shipped): characters live **inside** `appearances` (no separate `characters` column); `era_detail` and `related_media` were dropped — see Phase 1.

## Design decisions (carried from the Part-1 reviewer pass)
- **RLS:** mirror the base table's **dual read policies** — SELECT for both `authenticated` *and* `anon` (or a single `TO public`), or the anon PostgREST embed returns null enrichment. **No** INSERT/UPDATE/DELETE policy for client roles (writes go through the service role, which bypasses RLS). Attach the shared `update_updated_at` trigger.
- **Merge:** **no `merge_books()` change needed** — `ON DELETE CASCADE` drops a duplicate loser's enrichment; if the survivor lacked enrichment, a re-sync repopulates it. (Folding the satellite into the row-merge is the wrong tool.)
- **App read:** embed `book_enrichment(*)` **only on the `book/[id]` detail query**, never the shelf list (jsonb payload bloat). Handle supabase-js inferring a 1:1 relation as an array (`[0]`, a `!left` hint, or a flattening DB view). *Phase 1 finding:* the PK-as-FK makes the generated relationship `isOneToOne: true` and PostgREST returns the embed as an object (or `null`), so no array handling should be needed — confirm in Phase 3.
- **Types:** `npm run db:types` generates `jsonb` as the recursive `Json` type. Narrow it at a `parseEnrichment(row): Enrichment` boundary (explicit `Character[]`, etc.) so `app/book/[id].tsx` never indexes raw `Json`.
- **`content_hash`** hashes the **normalized stored fields**, not raw wikitext — cosmetic wiki edits to prose we don't store must not churn `fetched_at`/`updated_at`.
- **`pageid` lifecycle:** if a mapped `source_pageid` returns `missing` or is reached via `redirects`, **quarantine it** (flag stale) — never silently drop or re-point to the wrong article.

## Licensing
CC BY-SA 3.0 (text only). **Facts free; prose encumbered** (attribution + backlink + ShareAlike). MVP ships **facts + a "View on Wookieepedia" backlink** (the backlink doubles as attribution). Any prose is gated behind `components/wookieepedia-attribution.tsx`. **Cover art is publisher-copyright — do not rehost;** keep the OpenLibrary cover pipeline.

## Implementation Phases

### Phase 1 — Satellite migration ✅
- [supabase/migrations/20261020221839_add_book_enrichment.sql](../../supabase/migrations/20261020221839_add_book_enrichment.sql) — table per ERD, `book_enrichment_updated_at` trigger (shared `update_updated_at`), table + column comments (CC BY-SA 3.0 provenance), `CHECK (jsonb_typeof(appearances) = 'object')`.
- **Access:** RLS on; `SELECT` policies for `anon` and `authenticated` (`using (true)`, mirrors `books`). No client write policies. Privileges are explicit so they don't depend on the project's default grants: `revoke all` from `anon`/`authenticated`, then `grant select`; `grant select, insert, update, delete` to `service_role`.
- **TS boundary:** [lib/wookieepedia/enrichment.ts](../../lib/wookieepedia/enrichment.ts) — `Enrichment`, `AppearanceEntry`, `parseEnrichment(row)`, `parseAppearances(json)`, `isMentionOnly(entry)`. Independent of `lib/types.ts`; a tsc guard in the test asserts the generated row stays assignable to `BookEnrichmentRow`.
- **Tests:** `lib/wookieepedia/enrichment.test.ts` (Vitest, no DB); [supabase/tests/book_enrichment_test.sql](../../supabase/tests/book_enrichment_test.sql) (constraints, 1:1 PK, unique `source_pageid`, FK, object CHECK, trigger, anon/authenticated read-yes/write-no, cascade).
- **Acceptance:** reseed leaves the satellite untouched (seed upserts `books` on slug; no deletes); deleting a book cascades its enrichment; anon can read via embed; client roles cannot write.

#### `appearances` shape (pinned against the live wiki)
Source: the `{{App}}` template in each book's `==Appearances==` section. Its parameters (from `Template:App`) are `characters`, `dramatis personae`, `other characters`, `organisms`, `droids`, `events`, `locations`, `organizations`, `species`, `vehicles`, `technology`, `miscellanea`, plus `c-`/`l-` prefixed variants for canon/Legends crossovers. Checked against 15 pages (canon + Legends, 1978–2022; NJO *Star by Star* has ~880 entries).

Stored keys: `dramatis_personae`, `characters`, `organisms`, `droids`, `events`, `locations`, `organizations`, `species`, `vehicles`, `technology`, `miscellanea`. The sync folds `other characters` into `characters` and the `c-`/`l-` variants into their base key. `dramatis personae` (principal cast, NJO and some Legends) stays separate.

Entry: `{ name, page?, markers?, note?, depth? }` — optional keys omitted when empty.
- `name` — wikilink label (else target). ~0.1% of entries are unlinked plain text → `page` absent.
- `page` — wikilink target (normalized, e.g. `Mitth'raw'nuruodo/Legends`), **always set for a linked entry**, even when it equals `name` — so linked vs plain text is distinguishable and the app can link names out (decided in Phase 2; `parseEnrichment` still accepts older rows without it).
- `markers` — from inline templates: `{{1st}}` first, `{{1stm}}` first_mentioned, `{{1stc}}` first_canon, `{{1stID|x}}` first_identified, `{{1str}}` first_before_retcon, `{{Mo}}` mentioned, `{{Imo}}` indirect_mention, `{{ID|x}}` identified_as, `{{Flash}}` flashback, `{{Hologram}}` hologram, `{{Vision|x}}` vision, `{{Voice}}` voice, `{{Ghost}}` ghost, `{{Po}}` picture, `{{Co}}` cover, `{{Wreck}}` wreckage, `{{Ret}}` retcon. Mention-only = `mentioned` | `indirect_mention` | `first_mentioned`.
- `note` — `{{C|…}}` free text ("Statue only", "unborn"), alias text (`"Threepio"`), template arguments (`{{ID|Yagai}}`, `{{Vision|Luke Skywalker}}`), or the dramatis personae role (`Jedi Knight (female Twi'lek)`).
- `depth` — list nesting (`**` = 1; up to 5 in locations), e.g. *Battle of Endor* under *Galactic Civil War*.
- Ignore `{{!}}` (column break) and `{{'s}}` (render as `'s`).

Payload: 14–50 KB per book (measured in Phase 2: avg 36 KB, max 111 KB) → detail-only embed stands.

#### Deliberately left out
- **`era_detail`** — the `{{Book}}` infobox has no era field. The only era signal is the `{{Top|rwm|<code>}}` icon code (`rote`, `rofo`, `tnr`, `thr`; Legends `imp`, `reb`, `new`, `njo`, `old`), which is coarse and duplicates `books.era`. Phase 2 may use it to cross-check `books.era`, not to store.
- **`related_media`** — the only structured candidates are infobox `preceded by`/`followed by` (reading order, overlaps `books.series_*`, sometimes multi-valued with refs) and `==Media==` (editions/covers, out-of-universe). No clean in-universe related-media list. Additive column later if Phase 3 needs it.
- **Separate `characters` column** — characters are one `{{App}}` category; they live in `appearances`.
- **`timeline_notes`** comes from infobox `timeline` (e.g. `c. [[15 BBY]]…–c. [[2 BBY]]`). Phase 2 must keep `{{C|Part 1}}`-style labels (*Darth Plagueis*) — `stripWikiMarkup` drops templates.

#### Verification (local)
Ran locally on 2026-10-20: `npx supabase db reset --local`, `npm run db:types`, both SQL tests PASS, PostgREST probe (anon embed returns `book_enrichment` as an object; anon POST/DELETE → 42501; service-role insert + `on_conflict=book_id` upsert OK).

```bash
npx supabase status
npm run db:reset            # local only; applies all migrations (no seed.sql — run npm run db:seed after)
npm run db:types            # regenerates lib/types.ts
docker exec -i supabase_db_ossus-archives psql -U postgres -v ON_ERROR_STOP=1 -q < supabase/tests/book_enrichment_test.sql
npm test && npx tsc --noEmit
```
Prod: migration pushed 2026-10-20 (`supabase db push`, by the user); table empty until the Phase 2 sync is applied.

### Phase 2 — Enrichment sync ✅
`npm run catalog:enrich` → [scripts/enrich-wookieepedia.ts](../../scripts/enrich-wookieepedia.ts). Dry-run by default; `--apply` writes; `--production` targets prod (read-only unless `--apply`, then the typed project-ref prompt, same guard as `apply-catalog-changeset.ts`). Flags: `--allow-shrink`, `--verbose`.

- **Parser** — [lib/wookieepedia/appearances.ts](../../lib/wookieepedia/appearances.ts) (pure): `parseAppearancesWikitext` → the stored `appearances` shape (optional keys and empty categories omitted; `parseAppearances` restores defaults). Every `{{App}}` on the page; `c-`/`l-` fold to base, `other characters` → `characters`, `dramatis personae` kept with the role as `note`. Entry = leading wikilink (label/target, link trail, quoted phrases) + residual text as note; no leading link → plain text, no `page` (incl. possessives like `[[Jabba]]'s palace`). `{{!}}`, `{{'s}}`, comments, refs handled; unknown templates/params are dropped and counted in `diagnostics`, never thrown. `buildTimelineNotes` keeps `{{C|…}}` as "(…)" and joins `<br>` segments with "; ". Tests: [appearances.test.ts](../../lib/wookieepedia/appearances.test.ts) against pinned real fixtures in `lib/wookieepedia/__fixtures__/` (canon *A New Dawn*, Legends *Heir to the Empire*, NJO *Star by Star*).
- **Marker vocabulary extended** (full-catalog run surfaced them; additive, `parseEnrichment` unchanged otherwise): `{{1stcm}}` first_canon_mentioned (mention-only), `{{1stp}}` first_pictured, `{{1stdesc}}` first_described, `{{Ho}}` heard, `{{Corpse}}` corpse, `{{Unborn}}` unborn, `{{Sim}}` simulation, `{{Holocron}}` holocron, `{{Qo}}` quote; `{{Crawl}}` → mentioned + note "opening crawl". `first*` arguments ("simultaneous with …") are publication metadata and not kept.
- **Not stored:** bold sub-group headings inside a category (`'''Food and beverages'''`, `'''Rogue Squadron'''` — 227 across the catalog). Entries are kept; the grouping is lost. Additive `group?` key later if Phase 3 wants it.
- **Mapping** — [lib/wookieepedia/enrich-sync.ts](../../lib/wookieepedia/enrich-sync.ts) `buildMapping`: persisted `book_enrichment.source_pageid` rows are the mapping and are never re-pointed. Books without a row map from the discovery CSV + `classify` (MATCHED/DIFFERS; AMBIGUOUS/NEW skipped). Refused: synthetic pageids (sidecar missing), a pageid claimed by two books, a book matched by two pages. No separate mapping file.
- **Fetch** — `fetchPagesByIds` ([client.ts](../../lib/wookieepedia/client.ts)): by **pageid** (the stable anchor; a move keeps the id), ≤50 per request, serial, compliant UA, 429 backoff, `rvcontinue` followed. Redirects are **not** followed.
- **Lifecycle / guards** (`planStep`): `missing`, now-a-`redirect` (target title reported), `not_book` (no `{{Book}}` and no `{{App}}`), `emptied` (entries → 0) and `shrunk` (< 50% of ≥ 20 entries; `--allow-shrink` accepts) are **flagged, last good row kept**.
- **Hash gate** — `content_hash` = sha256 of canonical (key-sorted) JSON of the stored content: `source_pageid`, `source_title`, `source_url`, `license`, `attribution`, `timeline_notes`, `appearances`. Excludes `fetched_at` and `source_revision_id`, so a prose-only wiki edit writes nothing. A page move (title/url change) does write. `source_revision_id`/`fetched_at` therefore record the revision/time the *current content* was first seen.
- **Writes** — only `book_enrichment`, upsert on `book_id`, only hash-changed rows, batches of ≤25 rows / ≤1 MB (~11 batches for a full load). If the table is missing on the target (PostgREST `PGRST205`/`42P01`) the run stops with "run `supabase db push` first".
- **No backup step:** the table is re-derivable from the wiki at any time (and was empty in prod at first sync); a partial failure resumes on re-run via the hash gate.

#### Verification (2026-10-20)
- Local: `npm run catalog:restore` (276 rows from `data/catalog-backup.csv`, prod ids) → dry-run → `--apply`: **269 inserted** in 11 batches, 0 flagged → re-run: **0 writes** (269 unchanged; `updated_at`/`fetched_at` fingerprint identical). After the always-set-`page` change: `--apply` rewrote **265** rows (4 empty-appearances rows unchanged), then a re-run wrote 0.
- Payload (always-set `page`): 9.48 MB total, avg 36.1 KB, largest *Mask of Fear* 111.0 KB (then *Life Debt* 92.2 KB, *Victory's Price* 84.5 KB). Was 7.32 MB / 77.1 KB before. Corpus: 150,822 entries, 0 unknown templates/params, 8 unbulleted lines.
- No page (7): `a-new-hope-novelization`, `empire-strikes-back-novelization`, `return-of-the-jedi-novelization`, `dooku-jedi-lost`, `legacy-of-the-jedi-secrets-of-the-jedi`, `lost-tribe-of-the-sith-collected`, `luke-skywalker-shadows-of-mindor` (not in the discovery set; pin by hand in Phase 4). 0 AMBIGUOUS against the current catalog.
- Rows with empty `appearances` (page has no `{{App}}`; still carry backlink + timeline): `ahsoka-a-novelization-of-season-one`, `heir-to-the-empire-the-20th-anniversary-edition`, `star-wars-starfighter`, `stories-of-jedi-and-sith`.
- Anon embed `books?select=*,book_enrichment(*)` returns an object (null when absent); `parseEnrichment` narrows it; anon POST → 401/42501. `supabase/tests/book_enrichment_test.sql` PASS with data loaded. Missing-table guard verified live (table renamed locally → clean stop, exit 1).
- Prod: `--production` dry-run (read-only) → 269 inserts, 9.48 MB, identical plan. **Not applied.**

```bash
SUPABASE_SERVICE_ROLE_KEY=<local secret> npm run catalog:enrich            # dry-run, local
SUPABASE_SERVICE_ROLE_KEY=<local secret> npm run catalog:enrich -- --apply
npm run catalog:enrich -- --production                                     # dry-run vs prod
npm run catalog:enrich -- --production --apply                             # prod write (typed ref)
```

### Phase 3 — App integration
- `lib/hooks.ts` — detail-only embed `from('books').select('*, book_enrichment(*)')`; `parseEnrichment` narrowing.
- `app/book/[id].tsx` — conditional cards (In-Universe: era/timeline; Characters: chips; Appearances/Related) + "View on Wookieepedia" attribution row. `components/wookieepedia-attribution.tsx`.
- **Acceptance:** enriched books show new cards + backlink; non-enriched render exactly as today; zero client-side Fandom calls.

### Phase 4 — Admin surfacing (optional)
- Show `fetched_at`/`source_url`/match status + a manual `source_pageid` pin in the local admin.

## Acceptance Criteria
- [ ] `book_enrichment` migration + dual-read RLS + service-role writes; reseed-safe; delete cascades.
- [x] Sync writes only the satellite, content-hash-gated, idempotent; stale/missing pageids flagged.
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
