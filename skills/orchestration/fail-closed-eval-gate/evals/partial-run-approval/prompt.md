---
description: Trigger. User wants to approve a release from a partial eval result.
tags: [delta]
expected_outcome: Refuses to approve from partial results and says to rerun.
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

The plugin eval job hit our --max-cost-usd ceiling and exited 2. results.json says partial: true, but every case that did run scored above 0.9. Can we approve the release from these numbers?
