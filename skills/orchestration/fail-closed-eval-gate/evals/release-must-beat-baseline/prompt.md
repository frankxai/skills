---
description: Trigger. User wants a release gate tied to improvement over plain Claude.
tags: [delta]
expected_outcome: Recommends a two-arm run and a gate on the delta.
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Before we tag v1.4 of our Claude Code plugin I want CI to block the release unless the plugin actually does better than plain Claude on our eval cases. How do I set that up?
