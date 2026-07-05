# AI Skills for AI Architects

[![skills.sh](https://skills.sh/b/frankxai/skills)](https://www.skills.sh/frankxai/skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Agent skills for people accountable for AI systems in production — straight from my working `~/.claude` directory. MCP, orchestration, model routing, and context engineering, bundled as one architect's toolkit.

```sh
npx skills add frankxai/skills
```

One command, ~30 seconds. Works with Claude Code, Cursor, Gemini CLI, Windsurf, and Codex — any harness that reads `SKILL.md`.

## The four ways enterprise AI agent initiatives die

I design AI systems for enterprises by day and run a multi-agent creator stack at night. Both worlds fail the same four ways:

**1. The demo that never ships.** One impressive agent, zero orchestration architecture. Nobody decided how work decomposes, who hands off to whom, or what happens when a step fails — so it never survives contact with production. → [`skills/orchestration/`](skills/orchestration)

**2. The agent that forgets the rules.** Behavior lives in tribal knowledge instead of engineered context. Memory files bloat until the agent obeys none of them. → [`skills/context/`](skills/context)

**3. Integration spaghetti.** Every tool bolted on differently: N agents × M tools = N×M custom integrations. MCP exists so this stops. → [`skills/mcp/`](skills/mcp)

**4. The invoice that kills the roadmap.** One frontier model for everything, including tasks a small model does for a fraction of the cost. Routing is an architecture decision, not a settings toggle. → [`skills/models/`](skills/models)

The skills here are the distilled countermeasures: small, composable, model-agnostic.

## Install

Install all skills. Inside a coding agent the CLI installs them non-interactively; in a plain terminal it prompts you to pick:

```sh
npx skills add frankxai/skills
```

Manual, air-gapped, or Windows without the CLI: clone this repo and copy any `skills/<category>/<name>/` folder into `~/.claude/skills/<name>/`.

## Catalog

| Skill | Category | Invocation | Fires when |
|---|---|---|---|
| [claude-md](skills/context/claude-md/SKILL.md) | context | model-invoked | writing or auditing CLAUDE.md / AGENTS.md memory files |
| [agentic-orchestration](skills/orchestration/agentic-orchestration/SKILL.md) | orchestration | model-invoked | coordinating multiple agents: decomposition, handoffs, recovery |
| [model-routing](skills/models/model-routing/SKILL.md) | models | model-invoked | choosing models to balance capability against cost |
| [mcp-architecture](skills/mcp/mcp-architecture/SKILL.md) | mcp | model-invoked | designing an MCP server from scratch |
| [mcp-2025-patterns](skills/mcp/mcp-2025-patterns/SKILL.md) | mcp | model-invoked | current-generation MCP questions: security, multi-server, transports |
| [claude-sdk](skills/frameworks/claude-sdk/SKILL.md) | frameworks | model-invoked | building agents on the Claude Agent SDK |
| [langgraph-patterns](skills/frameworks/langgraph-patterns/SKILL.md) | frameworks | model-invoked | graph-based agent workflows in LangGraph |
| [openai-agentkit](skills/frameworks/openai-agentkit/SKILL.md) | frameworks | model-invoked | multi-agent systems on the OpenAI Agents SDK / AgentKit |
| [defuddle](skills/tools/defuddle/SKILL.md) | tools | model-invoked | reading a web page as clean markdown instead of raw HTML |

All launch skills are model-invoked: they fire when the work matches their description. User-invoked orchestrators (architecture-review sessions, agent councils) are the next wave — watch the repo.

## How these are built

- One skill = one folder = one `SKILL.md`. The frontmatter `name` matches the folder; the `description` is the trigger surface — it tells the model when to fire, not what the file contains.
- Memory files stay under 200 lines; anything situational moves into a skill. That rule is itself a skill: [claude-md](skills/context/claude-md/SKILL.md).
- CI validates every skill on every push: frontmatter schema, no personal paths, no secrets. See [scripts/validate-skills.mjs](scripts/validate-skills.mjs).
- No vendor lock-in. Skills reference public CLIs and open protocols. If a skill ever needs a paid service, its first section says so.

## Related lanes

- [frankxai/creator-skills](https://github.com/frankxai/creator-skills) — the creator lane: video-generation routing, Higgsfield, HyperFrames, Suno, brand systems.
- [agentic-creator-os](https://github.com/frankxai/agentic-creator-os) — the full operating system these skills ship inside.
- [ai-architect-academy](https://github.com/frankxai/ai-architect-academy) — the curriculum lane: the mental models behind these skills.
- [claude-skills-library](https://github.com/frankxai/claude-skills-library) — the full 100+ skill catalog these are curated from.

## Newsletter

One skill promoted from my private `~/.claude` set every week, with a note on the problem it solves. [Subscribe →](https://www.frankx.ai/newsletter?utm_source=github&utm_medium=readme&utm_campaign=skills)

## License

MIT — see [LICENSE](LICENSE).
