---
title: "feat: iOS TestFlight Launch Roadmap"
type: feat
date: 2026-05-04
parent: docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md
status: active
deepened: 2026-05-04 (DHH, Kieran TS, Simplicity, Architecture, Performance, Security, SpecFlow + 5 research agents)
---

# iOS TestFlight Launch Roadmap

## Overview

Sequenced plan from "auth works on simulator" to "TestFlight build my friends can install on their phones." Then Android as a separate pass, then full App Store launch later.

## Enhancement summary (from deepening)

Restructured after multi-reviewer pass. Key changes:

- **Phase 1 and 2 swapped.** Reviewers (DHH, architecture-strategist) called this out: deciding visual treatment from the simulator before the app is on a real phone is backwards. EAS device build now comes first; the design pass works against device feedback.
- **Phase 1 (was 2) narrowed to "Brand Minimum"** — custom app icon, custom splash, font swap, replacing the placeholder login logo. Liquid Glass spike moved to Phase 5 (post-TestFlight iteration), where friend feedback can drive the decision. Per simplicity + DHH: the dark cinematic system already shipped is enough to ship to friends with.
- **Phase 5 (was 6) Android collapsed** to a one-paragraph deferral — gets a separate plan when iOS TestFlight is up.
- **Phase 6 split** into Phase 5 (Post-TestFlight Iteration) + Phase 7 (Full App Store Launch). Iteration loop captures the "let friends drive what gets polished" insight.
- **New: User-flow QA matrix** between Phase 3 and 4 — explicit fresh-user, cold-offline, deletion, locale, iOS 25 fallback paths.
- **Account deletion now has a real spec** (Phase 7) — service role key handling, caller JWT verification, rate-limit, re-auth requirement.
- **Apple JWT rotation reminder pulled forward** from 6 months to 5 months.
- **Apple Sign-In name persistence bug surfaced** in [lib/auth.tsx:97-103](lib/auth.tsx) — fix in Phase 3.
- **app.json duplicate permissions** ([lines 25-28](app.json)) — fix in Phase 3.

---

## Where things stand right now (2026-05-04)

| Area                                                          | Status                                                                |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| Auth (Google + Apple Sign-In, dev fallback, sign-out)         | ✅ Verified end-to-end on simulator + local Supabase                  |
| Catalog, bookshelf, scanner                                   | ✅ Shipped                                                            |
| 3D book covers (perspective transform, viewer)                | ✅ Shipped — Phase 0 = defer (Option A)                                |
| Dark Cinematic Design System ([2026-04-20 plan](docs/plans/2026-04-20-feat-dark-cinematic-design-system-plan.md)) | ✅ Largely applied                  |
| Login screen rebranded ("SW" → "OA", "Star Wars Books" → "Ossus Archives") | ✅ Done                                              |
| Loading / error / offline                                     | ❌                                                                     |
| Custom app icon + splash                                      | ❌ Default Expo placeholders                                           |
| EAS Build config                                              | ❌                                                                     |
| Account deletion Edge Function                                | ❌                                                                     |
| Privacy policy URL                                            | ❌                                                                     |
| App Store Connect record                                      | ❌                                                                     |

---

## Phase 0 — 3D Book Decision

**Decision (2026-05-04): Option A — defer until TestFlight feedback.** Ship what's shipped. No 3D work in this roadmap. Revisit only if friends flag it as weird or distracting on TestFlight.

Full decision matrix and revert checklist preserved in earlier revisions of this file (see git history if Phase 5 ever needs to revisit).

---

## Phase 1 — EAS Bootstrap + First Device Build

**Goal:** app installed on your iPhone via Expo Build, before any further design decisions are made.

### Why this is now first

OLED contrast, P3 color, scroll feel, font hinting, splash transition — all read meaningfully different on device than on the simulator. Designing on the simulator first is paying for two passes when one would do.

### Tasks

- [ ] `eas login` and `npx eas init` — links the project to Expo's cloud
- [ ] Create [eas.json](eas.json):

```json
{
  "cli": { "version": ">= 18.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "ios": { "resourceClass": "m-medium" }
    },
    "production": {
      "distribution": "store",
      "autoIncrement": true,
      "ios": { "resourceClass": "m-medium" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "ghanbak@gmail.com",
        "ascAppId": "<fill after ASC app record exists>",
        "appleTeamId": "<fill from developer.apple.com>"
      }
    }
  }
}
```

