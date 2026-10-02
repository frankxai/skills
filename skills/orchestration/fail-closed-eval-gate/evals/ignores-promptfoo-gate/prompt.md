---
description: No trigger, near miss. promptfoo suites are a different format that claude plugin eval does not read.
tags: [no-trigger]
expected_outcome: Answers about promptfoo without invoking the eval-gate skill.
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

How do I make our promptfoo eval fail the CI build when any assertion in promptfooconfig.yaml fails?
