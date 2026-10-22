# Catalog changeset summary

Built 2026-10-20 against the PRODUCTION catalog (185 rows).
Discovery CSV sha256 `35d9d028f022`. Apply: `npx tsx scripts/apply-catalog-changeset.ts`.

| Section | Count |
| --- | --- |
| ISBN conflict fixes | 5 |
| Cover fixes (cover_image only) | 2 |
| Flagged ISBN conflicts (not fixed) | 0 |
| Updates (date_published / format) | 51 (flagged & pending review: 0) |
| Inserts | 91 (needs_type: 0) |
| Excluded | 14 |
| Needs review (not applied) | 0 |

## ISBN conflict fixes

- `brotherhood`: 9780593358603 → 9780593358573. The wiki assigns 9780593358603 to *Shadow of the Sith* (`catalog:shadow-of-the-sith`); OL: "Star Wars Shadow of the Sith".
- `heir-to-the-empire`: 9780345528292 → 9780553073270. The wiki assigns 9780345528292 to *Heir to the Empire: The 20th Anniversary Edition* (`insert:heir-to-the-empire-the-20th-anniversary-edition`); OL: "Heir to the Empire Star Wars Del Rey".
- `jedi-academy-champions-of-the-force`: 9780553568011 → 9780553298024. The wiki assigns 9780553568011 to *X-Wing: Rogue Squadron* (`catalog:x-wing-rogue-squadron`); OL: "Star Wars: Rogue Squadron Book 1 in the exciting new series!".
- `red-harvest`: 9780345511225 → 9780345511171. The wiki assigns 9780345511225 to *Scourge* (`catalog:scourge`); OL: "Star Wars Scourge".
  - primary_isbn 9780345511225 → 9780345511171
- `x-wing-rogue-squadron`: 9780553568042 → 9780553568011. The wiki assigns 9780553568042 to *X-Wing: The Bacta War* (`catalog:x-wing-bacta-war`); OL: "Star Wars: The Bacta War X-Wing Book 4".

## Cover fixes (cover_image only, keyed by id)

- `brotherhood`: current cover is built from misfiled ISBN 9780593358603; rebuilt from corrected ISBN 9780593358573
  - https://images2.penguinrandomhouse.com/cover/9780593358603
  - → https://covers.openlibrary.org/b/id/12393484-L.jpg (openlibrary:isbn:9780593358573)
- `red-harvest`: current cover is built from misfiled ISBN 9780345511225; rebuilt from corrected ISBN 9780345511171
  - https://images2.penguinrandomhouse.com/cover/9780345511225
  - → https://covers.openlibrary.org/b/id/10885073-L.jpg (openlibrary:isbn:9780345511171)

## Inserts with review flags

- *Ahsoka: A Novelization of Season One* (`ahsoka-a-novelization-of-season-one`): not yet released (2027-03-23); no cover found
- *Princess of the Rebellion* (`princess-of-the-rebellion`): not yet released (2027-05-04); no cover found
- *Reign of the Empire: From the Ashes* (`reign-of-the-empire-from-the-ashes`): not yet released (2027-08-10); no cover found
- *Star Wars: A New Hope (paperback novel)* (`star-wars-a-new-hope-paperback-novel`): dropped editor credit "edited by Emil Fortune" from author
- *Star Wars: Starfighter* (`star-wars-starfighter`): not yet released (2027-06-22); no cover found
- *Star Wars: The Empire Strikes Back (paperback novel)* (`star-wars-the-empire-strikes-back-paperback-novel`): dropped editor credit "edited by Emil Fortune" from author
- *Twin Crossroads* (`twin-crossroads`): not yet released (2027-04-06); no cover found

## Updates with review flags

✓ = reviewed and accepted by the user (2026-10-20, `APPROVED_DATE_UPDATES`); ⚠ = pending review.

- ✓ approved `corellian-trilogy-showdown`: wiki date is month-precision only (1995-08-01 → 1995-09-01)
- ✓ approved `courtship-of-princess-leia`: wiki date is month-precision only (1994-08-01 → 1994-04-01)
- ✓ approved `dark-force-rising`: wiki date is month-precision only (1992-06-01 → 1992-05-01)
- ✓ approved `fotj-apocalypse`: year changes (2011-06-21 → 2012-03-13)
- ✓ approved `jedi-academy-champions-of-the-force`: wiki date is month-precision only (1994-03-01 → 1994-10-01)
- ✓ approved `jedi-academy-dark-apprentice`: wiki date is month-precision only (1994-01-01 → 1994-07-01)
- ✓ approved `jedi-academy-jedi-search`: wiki date is month-precision only (1994-02-01 → 1994-03-01)
- ✓ approved `lotf-fury`: year changes (2008-08-26 → 2007-11-27)
- ✓ approved `lotf-inferno`: year changes (2008-05-27 → 2007-08-28)
- ✓ approved `lotf-invincible`: year changes (2009-05-19 → 2008-05-13)
- ✓ approved `shadows-of-the-empire`: wiki date is month-precision only (1996-04-01 → 1996-05-01)
- ✓ approved `the-last-command`: wiki date is month-precision only (1993-05-01 → 1993-04-01)
- ✓ approved `the-truce-at-bakura`: wiki date is month-precision only; year changes (1994-01-01 → 1993-11-01)
- ✓ approved `x-wing-bacta-war`: wiki date is month-precision only (1997-01-01 → 1997-02-01)
- ✓ approved `x-wing-iron-fist`: wiki date is month-precision only (1998-06-01 → 1998-07-01)
- ✓ approved `x-wing-krytos-trap`: wiki date is month-precision only (1996-12-01 → 1996-10-01)
- ✓ approved `x-wing-rogue-squadron`: wiki date is month-precision only (1996-12-01 → 1996-01-01)
- ✓ approved `x-wing-wedges-gamble`: wiki date is month-precision only (1996-12-01 → 1996-05-01)

