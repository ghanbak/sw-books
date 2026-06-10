-- add_owned_books(book_ids): batch-add catalog books to the caller's owned shelf.
-- Powers the shelf scanner's review-queue "Add selected" (one round-trip for N books).
--
-- Correctness properties (see docs/plans/2026-06-08-feat-visual-shelf-spine-scanner-plan.md):
--   * Sets owned = true and NOTHING else — the ON CONFLICT update lists only `owned`,
--     so read/want_to_read are preserved by construction. The flag-merge lives
--     server-side (like merge_books's bool_or) so a stale client can never clobber
--     flags toggled on another device.
--   * user_id comes from auth.uid() — the caller cannot write another user's shelf.
--     SECURITY INVOKER (the default) keeps the user_books RLS policies in force.
--   * Idempotent — re-adding an already-owned book is a no-op, which makes the
--     planned offline-queue replay (Phase 2.5) safe.
--
-- Called with a user session (not service role). After applying this migration,
-- regenerate types: `npm run db:types`.
create or replace function public.add_owned_books(book_ids uuid[])
returns setof public.user_books
language sql
as $$
  insert into public.user_books (user_id, book_id, owned)
  select auth.uid(), unnest(book_ids), true
  on conflict (user_id, book_id) do update set owned = true
  returning *;
$$;
