---
title: Deploy the Admin Tool to Vercel — Checklist
type: ops
date: 2026-06-02
---

# 🚀 Deploy the Admin Tool to Vercel — Checklist

Deploys the Next.js admin (`admin/`) to Vercel, gated by the Phase C auth gate.
Pairs with `2026-05-30-feat-ossusarchives-web-and-hosted-admin-plan.md`.

---

## ⚠️ 0. Prerequisite — the code must be on the branch Vercel deploys

The New Project screen shows it importing **`ghanbak/sw-books @ main`**. All the
admin work (auth gate, local/prod switch, add/delete/merge) lives on
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

---

## 2. Environment Variables

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

**Auth gate (production only — these are publishable/safe):**

| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod Supabase URL (same as above) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod **publishable / anon** key |
| `ADMIN_USER_IDS` | **leave blank** for the first deploy (you fill it in step 5) |
| `ADMIN_ALLOWED_ORIGIN` | your deployed origin, e.g. `https://sw-books.vercel.app` (or the custom domain) |

**Optional:**

| Key | Value |
|---|---|
| `GOOGLE_BOOKS_API_KEY` | enables Google Books lookups (else OL-only) |

---

## 3. Supabase redirect URL (one-time, prod project)

In the **production** Supabase dashboard → **Authentication → URL Configuration →
Redirect URLs**, add:

```
https://<your-domain>/auth/callback
```

(Google OAuth is already configured for the app; only the app's callback URL
needs allow-listing. Add both the `*.vercel.app` URL and the custom domain if you
use one.)

---

## 4. Deploy & allowlist bootstrap

1. Set in Vercel (Production): `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (your prod, publishable values) and `ADMIN_USER_IDS` (leave blank for first login).
2. In the prod Supabase dashboard → Auth → URL Configuration → Redirect URLs, add `https://<your-domain>/auth/callback`.
3. Deploy → hit `/login` → sign in with Google → it'll say "not on the allowlist" and show your user id.
4. Paste that id into `ADMIN_USER_IDS`, redeploy → you're in.

---

## 5. Post-deploy verification

- [ ] Visiting any route while logged out → redirects to `/login`.
- [ ] After Google sign-in with an allowlisted id → catalog loads.
- [ ] The Local/Prod switch shows **Production** data (Local won't differ since both point at prod).
- [ ] Add / edit / delete works against prod.

---

## 6. Known caveats on the hosted instance

- **`/diff` → "Export to CSV"** writes to the local filesystem (`../data`), which
  is **read-only on Vercel** — that button errors there. Backups stay a local/CI
  job (`npm run catalog:backup`); the scheduled GitHub Action is web-plan Phase D.
- **The drift badge** compares against the repo's frozen `data/books.csv`, so it
  reads as noisy/meaningless when hosted — harmless.
- **The Local/Prod switch** "Local" position can't reach `127.0.0.1` from Vercel;
  it's pointed at prod via the env above. (Optional cleanup: hide the switch when
  hosted.)
- **Auth enforces only in production builds.** Vercel builds are production, so
  the gate is active. If you ever set `NODE_ENV` otherwise, the gate disables —
  don't.
