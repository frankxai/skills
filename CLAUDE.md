# skills — repo conventions

Public skills catalog. Everything here ships to strangers' machines via `npx skills add frankxai/skills`.

## Layout

- `skills/<category>/<name>/SKILL.md` — one skill per folder. Categories: mcp, orchestration, models, context, frameworks, tools.
- Supporting files live beside the SKILL.md (`references/`, `*.json`). No nested skill directories.

## Skill rules

- Frontmatter keys: `name` (kebab-case, must equal the folder name), `description` (the trigger surface, max 1024 chars), optional `version`, `argument-hint`, `allowed-tools`. Nothing else.
- The description says WHEN to fire, not what the file contains.
- Bodies are portable: no personal paths, no machine-specific setup, no references to private repos or internal systems.
- If a skill needs a paid account or API key, its first section states that; env-var patterns only, never literal credentials.

## Gates — run before any commit

- `node scripts/validate-skills.mjs` must pass (frontmatter schema + banned-pattern scan).
- New skill → add its Catalog row in README.md.

## Never

- No secrets, no user paths, no client or employer specifics.
- No emoji in skill bodies or the README.
- This repo is the source of truth; local runtimes consume it via `scripts/sync-to-local.ps1`, never the reverse.
