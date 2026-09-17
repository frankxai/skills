# AI Skills for AI Architects — Starlight Architect Plugin

[![skills.sh](https://skills.sh/b/frankxai/skills)](https://www.skills.sh/frankxai/skills)
[![Agent Plugins 1.0](https://img.shields.io/badge/Agent%20Plugins-1.0-blue.svg)](plugin.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Agent skills for engineers and architects accountable for AI systems in production. MCP, orchestration, model routing, and context engineering, bundled as one portable toolkit.

One portable skill pack. Zero vendor lock-in. Works across **Claude Code**, **OpenAI Codex**, **Grok Build**, **Google Antigravity**, **Cursor**, and **Gemini CLI**.

---

## Quick Install (All Runtimes)

### 1. Claude Code, Cursor & Universal CLI
```sh
npx skills add frankxai/skills
```

### 2. OpenAI Codex (Agent Plugin)
```sh
codex plugin install frankxai/skills
```
*Or copy directly:* `cp -r skills/* ~/.codex/skills/`

### 3. Grok Build (xAI)
```sh
npx skills add frankxai/skills --dest ~/.grok/skills
```

### 4. Google Antigravity
```sh
cp -r skills/* ~/.gemini/antigravity/skills/
```

---

## The Four Ways Enterprise AI Agent Initiatives Die

I design AI systems for enterprises by day and run a multi-agent creator stack at night. Both worlds fail the same four ways:

**1. The demo that never ships.** One impressive agent, zero orchestration architecture. Nobody decided how work decomposes, who hands off to whom, or what happens when a step fails — so it never survives contact with production. → [`skills/orchestration/`](skills/orchestration)

**2. The agent that forgets the rules.** Behavior lives in tribal knowledge instead of engineered context. Memory files bloat until the agent obeys none of them. → [`skills/context/`](skills/context)

**3. Integration spaghetti.** Every tool bolted on differently: N agents × M tools = N×M custom integrations. MCP exists so this stops. → [`skills/mcp/`](skills/mcp)

**4. The invoice that kills the roadmap.** One frontier model for everything, including tasks a small model does for a fraction of the cost. Routing is an architecture decision, not a settings toggle. → [`skills/models/`](skills/models)

The skills here are the distilled countermeasures: small, composable, model-agnostic.

**Start here:** [`agent-design-review`](skills/reviews/agent-design-review/SKILL.md) — a user-invoked skill that grills your agent-system design against all four failure modes and hands back a build / fix-first / rethink verdict. Run it before you write code, not after production teaches you the same lesson.

---

## Catalog

Two kinds of skills. **User-invoked** ones you run deliberately — a review, a session you start. **Model-invoked** ones fire on their own when the work matches their description.

| Skill | Category | Invocation | Fires when |
| :--- | :--- | :--- | :--- |
| [agent-design-review](skills/reviews/agent-design-review/SKILL.md) | reviews | **user-invoked** | you ask to grill / pressure-test an agent design before building |
| [claude-md](skills/context/claude-md/SKILL.md) | context | model-invoked | writing or auditing CLAUDE.md / AGENTS.md memory files |
| [agentic-orchestration](skills/orchestration/agentic-orchestration/SKILL.md) | orchestration | model-invoked | coordinating multiple agents: decomposition, handoffs, recovery |
| [model-routing](skills/models/model-routing/SKILL.md) | models | model-invoked | choosing models to balance capability against cost |
| [mcp-architecture](skills/mcp/mcp-architecture/SKILL.md) | mcp | model-invoked | designing an MCP server from scratch |
| [mcp-2025-patterns](skills/mcp/mcp-2025-patterns/SKILL.md) | mcp | model-invoked | current-generation MCP questions: security, multi-server, transports |
| [claude-sdk](skills/frameworks/claude-sdk/SKILL.md) | frameworks | model-invoked | building agents on the Claude Agent SDK |
| [langgraph-patterns](skills/frameworks/langgraph-patterns/SKILL.md) | frameworks | model-invoked | graph-based agent workflows in LangGraph |
| [openai-agentkit](skills/frameworks/openai-agentkit/SKILL.md) | frameworks | model-invoked | multi-agent systems on the OpenAI Agents SDK / AgentKit |
| [defuddle](skills/tools/defuddle/SKILL.md) | tools | model-invoked | reading a web page as clean markdown instead of raw HTML |

---

## How These Are Built

- **One skill = one folder = one `SKILL.md`.** The frontmatter `name` matches the folder; the `description` is the trigger surface — it tells the model when to fire, not what the file contains.
- **Memory files stay under 200 lines;** anything situational moves into a skill. That rule is itself a skill: [claude-md](skills/context/claude-md/SKILL.md).
- **Vendor-Neutral Agent Plugins 1.0:** Packaged with `plugin.json` for plug-and-play installation in Codex, Cursor, and Copilot.
- **No vendor lock-in.** Skills reference public CLIs and open protocols.

---

## Related Lanes

- [frankxai/creator-skills](https://github.com/frankxai/creator-skills) — the creator lane: video-generation routing, Nano Banana, Veo, Suno, brand systems.
- [starlight-agent-skills](https://github.com/frankxai/starlight-agent-skills) — the canonical Starlight skill repository with contracts, adapters, and evals.
- [agentic-creator-os](https://github.com/frankxai/agentic-creator-os) — the full creator operating system these skills ship inside.

---

## License

MIT — see [LICENSE](LICENSE).
