# Catalog cleanup changeset

Built 2026-11-07 against the PRODUCTION-snapshot (data/catalog-backup.csv) catalog (276 rows), read-only.
Apply (dry-run first): `npx tsx scripts/apply-catalog-changeset.ts --production --changeset data/discovery/catalog-cleanup.json`

| Section | Count |
| --- | --- |
| ISBN repairs (primary_isbn ∉ isbn[]) | 23 (flagged: 0) |
| Cover fills (null cover_image) | 5 |
| … of which work-level fallback (may be a different printing) | 2 |
| Covers still missing (released) | 0 |
| No cover available yet (unreleased) | 5 |
| Synopsis fills — **drafted, review each** | 0 |
| Synopses skipped | 1 |

## ISBN repairs

### `acolyte-crystal-crown` — operator-approved isbn[] addition

- before: isbn [9781368099123, 9781368082167] · primary 9781368082167
- after: isbn [9781368082167, 9781368070126] · primary 9781368082167
- why: operator-approved: isbn[] += 9781368070126 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Disney–Lucasfilm Press hardcover, July 29 2025); Open Library: "Star Wars: the Acolyte: the Crystal Crown", Tessa Gratton); operator-approved: isbn[] -= 9781368099123 (invalid check digit) (2026-11-07 (#86) — bad check digit (extra isbn[] entry); recomputed 9781368099127 has no Open Library record, so nothing is added)
- wiki: *The Acolyte: The Crystal Crown* — infobox [9781368070126]; page lists [9781368070126, 9781368082167]
- Open Library 9781368082167: no record
- Open Library 9781368099123: no record
- Open Library 9781368070126: "Star Wars : the Acolyte / the Crystal Crown" (/works/OL42429960W)
- other rows holding 9781368082167: none
- operator-approved addition 9781368070126: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Disney–Lucasfilm Press hardcover, July 29 2025); Open Library: "Star Wars: the Acolyte: the Crystal Crown", Tessa Gratton
- invalid-ISBN removal 9781368099123: 2026-11-07 (#86) — bad check digit (extra isbn[] entry); recomputed 9781368099127 has no Open Library record, so nothing is added

### `acolyte-wayseeker` — operator-approved isbn[] addition

- before: isbn [9780593723456] · primary 9780593723456
- after: isbn [9780593874431] · primary 9780593874431
- why: operator-approved: isbn[] += 9780593874431 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, May 6 2025); penguinrandomhouse.com lists it as "The Acolyte: Wayseeker" by Justina Ireland; not on Open Library); operator-approved: isbn[] -= 9780593723456 (is Mace Windu: The Glass Abyss (Random House Worlds paperback)), primary_isbn → 9780593874431 (2026-11-07 (#143, from #97) — penguinrandomhouse.com: Mace Windu: The Glass Abyss paperback; seeded on mace-windu-glass-abyss. Primary → the approved Random House Worlds HC)
- wiki: *The Acolyte: Wayseeker* — infobox [9780593874431]; page lists [9780593874431, 9780593874448, 9780593874455]
- Open Library 9780593723456: no record
- Open Library 9780593874431: no record
- other rows holding 9780593723456: none
- operator-approved addition 9780593874431: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, May 6 2025); penguinrandomhouse.com lists it as "The Acolyte: Wayseeker" by Justina Ireland; not on Open Library
- misfiled-ISBN removal 9780593723456 (is Mace Windu: The Glass Abyss (Random House Worlds paperback)) (primary → 9780593874431): 2026-11-07 (#143, from #97) — penguinrandomhouse.com: Mace Windu: The Glass Abyss paperback; seeded on mace-windu-glass-abyss. Primary → the approved Random House Worlds HC

### `aftermath-life-debt` — operator-approved isbn[] addition

- before: isbn [9780345511638] · primary 9780345511638
- after: isbn [9781101966938] · primary 9781101966938
- why: operator-approved: isbn[] += 9781101966938 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey US hardcover, July 12 2016); Open Library: "Star Wars: Aftermath: Life debt", Chuck Wendig, Del Rey); operator-approved: isbn[] -= 9780345511638 (is "Bubby's brunch cookbook" (Open Library)), primary_isbn → 9781101966938 (2026-11-07 (#143, from #97) — Open Library titles it "Bubby's brunch cookbook". Primary → the approved Del Rey US HC)
- wiki: *Aftermath: Life Debt* — infobox [9781101966938]; page lists [9780425286746, 9780425286852, 9780593972762, 9781101966938, 9781101966945, 9781101966952]
- Open Library 9780345511638: "Bubby's brunch cookbook / recipes and menus from New York's favorite comfort food restaurant" (/works/OL16470121W)
- Open Library 9781101966938: "Star Wars / Aftermath : Life debt" (/works/OL17846581W)
- other rows holding 9780345511638: none
- operator-approved addition 9781101966938: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey US hardcover, July 12 2016); Open Library: "Star Wars: Aftermath: Life debt", Chuck Wendig, Del Rey
- misfiled-ISBN removal 9780345511638 (is "Bubby's brunch cookbook" (Open Library)) (primary → 9781101966938): 2026-11-07 (#143, from #97) — Open Library titles it "Bubby's brunch cookbook". Primary → the approved Del Rey US HC

### `corellian-trilogy-ambush` — operator-approved isbn[] addition

- before: isbn [9780553572832] · primary 9780553572832
- after: isbn [9780553298031] · primary 9780553298031
- why: operator-approved: isbn[] += 9780553298031 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra US paperback, Feb 2 1995); Open Library: "Star Wars: Ambush at Corellia", Roger MacBride Allen, Spectra); operator-approved: isbn[] -= 9780553572832 (invalid check digit), primary_isbn → 9780553298031 (2026-11-07 (#86) — bad check digit; recomputed 9780553572834 is "Buffalo Palace" on Open Library. Primary → Spectra PB (OL: "Star Wars: Ambush at Corellia"))
- wiki: *Ambush at Corellia* — infobox [9780553298031]; page lists [9780307796141, 9780553298031]
- Open Library 9780553572832: no record
- Open Library 9780553298031: "Star Wars: Ambush at Corellia / The Corellian Trilogy - Book 1" (/works/OL92395W)
- other rows holding 9780553572832: none
- operator-approved addition 9780553298031: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra US paperback, Feb 2 1995); Open Library: "Star Wars: Ambush at Corellia", Roger MacBride Allen, Spectra
- invalid-ISBN removal 9780553572832 (primary → 9780553298031): 2026-11-07 (#86) — bad check digit; recomputed 9780553572834 is "Buffalo Palace" on Open Library. Primary → Spectra PB (OL: "Star Wars: Ambush at Corellia")

### `defy-the-storm` — operator-approved isbn[] addition

- before: isbn [9781368093941] · primary 9781368093941
- after: isbn [9781368093941, 9781368093811] · primary 9781368093941
- why: operator-approved: isbn[] += 9781368093811 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Disney–Lucasfilm Press US hardcover, Mar 5 2024); Open Library: "Defy the Storm: Star Wars: The High Republic", Tessa Gratton + Justina Ireland)
- wiki: *The High Republic: Defy the Storm* — infobox [9781368093811]; page lists [9781368093811, 9781761214059]
- Open Library 9781368093941: no record
- Open Library 9781368093811: "Defy the Storm / Star Wars: The High Republic" (/works/OL37564083W)
- other rows holding 9781368093941: none
- operator-approved addition 9781368093811: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Disney–Lucasfilm Press US hardcover, Mar 5 2024); Open Library: "Defy the Storm: Star Wars: The High Republic", Tessa Gratton + Justina Ireland

