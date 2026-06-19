---
title: "Admin prod login bounced to /login, then catalog 'fetch failed'"
date: 2026-06-18
tags: [admin, supabase, auth, oauth, pkce, vercel, env, api-keys]
area: admin (Next.js on Vercel) + Supabase Auth
symptoms:
  - "Google sign-in on https://ossusarchives.com redirects back to /login"
  - "Login page shows only 'Sign in with Google' (no session, no allowlist card)"
  - "After login works: 'Failed to load catalog: TypeError: fetch failed'"
status: resolved
---

# Admin prod login redirect → then catalog "fetch failed"

First-ever production use of the hosted admin hit **two stacked bugs**. Neither
reproduces locally (local `next dev` is ungated *and* points at the local DB).

## Bug 1 — OAuth bounce: wrong Supabase publishable key

**Symptom:** Google login succeeds at Supabase (auth logs show the `login`
event), the browser returns to `/auth/callback`, but the app bounces to `/login`
with no session.

**Root cause:** `exchangeCodeForSession()` failed with **`Invalid API key`**.
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (in Vercel + local `.env.local`) was
`sb_publishable_ACJW…`, which **isn't a valid key for this project**. The real
publishable key is `sb_publishable_rx0Y…` (Supabase → Project Settings → API).

**Why it was sneaky:**
- Supabase's `/authorize` is lenient about the apikey, so login *appears* to
  start. Only `/token` (the PKCE code exchange) strictly validates it → fails
  there.
- `app/auth/callback/route.ts` was **swallowing** the exchange error
  (`if (!error) {…}` else silent `redirect('/login')`), so nothing was logged.
  Fix step 1 was to stop swallowing it and surface a `?error=` on `/login` —
  that immediately revealed `Invalid API key`.
- `NEXT_PUBLIC_*` is **inlined at build time** → after fixing the Vercel env var
  you must **redeploy** (a fresh build), not just save the variable.

**Fix:** set `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the project's actual publishable
key in Vercel, redeploy. (Local `.env.local` corrected too, though it's moot
locally since the gate is off.)

## Bug 2 — Catalog "fetch failed": DB target defaulted to local

**Symptom:** login works, lands on `/admin/books`, but
`Failed to load catalog: TypeError: fetch failed`.

**Root cause:** `getDbTarget()` (in `lib/supabase-admin.ts`) defaulted to
`local` when there was no `admin-db-target` cookie. On Vercel that means querying
`http://127.0.0.1:54321` → connection refused → `fetch failed`. Worse, the books
page returns **early** on a query error and does **not** render the Local/Prod
switch, so you can't toggle to prod to recover (chicken-and-egg).

**Fix:** default the DB target to `prod` when `ADMIN_ENFORCED` (hosted), `local`
otherwise (commit `eea8036`). The cookie still overrides when set.

## Debugging technique worth reusing

The Vercel runtime-logs MCP truncates the message column. To read a swallowed
error's full text, **probe full-text queries** against the log line
(`query: "invalid"`, `"API key"`, `"code_verifier_cookie=true"`, …) — a match vs
no-match reveals the hidden substring without seeing the full string.

## Watch next

`SUPABASE_PROD_SERVICE_ROLE_KEY` and `SUPABASE_LOCAL_SERVICE_ROLE_KEY` were the
**same** value in `.env.local` — at least one is wrong. If a prod catalog
*write* (Server Action) ever fails with `Invalid API key`, the prod **secret**
key in Vercel needs the same correction (secret keys aren't readable via API;
copy from the Supabase dashboard).
