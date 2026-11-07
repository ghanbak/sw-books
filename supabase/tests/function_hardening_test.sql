-- Self-checking test for public function hardening (issue #90): client EXECUTE revoked
-- on admin-only functions, search_path pinned, user_books(book_id) indexed, and the
-- functions/trigger still work. Non-destructive: everything runs inside a transaction
-- that ROLLBACKs at the end. Raises an exception on any failed assertion; prints
-- "function_hardening test: PASS" on success.
--
-- Run against a local DB with the migrations applied, e.g.:
--   psql "$(supabase status -o env | grep DB_URL | cut -d= -f2 | tr -d '"')" -v ON_ERROR_STOP=1 -f supabase/tests/function_hardening_test.sql

begin;

insert into auth.users (id, instance_id, aud, role, email) values
	('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'harden-test-d@example.com')
on conflict (id) do nothing;

insert into public.books (id, slug, title, author, canon, type, isbn, updated_at) values
	('11111111-1111-1111-1111-111111111111', 'harden-survivor', 'S', array['A'], 'Canon',
		'Adult Novel', array['9780000000020'], '2000-01-01T00:00:00Z'),
	('22222222-2222-2222-2222-222222222222', 'harden-loser', 'L', array['A'], 'Canon',
		'Adult Novel', array['9780000000021'], '2000-01-01T00:00:00Z');

-- ── Catalog: search_path pinned, index present (as owner) ──
do $$
declare
	fn text;
begin
	foreach fn in array array[
		'public.merge_books(uuid, uuid[], jsonb)',
		'public.ordered_text_union(text[], text[])',
		'public.add_owned_books(uuid[])',
		'public.update_updated_at()'
	] loop
		if not exists (
			select 1 from pg_proc
			where oid = fn::regprocedure
				and exists (select 1 from unnest(proconfig) c where c like 'search_path=%')
		) then
			raise exception '% has no pinned search_path (proconfig)', fn;
		end if;
	end loop;

	if not exists (
		select 1
		from pg_index i
		join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
		where i.indrelid = 'public.user_books'::regclass and a.attname = 'book_id'
	) then
		raise exception 'no index leading on public.user_books(book_id)';
	end if;

	-- Trigger function still fires with the pinned search_path.
	update public.books set title = 'S2' where id = '11111111-1111-1111-1111-111111111111';
	if (select updated_at from public.books where id = '11111111-1111-1111-1111-111111111111')
		<= '2000-01-01T00:00:00Z'::timestamptz then
		raise exception 'books_updated_at trigger did not fire';
	end if;

	raise notice 'function_hardening catalog: PASS';
end $$;

-- ── Client roles: no RPC access to admin-only functions ──
set local role anon;
do $$
begin
	begin
		perform public.merge_books('11111111-1111-1111-1111-111111111111',
			array['22222222-2222-2222-2222-222222222222']::uuid[], '{}'::jsonb);
		raise exception '% was able to EXECUTE merge_books', current_user;
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.ordered_text_union(array['a'], array['b']);
		raise exception '% was able to EXECUTE ordered_text_union', current_user;
	exception when insufficient_privilege then null;
	end;
	raise notice 'function_hardening % revoke: PASS', current_user;
end $$;
reset role;

-- authenticated as user D (auth.uid() reads the JWT claims GUC).
select set_config('request.jwt.claims',
	'{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
	cnt int;
begin
	begin
		perform public.merge_books('11111111-1111-1111-1111-111111111111',
			array['22222222-2222-2222-2222-222222222222']::uuid[], '{}'::jsonb);
		raise exception '% was able to EXECUTE merge_books', current_user;
	exception when insufficient_privilege then null;
	end;
	begin
		perform public.ordered_text_union(array['a'], array['b']);
		raise exception '% was able to EXECUTE ordered_text_union', current_user;
	exception when insufficient_privilege then null;
	end;

	-- add_owned_books stays callable, writes only the caller's shelf, and is idempotent.
	perform public.add_owned_books(array['11111111-1111-1111-1111-111111111111']::uuid[]);
	perform public.add_owned_books(array['11111111-1111-1111-1111-111111111111']::uuid[]);
	select count(*) into cnt from public.user_books
	where user_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
		and book_id = '11111111-1111-1111-1111-111111111111' and owned;
	if cnt <> 1 then
		raise exception 'add_owned_books as authenticated: expected 1 owned row, got %', cnt;
	end if;

	raise notice 'function_hardening % access: PASS', current_user;
end $$;
reset role;

-- ── service_role (admin tool) can still merge, incl. the nested ordered_text_union ──
set local role service_role;
do $$
declare
	s public.books;
begin
	select * into s from public.merge_books('11111111-1111-1111-1111-111111111111',
		array['22222222-2222-2222-2222-222222222222']::uuid[], '{}'::jsonb);
	if s.isbn <> array['9780000000020', '9780000000021'] then
		raise exception 'merge_books as service_role: isbn union wrong: %', s.isbn;
	end if;
	if exists (select 1 from public.books where id = '22222222-2222-2222-2222-222222222222') then
		raise exception 'merge_books as service_role: loser not deleted';
	end if;
	raise notice 'function_hardening % merge: PASS', current_user;
end $$;
reset role;

do $$ begin raise notice 'function_hardening test: PASS'; end $$;

rollback;
