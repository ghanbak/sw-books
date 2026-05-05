-- Add `primary_isbn` to public.books.
--
-- Holds the preferred ISBN for buy-button / share-link flows. Source of truth
-- is the format-aware pipeline (scripts/source-isbns.ts), which picks paperback
-- > hardcover > first-listed from the OL editions response. Nullable: when the
-- pipeline can't resolve a format-tagged edition we fall back to isbn[0] in the
-- consuming code.

ALTER TABLE public.books ADD COLUMN primary_isbn text;
