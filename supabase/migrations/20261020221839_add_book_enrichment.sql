-- In-universe enrichment from Wookieepedia, stored in a 1:1 satellite of `books`
-- (plan: docs/plans/2026-07-01-feat-wookieepedia-enrichment-satellite-plan.md).
--
-- Wiki-owned, licensed, separately-refreshed data lives here, not on `books`, so
-- the catalog row's `books_updated_at` trigger never masks enrichment freshness.
--
-- - 1:1 via `book_id` PK → books.id ON DELETE CASCADE. merge_books() needs no
--   change: deleting a loser drops its enrichment; a re-sync repopulates the survivor.
-- - Reads: anon + authenticated (mirrors books' dual read policies, so the anon
--   PostgREST embed `books(*, book_enrichment(*))` is not null).
-- - Writes: service role only (the sync script). No client write policies, and
--   client write privileges are revoked as a second layer.
-- - `appearances` shape is narrowed in TS by `parseEnrichment` (lib/wookieepedia/enrichment.ts).
--
-- After applying: `npm run db:types` to regenerate lib/types.ts.

create table public.book_enrichment (
	book_id uuid primary key references public.books (id) on delete cascade,

	-- Provenance
	source_pageid bigint not null unique,
	source_title text,
	source_url text not null,
	source_revision_id bigint,
	license text not null default 'CC-BY-SA-3.0',
	attribution text,
	fetched_at timestamptz not null,
	content_hash text not null,

	-- Content
	appearances jsonb not null default '{}'::jsonb
		constraint book_enrichment_appearances_is_object check (jsonb_typeof(appearances) = 'object'),
	timeline_notes text,

	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on table public.book_enrichment is
	'In-universe enrichment for books, sourced from Wookieepedia (starwars.fandom.com). '
	'Text is licensed CC BY-SA 3.0: display requires attribution + a backlink to source_url. '
	'Written only by the service-role sync; one row per book.';
comment on column public.book_enrichment.source_pageid is
	'Wookieepedia page id: the stable wiki anchor (titles move, page ids do not).';
comment on column public.book_enrichment.source_revision_id is
	'Wiki revision the row was built from (staleness signal).';
comment on column public.book_enrichment.content_hash is
	'Hash of the normalized stored fields, not raw wikitext; gates idempotent re-sync.';
comment on column public.book_enrichment.appearances is
	'{{App}} section by category (characters, dramatis_personae, organisms, droids, events, '
	'locations, organizations, species, vehicles, technology, miscellanea) → '
	'[{name, page?, markers?, note?, depth?}]. Narrowed by parseEnrichment().';
comment on column public.book_enrichment.timeline_notes is
	'Display timeline from the {{Book}} infobox, e.g. "c. 15 BBY–c. 2 BBY".';

create trigger book_enrichment_updated_at
	before update on public.book_enrichment
	for each row execute function public.update_updated_at();

-- Privileges: explicit, so access does not depend on the project's default grants.
revoke all on public.book_enrichment from anon, authenticated;
grant select on public.book_enrichment to anon, authenticated;
grant select, insert, update, delete on public.book_enrichment to service_role;

-- RLS: public read, no client writes (service_role bypasses RLS).
alter table public.book_enrichment enable row level security;

create policy "authenticated_read_book_enrichment" on public.book_enrichment
	for select to authenticated
	using (true);

create policy "anon_read_book_enrichment" on public.book_enrichment
	for select to anon
	using (true);
