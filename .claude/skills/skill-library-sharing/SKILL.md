---
name: skill-library-sharing
description: Use when copying or installing skill libraries into a repo.
category: skill-management
---

# Copying and installing skill libraries

Copy real files, check licensing and internal content, and never overwrite an existing skill by name.

- Dereference symlinks when copying. Skills linked from `~/.agents/skills` do not resolve in cloud sessions.
- Same-name collision: keep the existing skill, list the skipped names in the report, and let the user choose any swap.
- Before committing into a repo, check each skill for a license file or a `license:` frontmatter. Unlicensed third-party skills republish others' work in a public repo: commit only licensed ones, or confirm the repo is private.
- Exclude internal material (design specs, Figma component keys, proprietary tokens) and app-managed folders such as `synced/`. Check repo visibility before committing.
