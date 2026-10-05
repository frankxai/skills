---
description: Trigger. User noticed a negative delta passed CI.
tags: [delta]
expected_outcome: Explains the exit code ignores the delta and adds a step that fails on it.
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Our GitHub Actions job runs `claude plugin eval . --json results.json` and it went green, but the report shows our plugin's delta is -0.2 on two cases. Why didn't CI fail, and what do I add so it does next time?
