---
title: "data: Manual ISBN review — books needing human verification"
type: data
date: 2026-05-05
related: docs/plans/2026-05-05-feat-catalog-data-quality-pass-plan.md
---

# Manual ISBN Review

Books where the pipeline could not fully verify the primary_isbn against OpenLibrary + Google Books. **0 of these are provably wrong** — they're just unverifiable automatically. Most likely correct; flagged here for human review.

## Categories

- **Weak (28)**: one API disagrees, often because OL has a generic "Star Wars" record. Likely correct CSV ISBN; OL just has sparse metadata.
- **No-data (12)**: neither API has the ISBN. Usually very new books (Acolyte tie-ins, THR Phase III) or older UK printings.

## How to use this list

1. Pick a row. Verify the ISBN at the publisher's site or Amazon.
2. If ISBN is correct → no action.
3. If ISBN is wrong → update the row in [data/books.csv](../../data/books.csv), then re-run `npx tsx scripts/source-isbns.ts && npm run db:seed`.
4. Optionally add a manual override to [data/isbn-manual-overrides.json](../../data/isbn-manual-overrides.json) (slug → [isbns…]; survives pipeline regen) and [data/cover-manual-overrides.json](../../data/cover-manual-overrides.json) (slug → cover URL).

## Weak (one API disagrees or has a generic record)

| Slug | Title | Author | DB primary_isbn | OL says | GB says |
|---|---|---|---|---|---|
| a-new-dawn | A New Dawn | John Jackson Miller | `9780553391473` | Star Wars | — |
| a-new-hope-novelization | Star Wars: From the Adventures of Luke Skywalker | George Lucas, Alan Dean Foster | `9780345279132` | Star Wars | — |
| a-test-of-courage | A Test of Courage | Justina Ireland | `9781760508104` | The High Republic | — |
| aftermath | Aftermath | Chuck Wendig | `9780345511621` | Star Wars Generations A Celebration Of Fandom | — |
| aftermath-life-debt | Aftermath: Life Debt | Chuck Wendig | `9780345511638` | Bubby's brunch cookbook | — |
| cataclysm | The High Republic: Cataclysm | Lydia Kang | `9781529907834` | Star Wars | — |
| choices-of-one | Choices of One | Timothy Zahn | `9780345511263` | Star Wars | — |
| corellian-trilogy-assault | Assault at Selonia | Roger MacBride Allen | `9780553572849` | — | Crack in the Sky |
| dark-disciple | Dark Disciple | Christie Golden | `9780099580133` | Star Wars | — |
| dark-lord-rise-of-darth-vader | Dark Lord: The Rise of Darth Vader | James Luceno | `9780099491231` | Star Wars | — |
| defy-the-storm | The High Republic: Defy the Storm | Tessa Gratton, Justina Ireland | `9781368093941` | — | The Joy Strategist |
| fotj-apocalypse | Apocalypse | Troy Denning | `9781846056925` | Star Wars : Fate of the Jedi | — |
| fotj-vortex | Vortex | Troy Denning | `9780345477590` | Star Wars | — |
| han-solo-at-stars-end | Han Solo at Stars' End | Brian Daley | `9780345912084` | Star Wars | — |
| lords-of-the-sith | Lords of the Sith | Paul S. Kemp | `9780099542681` | Star Wars | — |
| njo-force-heretic-reunion | Force Heretic III: Reunion | Sean Williams, Shane Dix | `9780307795625` | Reunion : Star Wars Legends | — |
| red-harvest | Red Harvest | Joe Schreiber | `9780345511225` | Star Wars | — |
| reign-of-the-empire-mask-of-fear | Reign of the Empire: The Mask of Fear | Alexander Freed | `9780593722725` | — | In an Orchard Grown from Ash |
| the-fallen-star | The Fallen Star | Claudia Gray | `9780593355411` | Star Wars | — |
| the-old-republic-revan | The Old Republic: Revan | Drew Karpyshyn | `9781781162040` | Star Wars | — |
| thrawn-ascendancy-chaos-rising | Thrawn Ascendancy: Chaos Rising | Timothy Zahn | `9780593157695` | Star Wars | — |
| thrawn-ascendancy-greater-good | Thrawn Ascendancy: Greater Good | Timothy Zahn | `9780593157701` | Star Wars | — |
| victorys-price | Victory's Price | Alexander Freed | `9781529101393` | Star Wars | — |
| x-wing-bacta-war | X-Wing: The Bacta War | Michael Stackpole | `9780553570074` | — | The Trial of Jessica Wakefield |
| x-wing-iron-fist | X-Wing: Iron Fist | Aaron Allston | `9780553570098` | — | Running for Her Life |
| x-wing-krytos-trap | X-Wing: The Krytos Trap | Michael Stackpole | `9780553570067` | — | Busted! |
| x-wing-solo-command | X-Wing: Solo Command | Aaron Allston | `9780553570104` | — | The Roommate |
| x-wing-wedges-gamble | X-Wing: Wedge's Gamble | Michael Stackpole | `9780553570050` | — | Elizabeth's Secret Diary |

## No-data (neither API has the ISBN)

| Slug | Title | Author | DB primary_isbn |
|---|---|---|---|
| acolyte-crystal-crown | The Acolyte: The Crystal Crown | Tessa Gratton | `9781368082167` |
| acolyte-wayseeker | The Acolyte: Wayseeker | Justina Ireland | `9780593723456` |
| bloodline | Bloodline | Claudia Gray | `9780345511362` |
| corellian-trilogy-ambush | Ambush at Corellia | Roger MacBride Allen | `9780553572832` |
| corellian-trilogy-showdown | Showdown at Centerpoint | Roger MacBride Allen | `9780553572856` |
| hand-of-thrawn-vision | Vision of the Future | Timothy Zahn | `9780553572993` |
| into-the-light | The High Republic: Into the Light | Claudia Gray | `9781368093965` |
| mace-windu-glass-abyss | Mace Windu: The Glass Abyss | Steven Barnes | `9780593723449` |
| temptation-of-the-force | The High Republic: Temptation of the Force | Tessa Gratton | `9780593598535` |
| the-living-force | The Living Force | John Jackson Miller | `9780593598559` |
| trials-of-the-jedi | The High Republic: Trials of the Jedi | Charles Soule | `9780593598542` |
| x-wing-wraith-squadron | X-Wing: Wraith Squadron | Aaron Allston | `9780553570081` |
