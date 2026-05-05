-- Drop the unused `asin` column from public.books.
--
-- Context: ASINs sourced from the original CSV are mostly wrong (mismatched
-- editions, dead listings). The Amazon "Find on Amazon" button now uses
-- ISBN search instead, which is reliable. The column has no remaining
-- consumers in app code or seed pipeline as of this migration.

ALTER TABLE public.books DROP COLUMN IF EXISTS asin;