### `hand-of-thrawn-vision` — operator-approved isbn[] addition

- before: isbn [9780553572993] · primary 9780553572993
- after: isbn [9780553100358] · primary 9780553100358
- why: operator-approved: isbn[] += 9780553100358 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra US hardcover, Sep 1998); Open Library: "Star Wars: Vision of the Future", Timothy Zahn, Bantam); operator-approved: isbn[] -= 9780553572993 (invalid check digit), primary_isbn → 9780553100358 (2026-11-07 (#86) — bad check digit; recomputed 9780553572995 is "The Alienist" on Open Library. Primary → Bantam US HC (OL: "Star Wars: Vision of the Future"))
- wiki: *Vision of the Future* — infobox [9780553100358]; page lists [9780307796448, 9780553100358, 9780553578799]
- Open Library 9780553572993: no record
- Open Library 9780553100358: "Star Wars: Vision of the Future / Hand of Thrawn Duology - Book 2" (/works/OL83582W)
- other rows holding 9780553572993: none
- operator-approved addition 9780553100358: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra US hardcover, Sep 1998); Open Library: "Star Wars: Vision of the Future", Timothy Zahn, Bantam
- invalid-ISBN removal 9780553572993 (primary → 9780553100358): 2026-11-07 (#86) — bad check digit; recomputed 9780553572995 is "The Alienist" on Open Library. Primary → Bantam US HC (OL: "Star Wars: Vision of the Future")

### `heir-to-the-empire` — operator-approved invalid-ISBN removal

- before: isbn [9780553296129, 9780307796103, 9781529150384, 9781473583580, 9780593358764, 9781787466326, 9780307933553, 9780553073270, 9780606107211, 9780345528295, 9780345530004, 9780785727354, 9780739316627, 9780553452969, 9780613922715, 9780783811000, 9780553745085, 9780553634853, 9780553199789, 9780553073409, 9780553404715] · primary 9780553634853
- after: isbn [9780553296129, 9780307796103, 9781529150384, 9781473583580, 9780593358764, 9781787466326, 9780307933553, 9780553073270, 9780606107211, 9780345530004, 9780785727354, 9780739316627, 9780553452969, 9780613922715, 9780783811000, 9780553745085, 9780553634853, 9780553199789, 9780553073409, 9780553404715] · primary 9780553634853
- why: operator-approved: isbn[] -= 9780345528295 (invalid check digit) (2026-11-07 (#86) — bad check digit (extra isbn[] entry); recomputed 9780345528292 (OL: "Heir to the Empire", Lucas Books 2011) is already on the row)
- wiki: *Heir to the Empire* — infobox [9780553073270]; page lists [9780307796103, 9780553073270, 9780553296129, 9780593358764, 9783442413348, 9788025213407, 9788070332856, 9788072143207, 9788571233645, 9788576571988, 9788863552935, 9789510216361, 9789545282157, 9789634971085, 9789721036468]
- Open Library 9780553634853: "Star Wars / Heir to the Empire" (/works/OL83589W)
- Open Library 9780553296129: "Star Wars - Thrawn Trilogy - Heir to the Empire" (/works/OL83589W)
- Open Library 9780307796103: "Heir to the Empire / Star Wars Legends  Vol. 1" (/works/OL83589W)
- Open Library 9781529150384: "Heir to the Empire / Book 1" (/works/OL83589W)
- Open Library 9781473583580: "Heir to the Empire / Book 1" (/works/OL83589W)
- Open Library 9780593358764: "Heir to the Empire / Star Wars Legends" (/works/OL83589W)
- Open Library 9781787466326: "Heir to the Empire" (/works/OL83589W)
- Open Library 9780307933553: "Star Wars / Heir to the Empire, 20th Anniversary Edition" (/works/OL83589W)
- Open Library 9780553073270: "Heir to the Empire" (/works/OL83589W)
- Open Library 9780606107211: "Heir to the Empire
            
                Star Wars Thrawn Trilogy" (/works/OL83589W)
- Open Library 9780345528295: "Heir to the empire" (/works/OL83589W)
- Open Library 9780345530004: "Heir to the empire" (/works/OL83589W)
- Open Library 9780785727354: "Star Wars Empire #1 / Heir to the Empire" (/works/OL83589W)
- Open Library 9780739316627: "SW / Heir to the Empire (AU Star Wars)" (/works/OL83589W)
- Open Library 9780553452969: "Heir to the Empire (Star Wars: The Thrawn Trilogy, Vol. 1)" (/works/OL83589W)
- Open Library 9780613922715: "Heir to the Empire (Star Wars: The Thrawn Trilogy, Vol. 1)" (/works/OL83589W)
- Open Library 9780783811000: "Star Wars / Heir to the Empire/8 Cassettes (G. K. Hall Audio Books Series Volume 1)" (/works/OL83589W)
- Open Library 9780553745085: "Star Wars / Heir to the Empire (Star Wars (Random House Audio))" (/works/OL83589W)
- Open Library 9780553199789: "Star Wars / Heir to the Empire (Star Wars (Random House Audio))" (/works/OL83589W)
- Open Library 9780553073409: "Star Wars / Heir to the Empire Limited Edition (Star Wars, Vol 1)" (/works/OL83589W)
- Open Library 9780553404715: "Heir to the Empire" (/works/OL83589W)
- other rows holding 9780553634853: none
- invalid-ISBN removal 9780345528295: 2026-11-07 (#86) — bad check digit (extra isbn[] entry); recomputed 9780345528292 (OL: "Heir to the Empire", Lucas Books 2011) is already on the row

### `mace-windu-glass-abyss` — operator-approved isbn[] addition

- before: isbn [9780593722718, 9780593723449] · primary 9780593723449
- after: isbn [9780593722718, 9780593723449, 9780593723432] · primary 9780593723449
- why: operator-approved: isbn[] += 9780593723432 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, Oct 15 2024); Open Library: "Mace Windu: The Glass Abyss: Star Wars", Steven Barnes)
- wiki: *Mace Windu: The Glass Abyss* — infobox [9780593723432]; page lists [9780593723432, 9780593723449, 9780593723456]
- Open Library 9780593723449: no record
- Open Library 9780593722718: no record
- Open Library 9780593723432: "Mace Windu: The Glass Abyss / Star Wars" (/works/OL37566914W)
- other rows holding 9780593723449: none
- operator-approved addition 9780593723432: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, Oct 15 2024); Open Library: "Mace Windu: The Glass Abyss: Star Wars", Steven Barnes

### `njo-final-prophecy` — operator-approved invalid-ISBN removal

- before: isbn [9780345428752, 9780099410430, 9780553713718, 9780345428757] · primary 9780099410430
- after: isbn [9780345428752, 9780099410430, 9780553713718] · primary 9780099410430
- why: operator-approved: isbn[] -= 9780345428757 (invalid check digit) (2026-11-07 (#86) — bad check digit (extra isbn[] entry); recomputed 9780345428752 (OL: "Star Wars: The Final Prophecy", Del Rey 2003) is already on the row)
- wiki: *The New Jedi Order: The Final Prophecy* — infobox [9780345428752]; page lists [9780345428752, 9780345464965, 9780739438022, 9788025220221]
- Open Library 9780099410430: "The Final Prophecy (Star Wars: The New Jedi Order)" (/works/OL1841317W)
- Open Library 9780345428752: "Star Wars: The Final Prophecy / The New Jedi Order #18" (/works/OL1841317W)
- Open Library 9780553713718: "The Final Prophecy" (/works/OL1841317W)
- Open Library 9780345428757: "Star Wars: The Final Prophecy / The New Jedi Order #18" (/works/OL1841317W)
- other rows holding 9780099410430: none
- invalid-ISBN removal 9780345428757: 2026-11-07 (#86) — bad check digit (extra isbn[] entry); recomputed 9780345428752 (OL: "Star Wars: The Final Prophecy", Del Rey 2003) is already on the row

### `njo-force-heretic-reunion` — operator-approved isbn[] addition

- before: isbn [9780307795625, 9780307795601, 9781448151974, 9781299271388] · primary 9780307795625
- after: isbn [9780307795625, 9780307795601, 9781448151974, 9781299271388, 9780345428721] · primary 9780307795625
- why: operator-approved: isbn[] += 9780345428721 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey paperback, July 2003); Open Library: "Reunion", Ballantine Books 2003)
- wiki: *The New Jedi Order: Force Heretic III: Reunion* — infobox [9780345428721]; page lists [9780345428721, 9788025220214]
- Open Library 9780307795625: "Reunion : Star Wars Legends / Force Heretic, Book III" (/works/OL28031246W)
- Open Library 9780307795601: "Remnant : Star Wars Legends / Force Heretic, Book I" (/works/OL28031244W)
- Open Library 9781448151974: "Star Wars / the New Jedi Order - Force Heretic III Reunion" (/works/OL1732960W)
- Open Library 9781299271388: no record
- Open Library 9780345428721: "Reunion" (/works/OL1732960W)
- other rows holding 9780307795625: none
- operator-approved addition 9780345428721: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey paperback, July 2003); Open Library: "Reunion", Ballantine Books 2003

### `queens-peril` — operator-approved collision removal

- before: isbn [9781368057141, 9781368063258, 9781368057943] · primary 9781368057141
- after: isbn [9781368057141, 9781368063258] · primary 9781368057141
- why: operator-approved: isbn[] -= 9781368057943 (belongs to "queens-shadow") (2026-11-06 (#78, approved on merge) — Open Library titles 9781368057943 "Queen's Shadow" (Disney Lucasfilm Press, 2020 paperback); it is queens-shadow's primary_isbn, so a scan could return Queen's Peril)
- wiki: *Queen's Peril* — infobox [9781368057141]; page lists [9781368057141, 9781368063258, 9781368077194]
- Open Library 9781368057141: "Queen's Peril / Star Wars" (/works/OL21888343W)
- Open Library 9781368063258: no record
- Open Library 9781368057943: "Queen's Shadow / Star Wars" (/works/OL19860554W)
- other rows holding 9781368057141: none
- operator-approved removal 9781368057943 (owner `queens-shadow`): 2026-11-06 (#78, approved on merge) — Open Library titles 9781368057943 "Queen's Shadow" (Disney Lucasfilm Press, 2020 paperback); it is queens-shadow's primary_isbn, so a scan could return Queen's Peril

### `reign-of-the-empire-mask-of-fear` — operator-approved isbn[] addition

- before: isbn [9780593723487] · primary 9780593723487
- after: isbn [9780593723487, 9780593723463] · primary 9780593723487
- why: operator-approved: isbn[] += 9780593723463 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, Feb 25 2025); Open Library: "Reign of the Empire: The Mask of Fear", Alexander Freed)
- wiki: *Reign of the Empire: The Mask of Fear* — infobox [9780593723463]; page lists [9780593723463, 9780593723470, 9780593723487, 9780593975862, 9781529919424]
- Open Library 9780593723487: "Star Wars / the Mask of Fear" (/works/OL24244423W)
- Open Library 9780593723463: "Reign of the Empire: The Mask of Fear" (/works/OL43926434W)
- other rows holding 9780593723487: none
- operator-approved addition 9780593723463: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, Feb 25 2025); Open Library: "Reign of the Empire: The Mask of Fear", Alexander Freed

### `temptation-of-the-force` — operator-approved isbn[] addition

- before: isbn [9780593598535] · primary 9780593598535
- after: isbn [9780593598535, 9780593723098] · primary 9780593598535
- why: operator-approved: isbn[] += 9780593723098 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, June 11 2024); Open Library: "Temptation of the Force: Star Wars: The High Republic", Tessa Gratton)
- wiki: *The High Republic: Temptation of the Force* — infobox [9780593723098]; page lists [9780593723098, 9780593723104, 9780593723111]
- Open Library 9780593598535: no record
- Open Library 9780593723098: "Temptation of the Force / Star Wars: The High Republic" (/works/OL37583441W)
- other rows holding 9780593598535: none
- operator-approved addition 9780593723098: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, June 11 2024); Open Library: "Temptation of the Force: Star Wars: The High Republic", Tessa Gratton

