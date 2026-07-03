# <Project> — Claude Code operating contract

_<one line: what this project is>_

<!-- Keep this file under ~200 lines. It is the ALWAYS-TRUE contract. Situational/system knowledge
     goes in .claude/rules/*.md (path-scoped) or docs/. Per-line test before adding anything:
     "would removing this cause Claude to make a mistake?" If no, it doesn't belong here. -->

---

## Operating doctrine
<!-- The few rules that govern every turn: lead-vs-ask, ship policy, what's reversible. -->
- <e.g. You are the lead — commit/push/deploy once guardians are green; don't ask permission.>

**Guardians (green-light checklist):**
- `<build/typecheck command>` — must pass before deploy
- `<lint / link / brand gate>`

**Hard stops (still ask):**
- <force-push to prod main · DB drops · key rotation · external sends>

---

## Behavioral guardrails
1. **Think before coding** — surface tradeoffs, don't assume, prefer the simpler reading.
2. **Explain simply** — state problem + mental model + simplest solution first; name mechanisms, not buzzwords.
3. **Simplicity & deep design** — minimum code, no speculative abstraction, simple interfaces / rich internals.
4. **Surgical changes** — touch only what you must; match style; don't refactor what isn't broken.
5. **Goal-driven** — verifiable targets; reproduce-then-fix; brief plan + verification for multi-step work.

---

## Commands
<!-- Bash Claude can't guess. -->
| Action | Command |
|---|---|
| Build / typecheck | `<cmd>` |
| Test (single) | `<cmd>` |
| Lint | `<cmd>` |
| Deploy | `<cmd>` |

---

## Code style & workflow
- <only what differs from language/framework defaults>
- <branch naming · PR convention · "typecheck before done">

---

## Architecture — where the depth lives
<!-- Pointers, not prose. Each loads on demand. -->
**Path-scoped rules** (`.claude/rules/`, load when matching files open):
- `<topic>.md` — <one line> · `<glob>`

**Reference docs** (`docs/architecture/`): `<topic>.md` …

---

_<closing line / standard>_