- [ ] **Env-var topology decision** — `EXPO_PUBLIC_*` vars embed at build time, not runtime. Three of the four are public-by-design (Supabase URL, anon key, Google client IDs); committing to `.env.production` is fine. Use **EAS env vars (plaintext visibility, scoped to preview+production)** if you'd prefer git not to see them — set with `eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value …`. The **service role key** and Apple `.p8` MUST NEVER be in any `.env*` file or behind an `EXPO_PUBLIC_` prefix; only ever in EAS Secrets / Edge Function env / Apple Developer portal.
- [ ] `eas credentials --platform ios` → auto-generate signing/provisioning. EAS handles cert + profile creation against your Apple Developer team.
- [ ] First build: `eas build --profile preview --platform ios` — wait ~20 min
- [ ] Install on physical iPhone via the build link (sideload, not yet TestFlight)
- [ ] Smoke test on device: auth (Apple + Google), catalog scroll, scanner, shelf toggles, sign-out, re-launch persistence

### Acceptance

- [ ] App installed on physical iPhone via EAS preview build
- [ ] Auth flows work against cloud Supabase
- [ ] No build-time errors, no runtime crashes during 5-min smoke test
- [ ] [eas.json](eas.json) committed
- [ ] **Sign-out + re-sign-in works on the `preview` profile build (Hermes, no dev menu)** — proves production-bundled JS is healthy

### Estimate

**~half day** for first successful build (including initial EAS setup). Subsequent builds are ~10–20 min wait time.

### Gotchas / first-build failures (from research)

- "Team ID not found" → verify Apple Developer membership active; regenerate certs
- "Provisioning profile mismatch" → bundle ID in [app.json](app.json) must match Apple Developer Portal entry exactly
- "OAuth credentials invalid" → Google iOS Client ID + Apple Sign-In service config must match the bundle ID

---

## Phase 2 — Design Pass: Brand Minimum

**Goal:** the app doesn't *look* like a placeholder when friends open it. Custom icon, custom splash, brand-fitting heading font, login hero replaced. Defer Liquid Glass + animated accents + themed-empty-state copy to **Phase 5** (post-TestFlight).

### What's in this phase

- [ ] **Custom heading font** — `SpaceGrotesk-Medium` via `expo-font`. Open SIL license, ships safely to App Store, both iOS + Android. Apply to screen titles only (uppercase + ~10% tracking). Body stays system. ISBN/data displays use system monospace.
- [ ] **Custom app icon** — pick one direction, deliver 1024×1024 (no transparency, solid `#1A1A1E` background) plus Android adaptive (foreground PNG with alpha + background color). Safe directions:
  - Book + lightsaber-blade bookmark (thin vertical blue accent)
  - Holocron silhouette / hex-grid
  - Ringed planet behind a book spine
  - **Avoid**: Death Star silhouette, lightsaber hilts, Jedi/Sith emblems, X-wing/TIE — IP risk
- [ ] **Custom splash screen** — solid icon-on-`#0A0A0C` background; no animated transitions in v1 (Android 12+ splash API rules out the rich treatment anyway). Hold ≥ 2s before fade so JS init completes.

```json
"expo-splash-screen": {
  "image": "./assets/images/splash-icon.png",
  "imageWidth": 160,
  "resizeMode": "contain",
  "backgroundColor": "#0A0A0C",
  "dark": { "backgroundColor": "#0A0A0C" }
}
```

- [ ] **Login hero touch-up** — done already (placeholder "SW" → "OA" + "Ossus Archives" per [app/(auth)/login.tsx](app/(auth)/login.tsx)). Verify the logo treatment renders well on device; iterate if needed.
- [ ] **Token audit** — quick walkthrough of every screen on device, list any place still using hardcoded colors instead of `tokens.*`. Reconcile against the [Dark Cinematic plan](docs/plans/2026-04-20-feat-dark-cinematic-design-system-plan.md) checklist.

### What's explicitly NOT in this phase

- ~~Liquid Glass spike + adoption~~ → Phase 5, after device feedback
- ~~Custom themed empty/error/loading copy ("No transmissions received")~~ → Phase 5
- ~~Tab transitions / lightspeed / animated accents~~ → Phase 5
- ~~Tab bar custom icons~~ → Phase 5

