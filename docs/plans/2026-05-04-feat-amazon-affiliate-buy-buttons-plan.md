---
title: "feat: Amazon Affiliate Buy Buttons"
type: feat
date: 2026-05-04
parent: docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md
---

# Amazon Affiliate Buy Buttons

## Overview

Add a "Find on Amazon" button on the book detail screen that opens Amazon search results filtered to the Books category, querying by the book's ISBNs. Affiliate tag `ghanbak-20` appended to every URL so any resulting purchase credits the user's Associates account.

**No API calls.** Pure URL construction. The Creator API and PA-API are not used — they're referenced only for verifying URL parameter structure.

## Problem Statement

Books in the catalog need a path to purchase. The original master plan called for constructing direct product URLs from the `asin` column. After populating that column from the seed data, **most ASINs turned out to be wrong** (mismatched editions, dead listings, ASINs from completely different books). The column is poisoned and not worth fixing case-by-case.

ISBNs in the catalog (now multi-format per [2026-04-22 plan](docs/plans/2026-04-22-db-multi-format-isbn-and-covers-plan.md)) are reliable. ISBNs map cleanly to Amazon's search index — Amazon stores ISBN-10 and ISBN-13 on every book listing.

## Proposed Solution

A single "Find on Amazon" button on the book detail screen that opens Amazon's search results page in `SafariViewController` (via `expo-web-browser`). The URL is constructed at click time from a single ISBN per book.

**Strategy verified empirically (May 2026):**
- Amazon's search auto-filters to the user's region — US users on `amazon.com` get only US editions, no foreign-language noise
- A *single* ISBN search returns a results page surfacing all available variants for that book (hardcover, paperback, eBook, audiobook). Amazon's catalog cross-references editions and merges them in the listing
- Conclusion: **single ISBN, paperback-preferred** beats multi-ISBN concatenation for both URL cleanliness and result quality

### URL pattern

```
https://www.amazon.com/s?k=<single-isbn>&i=stripbooks&tag=ghanbak-20
```

