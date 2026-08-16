---
name: tool-allowlist
description: Use when designing agent tool policies, setting up tool access controls, or investigating "how did the agent call that tool". Default-deny tool access — agents may only call tools explicitly added to an allowlist for the current task. Stop if a tool is used that is not on the contract.
---

# Tool Allowlist

An agent is not ready for production until it operates under **default-deny tool access**: no tool is callable unless explicitly added to an allowlist for the current task. If the agent calls a tool that is not on the contract, **stop and treat it as a policy violation**.

This is the privilege boundary. Without it, one prompt injection can escalate to arbitrary tool execution.

## When to run

- Designing a new agent or multi-agent system
- Setting up production agent deployment
- Investigating "how did the agent execute that dangerous command"
- Implementing tool governance or audit requirements

If you cannot name the allowlist for this agent's current task, the agent is running with no policy.

## The allowlist model

A tool allowlist is the explicit set of tools an agent may call **for the current task**. Everything else is denied.

### Core principles

1. **Default-deny** — if a tool is not explicitly allowed, it is denied
2. **Deny wins** — explicit denies always override allows
3. **Per-task scoping** — allowlists are narrow and change per task, not global
4. **Runtime enforcement** — the policy layer evaluates every tool call before execution

**Sources:**
- [AgentPatterns: Allowlist vs Blocklist](https://www.agentpatterns.tech/en/governance/allowlist-vs-blocklist)
- [Vouched.id: Agent Allowlisting Guide](https://www.vouched.id/learn/blog/ai-agent-allowlisting-permission-scopes)

### What it is NOT

- **Not a blocklist** — blocklists only forbid known-bad tools; they permit everything new by default (insecure)
- **Not client-side suggestions** — client-side permissions can be bypassed by a compromised agent
- **Not static** — the allowlist should change per task; a file-read task gets fewer tools than a deployment task

## How to implement

### 1. Deploy a policy gateway

The allowlist must be enforced **outside the agent process**. A policy gateway sits between the agent and its tools, intercepts every tool call, and decides: allow, deny, or approval-required.

```
┌─────────────┐
│   Agent     │
└──────┬──────┘
       │ tool call
       ▼
┌─────────────────────┐
│  Policy Gateway     │  ← enforces default-deny
│  (allow/deny/audit) │
└──────┬──────────────┘
       │ allowed
       ▼
┌─────────────┐
│   Tool      │
└─────────────┘
```

**Tools:**
- [SecAI-Hub/agent-tool-firewall](https://github.com/SecAI-Hub/agent-tool-firewall) — lightweight HTTP policy gateway
- [Spin42/denyx](https://github.com/Spin42/denyx) — MCP policy layer with default-deny

**Sources:**
- [SecAI-Hub agent-tool-firewall README](https://github.com/SecAI-Hub/agent-tool-firewall)
- [Denyx agent-policy-spec](https://github.com/Spin42/denyx/blob/main/docs/agent-policy-spec.md)

### 2. Define the policy file

Policies are written in YAML and declare which tools are allowed, denied, and require approval:

```yaml
# policy.yaml
default: "deny"  # CRITICAL: default-deny mode

rate_limit:
  requests_per_minute: 120

allow:
  - name: "filesystem.read"
    paths_allowlist:
      - "$HOME/documents/**"
    paths_denylist:
      - "/etc/shadow"
    max_arg_length: 4096

  - name: "web.search"
    args_blocklist:
      - "password"
      - "secret"

deny:
  - name: "shell.exec"  # explicit deny always wins

requires_approval:
  - name: "filesystem.write"
  - name: "api.delete"
```

**Key decisions:**

- `default: "deny"` — this line is non-negotiable; without it, new tools are auto-allowed
- `deny` beats `allow` — if a tool appears in both, deny wins
- `paths_allowlist` — narrow filesystem access to specific directories
- `requires_approval` — human-in-the-loop for irreversible actions

**Sources:**
- [SecAI-Hub/agent-tool-firewall policy format](https://github.com/SecAI-Hub/agent-tool-firewall)

### 3. Enforce at runtime

On every tool call:

1. **Rate limit** — reject if over budget
2. **Explicit deny** — if tool is on the deny list, block immediately
3. **Allowlist check** — if tool is not on the allow list, block (default-deny)
4. **Argument validation** — check length limits, blocked patterns, path traversal
5. **Log decision** — record allow/deny/approval with tool name, arguments, agent identity

```json
{
  "timestamp": "2026-08-16T03:00:00Z",
  "agent_id": "agent-42",
  "tool": "filesystem.read",
  "args": { "path": "$HOME/documents/report.pdf" },
  "decision": "allow",
  "policy_rule": "filesystem.read allow rule #1"
}
```

**Sources:**
- [AgentPatterns: Policy Layer Mechanics](https://www.agentpatterns.tech/en/governance/allowlist-vs-blocklist)

### 4. Filter tool discovery

The gateway should **strip denied tools from the agent's view** so the model cannot even see or attempt to call them.

If the agent has 76 tools registered but only 12 are allowed for the current task, the agent sees only those 12.

**Sources:**
- [AgenticControlPlane blog](https://agenticcontrolplane.com/blog)

## Stop conditions — when NOT to proceed

**STOP** if any of the following is true:

1. The agent has access to tools but no policy file exists
2. The policy file has `default: "allow"` or no `default` key (not default-deny)
3. The policy is enforced client-side only (can be bypassed)
4. The agent called a tool that is not on the allowlist and was not blocked
5. No audit log exists for tool-call decisions

Do not deploy. Build the policy layer first.

## Per-task scoping

Allowlists should be **narrow and task-specific**, not static.

**Example: code-review agent**

```yaml
allow:
  - name: "git.diff"
  - name: "git.show"
  - name: "github.comment"

deny:
  - name: "git.push"        # read-only for review tasks
  - name: "filesystem.write"
```

**Example: deployment agent**

```yaml
allow:
  - name: "git.push"
  - name: "vercel.deploy"
  - name: "github.status"

requires_approval:
  - name: "vercel.deploy"   # deployment requires human gate
```

The allowlist changes per agent role, not per agent instance.

**Sources:**
- [AgentPatterns: Context-aware allowlists](https://www.agentpatterns.tech/en/governance/allowlist-vs-blocklist)

## Verification checklist

Before deploying an agent:

- ☐ A policy file exists with `default: "deny"`
- ☐ The policy is enforced by a gateway outside the agent process
- ☐ The allowlist is scoped to the agent's task (not "allow everything")
- ☐ Denied tools are stripped from the agent's tool discovery
- ☐ Human-approval gates are defined for irreversible actions
- ☐ Every tool call is logged with the policy decision
- ☐ Audit logs are monitored for deny spikes (signals policy drift)

If any checkbox is unchecked, the agent is running with no privilege boundary. Build the gate, then deploy.

## Common mistakes

1. **Relying on blocklists** — blocklists only stop known-bad tools; new tools are auto-allowed
2. **Client-side enforcement only** — a compromised agent bypasses client-side checks
3. **One global allowlist** — every agent gets every tool; no task scoping
4. **No audit log** — you cannot investigate "how did it call that" without logs

**Sources:**
- [AgentPatterns: Allowlist anti-patterns](https://www.agentpatterns.tech/en/governance/allowlist-vs-blocklist)

---

*Without default-deny, one prompt injection can call any tool in your estate. Allowlists are not nice-to-have; they are the privilege boundary.*
