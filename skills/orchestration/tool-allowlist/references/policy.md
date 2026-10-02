# Policy file format, version 1

One JSON file per agent task. `scripts/lint-policy.mjs` enforces everything on this page;
`scripts/to-claude-settings.mjs` converts a passing file into Claude Code's `permissions` object.
A complete passing example is `scripts/fixtures/good.policy.json`, and its converted form is
`scripts/fixtures/good.claude-settings.json`.

## Shape

```json
{
  "version": 1,
  "default": "deny",
  "description": "optional: the task this policy is for",
  "allow": [ { "tool": "shell", "pattern": "npm run test *", "why": "run the suite the task asks about" } ],
  "ask":   [ { "tool": "shell", "pattern": "git commit *", "why": "a person confirms each commit" } ],
  "deny":  [ { "tool": "read", "pattern": ".env", "why": "credentials" } ]
}
```

| Key | Type | Required | Rule |
|---|---|---|---|
| `version` | integer | yes | must be `1` |
| `default` | string | yes | must be `"deny"`; anything not allowed is refused or prompted |
| `description` | string | no | free text |
| `allow`, `ask`, `deny` | array of rules | no (default `[]`) | any other top-level key is an error |

Each rule:

| Key | Type | Required | Meaning |
|---|---|---|---|
| `tool` | string | yes | one of `shell`, `read`, `edit`, `fetch`, `mcp` |
| `pattern` | string | allow: yes. ask, deny: no | what the rule matches; omitted on ask or deny means the whole tool |
| `why` | string | yes | the task need (allow) or the risk (deny) in one line; reviewers read this first |
| `reviewed` | boolean | no | only meaningful on a shell allow that contains a shell operator (see `shell-metachar`) |

## Tools and patterns

| `tool` | `pattern` | Example | Claude Code form |
|---|---|---|---|
| `shell` | command text, `*` matches any text including spaces | `git diff *` | `Bash(git diff *)` |
| `read` | gitignore-style path: `//abs`, `~/home`, `/settings-root`, or relative | `src/**` | `Read(src/**)` |
| `edit` | same path syntax as `read` | `src/**` | `Edit(src/**)` |
| `fetch` | hostname, `*.` prefix for subdomains; a `domain:` prefix is accepted | `docs.github.com` | `WebFetch(domain:docs.github.com)` |
| `mcp` | `server` or `server/tool`; `*` allowed in the tool part only | `github/get_*` | `mcp__github__get_*` |

A rule with no pattern converts to the bare tool name (`Bash`, `Read`, `Edit`, `WebFetch`), and an
`mcp` rule with no pattern converts to `mcp__*`. The linter only lets those through in `ask` or `deny`.

## Lint rules

Errors exit 1 and block conversion. Warnings print and exit 0.

| Code | Level | Fires when | Why it is wrong |
|---|---|---|---|
| `bad-version`, `bad-shape` | error | `version` is not 1, a list is not an array, a key is unknown | a typo such as `"deny_list"` would otherwise be silently ignored |
| `default-not-deny` | error | `default` is anything but `"deny"` | every unlisted call would be allowed |
| `blocklist` | error | deny rules with an empty `allow`, or any key containing `blocklist` (such as `args_blocklist`) | a blocklist names what is forbidden and lets everything new through |
| `missing-why` | error | a rule has no `why` | a rule nobody can justify is the one that never gets removed |
| `unknown-tool` | error | `tool` is not in the table above | the fix names the neutral word when you wrote `Bash`, `Read`, `Write` or `WebFetch` |
| `wide-allow` | error | an allow with no pattern or `*`; a shell allow starting with `*`; a runner such as `npx *`, `docker exec *`, `sh -c *`; a read or edit allow on a bare root such as `//**` or `~/**` | each one grants the whole tool |
| `shell-metachar` | error | a shell allow contains `;` `&` `\|` a backtick, `$(`, `<`, `>` or a newline, unless `"reviewed": true` | Claude Code splits compound commands and checks redirect targets against file rules, so the string does not mean what it looks like |
| `fetch-without-domain` | error | a fetch allow has no pattern, `*`, or a URL instead of a host | the doc says a domain rule is the reliable way to scope fetches |
| `mcp-server-glob` | error | an mcp allow has a wildcard in the server name | the doc says such allow rules are skipped |
| `allow-shadowed` | error | a deny rule matches every call an allow rule matches; a `read` deny also counts against an `edit` allow | deny is evaluated before allow regardless of specificity, and a Read deny also blocks Edit and Write on that path, so the allow is dead |
| `credentials-not-denied` | error | read or edit is allowed and no deny covers each of `.env`, `.env.*`, `~/.ssh`, `*.pem` | the four most common secret locations |
| `allow-shadowed-by-ask` | warning | an ask rule matches every call an allow rule matches | the allow will still prompt |
| `too-many-allows` | warning | more than 20 allows for one tool (`--max-allow N`) | a list that long is rarely scoped to one task |
| `duplicate-rule` | warning | two rules in one list share tool and pattern | noise that hides real changes in review |

## Precedence the overlap check uses

From code.claude.com/docs/en/permissions, read 2026-10-02:

> Rules are evaluated in order: deny, then ask, then allow. The first match in that order determines
> the outcome, and rule specificity doesn't change the order.

> An allow rule can't carve an exception out of a deny rule.

So the intended shape is a broad allow with narrow denies inside it (`allow git *`, `deny git push *`
is legal and lints clean). The reverse, a narrow allow inside a broad deny, is the `allow-shadowed`
error. The overlap test is a string-level approximation of the documented matchers: Bash `*` matches
any text and a single trailing ` *` also matches the bare command; paths use gitignore rules where a
bare filename in a deny matches at any depth under its anchor; `*.host` matches subdomains only. It
does not resolve symlinks or expand environment variables, so a clean lint is a floor, not a proof.

## Running it

```sh
node scripts/lint-policy.mjs policy.json            # human-readable, exit 0/1/2
node scripts/lint-policy.mjs policy.json --json     # { file, ok, errors[], warnings[] }
node scripts/to-claude-settings.mjs policy.json > permissions.json
node --test scripts/lint-policy.test.mjs scripts/to-claude-settings.test.mjs
```

To call the linter from another program, pass an argument array, never a shell string:

```js
import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, ['scripts/lint-policy.mjs', 'policy.json', '--json'], { encoding: 'utf8' });
if (r.status !== 0) throw new Error(r.status === 2 ? r.stderr || r.stdout : r.stdout);
const { errors, warnings } = JSON.parse(r.stdout);
```
