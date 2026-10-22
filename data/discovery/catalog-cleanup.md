# Catalog cleanup changeset

Built 2026-10-22 against the PRODUCTION catalog (276 rows), read-only.
Apply (dry-run first): `npx tsx scripts/apply-catalog-changeset.ts --production --changeset data/discovery/catalog-cleanup.json`

| Section | Count |
| --- | --- |
| ISBN repairs (primary_isbn ∉ isbn[]) | 0 (flagged: 0) |
| Cover fills (null cover_image) | 2 |
| … of which work-level fallback (may be a different printing) | 2 |
| Covers still missing (released) | 3 |
| No cover available yet (unreleased) | 5 |
| Synopsis fills — **drafted, review each** | 0 |
| Synopses skipped | 1 |

## ISBN repairs


## Cover fills (cover_image was null)


### Work-level Open Library fallback — review each

No per-ISBN source had a cover, so these come from the Open Library **work** (all printings of the book), not the row’s own ISBN. The image may show a different printing (paperback vs. hardcover, a reissue). Each was downloaded and visually reviewed (note below); `openlibrary-search` fills are a **different edition: title+author match** — no row ISBN is on Open Library.

- `children-of-the-jedi` — **different edition: title+author match**: https://covers.openlibrary.org/b/id/372419-L.jpg (`openlibrary-search:title+author:OL497873W`) — no cover by ISBN; different edition: title+author match — no row ISBN is on Open Library; the search returned only OL497873W "Star Wars - Children of the Jedi" (Barbara Hambly, first published 1995); may be a different printing; visual review: 2026-10-22 — downloaded 276×475 JPEG of the English Bantam Spectra mass-market cover ("Star Wars / Children of the Jedi / Barbara Hambly"); not a placeholder or a foreign edition
- `last-shot` — same OL work as a row ISBN: https://covers.openlibrary.org/b/id/8568524-L.jpg (`openlibrary-work:OL19653601W`) — no cover by ISBN; Open Library work cover — 9780525622130's edition belongs to OL19653601W "Star Wars - Last Shot - A Han and Lando Novel" (Daniel José Older); may be a different printing; visual review: 2026-10-22 — downloaded 279×500 JPEG of the English Del Rey cover ("Star Wars / Last Shot / A Han and Lando Novel / Daniel José Older"); likely the later paperback printing (bestseller banner + review quote), not a placeholder or a foreign edition

## Covers still missing

- `sanctuary-a-bad-batch-novel` (*Sanctuary: A Bad Batch Novel*): tried 9780593874462 on Open Library and Google Books (+ ISBN-verified title search); 1 candidate(s) failed the HEAD check; work-level fallback: same-work: OL44264240W "Star Wars / Sanctuary: A Bad Batch Novel" (via 9780593874462): authors [—] ≠ row [Lamar Giles]
- `servants-of-the-empire-imperial-justice` (*Servants of the Empire: Imperial Justice*): tried 9781484716601 on Open Library and Google Books (+ ISBN-verified title search); 1 candidate(s) failed the HEAD check; work-level fallback: same-work: OL27832612W "Star Wars Rebels Servants of the Empire" (via 9781484716601): title does not match "Servants of the Empire: Imperial Justice"
- `the-high-republic-a-valiant-vow` (*The High Republic: A Valiant Vow*): tried 9781368095204 on Open Library and Google Books (+ ISBN-verified title search); 1 candidate(s) failed the HEAD check; work-level fallback: same-work: OL42425956W "Star Wars : the High Republic" (via 9781368095204): title does not match "The High Republic: A Valiant Vow"

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
