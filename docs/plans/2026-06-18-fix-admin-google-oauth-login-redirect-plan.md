---
title: "fix: Admin Google OAuth login bounces back to /login in production"
type: fix
date: 2026-06-18
status: proposed
area: admin (Next.js on Vercel) + Supabase Auth
---

# 🐛 fix: Admin Google OAuth login bounces back to `/login` in production

## Overview

On the production admin site (`https://ossusarchives.com`, the Next.js app under
`admin/`), signing in with Google returns the user to **`/login`** instead of
landing on `/admin/books`. Google + Supabase authentication itself **succeeds**,
but the app never establishes a usable session — so the gate bounces the user
straight back out.

This path is **never exercised locally** (local `next dev` is ungated via
`ADMIN_ENFORCED = NODE_ENV === 'production'`), so this is a **first-ever-use
production bug**: the code path has not successfully run anywhere yet. The deploy
checklist's final verification line —
`After Google sign-in with an allowlisted id → /admin/books loads` — is still
**unchecked** in [`docs/plans/2026-06-02-deploy-admin-to-vercel-checklist.md`](2026-06-02-deploy-admin-to-vercel-checklist.md).

## Problem Statement

### Expected
`/login` → "Sign in with Google" → Google → `/auth/callback` → **`/admin/books`** (signed in).

### Actual
`/login` → "Sign in with Google" → Google → `/auth/callback` → **`/login`** (plain
"Sign in with Google" button, as if never signed in).

### Evidence collected (established baseline — do not re-investigate)

| Source | Finding |
|---|---|
| **Supabase auth logs** | Google login **succeeds** at GoTrue. `actor=ghanbak@gmail.com`, `sub=936c80a8-65be-4750-bb54-cfe07bd83769`. `/authorize 302` → GoTrue `/callback 302` with an `action:"login"` event. Whole flow on apex `https://ossusarchives.com`; `redirectTo=https://ossusarchives.com/auth/callback?next=/admin/books`. |
| **Vercel runtime trace (prod)** | `GET /login 200` → `GET /auth/callback 307` → `GET /login 200`. **No `/admin/books`** serverless hit between callback and login (Edge-middleware redirects may not appear in that log view, so this is suggestive, not conclusive). |
| **User-observed** | After the bounce, `/login` shows **only** the plain "Sign in with Google" button — **no** "not on the allowlist" card and **no** user-id. ⇒ `/login`'s server-side `getClaims()` returns nothing ⇒ **no readable session**. |
| **Env** | `ADMIN_USER_IDS` **is set** in Vercel production (user-confirmed). ⇒ the allowlist is **not** the cause. |
| **Code audit** | `@supabase/ssr@0.10.3` + `@supabase/supabase-js@2.103`. Both `createBrowserClient` and `createServerClient` default to `flowType:'pkce'` + cookie storage. Callback/middleware/login match the canonical Supabase Next.js patterns — no obvious code-level defect. |
| **Key format** | Auth uses the **new** `sb_publishable_…` key (not a legacy anon JWT). This is the most recent change to the auth surface and the strongest "never worked" correlate. |

### Ruled in / out

- **OUT — empty allowlist.** `ADMIN_USER_IDS` is populated, and a not-allowlisted
  authenticated user would see the id card ([`login/page.tsx:33-45`](../../admin/app/login/page.tsx)). The user sees the plain button.
- **IN — no readable session ever exists.** The callback redirects to `/login`
  (not `/admin/books`) **and** `/login`'s `getClaims()` returns nothing.

## Root cause is currently *unobservable* — and that's the bug to fix first

[`admin/app/auth/callback/route.ts:17-18`](../../admin/app/auth/callback/route.ts)
**swallows** the failure: `const { error } = await supabase.auth.exchangeCodeForSession(code); if (!error) {…}`
and otherwise silently `redirect('/login')`. The candidate causes below are
**symptom-identical from the outside** (all produce "bounce to plain `/login`"),
so they can only be separated by capturing the actual error. Un-swallowing it is
both the diagnostic *and* the permanent fix.

### Co-primary hypotheses

- **H-A — PKCE verifier cookie not readable at exchange.** `signInWithOAuth`
  writes `sb-<ref>-auth-token-code-verifier`; the callback must read it. If absent,
  `exchangeCodeForSession` returns **"both auth code and code verifier should be
  non-empty"**. On a *single apex domain* the cookie is same-origin and `SameSite=Lax`
  is sent on the top-level GET return — so this only bites on a **host mismatch**
  (login starts on `www`/`*.vercel.app` but returns to apex) or a Supabase
  **Site URL / Redirect-URL** gap.