## Publisher normalization (inserts)

- "Del Rey (US) Arrow Books (UK)" → "Del Rey" (split; 1): `star-wars-episode-ii-attack-of-the-clones`
- "Del Rey Random House Worlds" → "Del Rey" (split; 1): `the-princess-and-the-scoundrel`
- "Disney–Lucasfilm Press" → "Disney Lucasfilm Press" (catalog-spelling; 36): `a-new-hope-the-princess-the-scoundrel-and-the-farm-boy`, `before-the-awakening`, `galaxys-edge-a-crash-of-fate`, `hunters-battle-for-the-arena`, `join-the-resistance`, `join-the-resistance-attack-on-starkiller-base`, `join-the-resistance-escape-from-vodran`, `landos-luck`, `moving-target-a-princess-leia-adventure`, `pirates-price`, `poe-dameron-free-fall`, `return-of-the-jedi-beware-the-power-of-the-dark-side`, `servants-of-the-empire-edge-of-the-galaxy`, `servants-of-the-empire-imperial-justice`, `servants-of-the-empire-rebel-in-the-ranks`, `servants-of-the-empire-the-secret-academy`, `smugglers-run-a-han-solo-and-chewbacca-adventure`, `solo-a-star-wars-story-a-junior-novel`, `spark-of-the-resistance`, `star-wars-the-force-awakens-a-junior-novel`, `star-wars-the-last-jedi-a-junior-novel`, `stories-of-jedi-and-sith`, `the-book-of-boba-fett-junior-novel`, `the-empire-strikes-back-so-you-want-to-be-a-jedi`, `the-high-republic-a-valiant-vow`, `the-high-republic-beware-the-nameless`, `the-high-republic-escape-from-valo`, `the-high-republic-quest-for-planet-x`, `the-high-republic-quest-for-the-hidden-city`, `the-last-jedi-cobalt-squadron`, `the-last-order`, `the-legends-of-luke-skywalker`, `the-mandalorian-junior-novel`, `the-mandalorian-season-2-junior-novel`, `the-mighty-chewbacca-in-the-forest-of-fear`, `the-weapon-of-a-jedi-a-luke-skywalker-adventure`
- "Disney–Lucasfilm Press Egmont UK Ltd" → "Disney Lucasfilm Press" (split+catalog-spelling; 1): `star-wars-rogue-one-a-junior-novel`
- "Egmont UK Ltd Disney–Lucasfilm Press" → "Disney Lucasfilm Press" (split+catalog-spelling; 1): `star-wars-the-rise-of-skywalker-a-junior-novel`

## Excluded (never inserted)

- *Alien Exodus*: canceled — never published (excerpts released as fan fiction) (also {{Canceled}} on the wiki)
- *Blood Oath*: canceled — never published (also {{Canceled}} on the wiki)
- *Escape from Dagu*: canceled Clone Wars novel — never published (also {{Canceled}} on the wiki)
- *Heart of the Jedi*: canceled — never published (also {{Canceled}} on the wiki)
- *Mandorla*: canceled — never published (also {{Canceled}} on the wiki)
- *Star Wars: Dark Empire*: canceled novelization of the Dark Horse comic — never published (also {{Canceled}} on the wiki)
- *Star Wars: Starfighter (junior novelization)*: incomplete data — no ISBN, no author, placeholder release date
- *Star Wars: The Mandalorian and Grogu: The Deluxe Junior Novelization*: canceled — {{Canceled}} on the Wookieepedia page
- *The Mandalorian: An Original Novel*: canceled — never published (also {{Canceled}} on the wiki)
- *The New Jedi Order: Knightfall I: Jedi Storm*: canceled Knightfall trilogy — never published (also {{Canceled}} on the wiki)
- *The Odyssey of Star Wars: An Epic Poem*: poetry retelling, not a novel
- *The Vow of Silver Dawn*: incomplete data — no ISBN or release date, pseudonymous author
- *Triple Threat*: canceled — never published (also {{Canceled}} on the wiki)
- *Untitled Boba Fett novel*: unpublished placeholder (also {{Canceled}} on the wiki)
