# External Services Setup Guide

Setup for the services OssusArchives depends on, ordered by when each becomes required. [README.md](../../README.md) is the day-to-day reference; this guide covers first-time setup.

**Identifiers** (from `app.json`):

| Field | Value |
|---|---|
| App name | `OssusArchives` |
| Expo slug | `ossus-archives` |
| iOS bundle ID | `com.ghanbak.ossusarchives` |
| Android package | `com.ghanbak.ossusarchives` _(Android deferred)_ |
| URL scheme | `ossusarchives://` |

---

## Prerequisites

No accounts needed for local development.

| Tool | Notes |
|---|---|
| Node.js (LTS) + npm | npm ships with Node. Install with `npm ci`, never `npm install` (see README). |
| Docker Desktop | Runs the local Supabase stack. |
| Supabase CLI | `brew install supabase/tap/supabase` |
| Xcode + iOS Simulator | Required. The app runs only as a development build. |
| Android Studio | Optional; Android is deferred. |

Expo CLI comes with the project: always invoke it as `npx expo …`.

> **Development builds only.** The app ships native modules (Google / Apple Sign-In, WebGPU), so it can't run in the stock Expo client. Use the iOS simulator; a physical device can't reach the dev server on this setup.

---

## Phase 1: Local development

```bash
npm ci                    # install exactly what package-lock.json pins (+ patches/)
cp .env.example .env      # fill in the values below
supabase start            # first run pulls Docker images (~2–3 min)
npm run db:reset          # apply migrations + supabase/seed.sql
npm run db:seed           # import the catalog from data/
npx expo prebuild --clean
npx expo run:ios          # build + install the dev build on the simulator
```

After the first build, run `npm start` and open the **dev build** on the simulator.

### `.env`

`supabase status` prints the local values:

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` (Project URL) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | The **Publishable** key |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Google Web client ID (Phase 2) |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | Google iOS client ID (Phase 2) |

The **Secret** key bypasses RLS. Never put it in app code. `npm run db:seed` and the admin tool read it as `SUPABASE_SERVICE_ROLE_KEY`.

### Signing in locally

`__DEV__` builds show **Continue as Dev User** on the login screen. It signs in a local test user against your local Supabase, so the catalog, shelves, scanner and covers work without OAuth.

### Supabase Studio

http://127.0.0.1:54323 browses tables, auth users and RLS. Edit the catalog with the admin tool (`npm run admin`, see [admin/README.md](../../admin/README.md)), not Studio.

### Commands

| Command | Purpose |
|---|---|
| `supabase start` / `supabase stop` | Start / stop the local stack |
| `supabase status` | Local URLs and keys |
| `npm run db:reset` | Drop and re-apply migrations + seed |
| `npm run db:seed` | Re-import the catalog CSV (local only) |
| `npm run db:types` | Regenerate `lib/types.ts` after schema changes |
| `supabase db diff` | Generate a migration from Studio changes |

---

## Phase 2: Sign-in providers

Sign-in is native (no OAuth web redirect). The step-by-step checklist, with progress, is [docs/plans/2026-04-29-auth-setup-checklist.md](../plans/2026-04-29-auth-setup-checklist.md). Summary:

### Google

In Google Cloud Console (OAuth consent screen with `email` and `profile` scopes), create:

| Client | Used by |
|---|---|
| Web | Supabase Google provider (client ID + secret) and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. The app passes it as `webClientId` so Supabase can verify the ID token. |
| iOS (bundle ID `com.ghanbak.ossusarchives`) | `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and its reversed form as `iosUrlScheme` in the `@react-native-google-signin/google-signin` plugin in `app.json`. |

Enable Google under Supabase **Authentication > Providers** with the Web client ID and secret. Locally, set `[auth.external.google]` in `supabase/config.toml` and restart the stack.

### Apple

Requires the Apple Developer Program.

1. App ID `com.ghanbak.ossusarchives` with **Sign in with Apple** enabled.
2. A Services ID and a Sign in with Apple key (`.p8`, downloadable once).
3. Enable Apple under Supabase **Authentication > Providers** (Services ID, key, Key ID, Team ID).

`expo-apple-authentication` is already in `app.json` plugins. The Supabase Apple client secret JWT expires every 6 months; rotate it before then.

---

## Phase 3: Hosted Supabase

Owner steps. Agents never run hosted Supabase commands.

1. Create the project in the Supabase dashboard (Free tier is enough).
2. `supabase link`, then `supabase db push --remote`. Since CLI v3, `db push` without `--remote` targets the local stack, and hosted changes ask for confirmation.
3. `EXPO_PUBLIC_*` values are embedded at build time. Point preview/production builds at the hosted URL and publishable key, e.g. with EAS environment variables (`eas env:create`). The secret key never goes behind an `EXPO_PUBLIC_` prefix.
4. The production database is the catalog's source of truth. Don't re-seed it from `data/books.csv` (`npm run db:seed:prod` refuses). Use the catalog scripts in README (`catalog:backup`, `catalog:changeset` / `catalog:apply`, `catalog:restore`). Prod scripts read credentials from the gitignored `.env.production` (copy `.env.production.example`).

### Account deletion

In-app deletion (App Store 5.1.1(v)) calls the `delete-account` Edge Function from `deleteAccount()` in `lib/account.ts` (Profile sheet). It deletes the user, cascades `user_books`, and revokes the Sign in with Apple token. Secrets, deploy and local-serve steps: [supabase/functions/delete-account/README.md](../../supabase/functions/delete-account/README.md).

---

## Phase 4: EAS Build and distribution

Requires an expo.dev account (`npm install -g eas-cli`, then `eas login`) and, for iOS, the Apple Developer Program. `eas.json` is already configured:

| Profile | Distribution | Channel |
|---|---|---|
| `development` | Dev client, simulator | `development` |
| `development-device` | Dev client, registered device | `development` |
| `preview` | Ad-hoc Release build, registered devices | `preview` |
| `production` | App Store / TestFlight | `production` |

`appVersionSource` is `remote` and `production` auto-increments the build number. The marketing version comes from `package.json` (`npm version`). Build, submit and OTA commands: README **Builds & distribution**. Releases: [docs/agents/releases.md](../agents/releases.md).

---

## What's needed when

| Phase | Service | Account? |
|---|---|---|
| 1 Local | Node.js + npm, Docker, Supabase CLI, Xcode | No |
| 2 Sign-in | Google Cloud Console | Yes (free) |
| | Apple Developer Program | Yes ($99/yr) |
| 3 Hosted | Supabase | Yes (free tier) |
| 4 Ship | expo.dev | Yes (free tier) |
| | App Store Connect | Apple Developer Program |
| | Google Play Console (deferred) | Yes ($25 one-time) |
