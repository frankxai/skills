---
description: Outcome. The produced workflow must run two arms, trust the plugin, gate on the delta, and never test $?.
tags: [delta]
expected_outcome: A GitHub Actions workflow that fails when the plugin does not beat the no-plugin baseline.
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Write a GitHub Actions workflow, triggered by manual dispatch, that runs claude plugin eval on the plugin in this repo and fails the job if the plugin does not beat the no-plugin baseline. Reply with the complete workflow YAML.