### `the-living-force` — operator-approved isbn[] addition

- before: isbn [9780593598559] · primary 9780593598559
- after: isbn [9780593598559, 9780593597958] · primary 9780593598559
- why: operator-approved: isbn[] += 9780593597958 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, Apr 9 2024); Open Library: "The Living Force: Star Wars", John Jackson Miller)
- wiki: *The Living Force* — infobox [9780593597958]; page lists [9780593128381, 9780593597958, 9780593597965, 9780593724699, 9780593871515, 9781529919455]
- Open Library 9780593598559: no record
- Open Library 9780593597958: "The Living Force / Star Wars" (/works/OL37565122W)
- other rows holding 9780593598559: none
- operator-approved addition 9780593597958: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, Apr 9 2024); Open Library: "The Living Force: Star Wars", John Jackson Miller

### `thrawn-ascendancy-chaos-rising` — operator-approved isbn[] addition

- before: isbn [9780593157695] · primary 9780593157695
- after: isbn [9780593157695, 9780593157688] · primary 9780593157695
- why: operator-approved: isbn[] += 9780593157688 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey US hardcover, Sep 1 2020); Open Library: "Chaos Rising: Star Wars: Thrawn Ascendancy, Book 1", Timothy Zahn, hardcover)
- wiki: *Thrawn Ascendancy: Chaos Rising* — infobox [9780593157688]; page lists [9780593157398, 9780593157688, 9780593157695, 9780593157701, 9781529124583]
- Open Library 9780593157695: "Star Wars / Thrawn Ascendancy" (/works/OL23764596W)
- Open Library 9780593157688: "Chaos Rising / Star Wars: Thrawn Ascendancy, Book 1" (/works/OL21212127W)
- other rows holding 9780593157695: none
- operator-approved addition 9780593157688: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey US hardcover, Sep 1 2020); Open Library: "Chaos Rising: Star Wars: Thrawn Ascendancy, Book 1", Timothy Zahn, hardcover

