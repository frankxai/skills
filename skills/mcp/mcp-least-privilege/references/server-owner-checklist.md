# MCP server owner checklist

Quotes are from modelcontextprotocol.io/specification/2026-07-28/basic/authorization, read 2026-10-02. "Probe" names the check in `scripts/probe-mcp-auth.mjs` that covers the line; "code review" means no external probe can see it.

## Authorization surface

- [ ] Protected resource metadata is served and linked from the 401. "MCP servers MUST implement OAuth 2.0 Protected Resource Metadata (RFC 9728)." Probe: `challenge-resource-metadata`, `metadata-json`.
- [ ] Metadata `resource` is the server's canonical URI, without fragment, preferably without trailing slash. "MUST use the canonical URI of the server." "invalid: ... anything with a fragment. Prefer no trailing slash." Probe: `metadata-resource`, `resource-no-fragment`, `resource-matches-endpoint`.
- [ ] Metadata lists at least one authorization server. "MCP clients MUST use it for authorization server discovery." Probe: `authorization-servers`.
- [ ] The 401 challenge names the required scopes. "MCP servers SHOULD include a `scope` parameter in the `WWW-Authenticate` header (RFC 6750 section 3) to indicate required scopes." Probe: `challenge-scope` (info).
- [ ] `scopes_supported` is the minimal set and omits `offline_access`. It is "intended to represent the minimal set of scopes necessary for basic functionality". "Servers SHOULD NOT include `offline_access` in the WWW-Authenticate scope or in `scopes_supported`." Probe: `scopes-supported-no-offline-access`, `challenge-no-offline-access`.

## Token handling

- [ ] Missing, invalid, and expired tokens get 401. "Invalid or expired tokens MUST receive HTTP 401." Probe: `unauth-401`, `invalid-bearer-401`.
- [ ] Tokens in the query string are not honored. "Access tokens MUST NOT be included in the URI query string." Probe: `query-token-rejected`.
- [ ] Audience is checked on every token. "MCP servers ... MUST validate that tokens were issued specifically for them as the intended audience (RFC 8707 section 2)." Code review: a real token minted for a different resource must get 401.
- [ ] No passthrough. "MCP servers MUST only accept tokens that are valid for use with their own resources." "MCP servers MUST NOT accept or transit any other tokens." Code review: grep every outbound HTTP call; none may copy the incoming `Authorization` header.
- [ ] Validation caches expire no later than the token. Practice, bounded by the 401 rule above. Code review.

## Scope enforcement

- [ ] Each tool checks its scope at dispatch, per call. Practice. Code review.
- [ ] Insufficient scope gets 403 with one complete challenge. "servers SHOULD respond `403 Forbidden` with `WWW-Authenticate: Bearer error="insufficient_scope", scope="<needed scopes>", resource_metadata="...", error_description="..."`." "Servers SHOULD include all scopes required for the current operation in a single challenge, not one at a time." Code review, or a manual test with a real low-scope token.
- [ ] Scope hierarchies are honored. "Servers MUST account for scope hierarchies (a broader scope implies narrower ones)." Code review.

## Tools that shell out

Before (from the previous version of this skill):

```typescript
return exec(`git diff ${shellEscape(file)}`);
```

After:

```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

server.addTool('git.diff', async ({ file }) => {
  if (typeof file !== 'string') throw new Error('invalid path');
  const { stdout } = await run('git', ['diff', '--', file], { cwd: REPO_ROOT, timeout: 10_000 });
  return stdout;
});
```

Why: `exec` hands one string to a shell, so safety depends on an escaping function getting every metacharacter right on every platform. `execFile` with an argument array starts `git` directly with no shell, so `;`, `$()`, and backticks in `file` are inert. The `--` ends option parsing, so a value like `--output=/tmp/x` is read as a path and not as a git option; shell escaping cannot prevent that. `cwd` pins the repository and `timeout` bounds the call.

## Not covered here

The authorization-server-discovery, client-registration, and security-considerations sub-pages of the spec were not read for this checklist. The spec says implementations MUST follow security-considerations. Add its items before using this list for a security sign-off.
