# Catalog cleanup changeset

Built 2026-10-21 against the PRODUCTION catalog (276 rows), read-only.
Apply (dry-run first): `npx tsx scripts/apply-catalog-changeset.ts --production --changeset data/discovery/catalog-cleanup.json`

| Section | Count |
| --- | --- |
| ISBN repairs (primary_isbn ∉ isbn[]) | 3 (flagged: 0) |
| Cover fills (null cover_image) | 6 |
| Covers still missing (released) | 5 |
| No cover available yet (unreleased) | 5 |
| Synopsis fills — **drafted, review each** | 90 |
| Synopses skipped | 1 |

## ISBN repairs

### `path-of-deceit` — add primary_isbn to isbn[]

- before: isbn [] · primary 9781368076128
- after: isbn [9781368076128] · primary 9781368076128
- why: primary_isbn belongs to this book: Open Library titles 9781368076128 "Path of Deceit / Star Wars: The High Republic"; the wiki infobox for "The High Republic: Path of Deceit" lists 9781368076128
- wiki: *The High Republic: Path of Deceit* — infobox [9781368076128]; page lists [9781368076128, 9781761212079, 9784052062230, 9784052062247]
- Open Library 9781368076128: "Path of Deceit / Star Wars: The High Republic" (/works/OL28632293W)
- other rows holding 9781368076128: none

### `queens-hope` — add primary_isbn to isbn[]

- before: isbn [9781368075930] · primary 9781368093767
- after: isbn [9781368075930, 9781368093767] · primary 9781368093767
- why: primary_isbn belongs to this book: Open Library titles 9781368093767 "Queen's Hope"; the wiki page "Queen's Hope" lists 9781368093767 (not the infobox); 9781368093767 is the same Open Library work (/works/OL25452734W) as the row's own ISBN
- wiki: *Queen's Hope* — infobox [9781368075930]; page lists [9781368075930, 9781368077439, 9781368093767, 9783833240829]
- Open Library 9781368093767: "Queen's Hope" (/works/OL25452734W)
- Open Library 9781368075930: "Queen's Hope / Star Wars" (/works/OL25452734W)
- other rows holding 9781368093767: none

### `shadow-of-the-sith` — add primary_isbn to isbn[] + approved addition

- before: isbn [9780593358610] · primary 9781529150063
- after: isbn [9780593358610, 9781529150063, 9780593358603] · primary 9781529150063
- why: primary_isbn belongs to this book: Open Library titles 9781529150063 "Shadow of the Sith / Star Wars"; 9781529150063 is the same Open Library work (/works/OL26514933W) as the row's own ISBN; operator-approved: isbn[] += 9780593358603 (approved 2026-10-21 — the Wookieepedia infobox ISBN for "Shadow of the Sith" (Del Rey US hardcover; Open Library: same work); removed from brotherhood by the 2026-10-20 changeset and on no row since)
- wiki: *Shadow of the Sith* — infobox [9780593358603]; page lists [9780593358603, 9780593358610, 9780593358627]
- Open Library 9781529150063: "Shadow of the Sith / Star Wars" (/works/OL26514933W)
- Open Library 9780593358610: "Star Wars / Shadow of the Sith" (/works/OL26514933W)
- Open Library 9780593358603: "Star Wars / Shadow of the Sith" (/works/OL26514933W)
- other rows holding 9781529150063: none
- operator-approved addition 9780593358603: approved 2026-10-21 — the Wookieepedia infobox ISBN for "Shadow of the Sith" (Del Rey US hardcover; Open Library: same work); removed from brotherhood by the 2026-10-20 changeset and on no row since
- note: 9781529150063 does not appear on the wiki page "Shadow of the Sith"


## Cover fills (cover_image was null)

