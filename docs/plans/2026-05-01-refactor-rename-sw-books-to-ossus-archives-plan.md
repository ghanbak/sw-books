---
title: "refactor: Rename sw-books to ossus-archives"
type: refactor
date: 2026-05-01
parent: docs/plans/2026-04-29-auth-setup-checklist.md
---

# Rename sw-books to ossus-archives

The [auth setup checklist](2026-04-29-auth-setup-checklist.md) commits to `OssusArchives` / `com.ghanbak.ossusarchives` / `ossusarchives`, but the rest of the repo still says `sw-books`. The bundle-ID divergence will break iOS/Android builds and OAuth callbacks the moment Sign-in-with-Apple wiring is exercised. Pre-launch is the cheap window — no installed users, no published listing.

## Variants

| Variant          | Where it goes                                                                       |
| ---------------- | ----------------------------------------------------------------------------------- |
| `ossus-archives` | Slugs, npm package name, Supabase `project_id`, GitHub repo                         |
| `ossusarchives`  | URL scheme, reverse-DNS components (`com.ghanbak.ossusarchives`), email local part  |
| `OssusArchives`  | Display name, iOS Xcode target/folder, headings, comments                           |

## Key facts

- **iOS and Android native are generated.** `ios/SWBooks*` and `android/` are output of `expo prebuild`. Update `app.json` first, then run `npx expo prebuild --clean` (no `--platform` flag — regenerates both). Hand-editing `ios/` or `android/` works once and breaks the next time anything regenerates them.
- **Bundle ID change is one-way post-publish.** Apple won't let you change it once an app is on the App Store. Pre-launch (now) it's free.
- **Supabase cloud "project name" is display-only.** The project ref (used in URLs and OAuth callbacks) is unchanged by a dashboard rename, so [.mcp.json](.mcp.json) and the OAuth callback URLs already wired in the auth checklist stay valid.
- **Brainstorm shorthand stays.** [docs/brainstorms/2026-04-09-sw-books-app-brainstorm.md](docs/brainstorms/2026-04-09-sw-books-app-brainstorm.md) uses "SW books" to mean "Star Wars books" the abbreviation, not the app. Don't mass-replace inside that file. Filename is also historical — leave it. Same for the `brainstorm:` reference and `References` section in the master plan.
- **No `eas.json`, no `i18n/locales/`** in the repo — nothing to update there.
- **App icons in `assets/images/` are image assets, not text.** No "SW" baked in (verified by inspection).

## The work

### 1. In-repo rename

Update every occurrence in source/config/docs:

- Config: [package.json:2](package.json#L2), [app.json:3-13,38](app.json), [supabase/config.toml:5](supabase/config.toml#L5)
- Source strings: [lib/supabase.ts:25](lib/supabase.ts#L25) (`dev@ossusarchives.local`), [app/(tabs)/profile.tsx:40](app/(tabs)/profile.tsx#L40), [app/(tabs)/scan.tsx:97](app/(tabs)/scan.tsx#L97), [constants/tokens.ts:2](constants/tokens.ts#L2)
- Docs: [README.md](README.md), [CLAUDE.md](CLAUDE.md), [.impeccable.md](.impeccable.md), [docs/guides/setup-guide.md](docs/guides/setup-guide.md), and the **Project Structure** ASCII tree + scaffold command in [docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md](docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md) (lines 55, 335 — leave the `brainstorm:` frontmatter and `References` section alone)
- Grep `.env*` files (`.env`, `.env.example`, `.env.local.example`, `.env.production`) for any name references and update if present

Then `npm install` to regenerate `package-lock.json`'s `"name"` field at the top and any nested references.

### 2. Regenerate native

1. Quit Xcode and any running iOS simulator with the old `SWBooks` app installed (avoids macOS file locks during `rm -rf ios/`)
2. `rm -rf ios/ android/`
3. `npx expo prebuild --clean`  ← regenerates **both** platforms with the new bundle ID, scheme, package name
4. Flush stale caches: `watchman watch-del-all && rm -rf $TMPDIR/metro-* && npx expo start -c`
5. Delete the old `SWBooks` app from the simulator before installing the new build
6. `npx expo run:ios` (per CLAUDE.md memory: simulator only, physical iPhone is unreliable)

## Acceptance

- No matches for `sw-books` / `swbooks` / `SW Books` outside intentional carve-outs:
  ```sh
  grep -rniE 'sw[- ]?books|swbooks' . \
    | grep -vE 'node_modules|package-lock\.json|\.expo/|ios/Pods/|docs/brainstorms/|docs/plans/2026-04-10-.*-plan\.md:5|docs/plans/2026-04-10-.*-plan\.md:554'
  ```
- `npx expo run:ios` builds on simulator; home-screen icon labels the app `OssusArchives`
- In-app: profile screen shows `OssusArchives v1.0.0`; camera permission prompt says `OssusArchives needs camera access...`
- Deep link resolves: `xcrun simctl openurl booted ossusarchives://` opens the app (this is what OAuth callbacks rely on)
- `npx expo prebuild --clean` produces `ios/OssusArchives/` (not `ios/SWBooks/`) and `android/app/src/main/.../com/ghanbak/ossusarchives/` (not `swbooks/`)
- `npm run lint` passes
- Dev sign-in flow works end-to-end (`signInAsDevUser` → catalog renders → scanner opens)

## Optional follow-ups

Each is independent and gateable on user say-so:

- **GitHub repo:** `gh repo rename ossus-archives` then `git remote set-url origin https://github.com/ghanbak/ossus-archives.git`. GitHub keeps a redirect from the old URL indefinitely.
- **Supabase cloud project:** Dashboard → Project Settings → General → rename display name. Project ref unchanged; no code changes needed.
- **Local working directory** (`/Users/ethan/Github/sw-books` → `ossus-archives`): would orphan the Claude Code auto-memory at `/Users/ethan/.claude/projects/-Users-ethan-Github-sw-books/memory/`. If pursued, mirror-rename that directory in the same step. Recommend deferring until everything else is verified green.
