# App Store listing: Ossus Archives 1.4.1

Copy for App Store Connect (#412, release #111). Paste each block as is. Counts are `wc -m` on the exact block text with no trailing newline.

Features listed here are the ones in the code on `main`. Not shipped, so not mentioned: themes, ratings, Aurebesh (the Account sheet shows a disabled "coming soon" toggle, `app/profile.tsx:91-96`).

## Name — 14 / 30

```text
Ossus Archives
```

The on-device display name is `OssusArchives` (`app.json:3`). The two can differ.

## Subtitle — 28 / 30

```text
Canon & Legends book tracker
```

## Promotional text — 148 / 170

```text
Photograph a shelf of spines and add every book at once. Track what you own, have read and want to read across Canon and Legends, in timeline order.
```

## Description — 1387 / 4000

```text
Ossus Archives is a tracker for Star Wars novels. Browse the books across Canon and Legends, keep track of what you own and have read, and add books by scanning them.

ARCHIVES
Browse adult, young adult and middle grade novels. Filter by Canon or Legends. Sort by in-universe chronology or publish date.

TIMELINE
Page through the books in in-universe order, from BBY to ABY. Each cover is a holographic card that tilts as you move your phone.

LIBRARY
Mark books Owned, Read or Wishlist, and star your favorites. Filter your library by Favorites, Wishlist, Read or Not read.

SCAN
Point the camera at a barcode to find a book by its ISBN. Or photograph a row of spines, confirm the matches, and add the whole shelf at once. Recognition runs on your device. Shelf adds made offline sync when you reconnect.

BOOK DETAILS
Synopsis, series and reading order, publisher, publish date, ISBNs, and the book's place on the timeline. Characters and timeline notes from Wookieepedia. A link to find the book on Amazon.

SEARCH
Search by title, author or series.

SYNC
Sign in with Apple or Google. Your shelves sync to your account. Delete your account at any time from the app.

Ossus Archives is an independent fan project. It is not affiliated with, endorsed by or sponsored by Lucasfilm Ltd. or The Walt Disney Company. As an Amazon Associate, Ossus Archives earns from qualifying purchases.
```

Where each claim comes from:

| Claim | Source |
| --- | --- |
| Canon / Legends filter | `app/(tabs)/archives/index.tsx:19-23` |
| Adult, YA, middle grade | `supabase/migrations/20260410000000_create_books_and_user_books.sql:19` |
| Sort by chronology or publish date | `hooks/useCatalogSort.ts:7-10` |
| Timeline in BBY/ABY order | `lib/timeline.ts:16-20`, `app/(tabs)/timeline/index.tsx:43-45` |
| Covers tilt with the phone | `components/holo-stage-canvas.tsx:45`, `app.json:22` |
| Owned, Read, Wishlist, favorites | `components/book-detail-toolbar.tsx:8`, `app/book/[id].tsx:269-278` |
| Library filters | `app/(tabs)/library/index.tsx:20-24` |
| Barcode and shelf scan | `components/scan-mode-switcher.tsx:8-9`, `components/barcode-scan-panel.tsx:72-76` |
| On-device recognition | `lib/ocr.ts:30-35`, `lib/spine-match.ts:5-6` |
| Offline shelf adds | `lib/shelf-queue.ts:7-10` |
| Detail fields | `app/book/[id].tsx:157-254` |
| Wookieepedia characters and timeline | `components/enrichment/enrichment-section.tsx:14` |
| Amazon link | `lib/amazon.ts:21-31`, `app/book/[id].tsx:160-165` |
| Search by title, author, series | `app/(tabs)/search/index.tsx:94` |
| Apple and Google sign-in | `app/(auth)/login.tsx:53-72` |
| In-app account deletion | `app/profile.tsx:125-141` |

## Keywords — 97 / 100

```text
novel,reading,library,shelf,collection,isbn,barcode,scanner,timeline,bby,aby,wishlist,saga,series
```

No words from the name or subtitle (App Store indexes both). No trademarked terms ("star wars", "jedi", "sith"): App Review Guideline 2.3.7 bars them in keywords.

## Category

- Primary: **Books**
- Secondary: **Entertainment**

## Age rating questionnaire

The app shows catalog book covers and publisher synopses. It has no user-generated content, chat, ads or purchases.

| Question | Answer | Why |
| --- | --- | --- |
| Cartoon or fantasy violence | Infrequent/Mild | Synopses and covers of Star Wars novels describe battles. |
| Realistic violence | None | |
| Prolonged graphic or sadistic violence | None | |
| Profanity or crude humor | None | |
| Mature or suggestive themes | None | |
| Horror or fear themes | None | |
| Sexual content or nudity | None | |
| Alcohol, tobacco or drug use | None | |
| Medical or treatment information | None | |
| Simulated gambling | None | |
| Contests | None | |
| Unrestricted web access | No | Links open fixed pages (Amazon search, Wookieepedia, privacy policy) via `openInAppBrowser` (`lib/external-link.ts:9`). There is no address bar. |
| User-generated content | No | Shelves are private to the user (RLS, `supabase/migrations/20260410000000_create_books_and_user_books.sql:77-92`). |
| Messaging or chat | No | |
| Advertising | No | Amazon affiliate links are not ads; disclosed in-app (`app/profile.tsx:106-113`). |
| Parental controls / age assurance | No | |
| Made for Kids | No | Policy: not directed to children under 13 (`admin/app/privacy/page.tsx:107-112`). |

Expected result: 9+ (App Store Connect computes it).

## App Privacy label

Tracking: **No**. The app has no ad or analytics SDKs (`package.json:38-84`) and does not use the advertising identifier. The Amazon link carries only the ISBN and our Associates tag (`lib/amazon.ts:12`, `lib/amazon.ts:26-31`).

Data collected (all **linked to the user**, purpose **App Functionality**, **not used for tracking**):

| Data type | Collected from | Source |
| --- | --- | --- |
| Contact Info → Email Address | Apple or Google sign-in, stored by Supabase Auth | `lib/auth.tsx:91-94`, `lib/auth.tsx:111-115`, `lib/auth.tsx:130-134`; shown in `app/profile.tsx:42`, `app/profile.tsx:90` |
| Contact Info → Name | Apple full name, saved as `user_metadata.full_name` | `lib/auth.tsx:111-115`, `lib/auth.tsx:121-128`, `lib/auth.tsx:156-158` |
| Identifiers → User ID | Supabase user id; every shelf row keys on it | `supabase/migrations/20260410000000_create_books_and_user_books.sql:33` |
| User Content → Other User Content | Shelf flags: owned, read, want to read, favorite | `supabase/migrations/20260410000000_create_books_and_user_books.sql:31-41`, `supabase/migrations/20260623000000_add_favorite_to_user_books.sql:10-11`; written in `lib/hooks.tsx:144`, `lib/hooks.tsx:192-199`, `lib/hooks.tsx:234`, `lib/shelf-queue.ts:345` |

Not collected:

- **Photos or camera images.** OCR runs on the device (`lib/ocr.ts:35`); spine matching is local against the downloaded catalog (`lib/spine-match.ts:5-6`). Barcode scans send only the ISBN as a catalog query (`components/barcode-scan-panel.tsx:72-76`).
- **Location, contacts, browsing history, purchases, health, financial info, diagnostics, usage data.** No code collects them. Web Analytics runs on the website only (`admin/app/layout.tsx:1`, `admin/app/layout.tsx:16`; policy `admin/app/privacy/page.tsx:48-57`).

Decide before submitting:

- **Identifiers → Device ID (not linked).** `expo-updates` sends a random per-install UUID to Expo's update server on each update check (`node_modules/expo-updates/ios/EXUpdates/AppLoader/FileDownloader.swift:448`; updates URL `app.json:13-15`). It is not tied to the account. The cautious answer is to declare it as Device ID, not linked, App Functionality. Neither choice is backed by an Expo statement in this repo.
- **Name from Google.** The code passes only the Google ID token (`lib/auth.tsx:91-94`). Supabase Auth may copy its name and picture claims into `user_metadata`; check one Google user in the Supabase dashboard. Either way, Name is already declared above.

### Where the privacy policy and the code disagree

1. **Name is collected but not in the policy.** The app requests and stores the Apple full name (`lib/auth.tsx:113`, `lib/auth.tsx:156-158`). The policy lists only a user identifier and email (`admin/app/privacy/page.tsx:26-30`). The Support page leaves it out too (`admin/app/support/page.tsx:38-39`). Fix: add the name to the policy, or stop requesting `FULL_NAME`.
2. **Favorites are not in the policy.** The policy lists owned, read, want to read (`admin/app/privacy/page.tsx:32-34`); the app also stores `favorite` (`supabase/migrations/20260623000000_add_favorite_to_user_books.sql:10-11`).
3. **Expo update client ID is not in the policy.** Expo is not listed as a service provider (`admin/app/privacy/page.tsx:66-80`), but the app sends it a per-install ID (`FileDownloader.swift:448`).
4. **Delete path wording.** The policy and Support page say "Account → Delete account" (`admin/app/privacy/page.tsx:97`, `admin/app/support/page.tsx:30`). In the app, Delete account is in its own section below the "Account" section (`app/profile.tsx:89`, `app/profile.tsx:125-137`). The sheet opens from the person icon labeled "Account and settings" (`components/tab-header-actions.tsx:64-68`). Close enough to follow; not a strict mismatch.

Consistent with the code: on-device recognition and ISBN-only lookup (`admin/app/privacy/page.tsx:37-40`), deletion removes the account and shelves and revokes Apple's token (`admin/app/privacy/page.tsx:100-103`; `supabase/functions/delete-account/index.ts:160-161`, `supabase/functions/delete-account/index.ts:167-169`), no location or ad identifiers (`admin/app/privacy/page.tsx:43-44`).

## App Review notes — 1222 / 4000

```text
Sign-in: use Sign in with Apple with your own Apple ID, or Continue with Google with any Google account. No demo account is needed. All features need sign-in, because shelves are stored per account.

Account deletion: tap the person icon at the top right of any tab to open the Account sheet, then tap Delete account at the bottom and confirm. Apple users are asked to re-authorize with Apple so we can revoke the Sign in with Apple token. Deletion removes the account and all shelves.

Camera: used only for scanning. Barcode mode looks up a book by its ISBN. Shelf mode photographs a row of book spines; text recognition runs on the device and the photo is not uploaded. To try it, tap the barcode icon at the top right of any tab.

Motion: device tilt animates the holographic covers on the Timeline tab and book pages.

Amazon links: the Find on Amazon button on a book page opens an Amazon search for that ISBN with our Amazon Associates tag. These are affiliate links; the disclosure is in the Account sheet under About. No in-app purchases.

Content: characters and timeline notes on book pages come from Wookieepedia (CC BY-SA, credited on each page). This is an independent fan app, not affiliated with Lucasfilm.
```

Sources: sign-in gate `app/_layout.tsx:163-164`; Google `lib/auth.tsx:82-96`; deletion `components/tab-header-actions.tsx:64-68`, `app/profile.tsx:125-141`, `lib/delete-account-flow.ts:6`; scan button `components/tab-header-actions.tsx:59-63`; camera string `app.json:52`; motion `app.json:22`; affiliate disclosure `app/profile.tsx:106-113`; Wookieepedia credit `components/enrichment/wookieepedia-card.tsx:12`.

Before pasting: Google sign-in only works for any reviewer account once the OAuth consent screen is in production (#49).

## URLs

| Field | URL | Route |
| --- | --- | --- |
| Support URL | `https://ossusarchives.com/support` | `admin/app/support/page.tsx` |
| Privacy Policy URL | `https://ossusarchives.com/privacy` | `admin/app/privacy/page.tsx` |
| Marketing URL (optional) | `https://ossusarchives.com/` | `admin/app/page.tsx` |

Base URL: `https://ossusarchives.com`, the fallback in `admin/app/sitemap.ts:4` and `admin/app/robots.ts:3` (overridable by `NEXT_PUBLIC_SITE_URL`). The app hard-codes the same privacy URL (`lib/external-link.ts:17`). Both pages exist and are statically rendered (`admin/app/support/page.tsx:5`, `admin/app/privacy/page.tsx:6`). Not checked: whether the deployed site serves them; open both before submitting. Contact address on both pages: `admin/app/_components/info-page.tsx:6`.
