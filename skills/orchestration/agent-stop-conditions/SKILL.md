---
name: agent-stop-conditions
description: Use when designing an agent, reviewing its orchestration logic, or investigating a runaway loop. Unbounded loops, missing human gates, or silent retries are failures. Encode when to stop and escalate before the agent runs, not after it burns budget or corrupts state.
---

# Agent Stop Conditions

An agent is not production-ready until it has **explicit stop conditions**: when to halt, when to escalate to a human, and when to fail loudly instead of retrying silently. If the agent has no encoded stopping rules, **stop and design them first** — unbounded loops are not "autonomous," they are budget-burning bugs.

This is not observability or a circuit breaker you add later. Stop conditions are part of the agent's contract.

## When to run

- Designing a new agent or orchestration flow
- Reviewing an agent before production rollout
- Investigating a runaway agent that consumed excessive tokens or made too many tool calls
- Post-mortem after an incident where "the agent didn't know when to stop"

If you cannot name the agent's stop conditions, the agent is unbounded.

## The three failure modes

### 1. Unbounded loops

The agent tries the same failing action repeatedly with no maximum attempt count.

**Example:**
```
Attempt 1: Call API → 500 error
Attempt 2: Call API → 500 error
Attempt 3: Call API → 500 error
...
(continues until token budget exhausted)
```

**Fix: Explicit retry limits**

Define a maximum retry count per action:

```typescript
const MAX_RETRIES = 3;
let attempts = 0;

while (attempts < MAX_RETRIES) {
  try {
    return await callAPI();
  } catch (error) {
    attempts++;
    if (attempts >= MAX_RETRIES) {
      throw new Error(`API call failed after ${MAX_RETRIES} attempts`);
    }
  }
}
```

