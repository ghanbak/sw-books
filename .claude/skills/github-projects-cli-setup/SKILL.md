---
name: github-projects-cli-setup
description: Use when gh errors on GitHub Projects v2 or labels.
category: git-workflow
---

# gh CLI setup for Projects, labels, milestones

Projects v2 needs the `project` token scope, which a default `gh auth login` does not grant.

- Check scopes with `gh auth status`. Default scopes are typically gist, read:org, repo, workflow.
- Grant the scope with `gh auth refresh -s project`. It opens a browser, so tell the user to run it; the agent cannot complete it.
- Labels, milestones, and issue templates work on default scopes; do them without waiting on Projects.
- Prefer `gh` over a GitHub MCP connection that is failing or unauthenticated.