Components:
- `s` → search results endpoint
- `k` → keyword query (Amazon's standard search param)
- `i=stripbooks` → filter to Books category (cuts Kindle Singles standalone listings, accessory items)
- `tag=ghanbak-20` → Amazon Associates tracking tag; commissions credit the user

Real example using `Thrawn Ascendancy: Chaos Rising` paperback ISBN:
```
https://www.amazon.com/s?k=9780593158319&i=stripbooks&tag=ghanbak-20
```

User lands on a results page showing all available formats (hardcover/paperback/eBook/audiobook) with paperback typically the default-selected variant. They pick the binding they want and proceed through Amazon's checkout.

### Picking the ISBN — known limitation for v1

**Current state:** [public.books](supabase/migrations/20260410000000_create_books_and_user_books.sql) has `format text[]` and `isbn text[]` as **non-parallel arrays**. The format column lists which formats exist for a book; the isbn column has a different cardinality. Today there's no way to identify which ISBN is the paperback specifically.

**v1 decision: use `book.isbn[0]` (first ISBN in the array).** Lands users on whatever variant Amazon matches that ISBN to — typically the most prominent edition (often hardcover or paperback, occasionally mass-market). Amazon's results page shows all available formats anyway, so the user can switch with one tap. Acceptable v1 trade-off.

**Future enhancement** (deferred to the broader data-hygiene work in [launch roadmap Phase 5](docs/plans/2026-05-04-feat-ios-testflight-launch-roadmap-plan.md)): add a denormalized `primary_isbn` column populated by the seed pipeline using OpenLibrary's `physical_format` field. Selection priority paperback → mass-market → hardcover → eBook → audiobook. When that lands, swap the buy button to read `book.primary_isbn ?? book.isbn[0]` — one-line change, graceful fallback.

### Why search results, not direct product

- ASINs in the DB are unreliable → can't use `/dp/<asin>?tag=...`
- Direct ISBN-as-ASIN (`/dp/<isbn>?tag=...`) works for some books but Amazon assigns separate ASINs for different editions; an ISBN-10 doesn't always resolve to an ASIN
- Search lets Amazon do the work of matching the ISBN to whichever editions they currently sell, including reprints we don't have an ISBN for
- Single ISBN already surfaces all formats (verified) — no need to concatenate

## Technical Approach

### URL construction utility

New file: `lib/amazon.ts` — pure function, no React, fully testable.

```ts
// lib/amazon.ts
const AMAZON_AFFILIATE_TAG = 'ghanbak-20';
const AMAZON_BASE = 'https://www.amazon.com';

/**
 * Builds an affiliate-tagged Amazon search URL for a single ISBN.
 * Filters to the Books category (i=stripbooks). Returns null if the
 * ISBN is missing or fails the length check.
 */
export function buildAmazonSearchUrl(isbn: string | null | undefined): string | null {
  if (!isbn) return null;
  const cleaned = isbn.replace(/[-\s]/g, '');
  if (cleaned.length !== 10 && cleaned.length !== 13) return null;

  const params = new URLSearchParams({
    k: cleaned,
    i: 'stripbooks',
    tag: AMAZON_AFFILIATE_TAG,
  });
  return `${AMAZON_BASE}/s?${params.toString()}`;
}
```

Caller: `buildAmazonSearchUrl(book.isbn?.[0])`. Defensive: strips hyphens/whitespace, validates length (10 or 13), returns null if no valid ISBN (caller hides the button).

### UI integration — floating sticky button

The button is **pinned to the bottom of the book detail screen**, safe-area-aware, persistent while the user scrolls the synopsis/metadata. New components:

```
components/buy-on-amazon-button.tsx     // the pressable with text + icon
components/affiliate-disclosure-sheet.tsx // tappable ⓘ → modal with disclosure copy
```

Modify [app/book/[id].tsx](app/book/[id].tsx) — wrap content in a parent `<View flex:1>`, pad the `ScrollView`'s `contentContainerStyle.paddingBottom` to clear the floating button (~96 + safe-area-bottom), then absolute-position the button container at `bottom: 0`.

**Floating container style:**
```ts
{
  position: 'absolute',
  left: 0, right: 0, bottom: 0,
  paddingHorizontal: 20,
  paddingTop: 12,
  paddingBottom: 12 + insets.bottom, // useSafeAreaInsets()
  backgroundColor: tokens.surface.background,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: tokens.border.subtle,
}
```
Use `useSafeAreaInsets()` from `react-native-safe-area-context` (already in dependencies).

**The button itself** (`<Pressable>`):
- Background: `tokens.accent.primary` (lightsaber blue `#4A90D9`)
- Foreground text: `tokens.text.inverse` (`#0A0A0C` for max contrast on the blue)
- Icon: lucide `ExternalLink` at left, signals leaves-app
- Copy: **"Find on Amazon"** (search, not direct product)
- Right side: small `ⓘ` icon (lucide `Info`) — tappable separately from the main button, opens the disclosure sheet
- Height: 52 (matches login screen sign-in buttons), borderRadius: 12

**Behavior on main press:**
1. `Haptics.impactAsync` for feedback
2. `WebBrowser.openBrowserAsync(url, { presentationStyle: 'pageSheet' })` from `expo-web-browser`
3. Sheet dismisses on user close — no callback action needed

**Behavior on `ⓘ` press:**
1. Open `<AffiliateDisclosureSheet />` modal — semi-transparent overlay with a card containing the disclosure copy
2. Disclosure copy: *"Ossus Archives is a participant in the Amazon Services LLC Associates Program. Tapping 'Find on Amazon' opens Amazon's website. As an Associate I earn from qualifying purchases — at no extra cost to you."*

If `buildAmazonSearchUrl(book.isbn)` returns null (no valid ISBNs), the entire floating container hides — no broken affordance.

### Multi-ISBN handling

**Decision: single button, all valid ISBNs concatenated in `k` query.** Simplest and most predictable. User lands on a results page that shows whichever editions Amazon currently has.

Considered alternatives:
- **Format selector sheet** ("Hardcover" / "Paperback" / "Mass-market") — would require knowing format-per-ISBN, which the seed migration may not have populated cleanly. Adds complexity for marginal UX gain.
- **Single button, smartest single ISBN** — pick paperback first, fall back to mass-market, etc. Brittle; "smartest" is hard to define and one search query is the same network cost as multi.

Future enhancement (Phase 2 in this plan): if format metadata is reliable, swap to a sheet for explicit user choice. Not v1.

### Apple App Store compliance

This is the riskiest dimension; getting it wrong = TestFlight or App Store rejection.

**Status:** **safe by default for physical books.**

- **Guideline 3.1.5(a) "Goods and Services Outside of the App"** — physical goods (books) are explicitly allowed to link out to external purchase. No StoreKit External Link entitlement required. This is the exact use case Apple permits.
- **Guideline 3.1.1 "In-App Purchase"** — only required for digital content/services consumed *in* the app. Books delivered by Amazon are physical (or e-books delivered via Amazon's own apps); not our consumption.
- **No anti-steering issues** — those rules target apps trying to circumvent IAP for digital content. Not applicable.
- **Visible external context** — open in `SafariViewController` (not in-app `WebView`) so the URL bar shows `amazon.com`. This both satisfies Apple's "transparency" expectation and is the standard expo-web-browser pattern.

**Disclosure compliance.** Required regardless of CTA wording — "Find on Amazon" doesn't dodge the rule. Three sources mandate it:
- **FTC Endorsement Guides (16 CFR § 255.5)** — disclosure is about the *material connection* (you earn commission), not the CTA verb. "Find," "Buy," "View on Amazon" are equivalent for FTC purposes.
- **Amazon Associates Operating Agreement § 5** — explicitly mandates a "clearly and conspicuously" displayed notice that the user may earn commissions. **This is the strongest enforcer in practice** — Amazon audits and can terminate the affiliate account for missing disclosure.
- **Apple App Store** — low risk for affiliate-link disclosure specifically, but expected.

**Placement: tappable ⓘ icon → disclosure sheet (chosen for this app).** Trade-off considered:

| Pattern | UX feel | Compliance | Verdict |
|---|---|---|---|
| Inline hint under button | Clearest disclosure visibility | ✅ | Cluttered against the floating-button design |
| ⓘ icon → sheet | Discoverable, not visually loud | ✅ (icon is "clearly" present, sheet is "conspicuous" once tapped) | **Chosen** |
| Footer link in About / Privacy only | Low visibility | Borderline; many would argue insufficient | Not enough on its own |

Chosen path: ⓘ next to the floating "Find on Amazon" button. Disclosure copy will also live in the eventual Privacy Policy (Phase 7 of [launch roadmap](docs/plans/2026-05-04-feat-ios-testflight-launch-roadmap-plan.md)) for belt-and-suspenders.

### Why not the Creator API / PA-API

The user explicitly prefers URL construction. Worth recording why this is also the right technical call:

- **No backend dependency.** Pure URL construction means no Edge Function, no rate limits, no API key rotation, no auth flow with Amazon.
- **Tag persistence is automatic.** The `tag=ghanbak-20` URL param survives redirects and the Amazon Associates SiteStripe machinery picks it up server-side.
- **Click reporting still works.** Amazon Associates dashboard tracks clicks/conversions on tagged URLs server-side regardless of how the URL was built.
- **Trade-off accepted:** No app-side conversion analytics, no programmatic verification a book is purchasable. v1 is fine without these.

## Acceptance Criteria

### Behavior
- [ ] Floating container hides entirely when `book.isbn[0]` is missing/invalid
- [ ] Pressing the main button opens Amazon search results in `SafariViewController` (not in-app WebView), URL bar shows `amazon.com`
- [ ] Pressing the ⓘ icon opens the disclosure sheet
- [ ] Generated URL contains `tag=ghanbak-20`, `i=stripbooks`, single ISBN in `k`
- [ ] Manual: open the URL on a real device, verify the result page shows the expected book with format options
- [ ] Manual: complete a test purchase via the link, confirm a click + conversion appears in Amazon Associates dashboard within 24h

### Layout
- [ ] ScrollView content scrolls cleanly under the floating button without being permanently obscured
- [ ] Safe-area inset honored on iPhones with home indicator (button doesn't sit on top of the indicator)
- [ ] Button visually consistent with rest of app (blue accent, Space Grotesk on adjacent text where appropriate)

### Hygiene
- [ ] No `asin` references in the new code path; the column is left in the DB but unused
- [ ] Disclosure sheet copy reusable from a Privacy/About screen later (Phase 7 of [launch roadmap](docs/plans/2026-05-04-feat-ios-testflight-launch-roadmap-plan.md))

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Amazon's URL params change (unlikely; stable for 15+ years) | Low | Single source-of-truth in `lib/amazon.ts` — one fix point if it does |
| Affiliate tag dropped by Amazon's redirects | Low | The `tag=` param is part of Associates' standard URL structure and survives redirects. Verify via test purchase. |
| Search returns wrong book or no results for some ISBNs | Medium | Amazon's index is fuzzy. For obscure SW books with limited print runs, search may surface unrelated items. Acceptable for v1; future: validation pass after launch using random sample. |
| Apple flags the affiliate use during App Store review | Low | Guideline 3.1.5(a) explicitly permits physical-goods external links. Pre-emptively note in App Store Connect review notes if asked. |
| FTC complaint over missing disclosure | Low (small audience) but compliance-critical | Inline disclosure under the button + privacy policy mention later |
| Universal-link capture: Amazon's iOS app may intercept the URL and open natively | Medium | The `tag=` param is preserved through universal-link handoff. Amazon's iOS app respects the tag. Tested behavior, but verify on first device test. |
| User in non-US region lands on `.com` instead of their local Amazon | High globally, low for v1 (US-only audience) | Out of v1 scope. Future: Amazon OneLink (a different URL pattern that auto-redirects per region) |

## Future Enhancements (v2+)

- **Format selector sheet** — show paperback / hardcover / mass-market / Kindle as separate options, each with a per-format ISBN. Requires reliable format metadata in the DB.
- **OneLink for international** — Amazon's geo-redirector. URL becomes `https://www.amazon.com/s?k=...&tag=ghanbak-20&linkCode=osi&...` with OneLink handling region routing. Worth implementing once non-US TestFlight testers exist.
- **Click analytics** — log button presses to Supabase to compare against Amazon's reported click count. Helps catch link rot or universal-link interception edge cases.
- **DB cleanup** — remove the unused `asin` column entirely (separate refactor migration). Currently kept to avoid a destructive change while v1 stabilizes.
- **Other booksellers** — Bookshop.org affiliate links (also URL-based, similar pattern). Worth offering as an alternative, especially for users who don't want to support Amazon.
- **Library lookup** — link to WorldCat / OpenLibrary / Libby for users who want to borrow rather than buy.

## Resolved Decisions

1. **CTA color: blue** (`tokens.accent.primary`) — feels more native than yellow, leaves yellow for the scanner's distinctive accent
2. **Layout: floating sticky button at bottom**, safe-area-aware, no section header. Persistent affordance while user scrolls metadata/synopsis
3. **Disclosure: required regardless of CTA wording.** "Find" doesn't dodge it — the FTC + Amazon contract care about the material connection, not the verb. Chosen placement: tappable ⓘ icon next to the button → modal sheet with disclosure copy. Also lives in privacy policy (Phase 7)
4. **No price/rating shown in-app** — would require paid PA-API or ToS-violating scraping. Amazon's product page shows it after click
5. **Single ISBN, no concatenation** — verified empirically that one ISBN returns all variants on Amazon. Strategy beats multi-ISBN
6. **Region noise resolved** — Amazon auto-filters to user's region, no foreign editions slipping through on `.com`
7. **v1: use `book.isbn[0]`** — accept the limitation of landing on a non-paperback variant some of the time. Data-model fix (add `primary_isbn` column populated from OL `physical_format`) deferred to the Data Hygiene work in Phase 5 of the launch roadmap

## Open Questions

1. **Disclosure copy wording** — proposed: *"Ossus Archives is a participant in the Amazon Services LLC Associates Program. Tapping 'Find on Amazon' opens Amazon's website. As an Associate I earn from qualifying purchases — at no extra cost to you."* Adjust before ship if you want a different tone

## References

### Internal

- Master plan: [docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md](docs/plans/2026-04-10-feat-star-wars-book-tracker-app-plan.md) — original ASIN-based intent (now obsolete for buy buttons)
- Multi-format ISBN migration: [docs/plans/2026-04-22-db-multi-format-isbn-and-covers-plan.md](docs/plans/2026-04-22-db-multi-format-isbn-and-covers-plan.md) — source of the `isbn[]` column
- Existing external-link pattern: [app/(tabs)/scan.tsx](app/(tabs)/scan.tsx) and [components/external-link.tsx](components/external-link.tsx) — `expo-web-browser` integration
- Tokens: [constants/tokens.ts](constants/tokens.ts) — yellow `tokens.accent.secondary`, hint text `tokens.text.hint`

### External

- [Amazon Associates Program Operating Agreement](https://affiliate-program.amazon.com/help/operating/agreement) — tag attribution, FTC disclosure requirements
- [Amazon Search URL parameters](https://docs.aws.amazon.com/AWSECommerceService/latest/DG/) — `k`, `i`, `tag` (legacy PA-API docs document these)
- [Apple App Store Review Guideline 3.1.5(a)](https://developer.apple.com/app-store/review/guidelines/#payments) — "Goods and Services Outside of the App"
- [FTC .com Disclosures Guide](https://www.ftc.gov/business-guidance/resources/com-disclosures-how-make-effective-disclosures-digital-advertising) — clear-and-conspicuous standard for affiliate disclosure
- [expo-web-browser docs](https://docs.expo.dev/versions/latest/sdk/webbrowser/) — `openBrowserAsync` patterns and presentation styles
- Creator API reference: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/api-reference (referenced for URL parameter structure only — not consumed)

## Estimate

**~2 hours.** Breakdown:
- URL utility: 15m — pure function, trivial
- UI (floating button + disclosure sheet + book detail integration): ~1h
- Manual verification: 30m — test build, real-device click + test purchase, confirm Associates dashboard entry within 24h

No schema changes, no migrations, no native dependencies beyond what's already in the project (`expo-web-browser`, `expo-haptics`, `react-native-safe-area-context`, lucide).
