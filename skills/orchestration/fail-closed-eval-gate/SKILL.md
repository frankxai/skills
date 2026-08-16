---
name: fail-closed-eval-gate
description: Use when an agent, system, or prompt change is ready to merge or deploy. Do not proceed unless a named evaluation suite exists that can fail and block the release. Triggers include "ready to merge", "ship this change", "deploy to production", "CI/CD for agents", "gate this release".
---

# Fail-Closed Eval Gate

A change to an agent or prompt is not shippable until an evaluation suite exists that can **fail and block the release**. If no eval artifact is present, or if the eval cannot fail, **stop and build the gate first**.

This is the CI equivalent for AI agents: the check that sits between code-complete and production.

## When to run

- A pull request changes agent prompts, system instructions, tool schemas, or orchestration logic
- Someone says "ready to merge" or "ship this"
- A release candidate is proposed
- You're setting up CI/CD for the first time

If you can't name the eval suite and show its last failing run, the change is not gated.

## The gate structure

Agent evaluation gates are tiered. Each tier blocks independently — a strong score on one tier does not carry a weak score on another.

### Tier 1: Deterministic (runs on every PR)

Fast, non-LLM checks that validate tool-call correctness:

1. **Tool schema validation** — every tool call uses a valid schema with required fields present
2. **Argument validity** — tool arguments parse correctly and meet type constraints
3. **Sequence correctness** — tool calls follow valid state transitions (e.g., no "close issue" before "open issue")

**How to implement:**
- Record actual tool calls as replay cassettes (golden runs)
- On each PR, replay the cassettes and assert that tool arguments still match expected schemas
- Use libraries like `@agent-eval/replay` or write assertions against recorded JSON

**Sources:**
- [Agent Evaluation Harness: Replay + CI Gates](https://www.kunalganglani.com/blog/agent-evaluation-harness-replay)
- [Pondero CI for agents guide](https://pondero.ai/enterprise/guides/ci-for-agents-eval-gating-2026/)

### Tier 2: Behavioral (runs on merge to main or nightly)

LLM-as-judge for semantic correctness:

1. **Faithfulness** — agent cites only information it retrieved; no hallucinations
2. **Instruction adherence** — agent follows the task spec, does not invent steps
3. **Safety** — agent does not execute unsafe actions or leak PII

**How to implement:**
- Define explicit rubrics per dimension (not "quality" — name the exact condition)
- Use LLM-judge with `repeat: 3` and `repeat-min-pass: 2` (majority voting to reduce judge flakiness)
- Set per-dimension thresholds: **a single safety failure blocks the build**, even if other metrics pass

**Example rubric (faithfulness):**
```yaml
rubric: "The agent cites the tracking number and gives no delivery date it did not look up. Score PASS if true, FAIL otherwise."
```

**Sources:**
- [Noveum: AI Agent Evaluation Gate](https://noveum.ai/en/blog/ai-agent-evaluation-gate)
- [FutureAGI: Definitive Guide to Agent Evaluation](https://futureagi.substack.com/p/the-definitive-guide-to-ai-agent)

### Tier 3: Regression (runs nightly or on release)

Large-scale suites with incident-derived cases:

1. **Incident-to-test loop** — every production failure becomes a test case
2. **Edge cases** — the long tail of unusual inputs
3. **Cost and step budget** — median token cost and step count must not exceed baseline by more than 15 percent

**How to implement:**
- Maintain a baseline: advance it only when completion rate improves by at least 1 point or cost drops by at least 10 percent
- Never auto-advance on every green run (slow-cooking regressions)
- Record and version your baseline artifact

**Sources:**
- [RockB: Agent CI/CD Eval Pipeline](https://baeseokjae.github.io/posts/agent-ci-cd-eval-pipeline-integration-guide-2026/)

## Stop conditions — when NOT to proceed

**STOP** if any of the following is true:

1. No eval suite exists for this agent or flow
2. The eval suite cannot fail (it's always green, or it only logs)
3. The eval suite has no tier-1 deterministic checks
4. The eval has no per-dimension thresholds (only one aggregate "pass rate")
5. The most recent run of the eval suite has no failure artifact (you can't show a red run)

Do not merge. Do not deploy. Build the gate first.

## The gate in CI

Wire the gate into the same CI job that runs your unit tests:

```yaml
# Example GitHub Actions
- name: Run Tier 1 Eval (Deterministic)
  run: |
    npm run eval:replay -- --suite=tier1 --threshold=100
    # Must pass 100% of deterministic checks

- name: Run Tier 2 Eval (Behavioral)
  run: |
    npm run eval:behavioral -- --suite=tier2
    # Per-dimension thresholds set in config
    # Blocks on any dimension below threshold

- name: Gate Decision
  run: |
    # Fail the job if any tier failed
    if [ $? -ne 0 ]; then
      echo "Eval gate failed. See logs for dimension breakdown."
      exit 1
    fi
```

The job must fail when the gate fails. A red PR comment is not enough.

## Common mistakes

1. **Averaging dimensions** — "overall score 85%" hides a 50% safety score. Use per-dimension thresholds.
2. **No replay** — running live tool calls in CI makes tests flaky. Record and replay.
3. **Stale evals** — the spec changed but the eval didn't. Eval ownership = spec ownership.
4. **Gate bypass culture** — developers override red gates with "LGTM" comments. The gate must block merges, not just post warnings.

**Sources:**
- [Pondero: Common CI pitfalls](https://pondero.ai/enterprise/guides/ci-for-agents-eval-gating-2026/)

## Verification checklist

Before you mark a change "ready to ship":

- ☐ A named eval suite exists (`tier1-replay`, `tier2-behavioral`, `tier3-regression`)
- ☐ The suite has run in the last 24 hours
- ☐ The suite has at least one recorded failure (proof it can fail)
- ☐ Per-dimension thresholds are set (safety, faithfulness, instruction adherence)
- ☐ Deterministic replay is enabled for tier-1 checks
- ☐ The gate is wired into CI and blocks merges on failure
- ☐ Incident cases from production are promoted into the regression suite

If any checkbox is unchecked, the change is not gated. Build the gate, then ship.

---

*An eval that cannot fail is observability, not a gate. Treat agent changes like code: no merge without tests, no deploy without CI.*