- `hiding-from-the-dark`: https://books.google.com/books/content?id=T-jREQAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api (google-books-search:isbn:9780736447027) — no cover; found via google-books-search
- `legacy`: https://books.google.com/books/content?id=rueNEQAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api (google-books-search:isbn:9780593982679) — no cover; found via google-books-search
- `reign-of-the-empire-edge-of-the-abyss`: https://books.google.com/books/content?id=shLIEQAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api (google-books-search:isbn:9780593873625) — no cover; found via google-books-search
- `star-wars-outlaws-low-red-moon`: https://books.google.com/books/content?id=WeJzEQAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api (google-books-search:isbn:9780593874509) — no cover; found via google-books-search
- `star-wars-rogue-one-a-junior-novel`: https://books.google.com/books/content?id=HEupDAEACAAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api (google-books-search:isbn:9781484705094) — no cover; found via google-books-search
- `the-last-order`: https://books.google.com/books/content?id=Ai5sEQAAQBAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api (google-books-search:isbn:9781368065610) — no cover; found via google-books-search

## Covers still missing

- `children-of-the-jedi` (*Children of the Jedi*): tried 9780553840087 on Open Library and Google Books (+ ISBN-verified title search)
- `last-shot` (*Last Shot*): tried 9780525622130 on Open Library and Google Books (+ ISBN-verified title search); 1 candidate(s) failed the HEAD check
- `sanctuary-a-bad-batch-novel` (*Sanctuary: A Bad Batch Novel*): tried 9780593874462 on Open Library and Google Books (+ ISBN-verified title search); 1 candidate(s) failed the HEAD check
- `servants-of-the-empire-imperial-justice` (*Servants of the Empire: Imperial Justice*): tried 9781484716601 on Open Library and Google Books (+ ISBN-verified title search); 1 candidate(s) failed the HEAD check
- `the-high-republic-a-valiant-vow` (*The High Republic: A Valiant Vow*): tried 9781368095204 on Open Library and Google Books (+ ISBN-verified title search); 1 candidate(s) failed the HEAD check

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
| `a-new-hope-the-princess-the-scoundrel-and-the-farm-boy` | A middle-grade retelling of A New Hope told in three parts, one each from Leia, Han, and Luke. | film/series plot + Wookieepedia article (facts only) |
| `ahsoka-a-novelization-of-season-one` | A junior novelization of Ahsoka's first season, as Ahsoka and Sabine Wren race to find Thrawn and Ezra Bridger. | announced publisher premise (unreleased) — facts only; not yet released (2027-03-23) — written from the announced premise |
| `before-the-awakening` | Three stories follow Finn, Rey, and Poe Dameron in the days before The Force Awakens. | Wookieepedia article + publisher summary (facts only) |
| `before-the-storm` | Leia faces the Yevetha's warlike Nil Spaar while Luke searches for clues about his mother and Lando chases a derelict alien ship. | Wookieepedia article + publisher summary (facts only) |
| `children-of-the-jedi` | Luke meets the spirit of Jedi Callista aboard the reawakened dreadnaught Eye of Palpatine as Leia searches Belsavis for lost Jedi children. | Wookieepedia article + publisher summary (facts only) |
| `dark-nest-i-the-joiner-king` | Young Jedi answer a mysterious summons to the Unknown Regions and are drawn into the Killik hive's border war with the Chiss. | Wookieepedia article + publisher summary (facts only) |
| `dark-nest-ii-the-unseen-queen` | The Skywalkers and Solos discover the Dark Nest still lives as Killik-fueled piracy pushes the Colony toward war. | Wookieepedia article + publisher summary (facts only) |
| `dark-nest-iii-the-swarm-war` | Luke reshapes the Jedi Order as the Chiss-Killik conflict explodes into open war and the Dark Nest makes its final move. | Wookieepedia article + publisher summary (facts only) |
| `darksaber` | Durga the Hutt builds a Death Star-based superweapon as Admiral Daala rallies the Empire and Luke seeks to restore Callista's Force powers. | Wookieepedia article + publisher summary (facts only) |
| `eyes-like-stars` | Teen Ardent Quay falls for a mysterious stowaway on her family's tour ship as they try to return an artifact home ahead of the First Order. | Wookieepedia article + publisher summary (facts only) |
| `galaxys-edge-a-crash-of-fate` | A smuggler returns to Batuu after thirteen years and reconnects with her childhood friend Jules just as a delivery job turns dangerous. | Wookieepedia article + publisher summary (facts only) |
| `galaxys-edge-black-spire` | Resistance spy Vi Moradi and ex-stormtrooper Archex try to build a rebel cell at Black Spire Outpost on Batuu. | Wookieepedia article + publisher summary (facts only) |
| `hard-merchandise` | Boba Fett and the amnesiac Neelah follow evidence tying Prince Xizor to a galaxy-shaking conspiracy as the Bounty Hunter Wars conclude. | Wookieepedia article + publisher summary (facts only) |
| `heir-to-the-empire-the-20th-anniversary-edition` | An annotated anniversary reissue of Heir to the Empire, with commentary by Zahn and a new Thrawn novella, Crisis of Faith. | Wookieepedia article + publisher summary (facts only) |
| `hiding-from-the-dark` | In a middle-grade horror tale, a girl named Bia escapes Coruscant to find her mother while a shadowy hunter closes in. | Wookieepedia article + publisher summary (facts only) |
| `hunters-battle-for-the-arena` | A Force-sensitive orphan joins the combat teams of Vespaara's Grand Arena and must learn to trust her teammates as a stranger shadows the competition. | Wookieepedia article + publisher summary (facts only) |
| `join-the-resistance` | Would-be hero Mattis Banz joins a squad of misfit Resistance recruits who must learn to work together. | Wookieepedia article + publisher summary (facts only) |
| `join-the-resistance-attack-on-starkiller-base` | J-Squadron's young recruits race to rejoin the Resistance in time for the attack on Starkiller Base. | Wookieepedia article + publisher summary (facts only) |
| `join-the-resistance-escape-from-vodran` | Captured by the First Order on Vodran, J-Squadron splits up as some recruits plot an escape and others bargain with a Hutt. | Wookieepedia article + publisher summary (facts only) |
| `landos-luck` | After a smuggling job goes wrong, Lando and L3-37 must choose between profit and helping a planet that needs a stolen artifact returned. | Wookieepedia article + publisher summary (facts only) |
| `last-shot` | Han and Lando team up years after Endor to stop a vengeful inventor's device, in a story that jumps between three eras. | Wookieepedia article + publisher summary (facts only) |
| `legacy` | Between The Last Jedi and The Rise of Skywalker, Leia and Rey travel to a Jedi temple on Tython to repair Rey's broken lightsaber. | Wookieepedia article + publisher summary (facts only) |
| `master-of-evil` | Newly armored Darth Vader obsessively hunts for a way to cheat death, chasing rumors of a shaman who can raise the dead. | Wookieepedia article + publisher summary (facts only) |
| `moving-target-a-princess-leia-adventure` | Between Empire and Jedi, Leia leads a small team on a decoy mission to draw Imperial attention away from the rebel fleet. | Wookieepedia article + publisher summary (facts only) |
| `pirates-price` | Pirate Hondo Ohnaka recounts his colorful encounters with Han, Chewie, and the Millennium Falcon. | Wookieepedia article + publisher summary (facts only) |
| `planet-of-twilight` | Leia is taken captive on the former prison world Nam Chorios while Luke searches for Callista and an ancient parasite awakens. | Wookieepedia article + publisher summary (facts only) |
| `poe-dameron-free-fall` | Sixteen-year-old Poe Dameron leaves Yavin 4 for a piloting job and ends up flying for the Kijimi spice runners. | Wookieepedia article + publisher summary (facts only) |
| `princess-of-the-rebellion` | After Yavin, Leia, Luke, and Han search for a hidden weapons cache left by Bail Organa to secure a new rebel base. | announced publisher premise (unreleased) — facts only; not yet released (2027-05-04) — written from the announced premise |
| `reign-of-the-empire-edge-of-the-abyss` | A year before Andor, Mon Mothma and Bail Organa confront the Empire's grip on truth while fractured rebel cells fight to survive. | Wookieepedia article + publisher summary (facts only) |
| `reign-of-the-empire-from-the-ashes` | The newly united Rebel Alliance struggles to hold together as Mon Mothma and Bail Organa build its base on Yavin 4. | announced publisher premise (unreleased) — facts only; not yet released (2027-08-10) — written from the announced premise |
| `republic-commando-hard-contact` | Clone commando squad Omega is dropped behind Separatist lines on Qiilura to wipe out a nanovirus designed to kill clones. | Wookieepedia article + publisher summary (facts only) |
| `republic-commando-triple-zero` | Omega Squad hunts a Separatist terror network and a mole inside Republic command on Coruscant. | Wookieepedia article + publisher summary (facts only) |
| `return-of-the-jedi-beware-the-power-of-the-dark-side` | A playful middle-grade retelling of Return of the Jedi by Origami Yoda author Tom Angleberger. | film/series plot + Wookieepedia article (facts only) |
| `sanctuary-a-bad-batch-novel` | Hunter, Tech, Wrecker, and Omega take risky jobs to fund Pabu's recovery, then find themselves shielding two fugitives hunted by the ISB. | Wookieepedia article + publisher summary (facts only) |
| `servants-of-the-empire-edge-of-the-galaxy` | Lothal teen Zare Leonis begins to doubt the Empire when his sister vanishes from the Imperial Academy. | Wookieepedia article + publisher summary (facts only) |
| `servants-of-the-empire-imperial-justice` | Undercover cadet Zare Leonis falls under suspicion at Lothal's academy while Merei digs deeper into Imperial secrets. | Wookieepedia article + publisher summary (facts only) |
| `servants-of-the-empire-rebel-in-the-ranks` | Zare Leonis enrolls at Lothal's Imperial Academy to secretly investigate his sister's disappearance. | Wookieepedia article + publisher summary (facts only) |
| `servants-of-the-empire-the-secret-academy` | Zare Leonis's search for his missing sister leads him to Commandant Hux's academy on Arkanis, where exposure could mean death. | Wookieepedia article + publisher summary (facts only) |
| `shadow-games` | Dash Rendar signs on as bodyguard to a galactic pop star whose tour is plagued by murders and ties to Black Sun. | Wookieepedia article + publisher summary (facts only) |
| `shield-of-lies` | Han spies on the Yevethan fleet, Lando is trapped aboard a runaway alien ship, and Luke studies with the Fallanassi. | Wookieepedia article + publisher summary (facts only) |
| `slave-ship` | Boba Fett fakes his death and chases a huge bounty that pulls him into Prince Xizor's plot to break the Bounty Hunters Guild. | Wookieepedia article + publisher summary (facts only) |
| `smugglers-run-a-han-solo-and-chewbacca-adventure` | After Yavin, Han and Chewbacca reluctantly extract a rebel officer from Cyrkon with an ISB agent on their tail. | Wookieepedia article + publisher summary (facts only) |
| `solo-a-star-wars-story-a-junior-novel` | A junior novelization of Solo: A Star Wars Story, with extra and deleted scenes. | film/series plot + Wookieepedia article (facts only) |
| `solo-a-star-wars-story-expanded-edition` | The film novelization of Solo, with added scenes including Han's Imperial Navy service and Qi'ra's past. | film/series plot + Wookieepedia article (facts only) |
| `spark-of-the-resistance` | Rey, Rose, Poe, and BB-8 answer a distress call and defend Minfar's Zixon people from the First Order. | Wookieepedia article + publisher summary (facts only) |
| `star-wars-a-new-hope-paperback-novel` | A junior novel adaptation of A New Hope, revised for current canon for Star Wars' 40th anniversary in 2017. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-episode-i-the-phantom-menace` | The novelization of The Phantom Menace, opening with young Anakin's life on Tatooine before the Jedi arrive. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-episode-ii-attack-of-the-clones` | The novelization of Attack of the Clones, expanding on Anakin and Padmé and adding scenes that never made the final film. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-galaxies-the-ruins-of-dantooine` | An Imperial bioengineer secretly aiding the Rebellion helps a rebel spy recover a holocron listing rebel sympathizers. | Wookieepedia article + publisher summary (facts only) |
| `star-wars-outlaws-low-red-moon` | Disinherited heir Jaylen Vrax and reprogrammed battle droid ND-5 build an underworld partnership in this Outlaws prequel. | Wookieepedia article + publisher summary (facts only) |
| `star-wars-return-of-the-jedi-paperback-novel` | A junior novel adaptation of Return of the Jedi, revised for current canon for Star Wars' 40th anniversary in 2017. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-rogue-one-a-junior-novel` | A junior novelization of Rogue One, following Jyn Erso's mission to steal the Death Star plans. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-the-clone-wars` | The novelization of the 2008 Clone Wars film, in which Anakin and new Padawan Ahsoka rescue Jabba's kidnapped son. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-the-empire-strikes-back-paperback-novel` | A junior novel adaptation of The Empire Strikes Back, revised for current canon for Star Wars' 40th anniversary in 2017. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-the-force-awakens` | The novelization of The Force Awakens, as Rey, Finn, and Poe are drawn into the fight against the First Order. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-the-force-awakens-a-junior-novel` | A junior novelization of The Force Awakens, following Rey and Finn from Jakku to Starkiller Base. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-the-force-unleashed` | Darth Vader's secret apprentice hunts the last Jedi while being groomed to help overthrow the Emperor. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-the-force-unleashed-ii` | A clone of Vader's former apprentice escapes Kamino and searches for Juno Eclipse and the truth of his identity. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-the-last-jedi-a-junior-novel` | A junior novelization of The Last Jedi with extended and exclusive scenes. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-the-last-jedi-expanded-edition` | The novelization of The Last Jedi, developed with Rian Johnson's input and including scenes from alternate drafts. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-the-rise-of-skywalker-a-junior-novel` | A junior novelization of The Rise of Skywalker with deleted and extended scenes. | film/series plot + Wookieepedia article (facts only) |
| `star-wars-the-rise-of-skywalker-expanded-edition` | The novelization of The Rise of Skywalker with expanded scenes and material not seen in the film. | film/series plot + Wookieepedia article (facts only) |
| `stories-of-jedi-and-sith` | Ten short stories by different authors pit iconic Jedi against Sith, from Obi-Wan and Luke to Vader and Maul. | Wookieepedia article + publisher summary (facts only) |
| `survivors-quest` | Luke and Mara Jade travel to the Unknown Regions to recover the wreck of the Outbound Flight Jedi expedition. | Wookieepedia article + publisher summary (facts only) |
| `tatooine-ghost` | Han and Leia go to Tatooine to recover a lost Alderaanian painting hiding a vital code, and Leia learns about her father's past. | Wookieepedia article + publisher summary (facts only) |
| `the-book-of-boba-fett-junior-novel` | A junior novelization of The Book of Boba Fett, as Boba and Fennec Shand take over Jabba's former territory on Tatooine. | film/series plot + Wookieepedia article (facts only) |
| `the-clone-wars-no-prisoners` | Ahsoka and Captain Rex join Gilad Pellaeon's rescue of a Republic spy, and Ahsoka meets a Jedi who rejects Order tradition. | Wookieepedia article + publisher summary (facts only) |
| `the-clone-wars-wild-space` | Obi-Wan and Bail Organa chase intelligence to a remote world that proves far more dangerous than they expect. | Wookieepedia article + publisher summary (facts only) |
| `the-crystal-star` | Leia searches for her kidnapped children while Luke and Han investigate a strange cult near a crystallizing star. | Wookieepedia article + publisher summary (facts only) |
| `the-empire-strikes-back-so-you-want-to-be-a-jedi` | A middle-grade retelling of The Empire Strikes Back that puts the reader in Luke's place as he trains to be a Jedi. | film/series plot + Wookieepedia article (facts only) |
| `the-high-republic-a-valiant-vow` | Padawans and younglings join forces against the spreading blight and swarms of destructive scav droids. | Wookieepedia article + publisher summary (facts only) |
| `the-high-republic-beware-the-nameless` | Ram Jomaram and a group of stowaway younglings answer a distress call in the Occlusion Zone and face the Nameless. | Wookieepedia article + publisher summary (facts only) |
| `the-high-republic-escape-from-valo` | Trapped on Nihil-occupied Valo, Padawan Ram Jomaram leads three young Jedi in protecting his home. | Wookieepedia article + publisher summary (facts only) |
| `the-high-republic-quest-for-planet-x` | Prospectors Dass and Sky enlist Padawan Rooper Nitani in a hunt for the legendary Planet X. | Wookieepedia article + publisher summary (facts only) |
| `the-high-republic-quest-for-the-hidden-city` | Jedi Silandra Sho and Padawan Rooper Nitani search the monster-haunted planet Gloam for a missing Pathfinder team. | Wookieepedia article + publisher summary (facts only) |
| `the-last-jedi-cobalt-squadron` | Bomber crew sisters Rose and Paige Tico risk a covert mission to deliver aid to a system the First Order is starving. | Wookieepedia article + publisher summary (facts only) |
| `the-last-order` | After The Rise of Skywalker, Finn and Jannah track the First Order officer behind the kidnapping of a shipful of children. | Wookieepedia article + publisher summary (facts only) |
| `the-legends-of-luke-skywalker` | Deckhands on a ship to Canto Bight swap tall tales about Luke Skywalker, unsure which are true. | Wookieepedia article + publisher summary (facts only) |
| `the-mandalorian-armor` | Boba Fett escapes the Sarlacc as flashbacks reveal Prince Xizor's scheme to turn the Bounty Hunters Guild against itself. | Wookieepedia article + publisher summary (facts only) |
| `the-mandalorian-junior-novel` | A junior novelization of The Mandalorian's first season, as Din Djarin chooses to protect the Child. | film/series plot + Wookieepedia article (facts only) |
| `the-mandalorian-season-2-junior-novel` | A junior novelization of The Mandalorian's second season, as Din Djarin seeks a Jedi to take in Grogu. | film/series plot + Wookieepedia article (facts only) |
| `the-mighty-chewbacca-in-the-forest-of-fear` | Chewbacca takes a job in a fear-inducing forest to recover a dark artifact and save Han Solo. | Wookieepedia article + publisher summary (facts only) |
| `the-new-rebellion` | A Dark Jedi named Kueller threatens the New Republic with mass murder while Han is framed for a Senate bombing. | Wookieepedia article + publisher summary (facts only) |
| `the-princess-and-the-scoundrel` | Han and Leia marry on Endor and honeymoon aboard the luxury starliner Halcyon as Imperial remnants threaten the peace. | Wookieepedia article + publisher summary (facts only) |
| `the-weapon-of-a-jedi-a-luke-skywalker-adventure` | Luke is drawn to a Jedi temple on Devaron, where he must protect a local girl and duel the scavenger Sarco Plank. | Wookieepedia article + publisher summary (facts only) |
| `twin-crossroads` | Training together after Endor, Luke and Leia go undercover on Coruscant and confront their parents' legacy. | announced publisher premise (unreleased) — facts only; not yet released (2027-04-06) — written from the announced premise |
| `tyrants-test` | Chewbacca leads a rescue for the captured Han as Leia commits the New Republic to war with the Yevetha. | Wookieepedia article + publisher summary (facts only) |
| `x-wing-isards-revenge` | Rogue Squadron reluctantly allies with Ysanne Isard to free prisoners held by Warlord Krennel. | Wookieepedia article + publisher summary (facts only) |
| `x-wing-mercy-kill` | Decades later, Wraith Squadron reunites to expose a Galactic Alliance general tied to the Lecersen Conspiracy. | Wookieepedia article + publisher summary (facts only) |
| `x-wing-starfighters-of-adumar` | Wedge and three veteran pilots lead a diplomatic mission to Adumar, a world that prizes fighter pilots above all. | Wookieepedia article + publisher summary (facts only) |

## Synopses skipped

- `star-wars-starfighter` (*Star Wars: Starfighter*): unreleased film novelization (2027-06-22); only a one-line announcement exists — the plot is not public, so no accurate synopsis can be written yet
