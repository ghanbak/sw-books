---
title: Deploy the Admin Tool to Vercel — Checklist
type: ops
date: 2026-06-02
---

# 🚀 Deploy the Admin Tool to Vercel — Checklist

Deploys the Next.js app (`admin/`) to Vercel: public `/` (marketing stub) +
`/privacy`, and the auth-gated catalog at **`/admin/*`** (Phase C gate).
Pairs with `2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md`.

---

## ⚠️ 0. Prerequisite — the code must be on the branch Vercel deploys

The New Project screen imports **`ghanbak/sw-books @ main`**. All the admin work
(auth gate, local/prod switch, add/delete/merge, `/admin` restructure) lives on
**`ossusarchives-domain-setup`**, which is **not pushed and not merged to main**.
Deploying `main` as-is would ship none of it.

Pick one:
- **Push the feature branch and deploy from it** (keeps `main` clean):
  `git push -u origin ossusarchives-domain-setup`, then in Vercel after import →
  **Settings → Git → Production Branch → `ossusarchives-domain-setup`** → redeploy.
- **Or merge to `main` first**, then deploy `main`.

> Nothing is pushed yet (hold-remote agreement). Say the word and I'll push the branch.

---

## 1. New Project settings (match these to the screenshot fields)

| Field | Set to | Why |
|---|---|---|
| **Project Name** | `sw-books` (or `ossusarchives-admin`) | cosmetic |
| **Application Preset** | **Next.js** (currently "Other") | so Vercel uses `next build` + Next output |
| **Root Directory** | **`admin`** (currently `./`) | the admin is a sub-package; the Expo app at the repo root is not what we deploy |
| **Include files outside the root directory** | **✅ ON** (checkbox under Root Directory → Edit) | the admin imports `../lib/*` (via `@app/*`) and reads `../data/` — the build fails without this |
| **Build & Output Settings** | leave default once Preset = Next.js | auto: `next build` |

The **#1 cause of a failed first build** is forgetting "Include files outside the
root directory" — without it, the build can't resolve `@app/*` (→ `../lib`).

The catalog will live at **`https://<domain>/admin/books`**; `/` and `/privacy`
are public.

---

## 2. Vercel environment variables

Add these (Environments: **Production and Preview** is fine — the auth gate
enforces on Preview builds too). Mark the two `*_SERVICE_ROLE_KEY` values
**Sensitive**. **Never** prefix server-only vars with `NEXT_PUBLIC_`.

**Data layer (the local/prod switch).** "Local" is meaningless on Vercel, so set
the LOCAL pair to the **prod** values too — then either switch position works:

| Key | Value |
|---|---|
| `SUPABASE_PROD_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_PROD_SERVICE_ROLE_KEY` | prod **secret** key (Sensitive) |
| `SUPABASE_LOCAL_URL` | same as `SUPABASE_PROD_URL` |
| `SUPABASE_LOCAL_SERVICE_ROLE_KEY` | same as the prod secret (Sensitive) |

**Auth gate (these are publishable/safe):**

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod Supabase URL (same as above) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod **publishable / anon** key |
| `ADMIN_USER_IDS` | **leave blank** for the first deploy (you fill it in §5) |
| `ADMIN_ALLOWED_ORIGIN` | your deployed origin, e.g. `https://sw-books.vercel.app` (or the custom domain) |

**Optional:**

| Key | Value |
|---|---|
| `GOOGLE_BOOKS_API_KEY` | enables Google Books lookups (else OL-only) |
| `NEXT_PUBLIC_SITE_URL` | canonical host for `sitemap.xml`/`robots.txt` (defaults to `https://ossusarchives.com`) |

---

## 3. GitHub Actions secrets — catalog backup (web-plan Phase D)

