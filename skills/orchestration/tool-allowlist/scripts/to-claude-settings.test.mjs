import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { toClaudeRule } from './to-claude-settings.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const CONVERT = join(here, 'to-claude-settings.mjs');
const fx = (name) => join(here, 'fixtures', name);
const run = (file) => spawnSync(process.execPath, [CONVERT, file], { encoding: 'utf8' });

test('clean policy converts to the golden permissions object', () => {
  const r = run(fx('good.policy.json'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.replace(/\r\n/g, '\n'), readFileSync(fx('good.claude-settings.json'), 'utf8').replace(/\r\n/g, '\n'));
});

test('output denies prompts by default and has allow, ask and deny arrays', () => {
  const out = JSON.parse(run(fx('good.policy.json')).stdout);
  assert.deepEqual(Object.keys(out), ['permissions']);
  assert.deepEqual(Object.keys(out.permissions), ['defaultMode', 'allow', 'ask', 'deny']);
  assert.equal(out.permissions.defaultMode, 'dontAsk');
});

for (const bad of ['bad-default-allow', 'bad-shell-chaining', 'bad-allow-shadowed', 'bad-no-ssh-deny', 'bad-args-blocklist']) {
  test(`refuses ${bad}: exit 1, nothing on stdout`, () => {
    const r = run(fx(`${bad}.policy.json`));
    assert.equal(r.status, 1);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /refusing to convert .*: \d+ lint error\(s\)/);
  });
}

test('passes warnings through on stderr and still converts', () => {
  const r = run(fx('warn-duplicate.policy.json'));
  assert.equal(r.status, 0);
  assert.match(r.stderr, /warning \[duplicate-rule\]/);
  assert.ok(JSON.parse(r.stdout).permissions.allow.length === 7);
});

test('unparseable JSON exits 2', () => {
  const r = run(fx('broken.policy.json'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /is not valid JSON/);
});

test('rule forms match the documented syntax', () => {
  const cases = [
    [{ tool: 'shell', pattern: 'npm run *' }, 'Bash(npm run *)'],
    [{ tool: 'shell' }, 'Bash'],
    [{ tool: 'read', pattern: './.env' }, 'Read(./.env)'],
    [{ tool: 'edit', pattern: '/src/**/*.ts' }, 'Edit(/src/**/*.ts)'],
    [{ tool: 'fetch', pattern: 'example.com' }, 'WebFetch(domain:example.com)'],
    [{ tool: 'fetch', pattern: 'domain:example.com' }, 'WebFetch(domain:example.com)'],
    [{ tool: 'fetch' }, 'WebFetch'],
    [{ tool: 'mcp', pattern: 'puppeteer' }, 'mcp__puppeteer'],
    [{ tool: 'mcp', pattern: 'puppeteer/puppeteer_navigate' }, 'mcp__puppeteer__puppeteer_navigate'],
    [{ tool: 'mcp', pattern: 'puppeteer/*' }, 'mcp__puppeteer__*'],
    [{ tool: 'mcp' }, 'mcp__*'],
  ];
  for (const [rule, want] of cases) assert.equal(toClaudeRule(rule), want);
});
