-- user_books.book_id: ON DELETE CASCADE → ON DELETE RESTRICT (issue #490).
--
-- Before: deleting a books row silently removed every user's shelf rows for it, and
-- data/catalog-backup.csv holds only books columns, so the flags were unrecoverable.
-- Now a delete of a shelved book fails with 23503 (foreign_key_violation); the admin's
-- deleteBook maps that to "merge instead". Unshelved books still delete.
--
-- Unchanged:
--   * user_books.user_id → auth.users stays ON DELETE CASCADE (account deletion).
--   * book_enrichment.book_id stays ON DELETE CASCADE (catalog-derived data).
--   * merge_books() already deletes loser user_books rows (after OR-merging them into
--     the survivor) in a statement before it deletes the loser books, so RESTRICT never
--     fires there. No function change.
-- idx_user_books_book_id (20261107065718) serves the RESTRICT lookup.
-- No column or type change: lib/types.ts needs no regeneration.

alter table public.user_books
	drop constraint if exists user_books_book_id_fkey;

alter table public.user_books
	add constraint user_books_book_id_fkey
	foreign key (book_id) references public.books (id) on delete restrict;
