---
name: subagent-skill-preloading
description: Use when editing subagent agent.md files to add skills.
category: agent-config
---

# Subagent skill preloading

Attach each subagent's core skills in frontmatter `skills:` so they load at start. Point the rest at the Skill tool in the body.

- Preload only the 2-4 skills the agent needs on nearly every task. Preloaded skills cost context on every run.
- Body wording: "Your preloaded skills (`a`, `b`) are your baseline. Load others via the Skill tool when they fit: ...". Drop any older "use the installed skills" line that duplicates the preload.
- Before reporting done, confirm each name in `skills:` exists as `<skills-dir>/<name>/SKILL.md`.
- A project-level agent file with the same name overrides the user-level one inside that repo. If the repo needs agents in cloud sessions, copy them in and apply every edit to both copies.