### `thrawn-ascendancy-greater-good` — operator-approved isbn[] addition

- before: isbn [9780593157701] · primary 9780593157701
- after: isbn [9780593157701, 9780593158296] · primary 9780593157701
- why: operator-approved: isbn[] += 9780593158296 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey US hardcover, Apr 27 2021); Open Library: "Greater Good: Star Wars: Thrawn Ascendancy, Book 2", Timothy Zahn, hardcover)
- wiki: *Thrawn Ascendancy: Greater Good* — infobox [9780593158296]; page lists [9780593158296, 9780593158302, 9780593158319, 9780593357316, 9780593358153]
- Open Library 9780593157701: "Star Wars / Thrawn Ascendancy" (/works/OL21212127W)
- Open Library 9780593158296: "Greater Good / Star Wars: Thrawn Ascendancy, Book 2" (/works/OL23764596W)
- other rows holding 9780593157701: none
- operator-approved addition 9780593158296: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Del Rey US hardcover, Apr 27 2021); Open Library: "Greater Good: Star Wars: Thrawn Ascendancy, Book 2", Timothy Zahn, hardcover

### `trials-of-the-jedi` — operator-approved isbn[] addition

- before: isbn [9780593723548] · primary 9780593723548
- after: isbn [9780593723548, 9780593723524] · primary 9780593723548
- why: operator-approved: isbn[] += 9780593723524 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, June 17 2025); penguinrandomhouse.com resolves it to "Trials of the Jedi" by Charles Soule; not on Open Library)
- wiki: *The High Republic: Trials of the Jedi* — infobox [9780593723524]; page lists [9780593723524, 9780593723531, 9780593723548]
- Open Library 9780593723548: no record
- Open Library 9780593723524: no record
- other rows holding 9780593723548: none
- operator-approved addition 9780593723524: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Random House Worlds US hardcover, June 17 2025); penguinrandomhouse.com resolves it to "Trials of the Jedi" by Charles Soule; not on Open Library

### `x-wing-bacta-war` — operator-approved isbn[] addition

