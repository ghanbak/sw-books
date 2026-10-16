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
# 1. Install (exactly what package-lock.json pins)
npm ci

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

> **This app requires a development build — it cannot run in Expo Go.** It ships
> native modules (Google / Apple Sign-In), and Expo Go only bundles Expo's own
> native code, so launching there fails with `RNGoogleSignin could not be found`.
> `npx expo run:ios` compiles the dev build and installs it on the simulator once
> (slow the first time, fast after). For day-to-day work afterward, run
> `npm start` and open the **dev build** app on the simulator — not Expo Go. Use
> the simulator, not a physical device (the device can't reach the dev server on
> this setup).

> **`npm ci`, not `npm install`.** `npm ci` installs exactly what `package-lock.json`
> pins and never rewrites it — the same install EAS runs in the cloud. `npm install`
> can drift Expo packages within their semver ranges, which has broken iOS builds
> here. To add or upgrade a dependency, use `npx expo install <pkg>` (it picks the
> version matching the Expo SDK), then commit the lockfile. Either way, `postinstall`
> re-applies the `patches/` (patch-package) — see the output for `✔` per package.

If `pod install` fails with `Encoding::CompatibilityError`, your shell locale isn't UTF-8. One-shot fix: prepend `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` to the prebuild command. Permanent fix: add those exports to `~/.zshrc`.

## Auth

Google and Apple Sign-In are wired natively (no OAuth web redirect). External setup — hosted Supabase project, Google Cloud OAuth clients, Apple Service ID + key — is documented in `docs/plans/2026-04-29-auth-setup-checklist.md` (local-only; `/docs` is gitignored).

In `__DEV__` builds, the **Continue as Dev User** button signs in as `dev@ossusarchives.local` against your local Supabase, bypassing OAuth entirely. Useful when iterating on UI without going through the provider dance.

The Apple Sign-In Supabase client secret JWT expires every 6 months — a scheduled agent posts a rotation reminder issue ~2 weeks before expiry.

## Builds & distribution (EAS)

Cloud builds run on EAS Build. Profiles in [eas.json](eas.json), each tied to an EAS Update channel:

| Profile              | Distribution                       | Update channel | Use                                               |
| -------------------- | ---------------------------------- | -------------- | ------------------------------------------------- |
| `development`        | internal · dev client · simulator  | `development`  | local dev client                                  |
| `development-device` | internal · dev client · device     | `development`  | dev client on a registered iPhone                 |
| `preview`            | internal · ad-hoc device           | `preview`      | test the real (Release) app on registered devices |
| `production`         | App Store                          | `production`   | TestFlight / App Store                            |

All iOS profiles are pinned to the `macos-sequoia-15.6-xcode-26.1` build image (see the VisionCamera note below). Builds take ~15–20 min.

### Preview — test on your device

A Release-config, ad-hoc-signed build installable on registered iPhones via the link/QR EAS prints when it finishes. This is the build to smoke-test before shipping — it exercises the same Release archive path as production.

```bash
# First time only: register your iPhone's UDID (opens a link/QR to install a profile)
eas device:create

# Build — install from the link EAS prints at the end
eas build --profile preview --platform ios
```

Only UDIDs registered via `eas device:create` can install an internal build; an unregistered device build succeeds but won't install.

### Versioning

`package.json` `version` is the single source of truth for the marketing version (`1.2.0`). Bump it with `npm version` on a clean `main` — never by hand:

```bash
npm version minor        # new features: 1.1.0 → 1.2.0  (patch for fixes, major for big releases)
git push --follow-tags   # pushes the version commit + its vX.Y.Z tag
```

The `version` lifecycle script ([scripts/sync-app-version.mjs](scripts/sync-app-version.mjs)) copies the new version into `app.json` `expo.version` so they can't drift. Bump before each App Store release — a version that's already been released can't take new builds. The build number is separate and owned by EAS (below).

### Production — TestFlight / App Store

```bash
# Build + submit to App Store Connect → TestFlight in one step
eas build --profile production --platform ios --auto-submit

# Or build first, then submit separately (e.g. to inspect the build before sending)
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

`production` sets `autoIncrement: true` with `appVersionSource: "remote"`, so EAS owns the build number — don't bump it by hand. Submit credentials (Apple ID, ASC app ID, team ID) live in `eas.json` under `submit.production`. After upload, App Store Connect takes ~10–30 min to process before the build shows in TestFlight.

### OTA updates — EAS Update

JS and asset changes can ship over the air with [EAS Update](https://docs.expo.dev/eas-update/introduction/) — no new build or App Store review. Installed apps check for an update on launch, download it in the background, and run it on the **next** cold launch.

```bash
# Publish the current JS bundle to every production build it's compatible with
eas update --channel production --message "Fix rail label on scrub"