- **H-B — `getClaims()` fails at the Edge.** Exchange *succeeds* and sets a cookie,
  but [`supabase-middleware.ts:43`](../../admin/lib/supabase-middleware.ts) and the
  login page can't verify it. With the new `sb_publishable_…` key + asymmetric JWT
  signing keys, `getClaims()` does a JWKS fetch in the **Edge runtime** (or falls
  back to a GoTrue round-trip). A failure here yields the identical symptom. This is
  co-equal with H-A, not secondary.
- **H-D — callback's `setAll` swallows the cookie write.** [`supabase-auth.ts:39-41`](../../admin/lib/supabase-auth.ts)
  wraps `cookieStore.set` in a `try/catch` that silently ignores failures. That's
  valid for a *Server Component*, but the callback is a **Route Handler** where the
  write must succeed to persist the session. If it throws and is swallowed, the
  session cookie is never written → identical symptom. Cheap to probe.

### Contingency

- **H-C — code reuse / double-invocation / TTL.** The trace shows a single
  `/auth/callback` hit, so this is nearly dead. Phase 1 logging confirms or kills it
  for free; do **not** build idempotency unless the logs demand it.

## Plan

> ⚠️ Not reproducible in local `next dev` (ungated). Every verification step runs
> against a Vercel **preview or production** deploy.

### Phase 1 — Un-swallow the failure (GATING + permanent fix)

One change set that captures the verbatim error and is also the correct hardening.

- [ ] **`admin/app/auth/callback/route.ts`** — on exchange error, `console.error`
  the `error.message`/`error.status` **and** a boolean for whether a
  `*-auth-token-code-verifier` cookie was present (booleans/codes only — never
  cookie values). Redirect to `/login?error=<code>` using a fixed enum
  (`exchange_failed`, `missing_code`). Leave the success path unchanged.
- [ ] **`admin/lib/supabase-auth.ts`** — in the `setAll` catch, `console.warn` that
  the write was skipped (distinguishes **H-D**). Keep behavior otherwise.
- [ ] **`admin/lib/supabase-middleware.ts`** — temporary `console.warn` recording
  whether `getClaims()` returned an `error` vs returned `claims` whose `sub` isn't
  allowlisted (distinguishes **H-A/H-D** from **H-B**). Remove after root-cause.
- [ ] **`admin/app/login/page.tsx`** — render an inline notice when `?error=` is
  present, via a `Record<ErrorCode, string>` lookup with a default. **Never** echo
  `searchParams.error` into JSX.
- [ ] Deploy to a **preview** (or prod), reproduce the Google login once, and read:
  `/auth/callback` serverless logs, `/admin` edge-middleware logs, and the `?error=`
  code on `/login`.

**Exit criteria:** the verbatim error tells us which of H-A / H-B / H-D is true.

### Phase 2 — Apply the matching fix

Read the captured error, then do **one** branch. Expected: **H-A** (host/redirect
config) or **H-B** (key/JWKS). Try config/host changes **before** touching cookie
options on working files.

