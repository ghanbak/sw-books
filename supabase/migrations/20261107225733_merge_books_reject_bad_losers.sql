-- merge_books(): reject bad losers instead of silently no-oping (issue #159).
--
-- Before: a NULL loser (e.g. a mistyped slug in `(select id from books where slug = …)`)
-- or a loser id with no books row matched nothing, so the call returned the survivor
-- unchanged and reported success while the duplicate stayed in place.
--
-- Now every input is validated before any write:
--   * survivor NULL / missing           → raise (missing check moved ahead of the writes)
--   * losers NULL / empty               → raise (unchanged)
--   * any loser NULL                    → raise
--   * any loser equal to the survivor   → raise (unchanged)
--   * any loser with no books row       → raise, listing the missing ids
-- Duplicate loser ids are tolerated (not a no-op; the merge is still correct).
-- The merge body is otherwise identical to 20260623000000_add_favorite_to_user_books.
--
-- `create or replace` keeps the owner and the EXECUTE grants from
-- 20261107065718_harden_db_functions (service_role only) but resets SET clauses,
-- so `set search_path = ''` is restated. SECURITY INVOKER (default) unchanged.
-- Signature unchanged: lib/types.ts needs no regeneration.

create or replace function public.merge_books(
	survivor uuid,
	losers uuid[],
	resolution jsonb default '{}'::jsonb
)
returns public.books
language plpgsql
set search_path = ''
as $$
declare
	merged_isbn text[];
	merged_format text[];
	missing uuid[];
	rec record;
	result public.books;
begin
	if survivor is null then
		raise exception 'survivor is required';
	end if;
	if losers is null or array_length(losers, 1) is null then
		raise exception 'at least one loser is required';
	end if;
	if array_position(losers, null) is not null then
		raise exception 'losers contains NULL (unresolved id?): %', losers;
	end if;
	if survivor = any(losers) then
		raise exception 'survivor % cannot also be a loser', survivor;
	end if;
	if not exists (select 1 from public.books where id = survivor) then
		raise exception 'survivor % not found', survivor;
	end if;
	select array_agg(l order by o) into missing
	from unnest(losers) with ordinality as u(l, o)
	where not exists (select 1 from public.books b where b.id = u.l);
	if missing is not null then
		raise exception 'loser(s) not found: %', missing;
	end if;

	-- 1-3. Collapse every affected user's survivor + loser shelf rows into a single
	-- survivor row (flags OR-merged), then drop all loser rows.
	insert into public.user_books (user_id, book_id, owned, read, want_to_read, favorite)
	select ub.user_id, survivor,
		bool_or(ub.owned), bool_or(ub.read), bool_or(ub.want_to_read), bool_or(ub.favorite)
	from public.user_books ub
	where ub.book_id = survivor or ub.book_id = any(losers)
	group by ub.user_id
	on conflict (user_id, book_id) do update set
		owned = excluded.owned,
		read = excluded.read,
		want_to_read = excluded.want_to_read,
		favorite = excluded.favorite;

	delete from public.user_books where book_id = any(losers);

	-- 4. Union arrays across survivor + losers (survivor first), in query order.
	select isbn, format into merged_isbn, merged_format
	from public.books where id = survivor;
	for rec in
		select isbn, format from public.books where id = any(losers)
		order by array_position(losers, id)
	loop
		merged_isbn := public.ordered_text_union(merged_isbn, rec.isbn);
		merged_format := public.ordered_text_union(merged_format, rec.format);
	end loop;

	update public.books b set
		isbn = merged_isbn,
		format = merged_format,
		title = coalesce(resolution->>'title', b.title),
		canon = coalesce(resolution->>'canon', b.canon),
		type = coalesce(resolution->>'type', b.type),
		primary_isbn = case when resolution ? 'primary_isbn'
			then nullif(resolution->>'primary_isbn', '') else b.primary_isbn end,
		era = case when resolution ? 'era' then nullif(resolution->>'era', '') else b.era end,
		series_name = case when resolution ? 'series_name'
			then nullif(resolution->>'series_name', '') else b.series_name end,
		series_order = case when resolution ? 'series_order'
			then nullif(resolution->>'series_order', '')::int else b.series_order end,
		timeline_order = case when resolution ? 'timeline_order'
			then nullif(resolution->>'timeline_order', '')::numeric else b.timeline_order end,
		publisher = case when resolution ? 'publisher'
			then nullif(resolution->>'publisher', '') else b.publisher end,
		date_published = case when resolution ? 'date_published'
			then nullif(resolution->>'date_published', '')::date else b.date_published end,
		language = case when resolution ? 'language'
			then nullif(resolution->>'language', '') else b.language end,
		cover_image = case when resolution ? 'cover_image'
			then nullif(resolution->>'cover_image', '') else b.cover_image end,
		synopsis = case when resolution ? 'synopsis'
			then nullif(resolution->>'synopsis', '') else b.synopsis end
	where b.id = survivor
	returning * into result;

	if result.primary_isbn is not null
		and not (result.primary_isbn = any(coalesce(result.isbn, '{}'))) then
		raise exception 'primary_isbn % is not in the merged isbn[]', result.primary_isbn;
	end if;

	-- 5. Delete the losers (no remaining shelf rows point at them after step 3).
	delete from public.books where id = any(losers);

	return result;
end;
$$;
