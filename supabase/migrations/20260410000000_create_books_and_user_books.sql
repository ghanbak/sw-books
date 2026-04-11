-- Books catalog table
-- Column names match the CSV headers from data/books.csv
CREATE TABLE books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  author text[] NOT NULL DEFAULT '{}',
  cover_image text,
  canon text NOT NULL CHECK (canon IN ('Canon', 'Legends')),
  date_published date,
  format text[] DEFAULT '{}',
  isbn text[] DEFAULT '{}',
  language text DEFAULT 'English',
  publisher text,
  series_name text,
  series_order int,
  timeline_order float,
  synopsis text,
  type text NOT NULL CHECK (type IN ('Adult Novel', 'YA Novel', 'Middle Grade Novel')),
  asin text,
  era text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_books_isbn ON books USING gin (isbn);
CREATE INDEX idx_books_canon ON books (canon);
CREATE INDEX idx_books_series_name ON books (series_name) WHERE series_name IS NOT NULL;

-- User books (personal shelves)
CREATE TABLE user_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES books ON DELETE CASCADE,
  owned boolean NOT NULL DEFAULT false,
  read boolean NOT NULL DEFAULT false,
  want_to_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, book_id)
);

CREATE INDEX idx_user_books_user_id ON user_books (user_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER books_updated_at
  BEFORE UPDATE ON books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER user_books_updated_at
  BEFORE UPDATE ON user_books
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS policies
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_books ENABLE ROW LEVEL SECURITY;

-- Books: all authenticated users can read the full catalog
CREATE POLICY "authenticated_read_books" ON books
  FOR SELECT TO authenticated
  USING (true);

-- Allow unauthenticated reads for development (anon key can browse catalog)
-- Remove this policy before production if you want to require sign-in to browse
CREATE POLICY "anon_read_books" ON books
  FOR SELECT TO anon
  USING (true);

-- User books: fully user-scoped CRUD
CREATE POLICY "own_books_select" ON user_books
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "own_books_insert" ON user_books
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "own_books_update" ON user_books
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "own_books_delete" ON user_books
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);
