# OssusArchives

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
- `npm run admin` — Start the local catalog admin tool (Next.js, `127.0.0.1:3100`)
- `npm run admin:install` — Install the admin app's dependencies

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
- `admin/` — Local-only Next.js catalog admin tool (separate package; not part of the Expo app)

## Database

- 2 tables: `books` (catalog) and `user_books` (personal shelves)
- Column names match the CSV headers
- RLS enforced: authenticated users read all books, CRUD own user_books only

## Catalog management

- Edit the catalog with the local admin tool: `npm run admin` (see [admin/README.md](admin/README.md))
- Review `/diff` and **Export to CSV** before committing changes to `data/`
- Do not hand-edit `data/books.csv` except for slug renames (slugs are read-only in the tool)
- The CSV→row mapping is shared in [lib/catalog.ts](lib/catalog.ts) (used by both `scripts/seed.ts` and the admin export)

## Design Context

**Personality:** Bold, Playful, Galactic — but grounded. Star Wars datapad feel without literal theming.

**Aesthetic:** Dark mode cinematic + skeuomorphic book covers. Dark surfaces, books are the visual heroes. Inspiration: Apple Books shelf UI + official Star Wars app datapad aesthetic.

**Color tokens (design for theming):**
- Primary accent: Lightsaber blue (`#4A90D9`) — buttons, active states, toggles
- Secondary accent: Star Wars yellow (`#FFE81F`) — scanner, badges, emphasis only
- Canon badge: `#1a3a5c` / Legends badge: `#5c3a1a`
- Background: `#0A0A0C` / Card: `#1A1A1E` / Border: `rgba(255,255,255,0.08)`
- Text primary: `#ECEDEE` / Secondary: `rgba(255,255,255,0.6)` / Hint: `rgba(255,255,255,0.3)`

**Principles:**
1. Books are the hero — UI recedes, covers pop
2. Tactile, not theatrical — skeuomorphism serves function
3. Collector's pride — make users feel good about their collection
4. Galactic identity without cosplay — Star Wars through color and confidence
5. Design for theming — colors are tokens, Jedi blue default, other themes planned
