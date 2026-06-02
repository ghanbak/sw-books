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
