---
name: mcp-least-privilege
description: Use when designing or auditing an MCP server's security posture. MCP servers must operate under least-privilege per tool — scoped, narrow credentials and permissions, not omnibus access. Stop if a server is connected "because we might need it" or a tool has broader permissions than its stated function requires.
version: 1.0.0
---

# MCP Least Privilege

An MCP server is not ready for production until it operates under **least privilege per tool**: each tool gets exactly the access its function requires, and no server is connected "because we might need it." If a server has omnibus permissions or is connected without a defined use case, **stop and scope it down**.

MCP servers are the privilege boundary. The agent on the other side is a credentialed principal at machine speed.

## When to run

- Designing a new MCP server
- Auditing an existing MCP server before production rollout
- Investigating a security incident involving an MCP server
- Setting up multi-server orchestration

If you cannot name the specific permissions each tool requires, the server is not scoped.

## The MCP security model

**MCP itself does not enforce security** — it delegates all responsibility to implementers. The current standard for remote HTTP-based MCP servers is **OAuth 2.1 with PKCE**.

**Sources:**
- [Microsoft: State of MCP Security 2026](https://techcommunity.microsoft.com/blog/microsoft-security-blog/the-state-of-mcp-security-in-2026/4531327)
- [MCP Specification 2026-07-28](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/index.mdx)

### Key threats

1. **Confused deputy** — an MCP server acts with its own broad privileges on behalf of a user who does not have them
2. **Omnibus tools** — tools that accept free-form input and dispatch at runtime (e.g., `execute`, `run`) collapse all privilege boundaries
3. **Unscoped access** — a server requests filesystem write, database access, and network access when it only needs read-only file access
4. **No audit trail** — tool calls happen but no log exists to show who called what

**Sources:**
- [CODERCOPS: MCP Server Security Checklist](https://blog.codercops.com/blog/mcp-server-security-checklist-2026)

## How to implement least privilege

### 1. Define tool-level granularity

Every tool should be **narrow and explicit**, not a dispatch function.

**Bad: Omnibus tool**
```typescript
server.addTool("execute", async (params) => {
  // accepts arbitrary commands
  exec(params.command);
});
```

This is a privilege boundary collapse. One tool can now do anything the server can do.

**Good: Narrow tools**
```typescript
server.addTool("git.status", async () => {
  return exec("git status");
});

server.addTool("git.diff", async (params) => {
  const { file } = params;
  return exec(`git diff ${shellEscape(file)}`);
});
```

Each tool has a single, audited function.

**Sources:**
- [DigitalApplied: MCP Tool Scoping](https://www.digitalapplied.com/blog/mcp-server-security-best-practices-2026-engineering-guide)

### 2. Enforce per-request authorization

Validate a caller's scopes **at the moment of tool dispatch**, not just at initial authentication.

```typescript
server.addTool("issues.delete", async (params, context) => {
  // Re-check scopes on every call
  if (!context.scopes.includes("mcp:issues:delete")) {
    throw new Error("Forbidden: missing mcp:issues:delete scope");
  }

  return await deleteIssue(params.issueId);
});
```

Tokens can be revoked mid-session; scope grants can change. Never cache authorization decisions.

**Sources:**
- [APIScout: MCP Server Security Best Practices](https://apiscout.dev/guides/anthropic-mcp-server-security-2026)

### 3. Define scopes per tool category

Use narrow OAuth scopes, not one all-access scope:

- `mcp:tools:read` — read-only tools
- `mcp:tools:write` — tools that modify state
- `mcp:tools:admin` — tools that can modify tool definitions

A weather-lookup tool should **never** have filesystem write access, even if the server also offers file tools. Scopes are per-tool, not per-server.

**Sources:**
- [APIScout: Scope Design](https://apiscout.dev/guides/anthropic-mcp-server-security-2026)

### 4. Bind identity and context

Pass user identity through the call chain to prevent the confused deputy problem:

```typescript
server.addTool("repo.delete", async (params, context) => {
  const { repoId } = params;
  const userId = context.user.id;

  // Ensure the user has permission, not just the server
  if (!await userCanDeleteRepo(userId, repoId)) {
    throw new Error("Forbidden: user lacks repo delete permission");
  }

  return await deleteRepo(repoId, userId);
});
```

The server acts **on behalf of the user**, not with its own omnibus credentials.

**Sources:**
- [Microsoft: Confused Deputy Risk](https://techcommunity.microsoft.com/blog/microsoft-security-blog/the-state-of-mcp-security-in-2026/4531327)

### 5. Use an identity-aware gateway

Deploy a proxy between the client and MCP servers to:
- Inspect requests
- Enforce allowlists (deny tools not on the list)
- Perform semantic intent verification
- Log all invocations with agent identity

```
┌──────────────┐
│   Agent      │
└──────┬───────┘
       │ tool call
       ▼
┌────────────────────┐
│ Identity Gateway   │  ← validates tokens, enforces allowlists
└──────┬─────────────┘
       │ allowed
       ▼
┌──────────────┐
│ MCP Server   │
└──────────────┘
```

**Sources:**
- [Microsoft: Identity-Aware Gateway](https://techcommunity.microsoft.com/blog/microsoft-security-blog/the-state-of-mcp-security-in-2026/4531327)

### 6. Sandbox local MCP servers

Local MCP servers run as full OS processes with the user's permissions unless explicitly sandboxed. Use containers, gVisor, or SELinux to isolate them.

**Example: Docker sandbox**
```bash
docker run --rm \
  --network=none \
  --read-only \
  --tmpfs=/tmp:rw,noexec,nosuid \
  mcp-server-local
```

This limits the blast radius if the server is compromised.

**Sources:**
- [APIScout: Sandboxing Local Servers](https://apiscout.dev/guides/anthropic-mcp-server-security-2026)

### 7. Audit every invocation

Log every tool call with:
- Agent identity
- Tool name
- Parameters (sanitized — no secrets)
- Timestamp
- Policy decision (allow/deny)

```json
{
  "timestamp": "2026-08-16T03:00:00Z",
  "agent_id": "agent-42",
  "user_id": "user@example.com",
  "tool": "repo.delete",
  "params": { "repoId": "repo-123" },
  "scopes": ["mcp:tools:admin"],
  "decision": "allow",
  "outcome": "success"
}
```

Audit logs let you investigate "how did it call that tool" after the fact.

**Sources:**
- [APIScout: Audit Logging](https://apiscout.dev/guides/anthropic-mcp-server-security-2026)

## Stop conditions — when NOT to proceed

**STOP** if any of the following is true:

1. The MCP server has omnibus tools (e.g., `execute`, `run`) that accept free-form input
2. A tool requests more permissions than its stated function requires
3. The server is connected "because we might need it" with no defined use case
4. No scopes are defined (one token grants all access)
5. Authorization is checked once at authentication, not on every tool call
6. No audit log exists for tool invocations
7. Local servers run without sandboxing

Do not deploy. Scope the server down, then connect it.

## Verification checklist

Before deploying an MCP server:

- ☐ Every tool is narrow and explicit (no omnibus tools)
- ☐ Scopes are defined per tool category (read/write/admin)
- ☐ Authorization is re-validated on every tool call
- ☐ User identity is passed through the call chain (no confused deputy)
- ☐ An identity-aware gateway enforces allowlists
- ☐ Local servers are sandboxed (containers, gVisor, SELinux)
- ☐ Every tool call is logged with agent identity, tool name, and decision
- ☐ Audit logs are monitored for policy violations

If any checkbox is unchecked, the server is not operating under least privilege. Scope it down, then deploy.

## Common mistakes

1. **Authentication ≠ Authorization** — a server is authenticated, but that says nothing about what it should be allowed to do
2. **Broad credentials for convenience** — a weather tool inherits filesystem write access because it shares a credential pool
3. **No tool-level scopes** — one token grants all tools, not per-tool permissions
4. **Stdio = security** — stdio is a transport choice, not a security control; the agent is still a credentialed principal
5. **No audit trail** — you cannot investigate incidents without logs

**Sources:**
- [CODERCOPS: Common MCP Security Mistakes](https://blog.codercops.com/blog/mcp-server-security-checklist-2026)
- [DigitalApplied: MCP Privilege Boundary](https://www.digitalapplied.com/blog/mcp-server-security-best-practices-2026-engineering-guide)

---

*MCP servers are the privilege boundary. Treat them with the same operational seriousness as a public-facing API with the blast radius of the tools they expose.*
