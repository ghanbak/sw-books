-- merge_books(): fold one or more duplicate book rows ("losers") into a
-- "survivor", atomically. Used to clear duplicate catalog rows.
--
-- Steps (single transaction — the whole function is one statement to its caller):
--   1. OR-merge each loser's shelf flags (owned/read/want_to_read) into the
--      survivor's user_books row for users who shelved both (no shelf data lost).
--   2. Delete loser shelf rows that would collide with the survivor on
--      UNIQUE(user_id, book_id).
--   3. Repoint the remaining loser shelf rows to the survivor.
--   4. Union the survivor's + losers' isbn[] / format[] (survivor first,
--      de-duplicated, order preserved) and apply optional scalar overrides from
--      `resolution`. primary_isbn must remain a member of the merged isbn[].
--   5. Delete the loser book rows.
--
-- Called with the service-role key (RLS bypassed). After applying this
-- migration, regenerate types: `npm run db:types`.

-- Ordered, de-duplicated union of two text[] (a's elements first, then b's
-- elements not already present). Preserves order; tolerates NULL inputs.
create or replace function public.ordered_text_union(a text[], b text[])
returns text[]
language sql
immutable
as $$
	select array_agg(v order by o)
	from (
		select v, min(o) as o
		from (
			select unnest(coalesce(a, '{}')) as v, generate_subscripts(coalesce(a, '{}'), 1) as o
			union all
			select unnest(coalesce(b, '{}')), 1000 + generate_subscripts(coalesce(b, '{}'), 1)
		) t
		where v is not null
		group by v
	) u;
$$;

create or replace function public.merge_books(
	survivor uuid,
	losers uuid[],
	resolution jsonb default '{}'::jsonb
)
returns public.books
language plpgsql
as $$
declare
	merged_isbn text[];
	merged_format text[];
	rec record;
	result public.books;
begin
	if survivor is null then
		raise exception 'survivor is required';
	end if;
	if losers is null or array_length(losers, 1) is null then
		raise exception 'at least one loser is required';
	end if;
	if survivor = any(losers) then
		raise exception 'survivor % cannot also be a loser', survivor;
	end if;

	-- 1-3. Collapse every affected user's survivor + loser shelf rows into a single
	-- survivor row (flags OR-merged), then drop all loser rows. Handles any number
	-- of losers and loser-vs-loser duplicates with no UNIQUE(user_id, book_id)
	-- violation: the grouped insert yields exactly one row per user, and the
	-- conflict target (an existing survivor row) is folded in by the same aggregate.
	insert into public.user_books (user_id, book_id, owned, read, want_to_read)
	select ub.user_id, survivor,
		bool_or(ub.owned), bool_or(ub.read), bool_or(ub.want_to_read)
	from public.user_books ub
	where ub.book_id = survivor or ub.book_id = any(losers)
	group by ub.user_id
	on conflict (user_id, book_id) do update set
		owned = excluded.owned,
		read = excluded.read,
		want_to_read = excluded.want_to_read;

	delete from public.user_books where book_id = any(losers);

	-- 4. Union arrays across survivor + losers (survivor first), in query order.
	select isbn, format into merged_isbn, merged_format
	from public.books where id = survivor;
	if not found then
		raise exception 'survivor % not found', survivor;
	end if;
	for rec in select isbn, format from public.books where id = any(losers) loop
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
