# Contributing

Skills here are small, portable, and opinionated. PRs that add or sharpen one are welcome.

## Add a skill

1. Create `skills/<category>/<name>/SKILL.md`. Categories: `mcp`, `orchestration`, `models`, `context`, `frameworks`, `tools`. New category? Say why in the PR.
2. Frontmatter — these keys only:
   ```
   ---
   name: <kebab-case, must equal the folder name>
   description: <when this fires — the trigger surface, max 1024 chars>
   version: 1.0.0   # optional
   ---
   ```
   The description tells the model *when* to fire, not what the file contains.
3. Body is portable: no personal paths, no machine-specific setup, no secrets, no private-repo references. Reference public tools and open protocols; if a skill needs a paid service, say so in its first section (env-var patterns only, never literal credentials).
4. Add a Catalog row in `README.md`.

## Before you open the PR

```sh
node scripts/validate-skills.mjs
```

This checks the frontmatter schema and scans for personal paths and secrets. CI runs the same check on every push — green or it doesn't merge.

## What gets merged

Skills that encode real judgment: a discipline, a decision, a playbook — not 500 words of filler. If it reads like a generic tutorial, it's a no. Small and composable beats broad and vague.

MIT-licensed, like the rest of the repo. By contributing you agree your work ships under it.
