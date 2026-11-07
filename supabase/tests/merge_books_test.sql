-- Self-checking test for merge_books(). Non-destructive: everything runs inside
-- a transaction that ROLLBACKs at the end. Raises an exception on any failed
-- assertion; prints "merge_books test: PASS" on success.
--
-- Run against a local DB with the migration applied, e.g.:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" -f supabase/tests/merge_books_test.sql
-- or paste into the Supabase SQL editor on a local/branch project.

begin;

-- Two users: A shelves BOTH survivor and loser; B shelves only the loser.
insert into auth.users (id, instance_id, aud, role, email) values
	('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'merge-test-a@example.com'),
	('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'merge-test-b@example.com')
on conflict (id) do nothing;

insert into public.books (id, slug, title, author, canon, type, isbn, primary_isbn, format) values
	('11111111-1111-1111-1111-111111111111', 'merge-survivor', 'Survivor', array['Author A'],
		'Canon', 'Adult Novel', array['9780000000001', '9780000000002'], '9780000000001',
		array['Hardcover']),
	('22222222-2222-2222-2222-222222222222', 'merge-loser', 'Loser', array['Author A'],
		'Canon', 'Adult Novel', array['9780000000002', '9780000000003'], '9780000000003',
		array['Paperback']);

-- A: survivor row all-false, loser row read=true → expect OR-merge read=true, one row.
-- B: only the loser, owned=true → expect repoint to survivor, owned preserved.
insert into public.user_books (user_id, book_id, owned, read, want_to_read) values
	('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', false, false, false),
	('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', false, true, false),
	('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', true, false, false);

select public.merge_books(
	'11111111-1111-1111-1111-111111111111',
	array['22222222-2222-2222-2222-222222222222']::uuid[],
	'{}'::jsonb
);

do $$
declare
	s public.books;
	cnt int;
	ub public.user_books;
begin
	select * into s from public.books where id = '11111111-1111-1111-1111-111111111111';

	if s.isbn <> array['9780000000001', '9780000000002', '9780000000003'] then
		raise exception 'isbn union wrong (survivor-first dedup expected): %', s.isbn;
	end if;
	if s.format <> array['Hardcover', 'Paperback'] then
		raise exception 'format union wrong: %', s.format;
	end if;
	if exists (select 1 from public.books where id = '22222222-2222-2222-2222-222222222222') then
		raise exception 'loser book was not deleted';
	end if;

	-- User A: collided loser row dropped, flags OR-merged into the survivor row.
	select count(*) into cnt from public.user_books
	where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
	if cnt <> 1 then
		raise exception 'user A should have exactly 1 shelf row, has %', cnt;
	end if;
	select * into ub from public.user_books
	where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
	if ub.book_id <> '11111111-1111-1111-1111-111111111111' or not ub.read then
		raise exception 'user A row not merged onto survivor with read=true: book=% read=%', ub.book_id, ub.read;
	end if;

	-- User B: loser repointed to survivor, owned preserved.
	select * into ub from public.user_books
	where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
	if ub.book_id <> '11111111-1111-1111-1111-111111111111' or not ub.owned then
		raise exception 'user B not repointed/owned-preserved: book=% owned=%', ub.book_id, ub.owned;
	end if;

	raise notice 'merge_books test: PASS';
end $$;

rollback;

-- ── Regression: one user shelving TWO different losers (and not the survivor)
--    must collapse to a single survivor row, with no UNIQUE(user_id, book_id)
--    violation and OR-merged flags. ──
begin;

insert into auth.users (id, instance_id, aud, role, email) values
	('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'merge-test-c@example.com')
on conflict (id) do nothing;

insert into public.books (id, slug, title, author, canon, type, isbn) values
	('11111111-1111-1111-1111-111111111111', 'm2-survivor', 'S', array['A'], 'Canon', 'Adult Novel', array['9780000000010']),
	('22222222-2222-2222-2222-222222222222', 'm2-loser-1', 'L1', array['A'], 'Canon', 'Adult Novel', array['9780000000011']),
	('33333333-3333-3333-3333-333333333333', 'm2-loser-2', 'L2', array['A'], 'Canon', 'Adult Novel', array['9780000000012']);

-- User C shelves BOTH losers (not the survivor), with differing flags.
insert into public.user_books (user_id, book_id, owned, read, want_to_read) values
	('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', true, false, false),
	('cccccccc-cccc-cccc-cccc-cccccccccccc', '33333333-3333-3333-3333-333333333333', false, true, false);

select public.merge_books(
	'11111111-1111-1111-1111-111111111111',
	array['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333']::uuid[],
	'{}'::jsonb
);

do $$
declare
	cnt int;
	ub public.user_books;
	s public.books;
begin
	if exists (select 1 from public.books
		where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')) then
		raise exception 'losers not deleted';
	end if;

	select count(*) into cnt from public.user_books
	where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
	if cnt <> 1 then
		raise exception 'user C should collapse to exactly 1 shelf row, has %', cnt;
	end if;

	select * into ub from public.user_books
	where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
	if ub.book_id <> '11111111-1111-1111-1111-111111111111' or not ub.owned or not ub.read then
		raise exception 'user C row not merged onto survivor with OR-merged flags: book=% owned=% read=%',
			ub.book_id, ub.owned, ub.read;
	end if;

	select * into s from public.books where id = '11111111-1111-1111-1111-111111111111';
	if not (array['9780000000010', '9780000000011', '9780000000012'] <@ s.isbn) then
		raise exception 'survivor isbn union missing loser isbns: %', s.isbn;
	end if;

	raise notice 'merge_books multi-loser test: PASS';
end $$;

rollback;

-- ── Regression (#159): bad survivor/loser input must raise, never silently no-op.
--    A NULL loser (mistyped slug in a subquery) or a nonexistent loser used to return
--    the survivor unchanged. Each case must raise the expected error AND leave the
--    catalog + shelves untouched (no partial merge when a valid loser is mixed in). ──
begin;

insert into auth.users (id, instance_id, aud, role, email) values
	('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'merge-test-e@example.com')
on conflict (id) do nothing;

insert into public.books (id, slug, title, author, canon, type, isbn) values
	('11111111-1111-1111-1111-111111111111', 'm3-survivor', 'S', array['A'], 'Canon', 'Adult Novel', array['9780000000030']),
	('22222222-2222-2222-2222-222222222222', 'm3-loser', 'L', array['A'], 'Canon', 'Adult Novel', array['9780000000031']);

insert into public.user_books (user_id, book_id, owned) values
	('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-2222-2222-222222222222', true);

do $$
declare
	s constant uuid := '11111111-1111-1111-1111-111111111111';
	l constant uuid := '22222222-2222-2222-2222-222222222222';
	ghost constant uuid := '99999999-9999-9999-9999-999999999999';
	cases jsonb := jsonb_build_array(
		jsonb_build_object('name', 'NULL loser', 'survivor', s,
			'losers', array[null]::uuid[], 'err', 'losers contains NULL%'),
		jsonb_build_object('name', 'NULL loser mixed with valid loser', 'survivor', s,
			'losers', array[l, null]::uuid[], 'err', 'losers contains NULL%'),
		jsonb_build_object('name', 'NULL via mistyped slug subquery', 'survivor', s,
			'losers', array[(select id from public.books where slug = 'm3-losr')]::uuid[],
			'err', 'losers contains NULL%'),
		jsonb_build_object('name', 'missing loser', 'survivor', s,
			'losers', array[ghost]::uuid[], 'err', 'loser(s) not found%'),
		jsonb_build_object('name', 'missing loser mixed with valid loser', 'survivor', s,
			'losers', array[l, ghost]::uuid[], 'err', 'loser(s) not found%'),
		jsonb_build_object('name', 'loser equals survivor', 'survivor', s,
			'losers', array[s]::uuid[], 'err', '%cannot also be a loser%'),
		jsonb_build_object('name', 'NULL survivor', 'survivor', null,
			'losers', array[l]::uuid[], 'err', 'survivor is required%'),
		jsonb_build_object('name', 'missing survivor', 'survivor', ghost,
			'losers', array[l]::uuid[], 'err', 'survivor % not found%'),
		jsonb_build_object('name', 'empty losers', 'survivor', s,
			'losers', array[]::uuid[], 'err', 'at least one loser is required%'),
		jsonb_build_object('name', 'NULL losers', 'survivor', s,
			'losers', null, 'err', 'at least one loser is required%')
	);
	c jsonb;
	failures text[] := '{}';
	raised boolean;
	msg text;
begin
	for c in select * from jsonb_array_elements(cases) loop
		raised := false;
		begin
			perform public.merge_books(
				(c->>'survivor')::uuid,
				case when jsonb_typeof(c->'losers') = 'null' then null
					else array(select nullif(x, 'null')::uuid
						from jsonb_array_elements_text(c->'losers') x) end,
				'{}'::jsonb);
		exception when others then
			raised := true;
			msg := sqlerrm;
		end;

		if not raised then
			failures := failures || format('%s: did not raise', c->>'name');
		elsif msg not like c->>'err' then
			failures := failures || format('%s: wrong error %L', c->>'name', msg);
		end if;

		-- Untouched: loser book + its shelf row still in place, survivor isbn unchanged.
		if not exists (select 1 from public.books where id = l)
			or not exists (select 1 from public.user_books
				where user_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and book_id = l and owned)
			or (select isbn from public.books where id = s) <> array['9780000000030'] then
			failures := failures || format('%s: data changed', c->>'name');
		end if;
	end loop;

	if cardinality(failures) > 0 then
		raise exception 'merge_books bad-input test: % failure(s): %',
			cardinality(failures), array_to_string(failures, '; ');
	end if;

	raise notice 'merge_books bad-input test: PASS';
end $$;

rollback;
