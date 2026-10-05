# Skills branch review — 2026-10-05

Integrate the four executable Claude improvements together with the corrections in this review. Preserve the current catalog and community files. Retain all remote branches; no refs or PRs were mutated by this review.

Reviewed base: `bd80004713be6451188ac4ab66c1a9f55fa516ae` (`origin/main`), tree `fe4eb1a024b0fd3593a64e1d1632a7e9ce5d595e`. Corrected source head tested: `051f512f53d3b8a53a93a6f79d25a19b3b4955a7` on `codex/academy-skills-reviewed-2026-10-05`. The following documentation commit adds this report and its machine-readable receipt without changing tested executable source.

## Every remote branch

GitHub branch search returned nine branches including `main`; its continuation returned no additional branches. Ahead/behind counts are commit counts against the base above, not file-diff counts. Every non-main branch has a different tree from main. Full tree hashes and patch-equivalence results are in [the test receipt](2026-10-05-test-receipt.json).

| Branch | Exact head | Ahead / behind | PR | Disposition |
|---|---|---:|---|---|
| `agent/claude/eval-gate` | `d8a5d5b5a4e69331e5601be8bdfe793a51a4178e` | 2 / 0 | [#9](https://github.com/frankxai/skills/pull/9), open | Integrated both commits; corrected malformed-input handling and pinned-version CI example |
| `agent/claude/allowlist` | `c63d27a30fd959e34cff8cc5a87413e122a85dc9` | 1 / 0 | [#10](https://github.com/frankxai/skills/pull/10), draft | Integrated with corrected read/write protections, credential-family checks and native starting mode |
| `agent/claude/mcp-auth` | `fc54e39447966f454564f7ee624cfefc55f6b6a1` | 1 / 0 | [#11](https://github.com/frankxai/skills/pull/11), draft | Integrated with compliant well-known discovery and bounded dummy-token claims |
| `agent/claude/stop-conditions` | `9e6d8af7e032ca4d9fd3ce42fb753175a7c8a0be` | 1 / 0 | [#12](https://github.com/frankxai/skills/pull/12), draft | Integrated with integer turn limits and a window large enough for four-call cycles |
| `agent/claude/dollar-digit-gate` | `9f000cf5c0c2e0e22af4b651111e9fe797906373` | 3 / 2 | [#7](https://github.com/frankxai/skills/pull/7), draft | Defer whole branch: invalid plugin packaging. Salvage currency/trigger improvements through a dedicated follow-up |
| `agent/claude/canonical-frontmatter` | `cb07af98b85cfa159cbe82468b3582258cf82f60` | 2 / 2 | None open | Defer taxonomy change: metadata support conflicts with current AGENTS.md keys and needs an explicit packaging contract |
| `cursor/quality-gates-skills-9a34` | `5245df333655cf655679800a3bf3e016da2d74a4` | 1 / 2 | None open | Superseded by main's #6 squash; `git cherry` identifies its patch as already integrated |
| `cursor/agent-quality-gates-9a34` | `ed8c4c7762c9290468d9a4eaa2a84f0d79df68ed` | 1 / 2 | None open | Superseded substantively by #6 plus the executable replacements above. Remaining deltas are version annotations and alternate threshold wording, not new capabilities |

A direct stale-branch/main tree diff shows missing later files; that does not mean a three-way merge deletes them. A `git merge-tree --write-tree` check of #7 succeeded and retained main's later additions. The rejection of its packaging is based on concrete manifest defects, not that misleading direct diff.

## Defects reproduced and corrected

| Surface | Before | Corrected behavior |
|---|---|---|
| Read/Edit protection | Edit-only denies counted as protection for Read; Read-only denies counted as protection for NotebookEdit | File access requires Read protection; allowed editing also requires Edit protection |
| Credential families | Denying only `.env.local`, one SSH key or one certificate satisfied family checks | Family patterns are checked; a single-depth SSH wildcard cannot stand in for recursive protection |
| Empty allow list | A default-deny paused agent was mislabeled an unsafe blocklist | Empty allow lists are valid; unsupported blocklist keys remain errors |
| Native conversion | `default: deny` disappeared without a starting permission mode | Converter emits `permissions.defaultMode: dontAsk`; docs explicitly state that built-in reads/read-only commands remain implicit and settings can override the mode |
| MCP discovery | Missing header `resource_metadata` failed even when well-known metadata existed | Endpoint-path then origin-root discovery follows the current specification |
| Query token probe | HTTP 400 rejection failed the check; an invalid dummy token was treated as proof about valid tokens | 400 and 401 pass the dummy check; real-token query rejection is explicitly unverified |
| Stop limits | Fractional turns and a window shorter than a four-call cycle passed | Positive integer turns; window must be at least `4 * maxRepeats` |
| Eval gate | Null run objects, missing case scores and missing aggregate counts could pass | Untrusted structures exit 2 before evaluating scores |
| CI | Only frontmatter/secret-pattern validation ran on PRs | The actual dependency-free suites run through `node --test` as well |

The corrections preserve each checker’s advertised exit codes. Updated allowlist fixtures and golden settings cover native mode and Read/Edit rules. MCP mocks exercise both discovery routes and the missing-metadata failure.

## Exact-head evidence

Tests ran on Node `v24.19.0`. The existing CI targets Node 22; its forthcoming run remains the evidence for that runtime. Node 18 compatibility was not executed here.

| Exact original head | Skill suite | Passed / failed | Repository validator |
|---|---|---:|---|
| `d8a5d5b5a4e69331e5601be8bdfe793a51a4178e` | Eval delta gate | 23 / 0 | Pass |
| `c63d27a30fd959e34cff8cc5a87413e122a85dc9` | Policy linter/converter | 37 / 0 | Pass |
| `fc54e39447966f454564f7ee624cfefc55f6b6a1` | MCP authorization probe | 17 / 0 | Pass |
| `9e6d8af7e032ca4d9fd3ce42fb753175a7c8a0be` | Stop config/loop detector | 39 / 0 | Pass |

The validator passed at all eight non-main heads and on main. Original green suites were insufficient: added adversarial cases first reproduced seven general failures, four MCP failures and two credential-family failures. After correction, the combined root suite passed **128/128**, with zero failures or skipped tests, and the repository validator passed.

Captured final green output SHA-256: `903e6f9484f201fbb56ae5af42cb7f57a96e1a4d4a869c0a209c16f6178e1ffc`. Red-output hashes and exact-head output hashes are in the receipt. Durations vary, so repeated output hashes are not expected to match.

A separate forward exercise generated a review policy, a paused maintenance policy, native settings and a stop config from the skill instructions. Their checkers passed. A four-call cycle repeated twice exited 1 at call 8; a nonloop control exited 0. The exercise also confirmed material runtime limits: allowing `npm test` permits arbitrary subprocesses, native permissions do not create a strict source-directory sandbox, and stop-config linting does not install budget reservations, retry middleware or a hook. The receipt contains the executed checks; the validation agent’s final narrative was interrupted by provider capacity after it saved those artifacts.

## Packaging and source verification

PR #7's Codex manifest names 11 skill paths; **eight do not exist at its exact head**. Its Claude manifest has a string `author`; the current official manifest contract requires an object. Its generic `runtimes.*.supported` flags are assertions rather than tested runtime compatibility. Do not present that branch as an installable plugin.

The original dollar-digit guard has a useful premise: Claude Code substitutes `$N` skill arguments. It skips fenced code, where currency literals still appear, so it does not fully address that risk. This integration leaves the repo’s packaging contract intact; a future packaging change must test actual loaders and both manifests. Canonical metadata is a legitimate portability direction, but silently combining its validator with current AGENTS.md would create contradictory rules.

Current primary sources checked on 2026-10-05:

- [Claude Code permissions](https://code.claude.com/docs/en/permissions): Read/Edit separation, implicit reads, `dontAsk`, rule precedence and subprocess limits.
- [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) and [authorization-server discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery): header and well-known alternatives, endpoint-path-first fallback.
- [Claude CLI reference](https://code.claude.com/docs/en/cli-reference) and [Agent SDK loop](https://code.claude.com/docs/en/agent-sdk/agent-loop): turn/budget knobs, result subtypes and unattended prompting.
- [Plugin manifest reference](https://code.claude.com/docs/en/plugins-reference), [plugin evals](https://code.claude.com/docs/en/plugin-evals) and [skills](https://code.claude.com/docs/en/skills): manifest types, supported `case.yaml` and `prompt.md` layouts, and positional substitution.

## Safe integration order and remaining proof

The local branch applies eval gate's two commits, then allowlist, MCP auth and stop conditions, followed by `051f512` corrections. The four original branches touch disjoint skill directories and produced no cherry-pick conflicts. Publish the corrected integration as one reviewable change, or merge those exact original heads and immediately apply the bounded correction commit before release. Do not release the uncorrected heads as validated security/runtime controls.

Unit and local mock evidence is green. Paid `claude plugin eval` runs were not executed, no real production MCP endpoint was probed, and generated permissions were not loaded into a live Claude session. Main remains a public skills pack, without adding #7's broken plugin manifests. No cloud deployment is part of this repository; the academy and plugin owners should reference these exact tested revisions and validate their own runtime assembly. Live enforcement tests are the next evidence stage before an academy product claims a working autonomous architect.

All work remained inside this MIT repository and its worktrees. No code or book content was copied from another repository. No remote branch was deleted, force-pushed or rewritten.
