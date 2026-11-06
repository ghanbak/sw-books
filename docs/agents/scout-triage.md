# Scout + triage

Goal: find real problems with evidence, then turn every untriaged issue into a labeled, prioritized item the execute loop can pick up. This loop writes no code.

Follow [README.md](README.md) shared rules first.

## 1. Scout (one focus per run)

Pick the focus from the current local hour: `(hour / 4) % 4` → 0 bugs, 1 design drift, 2 performance + accessibility, 3 data + dependencies. Work in a fresh worktree on `origin/main`.

- **Bugs** (Brandon for data/server, Luis for app, Dylan for web/admin): run `npm run verify` and `verify:admin`; read commits merged since the last scout run for regressions; check Vercel runtime errors for the web/admin project if the Vercel tools are available; look for unhandled promise rejections, missing error/empty/loading states, and RLS gaps in `supabase/migrations`.
- **Design drift** (Tregg): compare `app/` and `components/` against the Design Context in CLAUDE.md. Hardcoded colors instead of tokens, the yellow accent used outside scanner/badges/emphasis, covers not being the visual hero, inconsistent spacing or radii, missing reduced-motion handling. Quote the rule each finding breaks.
- **Performance + accessibility** (Luis for app, Dylan for web): list rendering (FlashList usage, keys, memoization), heavy work on the JS thread, image sizes, bundle size for admin; missing accessibility labels/roles, touch targets under 44pt, contrast against the documented tokens.
- **Data + dependencies** (Brandon): `npm audit --omit=dev` at the root and in `admin/`, outdated packages with known CVEs, catalog data checks the existing scripts support in local/read-only mode.

Rules for filing:
- At most 3 new issues per run. Prefer one well-evidenced issue over three vague ones.
- Search first: `gh issue list --repo ghanbak/sw-books --state all --search "<key terms>"`. If it exists, comment new evidence instead of filing a duplicate.
- Use the matching issue form's fields (Bug, Design drift, or Feature) in the body. Include file paths with line numbers and the exact error or rule. Labels: the type label, `triage`, `source:scout`, the product label.
- Nothing found → file nothing. Say so in the summary.

## 2. Triage (every open issue labeled `triage`, including the owner's)

For each issue:
- Set exactly one tier label using the README tier rules. When unsure between two tiers, pick the stricter one.
- Set the owner label (`agent:tregg|luis|dylan|brandon`) and product label (`product:app|web|admin`, `area:data`).
- Add it to the Roadmap project if missing and set fields: Priority (P0 broken production, auth or data loss; P1 user-visible bug or blocker; P2 normal; P3 nice-to-have), Product, Effort (S/M/L).
- Fill in missing acceptance criteria and a "How to verify" section as a comment if the author left them blank.
- Status: `Todo` if it's eligible for the execute loop (`tier:auto-merge` or `tier:auto-pr`, or `tier:needs-approval` with `approved`) and Effort is S or M; otherwise `Backlog`. Effort L goes to `Backlog` with a comment proposing how to split it.
- Remove the `triage` label.

Keep at most 6 items in `Todo`; extra eligible items stay in `Backlog`, highest priority first.

## 3. Summary
Issues filed (numbers), issues triaged with tier and priority, anything P0 called out on its own line.
