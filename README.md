# ossus-archives

Mobile app for tracking Star Wars novels across canon and Legends timelines.

Sign in with Apple or Google, browse the curated catalog, scan ISBN barcodes to shelve quickly, and track what you own, what you've read, and what's next.

## Stack

- **App** — Expo SDK 54 (managed, CNG workflow), Expo Router, React Native 0.81, TypeScript strict
- **Backend** — Supabase (Postgres + Auth + Row-Level Security)
- **Lint / format** — Biome
- **Test** — Vitest

## Quickstart

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
# Fill in:
#   EXPO_PUBLIC_SUPABASE_URL
#   EXPO_PUBLIC_SUPABASE_ANON_KEY
#   EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID

# 3. Local Supabase
supabase start
npm run db:reset      # apply migrations
npm run db:seed       # import the catalog from data/

# 4. Build + run on iOS simulator
npx expo prebuild --clean
npx expo run:ios
```

If `pod install` fails with `Encoding::CompatibilityError`, your shell locale isn't UTF-8. One-shot fix: prepend `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` to the prebuild command. Permanent fix: add those exports to `~/.zshrc`.

## Auth

Google and Apple Sign-In are wired natively (no OAuth web redirect). External setup — hosted Supabase project, Google Cloud OAuth clients, Apple Service ID + key — is documented in `docs/plans/2026-04-29-auth-setup-checklist.md` (local-only; `/docs` is gitignored).

In `__DEV__` builds, the **Continue as Dev User** button signs in as `dev@ossusarchives.local` against your local Supabase, bypassing OAuth entirely. Useful when iterating on UI without going through the provider dance.

The Apple Sign-In Supabase client secret JWT expires every 6 months — a scheduled agent posts a rotation reminder issue ~2 weeks before expiry.

## Commands

| Command                       | What it does                                        |
| ----------------------------- | --------------------------------------------------- |
| `npm start`                   | Expo dev server                                     |
| `npm run lint` / `lint:fix`   | Biome check / autofix                               |
| `npm run db:reset`            | Reset local Supabase, apply migrations, run seed    |
| `npm run db:types`            | Regenerate `lib/types.ts` from local Supabase       |
| `npm run db:seed`             | Re-import the CSV seed                              |
| `npm run admin` / `admin:install` | Local catalog admin tool (Next.js, `127.0.0.1:3100`) |
| `npx expo prebuild --clean`   | Regenerate `ios/` and `android/` from `app.json`    |
| `npx expo run:ios`            | Build the native iOS app, launch on simulator       |

## Project layout

```
app/                    Expo Router routes (file-based)
  (auth)/login.tsx        Sign-in screen
  (tabs)/                 Catalog · Shelf · Scanner · Profile
  book/[id].tsx           Book detail
components/             Shared RN components
hooks/                  Custom hooks
lib/
  auth.tsx                AuthProvider + signInWithGoogle / signInWithApple
  supabase.ts             Supabase client + dev fallback
  types.ts                Generated from Supabase (do not hand-edit)
constants/              Design tokens
scripts/                Seed + data utilities
supabase/               Migrations + local config (config.toml, seed.sql)
data/                   Source CSV for the catalog
```

## Database

Two tables:

- `books` — public catalog. All authenticated users can read. Edited with the local admin tool (see below), not from the app.
- `user_books` — per-user shelves (owned / read / want-to-read). CRUD restricted to the owner via Postgres Row-Level Security.

The CSV in `data/` is the source of truth for the catalog.

## Catalog management

Edit the catalog with the local admin tool — a Next.js app at `admin/`:

```bash
npm run admin:install
cp admin/.env.local.example admin/.env.local   # paste the Supabase secret key
npm run admin                                   # → http://127.0.0.1:3100/books
```

Inline-edit fields, run Open Library + Google Books lookups per book, fix issues
in bulk, then review `/diff` and **Export to CSV**. After export, re-run
`npm run db:reset && npm run db:seed` to confirm the drift returns to 0. Full
workflow + troubleshooting: [admin/README.md](admin/README.md).

## Identifiers

| Field             | Value                                            |
| ----------------- | ------------------------------------------------ |
| iOS bundle ID     | `com.ghanbak.ossusarchives`                      |
| Android package   | `com.ghanbak.ossusarchives` _(Android deferred)_ |
| URL scheme        | `ossusarchives://`                               |
| App display name  | `OssusArchives`                                  |

## Conventions

See [CLAUDE.md](CLAUDE.md). Highlights:

- Native `ios/` and `android/` are **gitignored** — Expo's CNG workflow regenerates them from `app.json` on every `expo prebuild`. Don't hand-edit; do native config via plugins.
- `/docs` is gitignored — plans, brainstorms, and guides are local-only working notes.
- Biome for formatting and linting (not ESLint or Prettier).
- `lib/types.ts` is generated; regenerate with `npm run db:types` after schema changes.
