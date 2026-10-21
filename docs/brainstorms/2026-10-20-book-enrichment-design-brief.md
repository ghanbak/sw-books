---
title: "Book Enrichment (Wookieepedia) — Design Brief"
type: brainstorm
date: 2026-10-20
revised: 2026-10-21
parent: docs/plans/2026-07-01-feat-wookieepedia-enrichment-satellite-plan.md
status: design-only (no implementation)
---

# Book Enrichment — Design Brief

The cover sells the book. The enrichment answers two questions: *when does this happen?* and *who's in it?* It sits below the fold, speaks quietly, and links back to the source.

**Final scope (2026-10-21):** Timeline card, Characters card (curated main cast only), Wookieepedia card, and a full-height Characters sheet. Appearances (category index, pills, all other categories) and the `1ST` debut badge are cut. No character images.

**Reference designs (Figma `QXX32qKJOCbQzkEnO9tJPA`):**

| What | Node | Link |
|---|---|---|
| Section *Screens → Book Enrichment* (authoritative) | `248:2026` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=248-2026) |
| 1 · Book Detail — enriched, with Characters (*Star by Star*) | `248:1397` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=248-1397) |
| 4 · Book Detail — Timeline only (*Heir to the Empire: 20th Anniversary*) | `248:1736` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=248-1736) |
| Characters card | `248:1446` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=248-1446) |
| Wookieepedia card | `248:1966` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=248-1966) |
| 2a · Characters sheet — full height (top of list: header, search, Main cast, start of Other characters) | `263:3350` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=263-3350) |
| 2b · Characters sheet — scrolled to the end (mentioned rows, footer) | `264:1887` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=264-1887) |
| Components *Components → Book Enrichment — components* | `234:2` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=234-2) |
| `Enrichment / Card Title` (Label · See all link · Count) | `259:16` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=259-16) |
| `Enrichment / Character Row` (Mentioned No/Yes) | `259:29` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=259-29) |
| `SubtleButton` (adds `Width=Fill`) | `234:25` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=234-25) |
| `Enrichment / Wookieepedia Attribution` (`Layout=Card`) | `259:110` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=259-110) |
| `Enrichment / Timeline Row` | `234:35` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=234-35) |
| Deprecated components (do not build) | `259:1936` | [open](https://www.figma.com/design/QXX32qKJOCbQzkEnO9tJPA/Ossus-Archives?node-id=259-1936) |
| Old proposal (superseded, reference only) | `236:556` | — |

**Data (prod, 2026-10-20):** 269/276 books enriched. 268 have a timeline. 82 have a `dramatis_personae` (6–42 entries). *Star by Star*: 32 main cast + 103 other characters = 135 sheet rows; 35 of the 103 are mention-only.

---

## 1. Placement

```
Title / author
HoloCover (hero)
Synopsis
[ Find on Amazon ]                 ← primary CTA, unchanged
TIMELINE card                      ← new, when timeline_notes
CHARACTERS card         See all ›  ← new, only when dramatis_personae is non-empty
[ ↗ View on Wookieepedia ]         ← new card: full-width button + attribution line
From Wookieepedia contributors · CC BY-SA 3.0
DETAILS / SERIES / FORMATS / IDENTIFIERS   ← unchanged
```

- The enrichment cards sit in one stack between Amazon and Details: `gap: 12` between cards, the screen's existing `gap: 20` before and after the stack.
- All three use the existing `Card` (datapad notch included), body padding 12, and the shared `CardTitle` (§5).
- **Dedupe:** when `timeline_notes` is present, hide the Details card's `Timeline` row.

## 2. Timeline card

Unchanged from the previous brief.

- Title `Timeline`. Parse `timeline_notes` with `parseTimeline()`: split on `;` at parenthesis depth 0 only; a trailing `(…)` group becomes the segment label (first letter capitalized); ASCII hyphens between numbers become en dashes.
- Single segment: range 17/22, 600, `text.primary`, tabular-nums.
- Multiple segments: one row per segment (range 15/20, 600; label 13/18, 400, `text.secondary`, marginTop 2), `paddingVertical: 10`. Show every segment.
- Not interactive.

## 3. Characters card

Only for books with a curated main cast (`appearances.dramatis_personae`, 82 books). Every other book shows the Timeline card and the Wookieepedia card only (frame 4). No preview is invented from `characters`.

- **Title row:** `CardTitle` `Characters` with trailing link **`See all`**. No count in the link (user decision 2026-10-21); the sheet header carries the count.
  - Link: 11/13, 700, letterSpacing 1.2, `accent.primary`, no uppercase, followed by `chevron.right` SF Symbol 9pt semibold `accent.primary`, gap 3. Row height stays 17.
  - The text + chevron are one `Pressable`. Hit target ≥ 44pt: `hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}`. Pressed `opacity: 0.6`.
  - Opens the Characters sheet (§4).
  - Show it whenever the sheet holds more rows than the card shows (cast > 5, or any other characters).
- **Rows:** the first 5 `dramatis_personae` entries in wiki order, as `CharacterRow` (§3.1). No dividers between rows (matches frame 1).

### 3.1 `CharacterRow`

Text only. No images, no badges, no per-row chevron.

- `paddingVertical: 8`, `minHeight: 44`, items centered vertically.
- Name: 15/20, 500, letterSpacing −0.23, `text.primary`.
- Note (line 2, if present): 13/18, 400, letterSpacing −0.08, `text.secondary`, marginTop 2. Cast `note` is the role: capitalize the first letter (`chief of state (male Bothan)` → `Chief of state (male Bothan)`). Other characters' notes (aliases like `"Quiet"`) render verbatim.
- **Mentioned-only** (`isMentionOnly(entry)`: `mentioned`, `indirect_mention`, `first_mentioned`, `first_canon_mentioned`): name in `text.secondary`, plus the trailing cue word `mentioned` (13/18, 400, `text.secondary`, right-aligned, marginLeft 12, `flexShrink: 0`). The word is the non-color cue (WCAG 1.4.1).
- No other marker renders anything (`first`, `hologram`, etc. are ignored).
- Linked (`page` set): pressable, opens `wikiUrl(page)` with `openInAppBrowser()` (light impact + `PAGE_SHEET`). Pressed `opacity: 0.6`. Unlinked (`page === null`): not pressable, no pressed state.
- At `fontScale ≥ 1.35` the cue word moves to the start of line 2 (`mentioned · "Chewie"`).

## 4. Characters sheet

A full-height bottom sheet over the detail screen. It lists every character: main cast first, then the rest.

### 4.1 Figma frames and kit parts

Frames 2a (`263:3350`) and 2b (`264:1887`) are tall frames, like frames 1 and 4: they show the sheet's scroll content, not one 874pt viewport. 2a is the top of the list; 2b is the end of the list, with the search field scrolled away.

The chrome is the **iOS and iPadOS 27** kit, in its Dark mode (the kit's *Colors* collection set to Dark on each instance):

| Part | Kit component |
|---|---|
| Sheet, dimming layer, grabber | `Sheet - iPhone`, `Detent=Large` (set key `b638240e…`). Its sheet background is overridden to `surface.background`. |
| Header | `Toolbar - Top - iPhone`, `Style=Title 2 Line`, in the sheet's Content slot. Leading = close (`xmark`) glass button; Trailing slot hidden. |
| Search | `Accessory Bar - iPhone/Search`, `Mode=Dark`, at rest (cursor and Done hidden), side padding 20 to align with the cards |
| Status bar / home indicator | `Status bar - iPhone 17 Pro` / `Home Indicator` |

Behind the sheet is a copy of frame 1 (dimmed by the kit overlay), so the user's frame stays untouched.

Older sheets in the file (`Sheet - Inspector - iPhone`) and the detail frames' toolbars are iOS 26 kit parts. They're left as they are.

### 4.2 Presentation

- **Detent:** full height only (`sheetAllowedDetents: [1.0]`). Grabber visible. Swipe down or the close button dismisses.
- The detail screen stays underneath, dimmed and recessed by the system.
- Opening a character's wiki page presents the in-app browser (`PAGE_SHEET`) over the Characters sheet. Closing it returns to the sheet at the same scroll position.

### 4.3 Layout (screen padding 20, same as detail)

```
          ───                       grabber (system)
(✕)        Characters               header: close leading, title centered
         135 in this book           subtitle
[ 🔍 Search characters          ]   search field
┌ MAIN CAST                   32 ┐  Card + CardTitle (Trailing = count)
│ Alema Rar                      │
│ Jedi Knight (female Twi'lek)   │
│ …32 rows                       │
└─▬▬ ▬ ────────────╭──────╮──────┘  CardNotch
┌ OTHER CHARACTERS           103 ┐
│ Gial Ackbar          mentioned │  mention-only: dim name + cue word
│ Adarakh                        │
│ Tam Azur-Jamin                 │
│ "Quiet"                        │
│ …                              │
└─▬▬ ▬ ────────────╭──────╮──────┘
┌ [ ↗ View on Wookieepedia ]     ┐  footer: the same Wookieepedia card
│ From Wookieepedia contributors…│
└────────────────────────────────┘
```

- **Header** (pinned; the list scrolls under it): close button leading (`xmark`, 44×44, `GlassIconButton`), title `Characters` 17/22, 600, `text.primary`, centered; subtitle `{total} in this book` 13/18, `text.secondary` (`total` = rows in the sheet, `toLocaleString()`). No trailing button.
- **Search field:** first list item, below the header (§4.4).
- **Sections:** one `Card` per section, `gap: 12`, the same component as the detail cards. `CardTitle` with `trailing` = count in `text.secondary`, tabular-nums.
  1. `Main cast`: all `dramatis_personae` rows, name + role.
  2. `Other characters`: `characters`, excluding any entry whose `page` (or `name` when `page` is null) matches a cast entry. *Star by Star* has no overlap, but guard anyway.
  - Wiki order inside each section. No sticky section headers.
- **Rows:** `CharacterRow` (§3.1). The mentioned treatment applies in both sections.
- **Footer:** the Wookieepedia card (§6), `marginTop: 12`, bottom padding = `insets.bottom + 16`.
- **No caption** about links. The detail screen doesn't use captions and the rows don't need one: pressed state + the VoiceOver hint carry it.

### 4.4 Search: included

135 rows is about seven screens, and wiki order is by surname: Thrawn is filed as `Mitth'raw'nuruodo`, and "Chewie" and "Jag Fel" only appear in notes. Scrolling can't find those; a search over name + note can. It costs one row of chrome.

- Visual: the kit's search field (capsule, `magnifyingglass` leading, `xmark.circle.fill` clear when non-empty). In RN: a `TextInput` in a 48-tall capsule (frames 2a), `surface.card` fill, radius 24, 17pt `text.primary`, placeholder `Search characters` in `text.hint`, `returnKeyType="search"`, `clearButtonMode="while-editing"`.
- Match: case- and diacritic-insensitive (NFD, strip combining marks) on `name` and `note`. Use `useDeferredValue(query)`.
- While a query is active: sections with no hits disappear, counts show the number of matches, rows keep their treatment. Empty result: centered `No matches`, 15/20, `text.secondary`, `paddingTop: 48`.
- `keyboardDismissMode="on-drag"` on the list.

### 4.5 Accessibility

- **VoiceOver:** a native form sheet is modal for VoiceOver automatically. The two-finger Z gesture (escape) dismisses it.
  - Header title: `accessibilityRole="header"`. Close: `button`, `Close`.
  - Section title: `header`, `Main cast, 32`.
  - Row: one element. `link` when linked (`text` when not), label `{name}[, mentioned only][, {note}]`, hint `Opens on Wookieepedia.`
  - Search: `search` role, label `Search characters`. Announce the result count after a debounce: `{n} matches`.
  - Detail card link: `button`, `See all characters`, hint `Opens the character list.`
- **Reduce Motion:** the sheet presentation is native, so the system handles it. Add no custom animation in the sheet. Results update without layout animation. The detail screen's enrichment fade-in uses `ReduceMotion.System`.
- **Dynamic Type:** everything scales, rows grow (`minHeight` only), header title may wrap to 2 lines. Don't set `maxFontSizeMultiplier`.
- **Contrast** on `surface.card`: `text.primary` 14.8, `text.secondary` 6.9, `accent.primary` 5.2. All pass. The one exception is the attribution line in `text.hint` (2.7), which the user accepted (§6).

### 4.6 RN implementation (recommended)

Use the **Expo Router form sheet route**, the same pattern as the profile sheet in `app/_layout.tsx` (`presentation: 'formSheet'`). `components/affiliate-disclosure-sheet.tsx` no longer exists; it was folded into the profile sheet in the nav redesign.

```tsx
// app/_layout.tsx
<Stack.Screen
  name="characters/[id]"
  options={{
    presentation: 'formSheet',
    headerShown: false,
    sheetAllowedDetents: [1.0],
    sheetGrabberVisible: true,
    // no sheetCornerRadius: the system default matches the iOS 27 kit sheet in 2a/2b
  }}
/>
```

- Give the sheet's root view `backgroundColor: tokens.surface.background` (the frames override the kit's elevated background with it, so the cards read as on the detail screen).

- Sibling route `app/characters/[id].tsx` (param `id` = book id), so `app/book/[id].tsx` and its patched header config stay untouched. Push with `router.push({ pathname: '/characters/[id]', params: { id: book.id } })`.
- Header + search are plain RN views (`headerShown: false`, like profile). Don't use `headerSearchBarOptions` inside a form sheet; native header search in sheets is unreliable on react-native-screens 4.26.
- List: `FlashList` v2 (already a dependency) as the sheet's scroll view, flat rows with `getItemType` (`'search' | 'header' | 'entry' | 'footer' | 'gap'`). 135 rows is small, but item types keep the card-section rendering clean. Rows are `React.memo`.
- Data comes from the module cache filled by `useBookEnrichment` on the detail screen. Cold entry (deep link): centered `ActivityIndicator` (`text.secondary`) until data arrives.
- Not `@expo/ui` `List`: the rows and sections carry the app's custom card + notch styling, which the SwiftUI list can't express.

## 5. `CardTitle`

Extract to `components/ui/card.tsx`: 11/13, 700, uppercase, letterSpacing 1.2, **`text.secondary`** (was `text.hint`, 2.7:1, which fails AA; this brightens the existing Details/Series/Formats/Identifiers titles too, on purpose), paddingBottom 4, row with `gap: 8`.

```ts
type CardTitleProps = {
  children: string;
  trailing?: { kind: 'count'; value: number } | { kind: 'link'; label: string; onPress: () => void };
};
```

- `count`: same type style, `text.secondary`, tabular-nums (sheet sections).
- `link`: §3 spec (not uppercase, `accent.primary`, chevron, hitSlop).

## 6. Wookieepedia card

Its own `Card` (notch included), directly after the Characters card, or after the Timeline card when there's no cast. Also the sheet footer.

- Body: `paddingTop: 8` above the button (plus card padding 12), `gap: 8` between the button and the line.
- **Button:** `SubtleButton` with `onCard` + `fullWidth`. Copy exactly **`View on Wookieepedia`**.
  - Height 36 (`minHeight`), radius 18, fill `surface.background`, no border, content centered, gap 6.
  - Icon `arrow.up.forward.app` 15, medium, `accent.primary`. Label 14/18, 500, letterSpacing −0.15, `text.primary`.
  - Hit target: `hitSlop={{ top: 4, bottom: 4 }}` → 44. Pressed `opacity: 0.6`, disabled `0.38`.
  - `openInAppBrowser(enrichment.source_url)`.
- **Attribution line:** `From {attribution} · {license}` → `From Wookieepedia contributors · CC BY-SA 3.0`. 12/16, 400, **`text.hint`**, centered, not interactive. Hint is 2.7:1 on `surface.card`, below AA for 12pt text; the user accepted that knowingly (2026-10-21) to keep the line quiet. Don't "fix" it to `text.secondary`.

## 7. States

| State | Detail screen | Sheet |
|---|---|---|
| No `book_enrichment` row (7 books) | As today. Details `Timeline` row stays. | Unreachable |
| Timeline, no `dramatis_personae` | Timeline card + Wookieepedia card (frame 4) | Unreachable |
| `dramatis_personae` present | Timeline (if any) + Characters + Wookieepedia (frame 1) | Reachable |
| Neither timeline nor cast | Render nothing (a lone attribution card reads as a bug). Details `Timeline` row stays. | Unreachable |
| Loading (first visit) | Render nothing; fade in on arrival, `FadeIn.duration(200).reduceMotion(ReduceMotion.System)`. No skeleton. | Cache hit: immediate. Cold: `ActivityIndicator`. |
| Fetch error | Silent (render nothing), retry next mount | `ErrorState`, `Couldn't load characters`, retry |

## 8. Copy

| Where | Copy |
|---|---|
| Card titles | `Timeline` · `Characters` |
| Card link | `See all` (no count) |
| Sheet title / subtitle | `Characters` / `{total} in this book` |
| Sheet sections | `Main cast` · `Other characters` |
| Search placeholder / empty | `Search characters` / `No matches` |
| Cue word | `mentioned` |
| Button | `View on Wookieepedia` |
| Attribution | `From Wookieepedia contributors · CC BY-SA 3.0` |
| Sheet load error | `Couldn't load characters` |

## 9. Implementation checklist (Luis)

Ship in order; each step is reviewable alone.

1. **`lib/wookieepedia/url.ts`** (new): move `WIKI_BASE_URL` + `wikiUrl()` out of `enrich-sync.ts` (which re-exports them). The app must not import `enrich-sync.ts` (`node:crypto`).
2. **`lib/wookieepedia/enrichment-display.ts`** + Vitest:
   - `parseTimeline(notes)`, `timelineAccessibilityLabel(segments)`
   - `formatRole(note)` (capitalize first letter), `formatLicense(license)`
   - `buildCharacterRows(appearances, query): { rows: CharacterListRow[]; total: number; castCount: number; otherCount: number }`. Cast first, others deduped against cast, search filter applied.
   - `characterAccessibilityLabel(entry)` (`…, mentioned only, …`)
   - Reuse the existing `isMentionOnly()` from `lib/wookieepedia/enrichment.ts`.
3. **`lib/hooks.tsx`**: `useBookEnrichment(bookId)` → `{ status, enrichment, fromCache, retry }`, module-level cache (`book_enrichment` select `.eq('book_id', id).maybeSingle()` → `parseEnrichment`).
4. **`lib/external-link.ts`**: `openInAppBrowser(url)` (light impact + `PAGE_SHEET`). Refactor `buy-on-amazon-button.tsx` to use it.
5. **`components/ui/subtle-button.tsx`**: `SubtleButton({ label, onPress, icon?, onCard?, fullWidth?, disabled?, accessibilityRole?, accessibilityLabel?, accessibilityHint? })`.
6. **`components/ui/card.tsx`**: export `CardTitle` (§5); replace `styles.cardTitle` in `app/book/[id].tsx`.
7. **`components/enrichment/`**:
   - `timeline-card.tsx`
   - `character-row.tsx` (memo)
   - `characters-card.tsx` (first 5 + `See all` → present the sheet)
   - `wookieepedia-card.tsx` (button + attribution in a `Card`)
   - `enrichment-section.tsx` (Timeline → Characters → Wookieepedia, §1 gaps, §7 rules)
8. **`app/characters/[id].tsx`** (new form sheet route, §4.6) + register in `app/_layout.tsx`.
9. **`app/book/[id].tsx`**: call `useBookEnrichment`, render `EnrichmentSection` after Amazon, hide the Details `Timeline` row when `timeline_notes` exists, swap in `CardTitle`.

**Acceptance:**
- The 7 unenriched books look as today, apart from the `CardTitle` color.
- Books without a cast show no Characters card and no `See all`.
- *Star by Star*: `See all` opens a full-height sheet; `thrawn` in search finds `Mitth'raw'nuruodo`; VoiceOver reads `…, mentioned only` on mention rows; tapping a name opens its wiki page and closing returns to the same scroll position.
- At AX3 text size nothing truncates and no names collide with the cue word.
- No `1ST`, no Appearances, no character images anywhere.

## 10. Decisions (user, 2026-10-21)

- **`See all` carries no count.** The sheet header shows the total.
- **Attribution line stays `text.hint`.** The sub-AA contrast is accepted on purpose.

## Not in scope

Appearances (all categories other than characters), debut badges and other marker cues, character images, cross-book character features, wiki prose, admin surfacing.