**Sources:**
- [Noveum: Agent Evaluation Gate](https://noveum.ai/en/blog/ai-agent-evaluation-gate)
- [RockB: Agent CI/CD Guide](https://baeseokjae.github.io/posts/agent-ci-cd-eval-pipeline-integration-guide-2026/)

### 2. Missing human gates

The agent proceeds with irreversible actions (deployments, deletions, financial transactions) without human approval.

**Example:**
```
Agent: "Deploying to production..."
(deploys broken code, no confirmation)
```

**Fix: Approval gates for high-risk actions**

```typescript
async function deploy(artifact) {
  const approval = await requestHumanApproval({
    action: "deploy to production",
    artifact: artifact.id,
    riskLevel: "high",
  });

  if (!approval.granted) {
    throw new Error("Deployment denied by human operator");
  }

  return await executeDeployment(artifact);
}
```

**Approval-required actions:**
- Deployments to production
- Deletions of data or resources
- Financial transactions (payments, refunds)
- Privilege escalations
- Network security rule changes

**Sources:**
- [AgentPatterns: Approval Gates](https://www.agentpatterns.tech/en/governance/allowlist-vs-blocklist)

### 3. Silent retries and degradation

The agent encounters an error, retries internally, and proceeds with partial or corrupted results without surfacing the failure.

**Example:**
```
Agent: "Fetching user profile..."
(API returns 404)
Agent: "Proceeding with default profile..."
(continues with stale data, no error surfaced)
```

**Fix: Fail loudly**

```typescript
async function fetchUserProfile(userId) {
  const response = await api.get(`/users/${userId}`);

  if (response.status === 404) {
    // DO NOT proceed with defaults
    throw new Error(`User ${userId} not found`);
  }

  return response.data;
}
```

If critical data is missing, **stop and escalate**. Do not silently degrade.

**Sources:**
- [FutureAGI: Agent Evaluation Guide](https://futureagi.substack.com/p/the-definitive-guide-to-ai-agent)

## Encoded stop conditions

Stop conditions must be explicit, not emergent. Define them before the agent runs.

### 1. Step budget

Maximum number of tool calls or reasoning steps:

```typescript
const MAX_STEPS = 20;
let stepCount = 0;

async function agentLoop() {
  while (stepCount < MAX_STEPS) {
    const action = await model.nextAction();
    await executeAction(action);
    stepCount++;

    if (taskComplete()) {
      return "success";
    }
  }

  // Exceeded step budget
  throw new Error(`Task incomplete after ${MAX_STEPS} steps`);
}
```

**When to use:** Every autonomous agent. A step budget prevents infinite loops.

**Sources:**
- [Kunal Ganglani: Agent Evaluation Harness](https://www.kunalganglani.com/blog/agent-evaluation-harness-replay)

### 2. Token budget

Maximum tokens consumed per task:

```typescript
const MAX_TOKENS = 10000;
let tokensUsed = 0;

async function callModel(prompt) {
  const response = await model.generate(prompt);
  tokensUsed += response.usage.totalTokens;

  if (tokensUsed > MAX_TOKENS) {
    throw new Error(`Token budget exceeded: ${tokensUsed}/${MAX_TOKENS}`);
  }

  return response;
}
```

**When to use:** Cost-sensitive tasks. A token budget prevents runaway costs.

**Sources:**
- [RockB: Cost Gates](https://baeseokjae.github.io/posts/agent-ci-cd-eval-pipeline-integration-guide-2026/)

### 3. Time budget

Maximum wall-clock time:

```typescript
const TIMEOUT_MS = 60000; // 1 minute
const startTime = Date.now();

async function agentLoop() {
  while (true) {
    if (Date.now() - startTime > TIMEOUT_MS) {
      throw new Error("Task timeout: exceeded 1 minute");
    }

    await executeNextStep();
  }
}
```

**When to use:** Real-time systems or user-facing agents where latency matters.

### 4. Error rate threshold

Maximum tool failures before stopping:

```typescript
const MAX_TOOL_ERRORS = 3;
let toolErrors = 0;

async function callTool(tool, params) {
  try {
    return await tool.invoke(params);
  } catch (error) {
    toolErrors++;
    if (toolErrors >= MAX_TOOL_ERRORS) {
      throw new Error(`Tool error rate exceeded: ${toolErrors} failures`);
    }
    throw error;
  }
}
```

**When to use:** Multi-tool orchestration. If tools are failing, the task is not viable.

**Sources:**
- [Kunal Ganglani: Agent Evaluation Harness](https://www.kunalganglani.com/blog/agent-evaluation-harness-replay)

### 5. Hallucination detection

If the agent cites information it did not retrieve, stop:

```typescript
async function validateResponse(response, retrievedDocs) {
  const hallucinated = await detectHallucination(response, retrievedDocs);

  if (hallucinated) {
    throw new Error("Hallucination detected: agent cited unretrieved information");
  }

  return response;
}
```

**When to use:** RAG systems and high-stakes information retrieval.

**Sources:**
- [Noveum: Faithfulness Scoring](https://noveum.ai/en/blog/ai-agent-evaluation-gate)

### 6. Policy violation

If the agent calls a tool not on the allowlist, stop:

```typescript
async function callTool(toolName, params, allowlist) {
  if (!allowlist.includes(toolName)) {
    throw new Error(`Policy violation: tool ${toolName} not on allowlist`);
  }

  return await executeTool(toolName, params);
}
```

**When to use:** All production agents. Allowlists are the privilege boundary.

**Sources:**
- [AgentPatterns: Allowlist Enforcement](https://www.agentpatterns.tech/en/governance/allowlist-vs-blocklist)

## Escalation paths

When a stop condition is triggered, **escalate to a human** or a fallback system. Do not retry silently.

**Example escalation flow:**

```typescript
async function agentTask() {
  try {
    return await executeTask();
  } catch (error) {
    if (error.code === "STEP_BUDGET_EXCEEDED") {
      await escalateToHuman({
        reason: "Task incomplete after max steps",
        context: taskContext,
        suggestedAction: "Review and retry with extended budget",
      });
    } else if (error.code === "TOOL_ERROR_RATE_EXCEEDED") {
      await escalateToDev({
        reason: "Tool reliability issue",
        context: toolLogs,
        suggestedAction: "Investigate tool failure",
      });
    } else {
      throw error; // unknown error, fail loudly
    }
  }
}
```

**Escalation channels:**
- Human operator (dashboard notification, Slack message)
- Fallback system (simpler agent, manual workflow)
- Developer on-call (PagerDuty, incident tracker)

## Stop conditions — when NOT to proceed

**STOP** if any of the following is true:

1. The agent has no maximum step count
2. The agent has no maximum token budget
3. The agent can perform irreversible actions without human approval
4. The agent retries failed actions indefinitely
5. The agent proceeds with partial data after tool failures (silent degradation)
6. No escalation path is defined for stop conditions

Do not deploy. Encode the stop conditions first.

## Verification checklist

Before deploying an agent:

- ☐ Maximum step count is defined and enforced
- ☐ Maximum token budget is defined and enforced
- ☐ Timeout (wall-clock) is defined for long-running tasks
- ☐ Maximum tool error rate is defined
- ☐ Human approval is required for high-risk actions
- ☐ Hallucination detection is enabled for information retrieval
- ☐ Policy violation (tool allowlist) stops the run
- ☐ Escalation paths are defined for each stop condition

If any checkbox is unchecked, the agent is unbounded. Design the stops, then deploy.

## Common mistakes

1. **Unbounded retries** — "keep trying until it works" is not resilience, it's a budget leak
2. **No human gates** — the agent deploys to production without confirmation
3. **Silent degradation** — the agent proceeds with stale data after an API failure
4. **No escalation** — the agent hits a stop condition and crashes with no notification
5. **Stops added after the incident** — stop conditions are not observability, they are contract

**Sources:**
- [Noveum: Agent Evaluation Gate](https://noveum.ai/en/blog/ai-agent-evaluation-gate)
- [RockB: Agent CI/CD Guide](https://baeseokjae.github.io/posts/agent-ci-cd-eval-pipeline-integration-guide-2026/)

---

*An agent with no stop conditions is not autonomous, it is runaway. Stop conditions are not a circuit breaker you add later — they are part of the agent's contract.*
