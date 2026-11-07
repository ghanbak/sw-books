-- Harden public functions (issue #90).
--
-- 1. merge_books / ordered_text_union: admin-only maintenance helpers. They live in the
--    exposed `public` schema and Supabase's default privileges grant EXECUTE to anon and
--    authenticated, so both were callable via PostgREST RPC. Only the admin tool calls
--    merge_books, with the service-role key (admin/lib/supabase-admin.ts); ordered_text_union
--    is called only from inside merge_books (SECURITY INVOKER, so as service_role).
--    Revoke client EXECUTE; keep service_role explicit.
-- 2. Pin search_path = '' on all four public functions (advisor:
--    function_search_path_mutable). Bodies already schema-qualify every table and
--    non-builtin function (public.*, auth.uid()); builtins (now, unnest, bool_or,
--    coalesce, array_position, ...) resolve via pg_catalog, which is always searched
--    implicitly. No body rewrite needed.
--    NOTE: a future `create or replace function` drops SET clauses not restated —
--    restate `set search_path = ''` when recreating any of these.
-- 3. Index user_books(book_id): FK to books (ON DELETE CASCADE) and merge_books's
--    `book_id = survivor or book_id = any(losers)` scans. UNIQUE(user_id, book_id)
--    can't serve book_id-only lookups.
--
-- add_owned_books stays executable by authenticated (app shelf scanner, lib/hooks.tsx).
-- update_updated_at is a trigger function; triggers fire regardless of EXECUTE grants
-- on the caller, and pinning search_path does not affect now().
--
-- No API surface change: lib/types.ts needs no regeneration.

-- 1. Revoke client RPC access to admin-only functions.
revoke execute on function public.merge_books(uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.merge_books(uuid, uuid[], jsonb) to service_role;

revoke execute on function public.ordered_text_union(text[], text[]) from public, anon, authenticated;
grant execute on function public.ordered_text_union(text[], text[]) to service_role;

-- 2. Pin search_path.
alter function public.merge_books(uuid, uuid[], jsonb) set search_path = '';
alter function public.ordered_text_union(text[], text[]) set search_path = '';
alter function public.add_owned_books(uuid[]) set search_path = '';
alter function public.update_updated_at() set search_path = '';

-- 3. Index the book_id FK.
create index if not exists idx_user_books_book_id on public.user_books (book_id);
