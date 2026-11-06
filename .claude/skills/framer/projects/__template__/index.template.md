# Framer Project Context

## Project Details

- Project ID: {{PROJECT_ID}}
- Safe Project ID: {{SAFE_PROJECT_ID}}
- Session ID: {{SESSION_ID}}
- Generated At: {{GENERATED_AT}}
- Project inventory: [[project-inventory.md]]

## How to use this file

This `index.md` is the map. Read the **Anything** row first — it is the core foundation, needed for all tasks. Then read the row that matches your task, plus **every** additional row a multi-domain task touches (e.g. a landing page with a blog is *pages + CMS + components*; do not guess the other domains from memory). Open a guide only when a row names one, and request guides through [[prompt/implementation-guidance-documentation-index.md]]. Fuller patterns and sequencing live in [[recipes.md]].

## Task map

| Doing… | Read before you start |
|---|---|
| **Anything** | All files are required: [[prompt/core-principles.md]] (layout, spacing, width, fills, overflow) · [[prompt/core-examples.md]] (worked DSL patterns) · [[prompt/implementation-strategy.md]] (pick creation/edit/recreation, write a design plan, settle reusable-systems + site-metadata) · [[prompt/updating-the-project.md]] (DSL grammar) · [[prompt/tools.md]] (available tools and when to use them). House rules: [[prompt/overview.md]], [[prompt/guardrails.md]], [[prompt/critical-reminders.md]]. |
| **Pages / sections** — create, redesign, add sections, visual polish, review | + [[prompt/design-rules.md]] · [[prompt/how-projects-work.md]] §Layout Recipe + §Width Rules + §Links |
| **Responsive breakpoints** | [[recipes.md]] § Responsive breakpoints · [[prompt/how-projects-work.md]] §Layout Recipe (rules 7–8) |
| **Analytics** — traffic, visitors, page views, conversions, events | guide **Analytics** |
| **CMS** — collections, items, fields, collection lists, CMS-backed content | [[prompt/how-projects-work.md]] §CMS · [[prompt/updating-the-project.md]] (variable/CMS DSL) · guide **CMS Collection Lists** |
| **CMS detail pages** | [[prompt/how-projects-work.md]] §CMS detail pages · guide **CMS Detail Pages** |
| **Components / variants / icons** | [[prompt/how-projects-work.md]] §Components + §Icons · guide **Buttons** or others as needed |
| **Forms** | [[prompt/how-projects-work.md]] §Forms · guide **Forms** |
| **Navigation / links / redirects** | [[prompt/how-projects-work.md]] §Links + §Layout Templates · guide **Navigations** |
| **Publish** | [[prompt/how-projects-work.md]] §Hosting · [[prompt/critical-reminders.md]] |

If you have already read a file as part of earlier tasks, do not re-read it unless compaction has cleared it from context.

## Prompt Sections

{{PROMPT_SECTION_LIST}}

## Project Inventory

Current project-specific pages, components, CMS data, styles, fonts, icons, and IDs are stored in [[project-inventory.md]]. Treat it as a generated snapshot and use it for orientation.
