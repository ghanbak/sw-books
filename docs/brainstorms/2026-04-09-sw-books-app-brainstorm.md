# Star Wars Books App — Brainstorm

**Date:** 2026-04-09
**Status:** Ready for planning

## What We're Building

A mobile app (iOS + Android) for cataloging and tracking Star Wars books. Users sign in with Google or Apple, browse a curated Star Wars book catalog, and maintain personal shelves (owned, read, want to read). An ISBN barcode scanner lets users add books to their shelves quickly; if the scanned ISBN isn't in the catalog, the app looks up metadata and — if it's detected as a Star Wars book — adds it to the shared catalog so every user benefits.

**V1 surface:** auth, catalog browse/search, personal shelves, ISBN scanner (with enrichment fallback).
**V2 surface:** social profiles (public shelves, favorites, currently-reading), ratings/notes/reading progress, background metadata enrichment job.

## Why This Approach

**Hybrid Expo + Supabase, with edge functions only where they earn their keep.**

The RN app talks directly to Supabase for catalog reads and shelf writes (RLS enforces user scoping). The ISBN lookup path — fetching Google Books / Open Library / Wookieepedia, running the Star Wars heuristic, and writing new catalog entries — lives in a Supabase Edge Function. This keeps third-party API usage server-side, avoids shipping secrets in the app bundle, and gives V2's scheduled enrichment job a natural home (same function, different trigger).

Expo is the default because it collapses iOS/Android dev, OAuth, and the barcode scanner into pre-built modules, and EAS Build removes the need for a Mac farm. Supabase is the default because it hands you Google/Apple OAuth, Postgres with RLS, Storage for covers, and Edge Functions in one platform — the alternatives (SurrealDB, rolling our own auth) would cost weeks with no V1 upside.

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| **Mobile framework** | Expo (managed) + EAS Build | Barcode scanner, OAuth, and cross-platform builds with minimal native work |
| **Database / backend** | Supabase (Postgres + Auth + Edge Functions + Storage) | Built-in Google/Apple OAuth, RLS, generous free tier, mature RN SDK |
| **Repo structure** | pnpm/turbo monorepo: `apps/mobile`, `packages/db`, `packages/shared`, room for `apps/admin` later | Shared TS types between app and future admin web app without restructuring |
| **CSV ingestion** | Design a proper schema, write a one-time import script | Cleaner than raw CSV dump; gives us typed columns, constraints, and room for enrichment |
| **Book lookup sources** | Google Books → Open Library → Wookieepedia (layered) | Google has broadest ISBN coverage; Open Library fills cover gaps; Wookieepedia has canonical SW metadata |
| **"Is this a Star Wars book?" detection** | Heuristic on lookup metadata (title/subjects/publisher/known authors) | Fast, no extra API round trip, good enough for V1 |
| **Auth methods** | Google + Apple Sign-In only | Explicit user preference — no email/phone |
| **Admin UX** | Supabase Studio dashboard | Zero code; build a dedicated admin app only if it starts hurting |
| **V1 architecture** | Hybrid: direct Supabase for catalog/shelves, Edge Function for ISBN lookup + SW detection + catalog writes | Keeps UI snappy, secrets server-side, V2 enrichment slots in naturally |
| **Shelf model** | Three states per user-book: owned, read, want-to-read (non-exclusive) | Matches user mental model; a book can be both owned and read |

## Feature Scope

**V1 (MVP):**
- Google & Apple sign-in
- Browse + search Star Wars book catalog (seeded from CSV)
- Personal shelves: owned / read / want-to-read
- ISBN barcode scanner (add known books; look up + heuristically detect + add unknown SW books)

**V2 (post-launch):**
- Social profiles: public/private shelf toggle, favorites, "currently reading" highlight
- Ratings, notes, reading progress
- Scheduled edge function that backfills missing metadata on catalog books
- (Possibly) dedicated admin web app if Supabase Studio gets cramped

**Explicitly out of scope:**
- Email/password or phone auth
- Non-Star-Wars books (the heuristic is the gate)
- Offline-first sync (can revisit if users ask)
- Recommendations, feeds, comments

## Open Questions

1. **CSV contents** — What columns does the existing CSV have? This drives the initial schema (especially whether we have ISBN-13, cover URLs, series/era metadata, canon vs Legends flags).
2. **Series & era modeling** — Should the schema have first-class `series` and `era` tables, or denormalize into columns on `books`? Depends on how users want to browse.
3. **Duplicate/edition handling** — Same book, multiple ISBNs (hardcover/paperback/audiobook). Do we collapse into a single canonical entry with editions, or treat each ISBN as a separate row?
4. **Wookieepedia access** — Is the MediaWiki API enough, or do we need light scraping? Confirm before building the lookup pipeline.
5. **Pending/review queue** — Do auto-detected SW books go live immediately, or land in a `pending` table you approve via Supabase Studio? The heuristic will have false positives; a review step may be worth it.
6. **Rate limits & caching** — Edge function should cache lookup results (at least per-ISBN) to avoid hammering Google Books on repeat scans. Worth planning upfront.
7. **Cover image storage** — Hotlink from source URLs, or mirror into Supabase Storage? Hotlinking is simpler but fragile.

## Next Steps

Run `/workflows:plan` to turn this into a concrete implementation plan. The planner should pick up this document automatically.
