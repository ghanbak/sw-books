-- Self-checking regression test for the table RLS policies on books and user_books.
-- Non-destructive: everything runs inside a transaction that ROLLBACKs at the end.
-- Raises an exception on any failed assertion; prints "table_rls test: PASS" on success.
--
-- Guards against a later migration loosening the policies: a permissive books write
-- policy, or WITH CHECK (true) / USING (true) on user_books. Clients are simulated with
-- `set local role` plus request.jwt.claims, the way PostgREST runs their queries.
--
-- Run with scripts/verify-db.sh, or against a local DB with the migrations applied:
--   psql -v ON_ERROR_STOP=1 "$(supabase status -o env | grep DB_URL | cut -d= -f2 | tr -d '"')" -f supabase/tests/table_rls_test.sql

begin;

-- ── Fixtures (as the table owner) ──
-- User A owns a shelf row; user B tries to read, change and remove it.
insert into auth.users (id, instance_id, aud, role, email) values
	('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'rls-test-a@example.com'),
	('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'rls-test-b@example.com')
on conflict (id) do nothing;

insert into public.books (id, slug, title, author, canon, type) values
	('44444444-4444-4444-4444-444444444444', 'rls-test-1', 'RLS 1', array['Author A'],
		'Canon', 'Adult Novel'),
	('66666666-6666-6666-6666-666666666666', 'rls-test-2', 'RLS 2', array['Author A'],
		'Canon', 'Adult Novel');

insert into public.user_books (id, user_id, book_id, owned, read) values
	('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
		'44444444-4444-4444-4444-444444444444', true, true);

-- ── user_books as user B ──
set local role authenticated;
set local request.jwt.claims to
	'{"sub": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "role": "authenticated"}';

do $$
declare
	a constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
	b constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
	row_a constant uuid := '55555555-5555-5555-5555-555555555555';
	cnt int;
begin
	if auth.uid() is distinct from b then
		raise exception 'JWT claims not applied: auth.uid() = %', auth.uid();
	end if;

	select count(*) into cnt from public.user_books where user_id = a;
	if cnt <> 0 then
		raise exception 'user B selected % of user A''s user_books rows', cnt;
	end if;

	update public.user_books set owned = false, read = false where id = row_a;
	get diagnostics cnt = row_count;
	if cnt <> 0 then
		raise exception 'user B updated % of user A''s user_books rows', cnt;
	end if;

	delete from public.user_books where id = row_a;
	get diagnostics cnt = row_count;
	if cnt <> 0 then
		raise exception 'user B deleted % of user A''s user_books rows', cnt;
	end if;

	-- Unfiltered writes read no columns, so only the UPDATE / DELETE policies apply
	-- (a WHERE clause also pulls in the SELECT policies). B owns no rows, so any hit is A's.
	update public.user_books set owned = false;
	get diagnostics cnt = row_count;
	if cnt <> 0 then
		raise exception 'user B unfiltered update hit % user_books rows', cnt;
	end if;

	delete from public.user_books;
	get diagnostics cnt = row_count;
	if cnt <> 0 then
		raise exception 'user B unfiltered delete hit % user_books rows', cnt;
	end if;

	-- B cannot shelve a book under A's id (a book A has not shelved, so a loosened
	-- check fails here rather than on the unique constraint).
	begin
		insert into public.user_books (user_id, book_id)
		values (a, '66666666-6666-6666-6666-666666666666');
		raise exception 'user B inserted a user_books row for user A';
	exception when insufficient_privilege then null;
	end;

	raise notice 'user_books cross-user denied: PASS';
end $$;

-- ── user_books as user A (the owner) ──
set local request.jwt.claims to
	'{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}';

do $$
declare
	a constant uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
	b constant uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
	row_a constant uuid := '55555555-5555-5555-5555-555555555555';
	cnt int;
begin
	if auth.uid() is distinct from a then
		raise exception 'JWT claims not applied: auth.uid() = %', auth.uid();
	end if;

	-- Control: A sees the row, so the 0-row checks above are not vacuous.
	select count(*) into cnt from public.user_books where id = row_a;
	if cnt <> 1 then
		raise exception 'user A should see its own user_books row, saw %', cnt;
	end if;

	-- The owner cannot hand the row to another user.
	begin
		update public.user_books set user_id = b where id = row_a;
		raise exception 'user A reassigned its user_books row to user B';
	exception when insufficient_privilege then null;
	end;

	raise notice 'user_books owner reassign denied: PASS';
end $$;
reset role;

-- ── books as anon and authenticated ──
-- Inserts must raise; updates and deletes must touch 0 rows (or raise, if a later
-- migration revokes the table grants). Selects must still see the catalog.
do $$
declare
	r text;
	cnt int;
begin
	foreach r in array array['anon', 'authenticated'] loop
		perform set_config('request.jwt.claims',
			case r
				when 'anon' then '{"role": "anon"}'
				else '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "role": "authenticated"}'
			end, true);
		execute format('set local role %I', r);

		select count(*) into cnt from public.books
		where id = '44444444-4444-4444-4444-444444444444';
		if cnt <> 1 then
			raise exception '% should select books, saw % rows', r, cnt;
		end if;

		begin
			insert into public.books (slug, title, canon, type)
			values ('rls-test-' || r, 'RLS insert', 'Canon', 'Adult Novel');
			raise exception '% inserted a books row', r;
		exception when insufficient_privilege then null;
		end;

		begin
			update public.books set title = 'RLS hijack'
			where id = '44444444-4444-4444-4444-444444444444';
			get diagnostics cnt = row_count;
			if cnt <> 0 then
				raise exception '% updated % books rows', r, cnt;
			end if;
		exception when insufficient_privilege then null;
		end;

		begin
			delete from public.books where id = '44444444-4444-4444-4444-444444444444';
			get diagnostics cnt = row_count;
			if cnt <> 0 then
				raise exception '% deleted % books rows', r, cnt;
			end if;
		exception when insufficient_privilege then null;
		end;

		reset role;
		raise notice 'books % writes denied, select allowed: PASS', r;
	end loop;
end $$;

-- ── Final state (as the table owner) ──
do $$
declare
	ub public.user_books;
	bk public.books;
begin
	select * into ub from public.user_books where id = '55555555-5555-5555-5555-555555555555';
	if not found then
		raise exception 'user A''s user_books row was deleted';
	end if;
	if ub.user_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' or not ub.owned or not ub.read then
		raise exception 'user A''s user_books row modified: user=% owned=% read=%',
			ub.user_id, ub.owned, ub.read;
	end if;
	if exists (select 1 from public.user_books
		where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') then
		raise exception 'a user_books row was written for user B';
	end if;
	if (select count(*) from public.user_books
		where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 1 then
		raise exception 'user A should have exactly 1 user_books row';
	end if;

	select * into bk from public.books where id = '44444444-4444-4444-4444-444444444444';
	if not found or bk.title <> 'RLS 1' then
		raise exception 'books fixture modified or deleted: title=%', bk.title;
	end if;
	if exists (select 1 from public.books where slug like 'rls-test-%'
		and slug not in ('rls-test-1', 'rls-test-2')) then
		raise exception 'a client-inserted books row exists';
	end if;

	raise notice 'table_rls test: PASS';
end $$;

rollback;