- **H-A (verifier missing):** In **Supabase → Auth → URL Configuration** (prod
  `skygqzyjaiwefqmpfsya`): set **Site URL** = `https://ossusarchives.com` (the
  checklist left this "optional") and ensure **Redirect URLs** include
  `https://ossusarchives.com/auth/callback` + `https://ossusarchives.com/**`.
  **Enforce one canonical host** (apex; `www`/`*.vercel.app` redirect to it or
  aren't used to start login). _Only if_ Phase 1 proves the verifier is written but
  not returned **and** a host hop is involved, mirror `cookieOptions` on both
  clients — otherwise skip it (`sameSite:'lax'`/`secure`/`path:'/'` are already SSR
  defaults; no-op on a single apex domain).
- **H-B (`getClaims` errors):** Confirm JWT **signing keys** are configured and the
  Edge runtime can reach the JWKS endpoint with the new key format. If asymmetric
  verification is unreliable at Edge, fall back to `getUser()` in the middleware
  (note: a GoTrue round-trip per `/admin/*` request — acceptable for a one-user
  admin tool; make it a deliberate, commented choice).
- **H-D (swallowed write):** Persist the session cookie reliably from the route
  handler — don't let the `setAll` catch hide a real write failure in this context
  (set cookies onto the redirect response, or surface/handle the error instead of
  ignoring it). Keep the Server-Component swallow only where it's actually needed.
- **H-C (contingency):** if logs show a double hit, make the handler idempotent
  (treat "code already used" + a valid session as success).

### Phase 3 — Reconcile `ADMIN_ALLOWED_ORIGIN` + verify e2e

`ADMIN_ALLOWED_ORIGIN` is a confirmed latent bug on the same first-use surface — it
will break **Server Actions** (catalog saves) the moment login works.

- **Current:** `https://admin.ossusarchives.com/` → flows into
  `serverActions.allowedOrigins: [allowedOrigin]` ([`next.config.ts:20`](../../admin/next.config.ts)).
  Next 15 wants a **bare host**; the value has a scheme, a trailing slash, **and**
  the wrong host (`admin.ossusarchives.com` isn't a Vercel project domain).
- [ ] Set Vercel `ADMIN_ALLOWED_ORIGIN` to the actual deployed host, bare:
  `ossusarchives.com`. Update [`.env.local.example`](../../admin/.env.local.example)
  guidance (host only — no scheme, no slash). _No sanitizer code_ — the value is
  yours to set correctly.
- [ ] **Verify on the deploy:** allowlisted Google sign-in lands on `/admin/books`
  and persists across navigation; a catalog edit (Server Action) **saves** without a
  CSRF/origin rejection.
- [ ] Tick the open verification box in
  [`2026-06-02-deploy-admin-to-vercel-checklist.md`](2026-06-02-deploy-admin-to-vercel-checklist.md).
- [ ] Record the root cause in `docs/solutions/` (currently empty) for the next
  Supabase-SSR-on-Vercel setup.

## Acceptance Criteria

- [ ] Production Google sign-in reaches `/admin/books` and the session persists.
- [ ] On failure, `/login` shows a real (mapped) error and the server logs the exact
      `exchangeCodeForSession` / `getClaims` / `setAll` outcome — no silent reset.
- [ ] Server Actions succeed from the deployed host (`ADMIN_ALLOWED_ORIGIN` fixed).
- [ ] Deploy-checklist line ticked; root cause recorded in `docs/solutions/`.

## Notes

- **Security:** log only booleans/error-codes, never cookie values or tokens. The
  middleware is *not* the sole boundary (CVE-2025-29927) — every privileged Server
  Action re-checks via `getAdmin()`; preserve that.
- **No local repro:** the gate is prod-only; rely on preview/prod deploys + logs.
- **Conventions:** Biome (not ESLint/Prettier), TS strict, terse comments, no Claude
  attribution on commits/PRs. Auto-commit locally; don't push/PR until told.

## Key Files

- [`admin/app/auth/callback/route.ts`](../../admin/app/auth/callback/route.ts) — swallowed exchange error (Phase 1; H-A/H-D)
- [`admin/lib/supabase-auth.ts`](../../admin/lib/supabase-auth.ts) — `setAll` swallow (Phase 1; H-D)
- [`admin/lib/supabase-middleware.ts`](../../admin/lib/supabase-middleware.ts) — Edge `getClaims` gate (Phase 1; H-B)
- [`admin/app/login/page.tsx`](../../admin/app/login/page.tsx) — surface `?error=` via typed map (Phase 1)
- [`admin/app/login/_components/sign-in-button.tsx`](../../admin/app/login/_components/sign-in-button.tsx) — browser client (only if H-A cookie-option fallback needed)
- [`admin/next.config.ts`](../../admin/next.config.ts) — `serverActions.allowedOrigins` (Phase 3)
- Supabase dashboard → Auth → URL Configuration (Phase 2, H-A) · Vercel env + Domains (Phase 2/3)

## References

- Deploy checklist: [`docs/plans/2026-06-02-deploy-admin-to-vercel-checklist.md`](2026-06-02-deploy-admin-to-vercel-checklist.md)
- Hosted-admin plan: [`docs/plans/2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md`](2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md)
- Supabase project ref: `skygqzyjaiwefqmpfsya` · Vercel project: `sw-books` (`prj_yhanJ9dmjaomCQpFUqdXo77oPb4d`)