### Acceptance

- [ ] Space Grotesk loaded; all screen titles use it
- [ ] Custom app icon ships in iOS (1024) + Android adaptive variants
- [ ] Custom splash replaces Expo placeholder
- [ ] No hardcoded colors in screen-level components
- [ ] Visual QA on device (uses the EAS preview build from Phase 1) — colors, typography, splash all read right on the actual hardware

### Estimate

**~1 day** at this scope, not 3–5. The heavy stuff is icon design (which is mostly visual iteration; commission or direct, then ship).

### Cross-platform note

Wrap any platform-specific design choices (e.g., shadow vs elevation; iOS-only Liquid Glass *if* it lands later) behind a `<Surface variant="…">` abstraction in components/, not raw `Platform.select` at every call site. Pays dividends in Phase 6 Android.

---

## Phase 3 — Pre-TestFlight Polish

**Goal:** app feels solid enough to put in friends' hands without you wanting to apologize for rough edges.

### Required (blocks TestFlight)

- [ ] **Loading skeletons** — only on **slow** surfaces (book detail, scanner result lookup). Catalog already loads in <600ms on Wi-Fi per perf research; skeletons there are theatre and a single static placeholder color is better. **Library: `react-content-loader`** (SVG, simple, React-Compiler-safe). Avoid `moti/skeleton` — its memoization assumptions conflict with the React Compiler memoization that's enabled in [app.json:75](app.json) (`reactCompiler: true`).
- [ ] **Error states with retry** — per data-fetching surface, not at the route level. Pattern: `useBooks()` exposes `{state, data, error, retry}` and the screen renders an `<ErrorState onRetry={retry} />` for `state === 'error'`.
- [ ] **Cold-offline state** — if first launch happens with no network, render "Connect to the internet to sign in" on login; if signed-in cache exists, render last-cached catalog with a "Showing cached data" banner. Don't show a never-resolving spinner.
- [ ] **Apple Sign-In name persistence fix** — [lib/auth.tsx:97-103](lib/auth.tsx) currently writes `fullName` to user_metadata only after Supabase signs the user in. Apple only returns `fullName` on the first ever sign-in for that Apple ID + app combo; if `signInWithIdToken` succeeds but `updateUser` fails (network, race, app crash), the name is lost forever. Fix: persist `credential.fullName` to AsyncStorage *before* calling Supabase; on next launch, if user_metadata is missing the name and AsyncStorage has it, write it then.
- [ ] **Fix duplicate permissions** in [app.json:25-28](app.json):
  ```diff
  "permissions": [
    "android.permission.CAMERA",
  -  "android.permission.RECORD_AUDIO",
  -  "android.permission.CAMERA",
    "android.permission.RECORD_AUDIO"
  ],
  ```
  (Will fail Play Store review later; harmless for iOS.)
- [ ] **app.json metadata** — pin `version`, `ios.buildNumber`. EAS `autoIncrement: true` handles `buildNumber` after first set.
- [ ] **Cancellation handling** — Apple's `ERR_REQUEST_CANCELED` already handled in [app/(auth)/login.tsx:93-100](app/(auth)/login.tsx); confirm Google's silent-cancel path returns cleanly without alert.

### NOT required for TestFlight (defer to Phase 7)

- ~~Offline detection banner with `@react-native-community/netinfo`~~ — friends testing on home Wi-Fi rarely hit offline. Keep cold-offline state above; defer banner + write-blocking to Phase 7.
- ~~Sentry crash reporting~~ — App Store Connect's TestFlight crash reports are sufficient for friend signal. Add Sentry only if ASC's signal is missing or delayed (and pin `@sentry/react-native@^6.x`; 5.x silently no-ops on new arch).
- ~~Account deletion~~ — Apple App Store requires it, TestFlight doesn't. Phase 7.

### React Compiler interaction guards

The codebase has `reactCompiler: true` and `newArchEnabled: true` in [app.json](app.json). Real bites surfaced by review:

- Files using `useSharedValue` (Reanimated 4): add `'use no memo'` directive at top until Reanimated 4.1+ ships compiler annotations. Audit [components/Book3D.tsx](components/Book3D.tsx) and [components/Book3DViewer.tsx](components/Book3DViewer.tsx).
- `expo-image` cached `source` props get memoized aggressively. If cover URLs ever cache-bust (recent commit `17bf482` did this), wrap in `useMemo` explicitly.

