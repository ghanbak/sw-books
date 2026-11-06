# Source

- **Repo:** https://github.com/anthropics/knowledge-work-plugins
- **Upstream path:** `design/skills/ux-copy`
- **Commit:** `ae1513ea94dcb74a7f1505ddcf3b0ec3fab327f1`
- **Installed:** 2026-10-08 (manual copy after full read-through; no install scripts, npm/npx or other code from the repo was run)
- **License:** Apache-2.0 (repo-root LICENSE copied)

## Installed files
- `CONNECTORS.md`
- `LICENSE`
- `SKILL.md`

## Skipped files (not installed)
Plugin machinery NOT installed: design/.mcp.json (pre-configures Slack, Figma, Linear, Asana, Atlassian, Notion, Intercom, Google Calendar, Gmail MCP servers), design/.claude-plugin/plugin.json, design/README.md. The plugin has no commands/ or hooks/ folders (its README's /critique, /handoff… commands are these skills). No settings touched.

## Local edits
Ladder guard + extra connector/side-effect line inserted after the frontmatter (2026-10-08). CONNECTORS.md copied into the skill folder for reference; the SKILL.md link still points at ../../CONNECTORS.md (upstream plugin layout) — read the local copy instead. Body otherwise verbatim.

## Ladder note
Inside Ladder work, `ladder-craft` (SKILL.md §1 + `references/source-of-truth.md`) wins over any value in this skill. Third-party rules contribute technique only. See the round-2 install report for the per-skill override list.