The scheduled backup workflow (`.github/workflows/catalog-backup.yml`) needs two
**repo secrets** — these live in GitHub, **not** Vercel. Repo → **Settings →
Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | prod project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_READONLY_KEY` | prod **publishable / anon** key — read-only via the `books` RLS policy. **Not** the service-role key. |

The cron fires only from the **default branch**, so the nightly backup starts once
this is merged to `main`. Before that, test it via **Actions → Catalog CSV Backup
→ Run workflow** (runs on any branch).

---

## 4. Supabase redirect URL (one-time, prod project)

In the **production** Supabase dashboard → **Authentication → URL Configuration →
Redirect URLs**, add the callback for each host you'll use:

```
https://<custom-domain>/auth/callback        # e.g. https://ossusarchives.com/auth/callback
https://<project>.vercel.app/auth/callback    # the Vercel-assigned URL
http://localhost:3100/auth/callback           # only if you test the login flow locally
```

Notes:
- The callback route is `/auth/callback` (root-level, public) — **not** under `/admin`.
- Google OAuth is already configured for the app; only the app's callback URL(s)
  need allow-listing here.
- Optionally set **Site URL** to the custom domain.

---

## 5. Deploy & allowlist bootstrap

1. Set the Vercel env (§2) and GitHub secrets (§3); add the redirect URL (§4).
2. Deploy → visit **`/admin`** → it redirects to `/login` → sign in with Google.
3. Since `ADMIN_USER_IDS` is blank, `/login` shows **"not on the allowlist"** with your **user id**.
4. Paste that id into `ADMIN_USER_IDS` in Vercel → redeploy → you're in at `/admin/books`.

---

## 6. Post-deploy verification

- [x] `/` (marketing) and `/privacy` load **publicly**, no login.
- [x] `/robots.txt` and `/sitemap.xml` resolve and list only the public pages.
- [x] `/admin/*` while logged out → redirects to `/login`.
- [ ] After Google sign-in with an allowlisted id → `/admin/books` loads.
- [ ] The Local/Prod switch shows **Production** data; add / edit / delete works against prod.
- [ ] (Phase D) **Actions → Catalog CSV Backup → Run workflow** succeeds and commits `data/catalog-backup.csv` only when prod changed.

---

## 7. Account-deletion flow — Expo app (required before store submission)

The `/privacy` page promises **in-app account deletion + Apple token revocation**.
That lives in the **Expo app** (not this admin repo) and is a **hard Apple/Google
submission blocker**. Still to build:

1. **Supabase Edge Function `delete-account`** (runs server-side with the
   service-role key — never ship that key in the app):
   - Verify the caller's JWT → derive `user.id` server-side (never trust a client-passed id).
   - `delete from user_books where user_id = <uid>` (or rely on `on delete cascade`).
   - `supabase.auth.admin.deleteUser(uid)` to remove the Auth user.
   - **Sign in with Apple:** `POST https://appleid.apple.com/auth/revoke` with a
     `client_secret` JWT (ES256, signed with your `.p8`) to revoke the user's
     tokens. Requires capturing + storing the Apple refresh token at sign-in.
   - Return success only after all steps complete.
2. **In-app entry point:** a **"Delete account"** button in Settings → confirm
   dialog → invoke the Edge Function with the user's JWT → sign the user out →
   confirm. Must be easy to find and available in **all regions** (Apple 5.1.1(v)).
3. **Web deletion URL (Google Play):** an HTTPS page (can live on
   `ossusarchives.com`) that lets a user request deletion **without re-downloading
   the app**, links directly to the request, and states what's deleted + timeline.
4. **Store consoles:**
   - Set the Privacy Policy URL `https://ossusarchives.com/privacy` in **App Store
     Connect** *and* **Play Console**.
   - Complete Apple **App Privacy** + Google **Data safety** forms (consistent with
     the policy); add the **Data deletion** web URL in Play.
   - Confirm/replace the policy's contact email (currently the `privacy@ossusarchives.com` placeholder).

Refs: Apple Guideline 5.1.1(v) + TN3194 (Sign-in-with-Apple token revocation);
Google Play account-deletion policy; `supabase.auth.admin.deleteUser`.

---

## 8. Known caveats on the hosted instance

- **`/admin/diff` → "Export to CSV"** writes to the local filesystem (`../data`),
  which is **read-only on Vercel** — that button errors there. Backups are the
  scheduled GitHub Action (§3) / local `npm run catalog:backup`.
- **The drift badge** compares against the repo's frozen `data/books.csv`, so it
  reads as noisy/meaningless when hosted — harmless.
- **The Local/Prod switch** "Local" position can't reach `127.0.0.1` from Vercel;
  it's pointed at prod via the env above. (Optional cleanup: hide the switch when
  hosted.)
- **Auth enforces only in production builds.** Vercel builds are production, so
  the gate is active. If you ever set `NODE_ENV` otherwise, the gate disables —
  don't.