### Acceptance

- [ ] All slow data-fetching surfaces show loading state
- [ ] All can-fail surfaces show error + retry (not blank screens)
- [ ] Cold-offline state is intentional (not a stranded spinner)
- [ ] Apple Sign-In name persistence fix verified by signing in fresh on a test Apple ID, force-quitting before metadata write, re-launching, confirming name is captured
- [ ] No console errors during 5-min device smoke test
- [ ] `npm run lint` doesn't regress (already 79 pre-existing errors per rename-agent's earlier report; new code adds zero)

### Estimate

**~2 days.** Loading + error + cold-offline ~1 day; bug fixes + metadata pinning ~half day; verification on device ~half day.

---

## Phase 3.5 — User-Flow QA Matrix (pre-TestFlight gate)

**Goal:** before sending invites, walk through the flows that variance among 2–3 friends will exercise.

| Flow | What to verify | Pass? |
|---|---|---|
| Fresh tester, Apple Sign-In | First-time `fullName` capture lands in profile | ☐ |
| Fresh tester, Apple "Hide My Email" | Profile shows relay address; doesn't crash on missing email | ☐ |
| Fresh tester, Google Sign-In | Account picker → signed in; profile populated | ☐ |
| Tester on iOS 25 | App renders without Liquid Glass (it's not added yet anyway) | ☐ |
| Tester in non-en-US locale (set device to fr-FR) | No crash; dates render reasonably; BBY/ABY math intact | ☐ |
| Cold launch with airplane mode | Login shows "connect to internet" message, not stranded spinner | ☐ |
| Signed-in tester, cold offline | Cached catalog renders if cache exists; clean empty state otherwise | ☐ |
| Sign-out → sign back in (same user) | Session restores cleanly; `user_books` data intact | ☐ |
| Deep link `ossusarchives://` (typed) | Opens app; lands on safe screen (login or catalog), not blank | ☐ |
| Push new build to same TestFlight group | Friends update without re-onboarding; cached state survives | ☐ |

---

## Phase 4 — iOS TestFlight Distribution

**Goal:** friends install via TestFlight.

### Apple Developer / App Store Connect setup

- [ ] Apple Developer Program active ($99/yr) — required for TestFlight
- [ ] App Store Connect → My Apps → New App
  - Bundle ID: `com.ghanbak.ossusarchives`
  - Name: `OssusArchives` (Apple has its own char limits; verify display)
  - SKU: `ossus-archives-ios`
- [ ] App Store Connect → App Information → primary category, content rights
- [ ] Verify Sign in with Apple capability enabled on the bundle ID (already done per auth checklist § 3)

### Build + upload

- [ ] `eas build --profile production --platform ios --auto-submit`
- [ ] Build appears in App Store Connect → TestFlight tab after processing (~10–30 min)
- [ ] **Export compliance** — first-time submitters get blocked here for hours if not pre-set. Add `"ITSAppUsesNonExemptEncryption": false` to [app.json](app.json) under `ios.infoPlist` since the app uses only standard system crypto (Apple/Google ID tokens). Saves the per-build prompt.
- [ ] **Demo account credentials in review notes** — Beta App Review will sometimes try to test the sign-in flow. Provide a working Apple ID + Google account or a documented test path.
- [ ] Beta App Review (lighter than full review; usually 24–48h for first build)

### Internal testing setup

- [ ] App Store Connect → TestFlight → Internal Testing → create group "Friends"
- [ ] Internal Testing cap: **100 users with TestFlight role in App Store Connect** (not 100 Apple IDs in general). For more reach, use External Testing (10k cap, requires Beta App Review on each new feature)
- [ ] Send invites; testers accept via TestFlight app on iPhone

### Crash + feedback monitoring

- [ ] App Store Connect → TestFlight → Builds → Crashes — monitor after install
- [ ] App Store Connect → TestFlight → Builds → Feedback — monitor screenshots and notes
- [ ] Decide cadence (e.g., weekly during testing). Subsequent builds to the same group don't re-trigger Beta App Review unless entitlements change

### Acceptance

- [ ] At least one friend installs via TestFlight and successfully signs in
- [ ] No crashes in first 24h across testers
- [ ] Feedback channel monitored

### Estimate

**~3 days realistic** for first successful TestFlight build. The cert/profile/provisioning flow on a *first* iOS submission has more friction than the docs imply; budget the buffer. Subsequent builds are 1–2h each.

---

## Phase 5 — Post-TestFlight Iteration

**Goal:** let friend signal drive what gets polished. Single doc captures feedback as it comes in; this phase loops until friend feedback stabilizes.

### Decisions driven by feedback

| If friends say… | Then… |
|---|---|
| "The 3D books are weird/distracting" | Revert per Phase 0 Option B (~2–3h) |
| "The 3D books are great" | Polish per Phase 0 Option C (~1–2h) |
| "App feels generic / cold" | Liquid Glass spike (see below) |
| "X is confusing" | UI/UX fix |
| "Crashed on …" | Triage from ASC crash reports |

### Optional: Liquid Glass spike (only if feedback warrants)

If pursued, the research surfaced this concrete path:

- Pin `@callstack/liquid-glass@^0.7` (community, mature on SDK 54; Expo's `expo-glass-effect` will be the cleaner option once SDK 55 lands)
- Apply to **tab bar only** as the spike. Use `isLiquidGlassSupported` for graceful iOS <26 fallback to a tinted opaque bar
- Acceptance: scrolling 200-book FlatList with glass tab bar maintains ≥55fps on iPhone 11 (A13). If <50fps, defer
- Do NOT apply to scrollable list backgrounds, modal-over-modal stacks, or surfaces <50pt tall
- Wrap behind a `<Surface variant="glass">` component so Android can substitute a Material equivalent in Phase 6

### Other Phase 5 candidates (only if feedback supports)

- Themed empty/error/loading copy ("No transmissions received")
- Tab bar custom icons
- Sub-layer parallax on book covers (the page-edge strip + spine bevel from the 3D design brief, if 3D is staying)
- Animated accents (scanner viewfinder pulse, etc.)
- Sentry adoption (only if ASC crash signal is insufficient)

### Data hygiene pass

The catalog has known data-quality problems accumulated across the seed pipeline. Not a TestFlight blocker — friends will see a working catalog with mostly-correct data — but worth a sweep before App Store launch. Items in rough priority order:

| Issue | Symptom | Fix | Priority |
|---|---|---|---|
| **`format[]` and `isbn[]` are non-parallel arrays** | Can't tell which ISBN is the paperback. Buy button uses `isbn[0]` as a heuristic, lands on whichever variant Amazon matches | Add `primary_isbn text` column populated by seed pipeline using OL `physical_format`. Selection priority: Paperback → Mass-market → Hardcover → eBook → Audiobook → null fallback. One-line buy-button update once column lands | High — quietly improves every Amazon click |
| **`asin` column is mostly wrong** | Discovered post-seed; ASINs from CSV don't match correct editions | Decide: re-source from PA-API (paid program with sales-quota requirements) or drop the column. Recommend dropping — buy button uses ISBN search, ASIN provides nothing | Medium — column unused but pollutes schema |
| **Cover URLs occasionally break** | Some books render placeholder; recent commits (`17bf482`, `6e19d14`) caught and fixed batches | Add a monthly scheduled remote agent to verify `cover_image` URLs return 200 + valid image content-type, log to a Slack/email/issue if broken | Medium — visible to users, can recur |
| **`era` column is empty for all rows** | Listed as "all 188 rows have empty era; backfill in V2" in master plan. Currently means BBY/ABY math relies on `date_published` only, which is fine but era-based filtering is unavailable | Backfill from a SW timeline reference (Wookieepedia or hand-curated). Or leave for V2 if no era-based feature ships | Low — feature gap, not user-visible bug |
| **Author name normalization** | Possible inconsistent capitalization or abbreviated/full-name duplicates (e.g., "Timothy Zahn" vs "T. Zahn") | Audit `SELECT DISTINCT unnest(author) FROM books ORDER BY 1` and reconcile. Probably small (~20 unique authors) | Low — minor deduping |
| **Series ordering verification** | `series_order` accuracy for books within a series | Spot check a few series visually; trust the seed for the rest until a complaint surfaces | Low |
| **Duplicate detection** | Master plan dealt with 3 known duplicates; new ones could surface as catalog grows | One-shot SQL to find duplicates by normalized title + author + isbn intersection | Low — small catalog, manual scan is fine |
| **`timeline_order` accuracy** | Drives BBY/ABY display ordering | Mostly correct from seed; spot check anything that looks misplaced | Low |

**When to do it:** ideally between Phase 5 (post-TestFlight feedback) and Phase 6 (Android), or in parallel with Phase 6. Definitely before Phase 7 App Store submission — App Store reviewers occasionally screenshot user-facing data, and obvious gaps (broken covers especially) read as "unfinished."

**Estimate when scoped:** ~1 day for the high-priority items (primary_isbn + asin cleanup), another day for the medium-priority sweeps. Lower-priority items can wait for V2 features that require them.

### Acceptance

- [ ] Feedback log exists and is being maintained
- [ ] At least one iteration cycle (build N+1) shipped to TestFlight in response to feedback
- [ ] Decision recorded on 3D revert/keep based on actual friend signal

### Estimate

Open-ended; budget ~1 week of part-time iteration before considering Phase 7.

---

## Phase 6 — Android Pass

**Goal:** parity Android beta. Starts after iOS TestFlight is up and friends are testing.

This phase gets its own plan when Phase 5 settles. High-level scope:

- Auth checklist [§ 2d](docs/plans/2026-04-29-auth-setup-checklist.md) — Android Client ID, debug + production keystore SHA-1
- EAS Android build via `eas build --profile preview --platform android`
- Material design adjustments — back-gesture predictive behavior, tab bar elevation vs iOS, status bar tinting, edge-to-edge audit (already enabled per [app.json:22](app.json))
- Android adaptive icon variants (already in [assets/images/](assets/images/))
- Distribution: Google Play Internal Testing ($25 one-time) or sideload via EAS build link
- Phase 2's `<Surface variant="…">` abstractions and the Phase 5 `<Glass>` component pay off here — should be visual QA, not new components

Estimate when scoped: ~3–5 days assuming iOS path has shaken out the design / polish issues.

---

## Phase 7 — Full iOS App Store Launch

**Goal:** ready for the public App Store, not just TestFlight friends.

### Account deletion (Apple App Store Guideline 5.1.1(v) — required)

Edge Function with strict caller verification:

```typescript
// supabase/functions/delete-account/index.ts
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  // 1. Verify caller via their session JWT — never trust uid in body
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  // 2. Use service-role client to delete (bypasses RLS — only this function has it)
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,  // NEVER ship in app bundle
  );
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) return new Response('Delete failed', { status: 500 });

  return new Response(JSON.stringify({ ok: true }));
});
```

- [ ] Service role key only in Edge Function env, set via `supabase secrets set`. Never in `.env*`. Never behind `EXPO_PUBLIC_`.
- [ ] FK on `user_books.user_id → auth.users(id) ON DELETE CASCADE` — verify with `\d user_books` in psql, not assumed
- [ ] Rate limit: 1 deletion attempt per uid per 60s. Log attempts to a `deletion_attempts` table; reject 2nd attempt with 429
- [ ] Re-auth requirement: require Apple/Google sign-in completion within last 5 minutes before allowing the call. Enforce client-side AND server-side
- [ ] CORS: lock to the app's bundle scheme; reject browser origins
- [ ] In-app UX: Profile → Settings → "Delete Account" (red destructive). Two-step confirm with typed-confirm. On success, clear AsyncStorage + Supabase session, route to login, one-time toast "Account deleted." Partial-failure path: retry once, then surface "Some data may take up to 24h to remove. Contact support."

### Privacy policy (App Store + Apple Sign-In review require)

- [ ] Host at a stable URL (Notion public, GitHub Pages, Vercel static — any work)
- [ ] Cover: data collected (Apple/Google identifier + email, optionally first/last name on first Apple sign-in; shelf state; no analytics, no ads, no tracking); data NOT collected (be explicit); third parties (Supabase as data processor, region); deletion mechanism (in-app); contact email; effective date
- [ ] Privacy nutrition labels in App Store Connect MUST exactly match the policy text — mismatches are a frequent rejection cause

### OAuth consent screen (Google) → "In production"

- [ ] Verify scopes are still `email, profile, openid` only (non-sensitive — skips full verification process)
- [ ] App homepage URL + privacy policy URL filled
- [ ] App logo (120×120 PNG, no transparency)
- [ ] Authorized domains list verified
- [ ] After publish: anyone with a Google account can sign in (test-user gating drops)

### App Store Connect metadata

- [ ] Screenshots — 6.7" iPhone (1290×2796) required + optionally 6.5"/5.5"; 3–5 per size showing real flows: login, catalog grid, book detail, scanner result, bookshelf
- [ ] Apple Sign-In must be **visually equal-prominence** to Google sign-in (Guideline 4.8) — already done in [login.tsx](app/(auth)/login.tsx); verify
- [ ] Description, keywords, support URL, age rating questionnaire
- [ ] Promotional text + what's new + categories

### Apple JWT rotation

- [ ] **Pull rotation reminder forward to 2026-09-15** (5 months) instead of 10-15 (cuts the 30-day cushion before the 10-29 expiry deadline). Update the existing scheduled remote agent
- [ ] Document rotation runbook in repo: which `.p8` file, which Key ID + Team ID + Service ID, regenerate via Supabase docs link, paste into cloud Supabase Dashboard → Apple provider, ALSO update `supabase/.env` for local
- [ ] Optional: synthetic Apple sign-in probe weekly via Edge Function + cron; pages on failure

### Submit + review

- [ ] Submit for App Store Review (separate from Beta App Review). 1–3 day cycle typical
- [ ] Address review notes
- [ ] Release: manual or automatic on approval

### Acceptance

- [ ] Privacy Policy URL public and matches App Store Connect privacy questionnaire
- [ ] Account deletion verified end-to-end on TestFlight before submission. Test: user A cannot delete user B (security regression test)
- [ ] App Store Connect metadata complete
- [ ] Submitted, reviewed, live

### Estimate

~1 week part-time. Mostly metadata + screenshots; Edge Function + privacy policy ~1 day each.

---

## Cross-cutting risks (compressed)

| Risk | Mitigation |
|---|---|
| EAS env-var topology surprises (build-time embedding, secret leakage) | Phase 1 explicit subtask. EXPO_PUBLIC_* are public-by-design; service role + .p8 are EAS Secrets only. |
| React Compiler memoization breaks Reanimated worklets / expo-image cache | `'use no memo'` directives where needed; pin Reanimated 4.1+ when available |
| Apple JWT expiry (2026-10-29) causes silent sign-in failures for users | Reminder pulled forward to 2026-09-15; rotation runbook documented |
| Apple Sign-In name lost on first-run race | Persist to AsyncStorage before Supabase call (Phase 3 fix) |

## Success metric

You text three friends "try this" and they install OssusArchives on their iPhones, sign in with Apple or Google, scan a book, see it on their shelf — without you having to walk them through anything.

That's TestFlight success. App Store launch is whenever after that.

---

## References

- Master plan: [docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md](docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md)
- Auth checklist: [docs/plans/2026-04-29-auth-setup-checklist.md](docs/plans/2026-04-29-auth-setup-checklist.md)
- Dark Cinematic Design System: [docs/plans/2026-04-20-feat-dark-cinematic-design-system-plan.md](docs/plans/2026-04-20-feat-dark-cinematic-design-system-plan.md)
- 3D Book Covers parent: [docs/plans/2026-04-10-feat-3d-book-covers-plan.md](docs/plans/2026-04-10-feat-3d-book-covers-plan.md)
- 3D real-mesh (deferred): [docs/plans/2026-05-01-feat-3d-book-covers-real-mesh-renderer-plan.md](docs/plans/2026-05-01-feat-3d-book-covers-real-mesh-renderer-plan.md)
- 3D Book Covers Design Brief: [docs/brainstorms/2026-04-22-3d-book-covers-design-brief.md](docs/brainstorms/2026-04-22-3d-book-covers-design-brief.md)
- Design context: [.impeccable.md](.impeccable.md), [CLAUDE.md](CLAUDE.md)
- [EAS Build docs](https://docs.expo.dev/build/introduction/)
- [TestFlight docs](https://developer.apple.com/testflight/)
- [@callstack/liquid-glass (community RN wrapper)](https://github.com/callstack/liquid-glass)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines)
- [Sign in with Apple HIG](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