# Try it on a preview build first
eas update --channel preview --message "…"
```

**What can ship OTA:** anything in JS/TS and bundled assets (screens, components, styles, logic, images).

**What needs a new build** (`eas build` → TestFlight → review): adding/upgrading a native module or the Expo SDK, changes to `app.json` native fields or `plugins/`, and edits to `patches/` (they touch native code).

**Compatibility is automatic.** `app.json` sets `runtimeVersion: { policy: "fingerprint" }`: the runtime version is a hash of the native layer (native deps, config plugins, `patches/`). An update only reaches builds with the same fingerprint, so a JS update that depends on new native code can't land on an old binary and crash it — it simply waits for users to install the new build. Run `npm ci` before `eas build` / `eas update`, since the fingerprint is computed from your local `node_modules`.

To roll back, republish a previous update to the channel (`eas update:republish`) or view history with `eas update:list`. Apple allows OTA for fixes and features, but not for changing the app's core purpose.

Fuller setup (credentials, Apple Developer prerequisites, env/secrets via `eas env:create`) is in `docs/guides/setup-guide.md` (local-only).

> **VisionCamera / Xcode 26 note.** [`plugins/withVisionCameraNoOptimizer.js`](plugins/withVisionCameraNoOptimizer.js) forces `SWIFT_OPTIMIZATION_LEVEL=-Onone` on the VisionCamera/Nitro pods: `react-native-vision-camera` v5 crashes the Swift optimizer under Release whole-module optimization on Xcode 26 ([mrousavy/react-native-vision-camera#3743](https://github.com/mrousavy/react-native-vision-camera/issues/3743)). The Xcode 26.1 image pin and this plugin can be revisited/retired once upstream ships a fix.

## Commands

| Command                       | What it does                                        |
| ----------------------------- | --------------------------------------------------- |
| `npx expo run:ios`            | Build + install the dev build, launch on simulator  |
| `npm start`                   | Start Metro; serve JS to the installed dev build (not Expo Go) |
| `npx expo prebuild --clean`   | Regenerate `ios/` and `android/` from `app.json`    |
| `npm ci`                      | Install exactly what the lockfile pins (+ apply `patches/`) |
| `npm version minor`           | Bump the marketing version (`package.json` + `app.json`) and tag |
| `eas update --channel production` | Ship a JS-only update over the air              |
| `npm run lint` / `lint:fix`   | Biome check / autofix                               |
| `npm run db:reset`            | Reset local Supabase, apply migrations, run seed    |
| `npm run db:types`            | Regenerate `lib/types.ts` from local Supabase       |
| `npm run db:seed`             | Re-import the CSV seed                              |
| `npm run admin:install`       | Install the admin tool's dependencies (first run only) |
| `npm run admin`               | Start the local catalog admin (Next.js, `127.0.0.1:3100`) |

All commands run from the repo root — the admin scripts reach into `admin/` for
you via `--prefix`, so never `cd admin` to run them.

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

## Catalog management — the admin tool

Edit the catalog with the local admin tool: a separate Next.js app under
`admin/` that talks to your local Supabase `books` table directly with the
service-role key. It's **loopback-only and ungated** — `http://127.0.0.1:3100`,
no login — so it's safe to run locally but never exposed.

**First-time setup** (run from the repo root):

```bash
npm run admin:install                          # install admin/ dependencies (once)
cp admin/.env.local.example admin/.env.local   # then paste the Supabase secret key
```

Fill `admin/.env.local` with values from `supabase status`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=sb_secret_…          # the "secret" (RLS-bypassing) key
```

**Run it** (the local stack must be up and seeded first):

```bash
supabase start                                 # if not already running
npm run db:reset && npm run db:seed            # migrations + catalog seed
npm run admin                                  # → http://127.0.0.1:3100/books
```

Inline-edit fields, run Open Library + Google Books lookups per book, fix issues
in bulk, then review `/diff` and **Export to CSV**. After export, re-run
`npm run db:reset && npm run db:seed` to confirm the drift returns to 0. Full
workflow + troubleshooting: [admin/README.md](admin/README.md).

> All admin commands run from the **repo root**, not `admin/` — the root
> `package.json` owns `admin` / `admin:install` (they `--prefix admin` for you).
> Running them inside `admin/` fails with `Missing script: "admin"`.

To push the catalog to production, copy `.env.production.example` →
`.env.production` (prod URL + secret key from the Supabase dashboard) and run
`npm run db:seed:prod`. It upserts on `slug` (existing IDs preserved, so shelves
stay intact) and prompts for the project ref before writing. It does **not**
delete books removed from the CSV — remove those in the dashboard.

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
