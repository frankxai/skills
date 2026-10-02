# Run the gate in GitHub Actions

Flags and exit codes verified against code.claude.com/docs/en/plugin-evals on 2026-10-02.

Every agent run and judge call costs money, so this job runs on a release tag or by hand. For per-push checks, keep a smaller suite whose graders do not call a judge (`regex`,
`tool_used`, `tool_order`, `file_exists`) and run it with `--ablation none`.

Before you copy it:

- Commit `delta-gate.mjs` into your repo (it has no dependencies). The job below expects it at
  `.github/scripts/delta-gate.mjs`.
- Add an `ANTHROPIC_API_KEY` repository secret, or your cloud provider's variables.
- Tag your cases: `tags: [delta]` on cases the plugin should improve, `tags: [no-trigger]` on cases
  where the skill must stay silent.
- Pin both models and the Claude Code version you validated (v2.1.269 or later is required).

```yaml
name: plugin-eval-gate

on:
  workflow_dispatch:
  push:
    tags: ["v*"]

concurrency:
  group: plugin-eval-gate-${{ github.ref }}
  cancel-in-progress: true

jobs:
  eval:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Delta cases, with and without the plugin
        run: >-
          claude plugin eval .
          --trust-plugin
          --json results.json
          --ablation with-without
          --threshold 0.8
          --model claude-sonnet-5
          --judge-model claude-haiku-4-5
          --no-publish
          --max-cost-usd 20
          --tag delta

      - name: No-trigger cases, plugin arm only
        if: ${{ !cancelled() }}
        run: >-
          claude plugin eval .
          --trust-plugin
          --json no-trigger.json
          --ablation none
          --threshold 1.0
          --model claude-sonnet-5
          --no-publish
          --max-cost-usd 5
          --tag no-trigger

      - name: Delta gate
        if: ${{ !cancelled() && hashFiles('results.json') != '' }}
        run: node .github/scripts/delta-gate.mjs results.json --min-delta 0 --min-score 0.8

      - name: Keep the results
        if: ${{ always() }}
        uses: actions/upload-artifact@v4
        with:
          name: plugin-eval-results
          path: |
            results.json
            no-trigger.json
          if-no-files-found: warn
```

## How the steps fail

Each `run:` step is its own shell, and GitHub fails the step and the job when the command exits
non-zero. No step reads `$?`.

| Step | Exit 0 | Exit 1 | Exit 2 |
| :- | :- | :- | :- |
| Delta cases | Every case met `--threshold` | A case missed it, a case file failed to load, no cases matched the tag, a run could not start, or an option was invalid | Partial: cost ceiling hit or credential rejected. `results.json` is still written with `partial: true` |
| No-trigger cases | The skill stayed silent in every run | It fired somewhere, or one of the exit-1 causes above | Partial, as above |
| Delta gate | Plugin beat the baseline on comparable, complete data | The bar was missed; each line names the case, delta and score | `results.json` cannot be trusted (partial, malformed, wrong `schemaVersion`, no cases) |

The eval command exits 130 when interrupted and 143 when terminated, such as by `timeout-minutes`.

The two later steps use `!cancelled()` so a failed eval step still shows the gate's per-case
diagnosis. A partial document makes the gate exit 2, so running it after an exit-2 eval cannot
turn the job green.

## Making it block

A workflow that only runs on tags reports after the fact. To stop a release, make the publish job
`needs: eval`, or require the `eval` check on the branch you release from.

## Running this skill's own cases

The cases in this skill's `evals/` follow the `claude plugin eval` layout. That command needs a
plugin, so place the skill in one (`<plugin>/skills/fail-closed-eval-gate/`) and point the eval
directory at it from the plugin root:

```bash
claude plugin eval . --eval-dir skills/fail-closed-eval-gate/evals --trust-plugin \
  --ablation with-without --json results.json --no-publish --max-cost-usd 5 --tag delta
claude plugin eval . --eval-dir skills/fail-closed-eval-gate/evals --trust-plugin \
  --ablation none --no-publish --max-cost-usd 2 --tag no-trigger
node skills/fail-closed-eval-gate/scripts/delta-gate.mjs results.json
```

If a case reports "ablation requested but no plugin resolved", add `plugins: ["../../../.."]` to
its `prompt.md`, the path from the case directory to the plugin root.
