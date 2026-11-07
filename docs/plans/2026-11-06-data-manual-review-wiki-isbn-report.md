---
title: "data: Manual-review books vs Wookieepedia infobox ISBNs (#78)"
type: data
date: 2026-11-06
related: docs/plans/2026-05-05-data-manual-isbn-review-plan.md
---

# Manual-review books vs Wookieepedia infobox ISBNs

The 40 books in [2026-05-05-data-manual-isbn-review-plan.md](2026-05-05-data-manual-isbn-review-plan.md), checked against their Wookieepedia `{{Book}}` infobox, then each infobox ISBN looked up on Open Library. Catalog state is the prod snapshot `data/catalog-backup.csv`. All lookups were read-only.

## How to apply

Nothing here has been written to any database. The changes are:

- `scripts/build-catalog-cleanup.ts`: 19 `APPROVED_ISBN_ADDITIONS` (below) and one `APPROVED_ISBN_REMOVALS` entry (the Queen's collision). The builder re-checks each one on every build: an addition must be in the row's wiki infobox and on no other row, and a removal's owner must still hold the ISBN. Anything that fails is flagged, not applied.
- `data/isbn-manual-overrides.json` + `data/primary-isbn-manual-overrides.json`: `queens-peril` and `queens-hope` for the seed path (below).

Production, after merge (Ethan):

```sh
npm run catalog:cleanup            # read-only build vs prod → data/discovery/catalog-cleanup.{json,md}
npx tsx scripts/apply-catalog-changeset.ts --production --changeset data/discovery/catalog-cleanup.json          # dry-run
npx tsx scripts/apply-catalog-changeset.ts --production --apply --changeset data/discovery/catalog-cleanup.json  # writes
```

`npx tsx scripts/build-catalog-cleanup.ts --from-backup` builds the same changeset offline from `data/catalog-backup.csv`, with no DB and no credentials. The committed `catalog-cleanup.{json,md}` came from that run: 20 ISBN writes (19 additions, 1 removal), 0 flagged. It also carries the two work-level cover fills already reviewed on 2026-10-22 (`children-of-the-jedi`, `last-shot`); those rows are still null in the snapshot. Rebuild against live prod before applying. Any row that changed since the snapshot fails pre-flight as a conflict and is not written.

## Queen's Peril / Queen's Shadow collision

| ISBN | Open Library | Held by (prod) | Proposed |
|---|---|---|---|
| 9781368057943 | "Queen's Shadow", Disney Lucasfilm Press, 2020 (paperback) | `queens-peril` isbn[], `queens-shadow` isbn[] + primary | Remove from `queens-peril` (approved removal, owner `queens-shadow`) |
| 9781368057141 | "Queen's Peril", Disney-Lucasfilm Press, 2020 | `queens-peril` primary (wiki infobox) | Keep |
| 9781368024259 | "Star Wars: Queen's Shadow", hardcover, 2019 | `queens-shadow` (wiki infobox) | Keep |

Confidence: **high**. Afterwards each Queen's book's primary is its own edition: Peril 9781368057141, Shadow 9781368057943 (its 2020 paperback), Hope 9781368093767.

The seed path had the same collision: `isbn-overrides.json` gave Peril 9781368057943 and the manual override gave it to Shadow. `queens-peril` now has a manual override `[9781368057141, 9781368063258]`. `queens-hope` also had `primary_isbn ∉ isbn[]` in the seed path (`[9781368075930]` with primary 9781368093767). It now gets `[9781368075930, 9781368093767]`, matching prod. 9781368063258 is not on Open Library. It is listed on the Queen's Peril wiki page (not in the infobox), so it stays on Peril.

Regression test: `lib/__tests__/isbn-overrides.test.ts` fails if any ISBN maps to more than one book across the override files, or across the seed's resolved catalog.

## Cross-check result

Before: 21/40 rows hold their infobox ISBN, the issue's figure. A plain slug/title join finds only 20, because `fotj-vortex` maps to the wiki page "Fate of the Jedi: Vortex". That row already holds the page's infobox ISBN, 9780345509208. After the 19 additions below the count is **40/40**, with no exceptions. The cleanup builder maps all 40 pages and flags none of the additions.

### Proposed isbn[] additions

Confidence: **high** means the wiki infobox and Open Library both name the book, author and publisher. **Medium** means the wiki infobox plus the publisher's site, with no Open Library record.

| Slug | Add (wiki infobox) | Edition | Evidence | Confidence |
|---|---|---|---|---|
| acolyte-crystal-crown | 9781368070126 | Disney–Lucasfilm Press HC, 2025 | OL "Star Wars: the Acolyte: the Crystal Crown", Gratton | high |
| acolyte-wayseeker | 9780593874431 | Random House Worlds US HC, 2025 | penguinrandomhouse.com "The Acolyte: Wayseeker", Ireland; not on OL | medium |
| aftermath-life-debt | 9781101966938 | Del Rey US HC, 2016 | OL "Star Wars: Aftermath: Life debt", Wendig | high |
| corellian-trilogy-ambush | 9780553298031 | Bantam Spectra US PB, 1995 | OL "Ambush at Corellia", MacBride Allen | high |
| defy-the-storm | 9781368093811 | Disney–Lucasfilm Press US HC, 2024 | OL "Defy the Storm", Gratton + Ireland | high |
| hand-of-thrawn-vision | 9780553100358 | Bantam Spectra US HC, 1998 | OL "Vision of the Future", Zahn | high |
| mace-windu-glass-abyss | 9780593723432 | Random House Worlds US HC, 2024 | OL "Mace Windu: The Glass Abyss", Barnes | high |
| njo-force-heretic-reunion | 9780345428721 | Del Rey PB, 2003 | OL "Reunion", Ballantine 2003 | high |
| reign-of-the-empire-mask-of-fear | 9780593723463 | Random House Worlds US HC, 2025 | OL "Reign of the Empire: The Mask of Fear", Freed | high |
| temptation-of-the-force | 9780593723098 | Random House Worlds US HC, 2024 | OL "Temptation of the Force", Gratton | high |
| the-living-force | 9780593597958 | Random House Worlds US HC, 2024 | OL "The Living Force", Miller | high |
| thrawn-ascendancy-chaos-rising | 9780593157688 | Del Rey US HC, 2020 | OL "Chaos Rising … Book 1", Zahn, hardcover | high |
| thrawn-ascendancy-greater-good | 9780593158296 | Del Rey US HC, 2021 | OL "Greater Good … Book 2", Zahn, hardcover | high |
| trials-of-the-jedi | 9780593723524 | Random House Worlds US HC, 2025 | penguinrandomhouse.com resolves it to "Trials of the Jedi", Soule; not on OL | medium |
| x-wing-bacta-war | 9780553568042 | Bantam Spectra PB, 1997 | OL "The Bacta War: X-Wing Book 4", Stackpole | high |
| x-wing-iron-fist | 9780553578973 | Bantam Spectra PB, 1998 (wiki gives ISBN-10 0553578979) | OL "Iron Fist: X-Wing Book 6", Allston | high |
| x-wing-krytos-trap | 9780553568035 | Bantam Spectra PB, 1996 | OL "The Krytos Trap: X-Wing Book 3", Stackpole | high |
| x-wing-solo-command | 9780553579000 | Bantam Spectra US PB, 1999 | OL "Solo Command: X-Wing Book 7", Allston | high |
| x-wing-wedges-gamble | 9780553568028 | Bantam Spectra PB, 1996 | OL "Wedge's Gamble: X-Wing Book 2", Stackpole | high |

None of these ISBNs is on any other prod row. Each passed the ISBN-13 checksum, and the one ISBN-10 was converted with a recomputed check digit.

### Already matched (no change)

a-new-dawn, a-new-hope-novelization, a-test-of-courage, aftermath, bloodline, cataclysm, choices-of-one, corellian-trilogy-assault, corellian-trilogy-showdown, dark-disciple, dark-lord-rise-of-darth-vader, fotj-apocalypse, fotj-vortex, han-solo-at-stars-end, into-the-light, lords-of-the-sith, red-harvest, the-fallen-star, the-old-republic-revan, victorys-price, x-wing-wraith-squadron.

### Fields and covers

No field fills or cover changes are proposed. All 40 rows already have a cover, publisher, date, format and synopsis. The only empty columns are `era` (empty catalog-wide, and neither API supplies it) and `series_name` on standalones, which is correct.

Google Books was not checked. Keyless requests return HTTP 429, and the API key lives in the gitignored env file this run must not read. `npm run catalog:cleanup` with the key runs the Google Books cover passes as usual.

## Found along the way (not changed here)

- **acolyte-wayseeker holds Mace Windu's ISBN.** Its only ISBN, and its primary, is 9780593723456. penguinrandomhouse.com titles that "Mace Windu: The Glass Abyss", and it appears on the Mace Windu wiki page. The row's cover (`images2.penguinrandomhouse.com/cover/9780593723456`) is therefore Mace Windu's cover. The fix: set primary to 9780593874431, move 9780593723456 to `mace-windu-glass-abyss`, and rebuild the cover. The cleanup builder can't reset a primary that is already in `isbn[]`, so this needs its own change.
- **aftermath-life-debt primary 9780345511638**: Open Library titles it "Bubby's brunch cookbook", and it is not on the wiki page. It is probably wrong. The proposed addition gives the row a correct ISBN, but the primary still needs review.
- **Invalid ISBN-13 checksums in override files:** 9781368099123 (`acolyte-crystal-crown`, also on the prod row), 9780345528295, 9780345428757. A scan can never match these.
- **Force Heretic covers may be swapped:** `njo-force-heretic-refugee` uses the PRH cover for 9780345428721, which Open Library titles "Reunion".
- **`path-of-deceit` has an empty override `[]`** in the merged ISBN overrides, so the seed writes `isbn = {}`.
