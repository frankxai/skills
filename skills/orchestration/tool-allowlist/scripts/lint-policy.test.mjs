import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { lintPolicy, covers } from './lint-policy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LINT = join(here, 'lint-policy.mjs');
const fx = (name) => join(here, 'fixtures', `${name}.policy.json`);
const good = () => JSON.parse(readFileSync(fx('good'), 'utf8'));

function lint(name, ...flags) {
  const r = spawnSync(process.execPath, [LINT, fx(name), '--json', ...flags], { encoding: 'utf8' });
  return { status: r.status, out: JSON.parse(r.stdout) };
}

test('clean policy passes with no findings', () => {
  const { status, out } = lint('good');
  assert.equal(status, 0);
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.warnings, []);
});

test('human-readable mode prints a summary line and exits 0', () => {
  const stdout = execFileSync(process.execPath, [LINT, fx('good')], { encoding: 'utf8' });
  assert.match(stdout, /0 error\(s\), 0 warning\(s\)/);
});

const failing = [
  ['bad-default-allow', 'default-not-deny', '$.default', /anything not listed would be permitted/],
  ['bad-wide-shell', 'wide-allow', 'allow[6]', /allows every shell call/],
  ['bad-tool-wide-shell', 'wide-allow', 'allow[6]', /allows every shell call/],
  ['bad-runner-wildcard', 'wide-allow', 'allow[6]', /runner execute any inner command/],
  ['bad-shell-chaining', 'shell-metachar', 'allow[6]', /shell operator or redirection/],
  ['bad-shell-redirect', 'shell-metachar', 'allow[6]', /checks redirect targets against file rules/],
  ['bad-deny-only', 'blocklist', '$.allow', /deny rules with no allow rules is a blocklist/],
  ['bad-args-blocklist', 'blocklist', '$.allow[4].args_blocklist', /blocklist keys are not part of this format/],
  ['bad-missing-why', 'missing-why', 'allow[0]', /has no "why"/],
  ['bad-allow-shadowed', 'allow-shadowed', 'allow[6]', /allow\[6\] can never apply: deny\[4\] matches every call/],
  ['bad-no-ssh-deny', 'credentials-not-denied', '$.deny', /no deny rule covers ~\/\.ssh/],
  ['bad-fetch-any-domain', 'fetch-without-domain', 'allow[4]', /not restricted to a domain/],
  ['bad-unknown-tool', 'unknown-tool', 'allow[6]', /unknown tool "Bash"/],
  ['bad-mcp-server-glob', 'mcp-server-glob', 'allow[6]', /wildcard in the server name/],
];

for (const [name, code, where, message] of failing) {
  test(`${name} exits 1 with ${code} at ${where}`, () => {
    const { status, out } = lint(name);
    assert.equal(status, 1);
    assert.equal(out.ok, false);
    const hit = out.errors.find((e) => e.code === code && e.where === where);
    assert.ok(hit, `expected ${code} at ${where}, got ${JSON.stringify(out.errors)}`);
    assert.match(hit.message, message);
    assert.ok(hit.fix.length > 0, 'every error names a fix');
  });
}

test('every failing fixture trips exactly one error code', () => {
  for (const [name, code] of failing) {
    const codes = new Set(lint(name).out.errors.map((e) => e.code));
    assert.deepEqual([...codes], [code], name);
  }
});

test('a chained shell allow marked reviewed passes', () => {
  assert.equal(lint('ok-shell-chaining-reviewed').status, 0);
});

test('unknown-tool fix points at the neutral name', () => {
  assert.match(lint('bad-unknown-tool').out.errors[0].fix, /use "shell"/);
});

test('duplicate rule is a warning, exit 0', () => {
  const { status, out } = lint('warn-duplicate');
  assert.equal(status, 0);
  assert.equal(out.warnings[0].code, 'duplicate-rule');
  assert.match(out.warnings[0].message, /allow\[6\] repeats allow\[1\]/);
});

test('too many allows for one tool is a warning, exit 0', () => {
  const { status, out } = lint('good', '--max-allow', '1');
  assert.equal(status, 0);
  assert.equal(out.warnings[0].code, 'too-many-allows');
  assert.match(out.warnings[0].message, /2 allow rules for shell \(limit 1\)/);
});

test('an ask rule covering an allow is a warning', () => {
  const p = good();
  p.allow.push({ tool: 'shell', pattern: 'git commit -m *', why: 'commit fixes' });
  const { errors, warnings } = lintPolicy(p);
  assert.deepEqual(errors, []);
  assert.equal(warnings[0].code, 'allow-shadowed-by-ask');
});

test('a read deny shadows an edit allow on the same path', () => {
  const p = good();
  p.allow.push({ tool: 'edit', pattern: 'config/.env', why: 'rotate a key' });
  const { errors } = lintPolicy(p);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'allow-shadowed');
  assert.match(errors[0].message, /allow\[6\] can never apply: deny\[0\]/);
});

test('unparseable JSON exits 2', () => {
  const r = spawnSync(process.execPath, [LINT, fx('broken'), '--json'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(JSON.parse(r.stdout).fatal, /is not valid JSON/);
});

test('missing file exits 2', () => {
  const r = spawnSync(process.execPath, [LINT, fx('does-not-exist')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read/);
});

test('no arguments exits 2 with usage', () => {
  const r = spawnSync(process.execPath, [LINT], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage:/);
});

test('coverage follows the documented matching rules', () => {
  const r = (tool, pattern) => ({ tool, pattern });
  // Bash: trailing " *" also matches the bare command; a narrower deny does not cover a broader allow.
  assert.ok(covers(r('shell', 'git push *'), r('shell', 'git push')));
  assert.ok(!covers(r('shell', 'git push *'), r('shell', 'git *')));
  assert.ok(!covers(r('shell', 'ls *'), r('shell', 'lsof')));
  // Read/Edit: a bare filename deny matches at any depth; "*" stays inside one segment.
  assert.ok(covers(r('read', '.env'), r('read', 'app/.env')));
  assert.ok(!covers(r('read', '*.pem'), r('read', 'src/**')));
  assert.ok(!covers(r('read', '.ssh/**'), r('read', '~/.ssh/id_rsa')), 'relative deny does not reach home');
  assert.ok(covers(r('read', '//**/.env'), r('read', '~/proj/.env')));
  // WebFetch: "*.x" matches subdomains, not x itself.
  assert.ok(covers(r('fetch', '*.example.com'), r('fetch', 'api.example.com')));
  assert.ok(!covers(r('fetch', '*.example.com'), r('fetch', 'example.com')));
  // MCP: a server-only rule covers its tools.
  assert.ok(covers(r('mcp', 'github'), r('mcp', 'github/create_issue')));
  // A deny with no pattern covers the whole tool.
  assert.ok(covers({ tool: 'shell' }, r('shell', 'npm test')));
});
