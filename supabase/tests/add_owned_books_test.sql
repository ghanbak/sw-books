-- Self-checking test for add_owned_books(). Non-destructive: everything runs inside
-- a transaction that ROLLBACKs at the end. Raises an exception on any failed
-- assertion; prints "add_owned_books test: PASS" on success.
--
-- The RPC runs as the signed-in user (SECURITY INVOKER + auth.uid()), so the calls
-- below switch to the `authenticated` role with JWT claims, the way the app calls it.
--
-- Run against a local DB with the migrations applied, e.g.:
--   psql -v ON_ERROR_STOP=1 "$(supabase status -o env | grep DB_URL | cut -d= -f2 | tr -d '"')" -f supabase/tests/add_owned_books_test.sql
-- or paste into the Supabase SQL editor on a local/branch project.

begin;

-- ── Fixtures (as the table owner) ──
-- User A calls the RPC; user B shelves the same book and must never be touched.
insert into auth.users (id, instance_id, aud, role, email) values
	('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'owned-test-a@example.com'),
	('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'owned-test-b@example.com')
on conflict (id) do nothing;

insert into public.books (id, slug, title, author, canon, type) values
	('11111111-1111-1111-1111-111111111111', 'owned-test-1', 'Owned 1', array['Author A'],
		'Canon', 'Adult Novel'),
	('22222222-2222-2222-2222-222222222222', 'owned-test-2', 'Owned 2', array['Author A'],
		'Canon', 'Adult Novel'),
	('33333333-3333-3333-3333-333333333333', 'owned-test-3', 'Owned 3', array['Author A'],
		'Legends', 'Adult Novel');

-- A: book 1 already shelved with every other flag curated (read, want_to_read,
-- favorite) but not owned. B: book 1 shelved, not owned.
insert into public.user_books (user_id, book_id, owned, read, want_to_read, favorite) values
	('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', false, true, true, true),
	('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', false, false, false, false);

-- Guard: the function must stay SECURITY INVOKER so user_books RLS applies.
do $$
begin
	if (select p.prosecdef from pg_proc p
		where p.oid = 'public.add_owned_books(uuid[])'::regprocedure) then
		raise exception 'add_owned_books is SECURITY DEFINER; RLS would be bypassed';
	end if;
end $$;

-- ── As user A ──
set local role authenticated;
set local request.jwt.claims to
	'{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';

do $$
declare
	a constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
	r public.user_books;
	cnt int;
	ub public.user_books;
	book2_row_id uuid;
begin
	if auth.uid() is distinct from a then
		raise exception 'JWT claims not applied: auth.uid() = %', auth.uid();
	end if;

	-- 1. Insert new + upsert existing: every returned row is A's and owned.
	cnt := 0;
	for r in select * from public.add_owned_books(array[
		'11111111-1111-1111-1111-111111111111',
		'22222222-2222-2222-2222-222222222222'
	]::uuid[]) loop
		cnt := cnt + 1;
		if r.user_id <> a or not r.owned then
			raise exception 'returned row not owned by A: user=% book=% owned=%',
				r.user_id, r.book_id, r.owned;
		end if;
	end loop;
	if cnt <> 2 then
		raise exception 'first call should return 2 rows, returned %', cnt;
	end if;

	-- Existing row: owned flipped, curated flags (incl. favorite) preserved.
	select * into ub from public.user_books
	where user_id = a and book_id = '11111111-1111-1111-1111-111111111111';
	if not ub.owned or not ub.read or not ub.want_to_read or not ub.favorite then
		raise exception 'book 1 flags clobbered: owned=% read=% want_to_read=% favorite=%',
			ub.owned, ub.read, ub.want_to_read, ub.favorite;
	end if;

	-- New row: owned only, other flags at their defaults.
	select * into ub from public.user_books
	where user_id = a and book_id = '22222222-2222-2222-2222-222222222222';
	if not found then
		raise exception 'book 2 row was not inserted';
	end if;
	if not ub.owned or ub.read or ub.want_to_read or ub.favorite then
		raise exception 'book 2 new row wrong: owned=% read=% want_to_read=% favorite=%',
			ub.owned, ub.read, ub.want_to_read, ub.favorite;
	end if;
	book2_row_id := ub.id;

	-- 2. Idempotent: re-adding returns the same rows, creates none, changes no flags.
	select count(*) into cnt from public.add_owned_books(array[
		'11111111-1111-1111-1111-111111111111',
		'22222222-2222-2222-2222-222222222222'
	]::uuid[]);
	if cnt <> 2 then
		raise exception 're-add should return 2 rows, returned %', cnt;
	end if;
	select count(*) into cnt from public.user_books where user_id = a;
	if cnt <> 2 then
		raise exception 'A should have exactly 2 shelf rows after re-add, has %', cnt;
	end if;
	select * into ub from public.user_books
	where user_id = a and book_id = '22222222-2222-2222-2222-222222222222';
	if ub.id <> book2_row_id then
		raise exception 're-add replaced the book 2 row (id % -> %)', book2_row_id, ub.id;
	end if;
	if not ub.owned or ub.read or ub.want_to_read or ub.favorite then
		raise exception 're-add changed book 2 flags: owned=% read=% want_to_read=% favorite=%',
			ub.owned, ub.read, ub.want_to_read, ub.favorite;
	end if;
	select * into ub from public.user_books
	where user_id = a and book_id = '11111111-1111-1111-1111-111111111111';
	if not ub.owned or not ub.read or not ub.want_to_read or not ub.favorite then
		raise exception 're-add changed book 1 flags: owned=% read=% want_to_read=% favorite=%',
			ub.owned, ub.read, ub.want_to_read, ub.favorite;
	end if;

	-- 3. Stale client. Another device (same user) has since: un-owned book 2 and
	--    marked it read + favorite; and shelved book 3 as want_to_read + favorite.
	--    The stale client still thinks book 2 is unread and book 3 is not shelved.
	update public.user_books set owned = false, read = true, favorite = true
	where user_id = a and book_id = '22222222-2222-2222-2222-222222222222';
	insert into public.user_books (user_id, book_id, want_to_read, favorite)
	values (a, '33333333-3333-3333-3333-333333333333', true, true);

	select count(*) into cnt from public.add_owned_books(array[
		'22222222-2222-2222-2222-222222222222',
		'33333333-3333-3333-3333-333333333333'
	]::uuid[]);
	if cnt <> 2 then
		raise exception 'stale-client call should return 2 rows, returned %', cnt;
	end if;

	select * into ub from public.user_books
	where user_id = a and book_id = '22222222-2222-2222-2222-222222222222';
	if not ub.owned or not ub.read or ub.want_to_read or not ub.favorite then
		raise exception 'stale client clobbered book 2: owned=% read=% want_to_read=% favorite=%',
			ub.owned, ub.read, ub.want_to_read, ub.favorite;
	end if;
	select * into ub from public.user_books
	where user_id = a and book_id = '33333333-3333-3333-3333-333333333333';
	if not ub.owned or ub.read or not ub.want_to_read or not ub.favorite then
		raise exception 'stale client clobbered book 3: owned=% read=% want_to_read=% favorite=%',
			ub.owned, ub.read, ub.want_to_read, ub.favorite;
	end if;
	select count(*) into cnt from public.user_books where user_id = a;
	if cnt <> 3 then
		raise exception 'A should have exactly 3 shelf rows after stale-client call, has %', cnt;
	end if;

	-- 4. Empty batch is a no-op, not an error.
	select count(*) into cnt from public.add_owned_books(array[]::uuid[]);
	if cnt <> 0 then
		raise exception 'empty batch should return 0 rows, returned %', cnt;
	end if;

	raise notice 'add_owned_books as authenticated: PASS';
end $$;
reset role;

-- ── Anon: no auth.uid(), so nothing can be written ──
-- With no uid the insert targets user_id = null under a role with no user_books
-- policy; either RLS (42501) or the NOT NULL constraint (23502) rejects it.
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
do $$
begin
	begin
		perform public.add_owned_books(array['33333333-3333-3333-3333-333333333333']::uuid[]);
		raise exception 'anon add_owned_books was not rejected';
	exception when insufficient_privilege or not_null_violation then null;
	end;
	raise notice 'add_owned_books anon denied: PASS';
end $$;
reset role;

-- ── Final state (as the table owner) ──
do $$
declare
	ub public.user_books;
	cnt int;
begin
	-- B's row is untouched by A's calls.
	select * into ub from public.user_books
	where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
	if ub.book_id <> '11111111-1111-1111-1111-111111111111'
		or ub.owned or ub.read or ub.want_to_read or ub.favorite then
		raise exception 'user B row modified: book=% owned=% read=% want_to_read=% favorite=%',
			ub.book_id, ub.owned, ub.read, ub.want_to_read, ub.favorite;
	end if;
	select count(*) into cnt from public.user_books
	where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
	if cnt <> 1 then
		raise exception 'user B should have exactly 1 shelf row, has %', cnt;
	end if;

	-- No ownerless rows leaked from the anon call.
	if exists (select 1 from public.user_books where user_id is null) then
		raise exception 'a user_books row without a user_id was written';
	end if;

	raise notice 'add_owned_books test: PASS';
end $$;

rollback;