- before: isbn [9780553570074] · primary 9780553570074
- after: isbn [9780553568042] · primary 9780553568042
- why: operator-approved: isbn[] += 9780553568042 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra paperback, Feb 1997); Open Library: "Star Wars: The Bacta War: X-Wing Book 4", Michael A. Stackpole); operator-approved: isbn[] -= 9780553570074 (invalid check digit), primary_isbn → 9780553568042 (2026-11-07 (#86) — bad check digit; recomputed 9780553570076 is Sweet Valley "The Trial of Jessica Wakefield" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: The Bacta War"))
- wiki: *X-Wing: The Bacta War* — infobox [9780553568042]; page lists [9780553568042, 9780593498927, 9788025224427]
- Open Library 9780553570074: no record
- Open Library 9780553568042: "Star Wars: The Bacta War / X-Wing Book 4" (/works/OL84518W)
- other rows holding 9780553570074: none
- operator-approved addition 9780553568042: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra paperback, Feb 1997); Open Library: "Star Wars: The Bacta War: X-Wing Book 4", Michael A. Stackpole
- invalid-ISBN removal 9780553570074 (primary → 9780553568042): 2026-11-07 (#86) — bad check digit; recomputed 9780553570076 is Sweet Valley "The Trial of Jessica Wakefield" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: The Bacta War")

### `x-wing-iron-fist` — operator-approved isbn[] addition

- before: isbn [9780553570098] · primary 9780553570098
- after: isbn [9780553578973] · primary 9780553578973
- why: operator-approved: isbn[] += 9780553578973 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox ISBN-10 0553578979 (Bantam Spectra paperback, July 1998); Open Library: "Star Wars: Iron Fist: X-Wing Book 6", Aaron Allston); operator-approved: isbn[] -= 9780553570098 (invalid check digit), primary_isbn → 9780553578973 (2026-11-07 (#86) — bad check digit; recomputed 9780553570090 is "Running for Her Life" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: Iron Fist"))
- wiki: *X-Wing: Iron Fist* — infobox [9780553578973]; page lists [9780593726082, 9782265074576, 9788025228180]
- Open Library 9780553570098: no record
- Open Library 9780553578973: "Star Wars: Iron Fist / X-Wing Book 6" (/works/OL3567789W)
- other rows holding 9780553570098: none
- operator-approved addition 9780553578973: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox ISBN-10 0553578979 (Bantam Spectra paperback, July 1998); Open Library: "Star Wars: Iron Fist: X-Wing Book 6", Aaron Allston
- invalid-ISBN removal 9780553570098 (primary → 9780553578973): 2026-11-07 (#86) — bad check digit; recomputed 9780553570090 is "Running for Her Life" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: Iron Fist")

### `x-wing-krytos-trap` — operator-approved isbn[] addition

- before: isbn [9780553570067] · primary 9780553570067
- after: isbn [9780553568035] · primary 9780553568035
- why: operator-approved: isbn[] += 9780553568035 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra paperback, Oct 1996); Open Library: "Star Wars: The Krytos Trap: X-Wing - Book 3", Michael A. Stackpole); operator-approved: isbn[] -= 9780553570067 (invalid check digit), primary_isbn → 9780553568035 (2026-11-07 (#86) — bad check digit; recomputed 9780553570069 is Sweet Valley "Busted!" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: The Krytos Trap"))
- wiki: *X-Wing: The Krytos Trap* — infobox [9780553568035]; page lists [9780553568035, 9780593497340, 9788025224410]
- Open Library 9780553570067: no record
- Open Library 9780553568035: "Star Wars: The Krytos Trap / X-Wing - Book 3" (/works/OL84530W)
- other rows holding 9780553570067: none
- operator-approved addition 9780553568035: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra paperback, Oct 1996); Open Library: "Star Wars: The Krytos Trap: X-Wing - Book 3", Michael A. Stackpole
- invalid-ISBN removal 9780553570067 (primary → 9780553568035): 2026-11-07 (#86) — bad check digit; recomputed 9780553570069 is Sweet Valley "Busted!" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: The Krytos Trap")

### `x-wing-rogue-squadron` — operator-approved misfiled-ISBN removal

- before: isbn [9781845764692, 9781569713303, 9780553568011, 9781101968758, 9780553409260] · primary 9781845764692
- after: isbn [9780553568011, 9780553409260] · primary 9780553568011
- why: operator-approved: isbn[] -= 9781845764692 (is the X-Wing: Rogue Squadron comic (Titan Books, 2007)), 9781569713303 (is the X-Wing: Rogue Squadron comic (Dark Horse Comics, 1998)), 9781101968758 (is The X-Wing Series: Star Wars Legends 10-Book Bundle (ebook, Random House 2016)), primary_isbn → 9780553568011 (2026-11-07 (#143) — Open Library: "X-Wing Rogue Squadron", Titan Books 2007 (work OL37923497W, not the novel's OL84533W). Primary → Bantam Spectra PB (OL: "Star Wars: Rogue Squadron", 400 pp); 2026-11-07 (#143) — Open Library: "Star wars / X-Wing Rogue Squadron.", Dark Horse Comics 1998 (work OL15219983W, not the novel's OL84533W); 2026-11-07 (#154) — penguinrandomhouse.com + Open Library: "X-Wing Series : Star Wars Legends 10-Book Bundle" (work OL28042739W, not the novel's OL84533W). Multi-book bundle; no single row owns it)
- wiki: *X-Wing: Rogue Squadron* — infobox [9780553568011]; page lists [9780553568011, 9780593359792, 9788025221716]
- Open Library 9781845764692: "X-Wing Rogue Squadron" (/works/OL37923497W)
- Open Library 9781569713303: "Star wars / X-Wing Rogue Squadron." (/works/OL15219983W)
- Open Library 9780553568011: "Star Wars: Rogue Squadron / Book 1 in the exciting new series!" (/works/OL84533W)
- Open Library 9781101968758: "X-Wing Series : Star Wars Legends 10-Book Bundle / Rogue Squadron, Wedge's Gamble, the Krytos Trap, the Bacta War, Wraith Squadron ,Iron Fist, Solo Command, Isard's Revenge, Starfighters of Adumar, Mercy Kill" (/works/OL28042739W)
- Open Library 9780553409260: "Rogue Squadron (Star Wars X-Wing)" (/works/OL84533W)
- other rows holding 9781845764692: none
- misfiled-ISBN removal 9781845764692 (is the X-Wing: Rogue Squadron comic (Titan Books, 2007)) (primary → 9780553568011): 2026-11-07 (#143) — Open Library: "X-Wing Rogue Squadron", Titan Books 2007 (work OL37923497W, not the novel's OL84533W). Primary → Bantam Spectra PB (OL: "Star Wars: Rogue Squadron", 400 pp)
- misfiled-ISBN removal 9781569713303 (is the X-Wing: Rogue Squadron comic (Dark Horse Comics, 1998)): 2026-11-07 (#143) — Open Library: "Star wars / X-Wing Rogue Squadron.", Dark Horse Comics 1998 (work OL15219983W, not the novel's OL84533W)
- misfiled-ISBN removal 9781101968758 (is The X-Wing Series: Star Wars Legends 10-Book Bundle (ebook, Random House 2016)): 2026-11-07 (#154) — penguinrandomhouse.com + Open Library: "X-Wing Series : Star Wars Legends 10-Book Bundle" (work OL28042739W, not the novel's OL84533W). Multi-book bundle; no single row owns it

### `x-wing-solo-command` — operator-approved isbn[] addition

- before: isbn [9780553570104] · primary 9780553570104
- after: isbn [9780553579000] · primary 9780553579000
- why: operator-approved: isbn[] += 9780553579000 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra US paperback, Feb 2 1999); Open Library: "Star Wars: Solo Command: X-Wing - Book 7", Aaron Allston); operator-approved: isbn[] -= 9780553570104 (invalid check digit), primary_isbn → 9780553579000 (2026-11-07 (#86) — bad check digit; recomputed 9780553570106 is Sweet Valley "The Roommate" on Open Library. Primary → Spectra PB (OL: "Star Wars: Solo Command"))
- wiki: *X-Wing: Solo Command* — infobox [9780553579000]; page lists [9780307796516, 9780553579000, 9780593726112]
- Open Library 9780553570104: no record
- Open Library 9780553579000: "Star Wars: Solo Command / X-Wing - Book 7" (/works/OL3567800W)
- other rows holding 9780553570104: none
- operator-approved addition 9780553579000: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra US paperback, Feb 2 1999); Open Library: "Star Wars: Solo Command: X-Wing - Book 7", Aaron Allston
- invalid-ISBN removal 9780553570104 (primary → 9780553579000): 2026-11-07 (#86) — bad check digit; recomputed 9780553570106 is Sweet Valley "The Roommate" on Open Library. Primary → Spectra PB (OL: "Star Wars: Solo Command")

### `x-wing-wedges-gamble` — operator-approved isbn[] addition

- before: isbn [9780553570050] · primary 9780553570050
- after: isbn [9780553568028] · primary 9780553568028
- why: operator-approved: isbn[] += 9780553568028 (2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra paperback, May 1996); Open Library: "Star Wars: Wedge's Gamble: X-Wing - Book 2", Michael A. Stackpole); operator-approved: isbn[] -= 9780553570050 (invalid check digit), primary_isbn → 9780553568028 (2026-11-07 (#86) — bad check digit; recomputed 9780553570052 is Sweet Valley "Elizabeth's Secret Diary" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: Wedge's Gamble"))
- wiki: *X-Wing: Wedge's Gamble* — infobox [9780553568028]; page lists [9780553568028, 9780593497074, 9788025221723]
- Open Library 9780553570050: no record
- Open Library 9780553568028: "Star Wars: Wedge's Gamble / X-Wing - Book 2" (/works/OL84536W)
- other rows holding 9780553570050: none
- operator-approved addition 9780553568028: 2026-11-06 (#78, approved on merge) — Wookieepedia infobox (Bantam Spectra paperback, May 1996); Open Library: "Star Wars: Wedge's Gamble: X-Wing - Book 2", Michael A. Stackpole
- invalid-ISBN removal 9780553570050 (primary → 9780553568028): 2026-11-07 (#86) — bad check digit; recomputed 9780553570052 is Sweet Valley "Elizabeth's Secret Diary" on Open Library. Primary → Bantam Spectra PB (OL: "Star Wars: Wedge's Gamble")


## Cover fills (cover_image was null)


### Operator-approved covers

Sourced by hand for a row ISBN (publisher image) and visually reviewed; listed in the builder’s `APPROVED_COVERS`.

- `sanctuary-a-bad-batch-novel`: https://images2.penguinrandomhouse.com/cover/9780593874462 (`operator-approved:isbn:9780593874462`) — no cover; operator-approved cover for 9780593874462; visual review: 2026-11-07 (#79) — downloaded 296×450 JPEG of the Random House Worlds cover ("Star Wars / Sanctuary / A Bad Batch Novel / Lamar Giles"); penguinrandomhouse.com resolves the ISBN to Sanctuary: A Bad Batch Novel; Open Library: "Star Wars: Sanctuary" (OL44264240W)
- `servants-of-the-empire-imperial-justice`: https://images2.penguinrandomhouse.com/cover/9781484716601 (`operator-approved:isbn:9781484716601`) — no cover; operator-approved cover for 9781484716601; visual review: 2026-11-07 (#79) — downloaded 275×400 JPEG of the Disney Lucasfilm Press cover ("Star Wars Rebels / Servants of the Empire / Imperial Justice / Jason Fry"); Open Library: "Star Wars Rebels Servants of the Empire", subtitle "Imperial Justice"
- `the-high-republic-a-valiant-vow`: https://images2.penguinrandomhouse.com/cover/9781368095204 (`operator-approved:isbn:9781368095204`) — no cover; operator-approved cover for 9781368095204; visual review: 2026-11-07 (#79) — downloaded 357×450 JPEG of the Disney Lucasfilm Press cover ("Star Wars / The High Republic / A Valiant Vow / Justina Ireland"); penguinrandomhouse.com resolves the ISBN to The High Republic: A Valiant Vow

### Work-level Open Library fallback — review each

No per-ISBN source had a cover, so these come from the Open Library **work** (all printings of the book), not the row’s own ISBN. The image may show a different printing (paperback vs. hardcover, a reissue). Each was downloaded and visually reviewed (note below); `openlibrary-search` fills are a **different edition: title+author match** — no row ISBN is on Open Library.

- `children-of-the-jedi` — **different edition: title+author match**: https://covers.openlibrary.org/b/id/372419-L.jpg (`openlibrary-search:title+author:OL497873W`) — no cover by ISBN; different edition: title+author match — no row ISBN is on Open Library; the search returned only OL497873W "Star Wars - Children of the Jedi" (Barbara Hambly, first published 1995); may be a different printing; visual review: 2026-10-22 — downloaded 276×475 JPEG of the English Bantam Spectra mass-market cover ("Star Wars / Children of the Jedi / Barbara Hambly"); not a placeholder or a foreign edition
- `last-shot` — same OL work as a row ISBN: https://covers.openlibrary.org/b/id/8568524-L.jpg (`openlibrary-work:OL19653601W`) — no cover by ISBN; Open Library work cover — 9780525622130's edition belongs to OL19653601W "Star Wars - Last Shot - A Han and Lando Novel" (Daniel José Older); may be a different printing; visual review: 2026-10-22 — downloaded 279×500 JPEG of the English Del Rey cover ("Star Wars / Last Shot / A Han and Lando Novel / Daniel José Older"); likely the later paperback printing (bestseller banner + review quote), not a placeholder or a foreign edition

## No cover available yet

Not released yet — left null rather than forcing a cover.

- `ahsoka-a-novelization-of-season-one` (*Ahsoka: A Novelization of Season One*): no cover available yet (releases 2027-03-23); tried 9780736452847 on Open Library and Google Books (+ ISBN-verified title search)
- `princess-of-the-rebellion` (*Princess of the Rebellion*): no cover available yet (releases 2027-05-04); tried 9780736449946 on Open Library and Google Books (+ ISBN-verified title search)
- `reign-of-the-empire-from-the-ashes` (*Reign of the Empire: From the Ashes*): no cover available yet (releases 2027-08-10); tried 9780593874042, 9780593874059 on Open Library and Google Books (+ ISBN-verified title search)
- `star-wars-starfighter` (*Star Wars: Starfighter*): no cover available yet (releases 2027-06-22); tried 9798217482207, 9798217482214 on Open Library and Google Books (+ ISBN-verified title search)
- `twin-crossroads` (*Twin Crossroads*): no cover available yet (releases 2027-04-06); tried 9780525478850 on Open Library and Google Books (+ ISBN-verified title search)

## Drafted synopses (synopsis was null)

Every line below is an original **draft** (status `drafted`) written from the facts of the book — not wiki or publisher prose. Review and edit before applying.

| Slug | Draft | Notes |
| --- | --- | --- |

## Synopses skipped

- `star-wars-starfighter` (*Star Wars: Starfighter*): unreleased film novelization (2027-06-22); only a one-line announcement exists — the plot is not public, so no accurate synopsis can be written yet

## Unused drafts

- `a-new-hope-the-princess-the-scoundrel-and-the-farm-boy` (*A New Hope: The Princess, the Scoundrel, and the Farm Boy*): row already has a synopsis — never overwritten
- `ahsoka-a-novelization-of-season-one` (*Ahsoka: A Novelization of Season One*): row already has a synopsis — never overwritten
- `before-the-awakening` (*Before the Awakening*): row already has a synopsis — never overwritten
- `before-the-storm` (*Before the Storm*): row already has a synopsis — never overwritten
- `children-of-the-jedi` (*Children of the Jedi*): row already has a synopsis — never overwritten
- `dark-nest-i-the-joiner-king` (*Dark Nest I: The Joiner King*): row already has a synopsis — never overwritten
- `dark-nest-ii-the-unseen-queen` (*Dark Nest II: The Unseen Queen*): row already has a synopsis — never overwritten
- `dark-nest-iii-the-swarm-war` (*Dark Nest III: The Swarm War*): row already has a synopsis — never overwritten
- `darksaber` (*Darksaber*): row already has a synopsis — never overwritten
- `eyes-like-stars` (*Eyes Like Stars*): row already has a synopsis — never overwritten
- `galaxys-edge-a-crash-of-fate` (*Galaxy's Edge: A Crash of Fate*): row already has a synopsis — never overwritten
- `galaxys-edge-black-spire` (*Galaxy's Edge: Black Spire*): row already has a synopsis — never overwritten
- `hard-merchandise` (*Hard Merchandise*): row already has a synopsis — never overwritten
- `heir-to-the-empire-the-20th-anniversary-edition` (*Heir to the Empire: The 20th Anniversary Edition*): row already has a synopsis — never overwritten
- `hiding-from-the-dark` (*Hiding from the Dark*): row already has a synopsis — never overwritten
- `hunters-battle-for-the-arena` (*Hunters: Battle for the Arena*): row already has a synopsis — never overwritten
- `join-the-resistance` (*Join the Resistance*): row already has a synopsis — never overwritten
- `join-the-resistance-attack-on-starkiller-base` (*Join the Resistance: Attack on Starkiller Base*): row already has a synopsis — never overwritten
- `join-the-resistance-escape-from-vodran` (*Join the Resistance: Escape from Vodran*): row already has a synopsis — never overwritten
- `landos-luck` (*Lando's Luck*): row already has a synopsis — never overwritten
- `last-shot` (*Last Shot*): row already has a synopsis — never overwritten
- `legacy` (*Legacy*): row already has a synopsis — never overwritten
- `master-of-evil` (*Master of Evil*): row already has a synopsis — never overwritten
- `moving-target-a-princess-leia-adventure` (*Moving Target: A Princess Leia Adventure*): row already has a synopsis — never overwritten
- `pirates-price` (*Pirate's Price*): row already has a synopsis — never overwritten
- `planet-of-twilight` (*Planet of Twilight*): row already has a synopsis — never overwritten
- `poe-dameron-free-fall` (*Poe Dameron: Free Fall*): row already has a synopsis — never overwritten
- `princess-of-the-rebellion` (*Princess of the Rebellion*): row already has a synopsis — never overwritten
- `reign-of-the-empire-edge-of-the-abyss` (*Reign of the Empire: Edge of the Abyss*): row already has a synopsis — never overwritten
- `reign-of-the-empire-from-the-ashes` (*Reign of the Empire: From the Ashes*): row already has a synopsis — never overwritten
- `republic-commando-hard-contact` (*Republic Commando: Hard Contact*): row already has a synopsis — never overwritten
- `republic-commando-triple-zero` (*Republic Commando: Triple Zero*): row already has a synopsis — never overwritten
- `return-of-the-jedi-beware-the-power-of-the-dark-side` (*Return of the Jedi: Beware the Power of the Dark Side!*): row already has a synopsis — never overwritten
- `sanctuary-a-bad-batch-novel` (*Sanctuary: A Bad Batch Novel*): row already has a synopsis — never overwritten
- `servants-of-the-empire-edge-of-the-galaxy` (*Servants of the Empire: Edge of the Galaxy*): row already has a synopsis — never overwritten
- `servants-of-the-empire-imperial-justice` (*Servants of the Empire: Imperial Justice*): row already has a synopsis — never overwritten
- `servants-of-the-empire-rebel-in-the-ranks` (*Servants of the Empire: Rebel in the Ranks*): row already has a synopsis — never overwritten
- `servants-of-the-empire-the-secret-academy` (*Servants of the Empire: The Secret Academy*): row already has a synopsis — never overwritten
- `shadow-games` (*Shadow Games*): row already has a synopsis — never overwritten
- `shield-of-lies` (*Shield of Lies*): row already has a synopsis — never overwritten
- `slave-ship` (*Slave Ship*): row already has a synopsis — never overwritten
- `smugglers-run-a-han-solo-and-chewbacca-adventure` (*Smuggler's Run: A Han Solo & Chewbacca Adventure*): row already has a synopsis — never overwritten
- `solo-a-star-wars-story-a-junior-novel` (*Solo: A Star Wars Story: A Junior Novel*): row already has a synopsis — never overwritten
- `solo-a-star-wars-story-expanded-edition` (*Solo: A Star Wars Story: Expanded Edition*): row already has a synopsis — never overwritten
- `spark-of-the-resistance` (*Spark of the Resistance*): row already has a synopsis — never overwritten
- `star-wars-a-new-hope-paperback-novel` (*Star Wars: A New Hope (paperback novel)*): row already has a synopsis — never overwritten
- `star-wars-episode-i-the-phantom-menace` (*Star Wars: Episode I The Phantom Menace*): row already has a synopsis — never overwritten
- `star-wars-episode-ii-attack-of-the-clones` (*Star Wars: Episode II Attack of the Clones*): row already has a synopsis — never overwritten
- `star-wars-galaxies-the-ruins-of-dantooine` (*Star Wars Galaxies: The Ruins of Dantooine*): row already has a synopsis — never overwritten
- `star-wars-outlaws-low-red-moon` (*Star Wars Outlaws: Low Red Moon*): row already has a synopsis — never overwritten
- `star-wars-return-of-the-jedi-paperback-novel` (*Star Wars: Return of the Jedi (paperback novel)*): row already has a synopsis — never overwritten
- `star-wars-rogue-one-a-junior-novel` (*Star Wars: Rogue One: A Junior Novel*): row already has a synopsis — never overwritten
- `star-wars-the-clone-wars` (*Star Wars: The Clone Wars*): row already has a synopsis — never overwritten
- `star-wars-the-empire-strikes-back-paperback-novel` (*Star Wars: The Empire Strikes Back (paperback novel)*): row already has a synopsis — never overwritten
- `star-wars-the-force-awakens` (*Star Wars: The Force Awakens*): row already has a synopsis — never overwritten
- `star-wars-the-force-awakens-a-junior-novel` (*Star Wars: The Force Awakens: A Junior Novel*): row already has a synopsis — never overwritten
- `star-wars-the-force-unleashed` (*Star Wars: The Force Unleashed*): row already has a synopsis — never overwritten
- `star-wars-the-force-unleashed-ii` (*Star Wars: The Force Unleashed II*): row already has a synopsis — never overwritten
- `star-wars-the-last-jedi-a-junior-novel` (*Star Wars: The Last Jedi: A Junior Novel*): row already has a synopsis — never overwritten
- `star-wars-the-last-jedi-expanded-edition` (*Star Wars: The Last Jedi: Expanded Edition*): row already has a synopsis — never overwritten
- `star-wars-the-rise-of-skywalker-a-junior-novel` (*Star Wars: The Rise of Skywalker: A Junior Novel*): row already has a synopsis — never overwritten
- `star-wars-the-rise-of-skywalker-expanded-edition` (*Star Wars: The Rise of Skywalker: Expanded Edition*): row already has a synopsis — never overwritten
- `stories-of-jedi-and-sith` (*Stories of Jedi and Sith*): row already has a synopsis — never overwritten
- `survivors-quest` (*Survivor's Quest*): row already has a synopsis — never overwritten
- `tatooine-ghost` (*Tatooine Ghost*): row already has a synopsis — never overwritten
- `the-book-of-boba-fett-junior-novel` (*The Book of Boba Fett Junior Novel*): row already has a synopsis — never overwritten
- `the-clone-wars-no-prisoners` (*The Clone Wars: No Prisoners*): row already has a synopsis — never overwritten
- `the-clone-wars-wild-space` (*The Clone Wars: Wild Space*): row already has a synopsis — never overwritten
- `the-crystal-star` (*The Crystal Star*): row already has a synopsis — never overwritten
- `the-empire-strikes-back-so-you-want-to-be-a-jedi` (*The Empire Strikes Back: So You Want to Be a Jedi?*): row already has a synopsis — never overwritten
- `the-high-republic-a-valiant-vow` (*The High Republic: A Valiant Vow*): row already has a synopsis — never overwritten
- `the-high-republic-beware-the-nameless` (*The High Republic: Beware the Nameless*): row already has a synopsis — never overwritten
- `the-high-republic-escape-from-valo` (*The High Republic: Escape from Valo*): row already has a synopsis — never overwritten
- `the-high-republic-quest-for-planet-x` (*The High Republic: Quest for Planet X*): row already has a synopsis — never overwritten
- `the-high-republic-quest-for-the-hidden-city` (*The High Republic: Quest for the Hidden City*): row already has a synopsis — never overwritten
- `the-last-jedi-cobalt-squadron` (*The Last Jedi: Cobalt Squadron*): row already has a synopsis — never overwritten
- `the-last-order` (*The Last Order*): row already has a synopsis — never overwritten
- `the-legends-of-luke-skywalker` (*The Legends of Luke Skywalker*): row already has a synopsis — never overwritten
- `the-mandalorian-armor` (*The Mandalorian Armor*): row already has a synopsis — never overwritten
- `the-mandalorian-junior-novel` (*The Mandalorian Junior Novel*): row already has a synopsis — never overwritten
- `the-mandalorian-season-2-junior-novel` (*The Mandalorian Season 2 Junior Novel*): row already has a synopsis — never overwritten
- `the-mighty-chewbacca-in-the-forest-of-fear` (*The Mighty Chewbacca in the Forest of Fear!*): row already has a synopsis — never overwritten
- `the-new-rebellion` (*The New Rebellion*): row already has a synopsis — never overwritten
- `the-princess-and-the-scoundrel` (*The Princess and the Scoundrel*): row already has a synopsis — never overwritten
- `the-weapon-of-a-jedi-a-luke-skywalker-adventure` (*The Weapon of a Jedi: A Luke Skywalker Adventure*): row already has a synopsis — never overwritten
- `twin-crossroads` (*Twin Crossroads*): row already has a synopsis — never overwritten
- `tyrants-test` (*Tyrant's Test*): row already has a synopsis — never overwritten
- `x-wing-isards-revenge` (*X-Wing: Isard's Revenge*): row already has a synopsis — never overwritten
- `x-wing-mercy-kill` (*X-Wing: Mercy Kill*): row already has a synopsis — never overwritten
- `x-wing-starfighters-of-adumar` (*X-Wing: Starfighters of Adumar*): row already has a synopsis — never overwritten
