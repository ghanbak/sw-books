# SW Books

Star Wars book tracker mobile app built with Expo (React Native) + Supabase.

## Stack

- **Framework:** Expo SDK 54 (managed workflow) with Expo Router
- **Database:** Supabase (Postgres + Auth + RLS)
- **Language:** TypeScript (strict mode)
- **Linting:** Biome (not ESLint/Prettier)
- **Testing:** Vitest

## Commands

- `npm start` — Start Expo dev server
- `npm run lint` — Run Biome linting
- `npm run lint:fix` — Auto-fix lint issues
- `npm run db:reset` — Reset local Supabase (apply migrations + seed)
- `npm run db:types` — Regenerate TypeScript types from local Supabase
- `npm run db:seed` — Run the CSV seed script

## Conventions

- Run all commands from the project root
- Use Biome for formatting and linting, not ESLint/Prettier
- Generated Supabase types live in `lib/types.ts` — do not edit manually
- Keep descriptions terse — no verbosity or flattery
- Read existing implementations before creating new patterns
- Complete one action item at a time, summarize next, ask to proceed
- Always read latest documentation and TypeScript typings for third-party packages

## Project Structure

- `app/` — Expo Router file-based routes
- `components/` — Reusable React Native components
- `hooks/` — Custom React hooks
- `lib/` — Supabase client, types, utilities
- `scripts/` — One-time scripts (seed, etc.)
- `supabase/` — Migrations, config, seed SQL
- `data/` — Seed CSV data
- `docs/` — Plans, brainstorms, guides

## Database

- 2 tables: `books` (catalog) and `user_books` (personal shelves)
- Column names match the CSV headers
- RLS enforced: authenticated users read all books, CRUD own user_books only
- Admin manages catalog via Supabase Studio
