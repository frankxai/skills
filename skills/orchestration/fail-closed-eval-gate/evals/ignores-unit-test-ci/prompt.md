---
description: No trigger. Ordinary test CI with no agent eval.
tags: [no-trigger]
expected_outcome: Writes a pytest workflow without invoking the eval-gate skill.
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Add a GitHub Actions workflow that runs pytest on every push to main and fails the job if any test fails.
