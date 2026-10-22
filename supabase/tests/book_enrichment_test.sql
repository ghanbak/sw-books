-- Self-checking test for the book_enrichment satellite table. Non-destructive:
-- everything runs inside a transaction that ROLLBACKs at the end. Raises an
-- exception on any failed assertion; prints "book_enrichment test: PASS" on success.
--
-- Run against a local DB with the migration applied, e.g.:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2 | tr -d '"')" -f supabase/tests/book_enrichment_test.sql
-- or paste into the Supabase SQL editor on a local/branch project.

begin;

insert into public.books (id, slug, title, author, canon, type) values
	('11111111-1111-1111-1111-111111111111', 'enrich-test-a', 'Enrich A', array['Author A'],
		'Legends', 'Adult Novel'),
	('22222222-2222-2222-2222-222222222222', 'enrich-test-b', 'Enrich B', array['Author A'],
		'Canon', 'Adult Novel');

-- Seeded with a stale updated_at so the trigger is observable inside one transaction
-- (now() is fixed per transaction).
insert into public.book_enrichment (
	book_id, source_pageid, source_title, source_url, source_revision_id,
	fetched_at, content_hash, appearances, timeline_notes, updated_at
) values (
	'11111111-1111-1111-1111-111111111111', 900000001, 'Enrich A',
	'https://starwars.fandom.com/wiki/Enrich_A', 1, now(), 'hash-a',
	'{"characters": [{"name": "Thrawn", "markers": ["first"]}]}'::jsonb, '9 ABY',
	'2000-01-01T00:00:00Z'
);

-- ── Constraints (as the table owner) ──
do $$
declare
	e public.book_enrichment;
begin
	select * into e from public.book_enrichment
	where book_id = '11111111-1111-1111-1111-111111111111';
	if e.license <> 'CC-BY-SA-3.0' then
		raise exception 'license default wrong: %', e.license;
	end if;

	-- 1:1: a second row for the same book is rejected.
	begin
		insert into public.book_enrichment (book_id, source_pageid, source_url, fetched_at, content_hash)
		values ('11111111-1111-1111-1111-111111111111', 900000002, 'u', now(), 'h');
		raise exception 'second enrichment row for one book was accepted';
	exception when unique_violation then null;
	end;

	-- source_pageid is unique across books.
	begin
		insert into public.book_enrichment (book_id, source_pageid, source_url, fetched_at, content_hash)
		values ('22222222-2222-2222-2222-222222222222', 900000001, 'u', now(), 'h');
		raise exception 'duplicate source_pageid was accepted';
	exception when unique_violation then null;
	end;

	-- FK: no enrichment for a non-existent book.
	begin
		insert into public.book_enrichment (book_id, source_pageid, source_url, fetched_at, content_hash)
		values ('99999999-9999-9999-9999-999999999999', 900000003, 'u', now(), 'h');
		raise exception 'enrichment for a missing book was accepted';
	exception when foreign_key_violation then null;
	end;

	-- appearances must be a JSON object.
	begin
		insert into public.book_enrichment (
			book_id, source_pageid, source_url, fetched_at, content_hash, appearances
		) values ('22222222-2222-2222-2222-222222222222', 900000004, 'u', now(), 'h', '[]'::jsonb);
		raise exception 'non-object appearances was accepted';
	exception when check_violation then null;
	end;

	-- updated_at trigger fires on UPDATE.
	update public.book_enrichment set attribution = 'Wookieepedia contributors'
	where book_id = '11111111-1111-1111-1111-111111111111';
	select * into e from public.book_enrichment
	where book_id = '11111111-1111-1111-1111-111111111111';
	if e.updated_at <= '2000-01-01T00:00:00Z'::timestamptz then
		raise exception 'updated_at trigger did not fire: %', e.updated_at;
	end if;

	raise notice 'book_enrichment constraints: PASS';
end $$;

-- ── Client roles: read yes, write no ──
-- The same block runs as anon, then as authenticated. Writes must fail with
-- insufficient_privilege (privileges revoked; RLS has no write policy either).
set local role anon;
do $$
declare
	cnt int;
begin
	select count(*) into cnt from public.book_enrichment
	where book_id = '11111111-1111-1111-1111-111111111111';
	if cnt <> 1 then
		raise exception '% cannot SELECT book_enrichment (saw % rows)', current_user, cnt;
	end if;

	-- The detail-screen embed path (books → book_enrichment) resolves too.
	select count(*) into cnt from public.books b
	join public.book_enrichment be on be.book_id = b.id
	where b.id = '11111111-1111-1111-1111-111111111111';
	if cnt <> 1 then
		raise exception '% cannot read books joined to book_enrichment', current_user;
	end if;

	begin
		insert into public.book_enrichment (book_id, source_pageid, source_url, fetched_at, content_hash)
		values ('22222222-2222-2222-2222-222222222222', 900000005, 'u', now(), 'h');
		raise exception '% was able to INSERT', current_user;
	exception when insufficient_privilege then null;
	end;

	begin
		update public.book_enrichment set content_hash = 'tampered'
		where book_id = '11111111-1111-1111-1111-111111111111';
		raise exception '% was able to UPDATE', current_user;
	exception when insufficient_privilege then null;
	end;

	begin
		delete from public.book_enrichment
		where book_id = '11111111-1111-1111-1111-111111111111';
		raise exception '% was able to DELETE', current_user;
	exception when insufficient_privilege then null;
	end;

	raise notice 'book_enrichment % access: PASS', current_user;
end $$;
reset role;

set local role authenticated;
do $$
declare
	cnt int;
begin
	select count(*) into cnt from public.book_enrichment
	where book_id = '11111111-1111-1111-1111-111111111111';
	if cnt <> 1 then
		raise exception '% cannot SELECT book_enrichment (saw % rows)', current_user, cnt;
	end if;

	-- The detail-screen embed path (books → book_enrichment) resolves too.
	select count(*) into cnt from public.books b
	join public.book_enrichment be on be.book_id = b.id
	where b.id = '11111111-1111-1111-1111-111111111111';
	if cnt <> 1 then
		raise exception '% cannot read books joined to book_enrichment', current_user;
	end if;

	begin
		insert into public.book_enrichment (book_id, source_pageid, source_url, fetched_at, content_hash)
		values ('22222222-2222-2222-2222-222222222222', 900000005, 'u', now(), 'h');
		raise exception '% was able to INSERT', current_user;
	exception when insufficient_privilege then null;
	end;

	begin
		update public.book_enrichment set content_hash = 'tampered'
		where book_id = '11111111-1111-1111-1111-111111111111';
		raise exception '% was able to UPDATE', current_user;
	exception when insufficient_privilege then null;
	end;

	begin
		delete from public.book_enrichment
		where book_id = '11111111-1111-1111-1111-111111111111';
		raise exception '% was able to DELETE', current_user;
	exception when insufficient_privilege then null;
	end;

	raise notice 'book_enrichment % access: PASS', current_user;
end $$;
reset role;

-- ── Cascade + final state (as the table owner) ──
do $$
begin
	if not exists (
		select 1 from public.book_enrichment
		where book_id = '11111111-1111-1111-1111-111111111111' and content_hash = 'hash-a'
	) then
		raise exception 'enrichment row was modified or removed by a client role';
	end if;

	delete from public.books where id = '11111111-1111-1111-1111-111111111111';
	if exists (
		select 1 from public.book_enrichment
		where book_id = '11111111-1111-1111-1111-111111111111'
	) then
		raise exception 'deleting the book did not cascade to its enrichment';
	end if;

	raise notice 'book_enrichment test: PASS';
end $$;

rollback;
