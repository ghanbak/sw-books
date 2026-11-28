-- Self-checking test for user_books.book_id ON DELETE RESTRICT (issue #490).
-- Non-destructive: runs inside a transaction that ROLLBACKs. Raises on any failed
-- assertion; prints "user_books book FK restrict test: PASS" on success.
--
-- Covers: deleting a shelved book raises 23503 and keeps the shelf row; deleting an
-- unshelved book works; merge_books still folds loser shelf rows into the survivor
-- and deletes the loser; deleting a user still cascades their user_books.

begin;

insert into auth.users (id, instance_id, aud, role, email) values
	('a4900000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'fk-restrict-a@example.com'),
	('b4900000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
		'authenticated', 'authenticated', 'fk-restrict-b@example.com')
on conflict (id) do nothing;

insert into public.books (id, slug, title, author, canon, type, isbn) values
	('14900000-0000-0000-0000-000000000001', 'fk-shelved', 'Shelved', array['A'],
		'Canon', 'Adult Novel', array['9780000004901']),
	('14900000-0000-0000-0000-000000000002', 'fk-unshelved', 'Unshelved', array['A'],
		'Canon', 'Adult Novel', array['9780000004902']),
	('14900000-0000-0000-0000-000000000003', 'fk-survivor', 'Survivor', array['A'],
		'Canon', 'Adult Novel', array['9780000004903']),
	('14900000-0000-0000-0000-000000000004', 'fk-loser', 'Loser', array['A'],
		'Canon', 'Adult Novel', array['9780000004904']);

insert into public.user_books (user_id, book_id, owned, read) values
	('a4900000-0000-0000-0000-00000000000a', '14900000-0000-0000-0000-000000000001', true, false),
	('a4900000-0000-0000-0000-00000000000a', '14900000-0000-0000-0000-000000000004', false, true),
	('b4900000-0000-0000-0000-00000000000b', '14900000-0000-0000-0000-000000000004', true, false);

do $$
declare
	shelved constant uuid := '14900000-0000-0000-0000-000000000001';
	unshelved constant uuid := '14900000-0000-0000-0000-000000000002';
	survivor constant uuid := '14900000-0000-0000-0000-000000000003';
	loser constant uuid := '14900000-0000-0000-0000-000000000004';
	user_a constant uuid := 'a4900000-0000-0000-0000-00000000000a';
	user_b constant uuid := 'b4900000-0000-0000-0000-00000000000b';
	failures text[] := '{}';
	err_state text;
	cnt int;
	ub public.user_books;
begin
	-- 1. Shelved book: delete must raise 23503 and leave the book + shelf row in place.
	err_state := null;
	begin
		delete from public.books where id = shelved;
	exception when others then
		err_state := sqlstate;
	end;
	if err_state is null then
		failures := failures || 'deleting a shelved book did not raise'::text;
	elsif err_state <> '23503' then
		failures := failures || format('deleting a shelved book raised %s, not 23503', err_state);
	end if;
	if not exists (select 1 from public.books where id = shelved) then
		failures := failures || 'shelved book row is gone'::text;
	end if;
	if not exists (select 1 from public.user_books where user_id = user_a and book_id = shelved and owned) then
		failures := failures || 'shelf row for the shelved book is gone'::text;
	end if;

	-- 2. Unshelved book: delete still works.
	begin
		delete from public.books where id = unshelved;
	exception when others then
		failures := failures || format('deleting an unshelved book raised %s', sqlstate);
	end;
	if exists (select 1 from public.books where id = unshelved) then
		failures := failures || 'unshelved book was not deleted'::text;
	end if;

	-- 3. merge_books on a loser with shelf rows: rows fold into the survivor, loser deleted.
	begin
		perform public.merge_books(survivor, array[loser], '{}'::jsonb);
	exception when others then
		failures := failures || format('merge_books raised %s: %s', sqlstate, sqlerrm);
	end;
	if exists (select 1 from public.books where id = loser) then
		failures := failures || 'merge_books did not delete the loser'::text;
	end if;
	if exists (select 1 from public.user_books where book_id = loser) then
		failures := failures || 'loser shelf rows remain after merge'::text;
	end if;
	select * into ub from public.user_books where user_id = user_a and book_id = survivor;
	if ub.id is null or not ub.read then
		failures := failures || 'user A loser row not moved to survivor with read=true'::text;
	end if;
	select * into ub from public.user_books where user_id = user_b and book_id = survivor;
	if ub.id is null or not ub.owned then
		failures := failures || 'user B loser row not moved to survivor with owned=true'::text;
	end if;

	-- 4. Account deletion still cascades through user_books.user_id.
	begin
		delete from auth.users where id = user_a;
	exception when others then
		failures := failures || format('deleting user A raised %s: %s', sqlstate, sqlerrm);
	end;
	select count(*) into cnt from public.user_books where user_id = user_a;
	if cnt <> 0 then
		failures := failures || format('user A has %s shelf rows after account deletion', cnt);
	end if;
	-- With user A's rows gone, the formerly shelved book now deletes.
	begin
		delete from public.books where id = shelved;
	exception when others then
		failures := failures || format('deleting the book after its last shelf row went raised %s', sqlstate);
	end;

	-- 5. Catalog: book_id restricts, user_id still cascades.
	if (select confdeltype from pg_constraint
		where conrelid = 'public.user_books'::regclass and conname = 'user_books_book_id_fkey') is distinct from 'r' then
		failures := failures || 'user_books_book_id_fkey is not ON DELETE RESTRICT'::text;
	end if;
	if (select confdeltype from pg_constraint
		where conrelid = 'public.user_books'::regclass and conname = 'user_books_user_id_fkey') is distinct from 'c' then
		failures := failures || 'user_books_user_id_fkey is not ON DELETE CASCADE'::text;
	end if;

	if cardinality(failures) > 0 then
		raise exception 'user_books book FK restrict test: % failure(s): %',
			cardinality(failures), array_to_string(failures, '; ');
	end if;

	raise notice 'user_books book FK restrict test: PASS';
end $$;

rollback;
