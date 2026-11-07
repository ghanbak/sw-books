# Screenshots and diagrams

Owner's rule, 2026-11-07: Tregg, Luis and Dylan attach screenshots to every PR with a visual change. Brandon attaches a diagram when a proposed schema, data-flow or API change is easier to see than read.

**Visual change** = anything that changes what a screen renders: `app/`, `components/`, styles and tokens, `assets/`, `admin/` pages and components, user-facing copy. Logic-only diffs don't need screenshots.

## What to capture
- Before and after of each changed screen, same screen and same data. Capture "before" before you edit.
- The states the change touches (loading, empty, error, long text), not every screen in the app.
- App: the `iPhone 17 Pro` simulator, dark appearance. Admin: 1440×900.
- File names: `<screen>-<state>-before.png` and `-after.png`.

## Data (the repo is public, so the images are too)
- Only local Supabase seed data and the dev user ("Continue as Dev User"). Before capturing, check that the worktree's `.env.local` points at `http://127.0.0.1`.
- Never capture against the hosted project, a real account, or anything from `.env.production`. Never run `npm run db:reset` for screenshots; it wipes the owner's local data. If the local DB is empty, say so instead.

## App (Expo dev client)
1. One agent at a time on the simulator: `mkdir /tmp/sw-books-sim.lock` (exists → wait and retry, up to 15 min). Remove it when done, even on failure.
2. Local stack: `open -a Docker` if it isn't running, then `supabase start` (no-op if already up). Copy env: `cp /Users/ethan/Github/sw-books/.env.local .`.
3. Metro on a free port: `npx expo start --dev-client --port 8090` in the background.
4. `xcrun simctl boot "iPhone 17 Pro"` (ignore "already booted"), `xcrun simctl ui booted appearance dark`, then `xcrun simctl openurl booted "exp+ossus-archives://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8090"`.
5. On the login screen, tap "Continue as Dev User" (the iOS Simulator tool's `tap`). Navigate with deep links: `xcrun simctl openurl booted "ossusarchives://<route>"`.
6. Capture: `xcrun simctl io booted screenshot <file>.png`. Check each image before uploading (right screen, no red box, no personal data).
7. Stop Metro and remove the lock. Leave the simulator booted.

The installed dev client only runs JS changes. If the iOS fingerprint changed, skip app screenshots and say why.

## Admin (Next.js)
1. Local stack as above. Copy env: `cp /Users/ethan/Github/sw-books/admin/.env.local admin/`, then `npm --prefix admin ci --no-audit --no-fund`.
2. Dev server on a free port in 3101–3199 (3100 is the owner's): `(cd admin && npx next dev -H 127.0.0.1 -p 3101)` in the background.
3. Capture with the built-in browser, or headless Chrome:
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --user-data-dir="$(mktemp -d)" --window-size=1440,900 --screenshot=<file>.png http://127.0.0.1:3101/<path>`
4. Stop the dev server.

## Upload and attach
- `scripts/pr-assets.sh <head-branch> <files...>` pushes the images to the `pr-assets` branch and prints Markdown links. Never force-push `pr-assets`.
- In the PR body, add a `## Screenshots` section with a before/after table:

  ```markdown
  | Before | After |
  | --- | --- |
  | ![...](...) | ![...](...) |
  ```

- Couldn't capture (no simulator, Docker down, native change)? Write `Screenshots: not captured (<reason>)` instead. A reason is fine; silence isn't.
- Feature → main PRs: the caretaker copies the sub-issue PRs' "after" images into the feature PR's "What to look at".

## Diagrams (Brandon)
- When a schema, data-flow, pipeline, auth/RLS or API change is easier to see than read, put a Mermaid block in the PR body or the issue proposal (GitHub renders it): `erDiagram` for schema, `flowchart` for pipelines and data flow, `sequenceDiagram` for auth and request flows.
- Show the proposed state, and mark what's new or changed. Skip it for small changes.
- If Mermaid can't express it, upload a PNG or SVG with `scripts/pr-assets.sh`.
