---
name: rotato-cli
description: Use the installed Rotato CLI to create, inspect, frame, compose, revise, open, and render Rotato projects. Use whenever a user asks an agent to make or modify a Rotato video, inspect a .rotato project, capture frames, or automate Rotato from the command line.
---

# Rotato CLI

Before using Rotato, run `rotato skill show` and follow the returned current
skill instructions. The skill bundled with the installed CLI is authoritative;
do not substitute a remembered command schema or an older copied skill.

Run commands that communicate with the Rotato app using elevated or
unsandboxed permissions when the agent sandbox denies local IPC. The CLI probes
the exact Rotato build's command socket; do not infer liveness with process
inspection, Finder, Computer Use, or LaunchServices.
