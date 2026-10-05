#!/usr/bin/env node
// Lints a harness-neutral tool policy (references/policy.md). Zero dependencies, Node 18+.
// Usage: node lint-policy.mjs <policy.json> [--json] [--max-allow N]
// Exit 0 = clean or warnings only, 1 = policy errors, 2 = unreadable file, invalid JSON or bad usage.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const TOOLS = ['shell', 'read', 'edit', 'fetch', 'mcp'];
const TOP_KEYS = new Set(['version', 'default', 'description', 'allow', 'ask', 'deny']);
const RULE_KEYS = new Set(['tool', 'pattern', 'why', 'reviewed']);
const LISTS = ['allow', 'ask', 'deny'];
const CLAUDE_NAMES = { Bash: 'shell', PowerShell: 'shell', Read: 'read', Edit: 'edit', Write: 'edit', WebFetch: 'fetch' };
const SHELL_META = /[;|&`<>\n]|\$\(/;
const RUNNERS = /^(npx|direnv exec|devbox run|mise exec|docker exec|sh -c|bash -c)( \*|:\*)$/;
const CREDENTIALS = [
  { label: '.env', anchor: 'rel', path: '.env', fix: '{ "tool": "read", "pattern": ".env", "why": "..." }' },
  { label: '.env.*', anchor: 'rel', path: '.env.*', fix: '{ "tool": "read", "pattern": ".env.*", "why": "..." }' },
  { label: '~/.ssh', anchor: 'home', path: '.ssh/**', fix: '{ "tool": "read", "pattern": "~/.ssh/**", "why": "..." }' },
  { label: '*.pem', anchor: 'rel', path: '*.pem', fix: '{ "tool": "read", "pattern": "*.pem", "why": "..." }' },
];

const esc = (s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
const hasPattern = (r) => typeof r.pattern === 'string' && r.pattern.trim() !== '';

// Claude Code Bash matching: `*` matches any text including spaces; a trailing ` *` that is the
// only wildcard also matches the bare command; `:*` at the end equals ` *`.
function shellRegex(pattern) {
  const p = pattern.replace(/:\*$/, ' *');
  const stars = (p.match(/\*/g) || []).length;
  if (stars === 1 && p.endsWith(' *')) return new RegExp(`^${esc(p.slice(0, -2))}(?: .*)?$`);
  return new RegExp(`^${p.split('*').map(esc).join('.*')}$`);
}

function splitAnchor(pattern) {
  const p = pattern.replace(/^\.\//, '');
  if (p.startsWith('//')) return { anchor: 'abs', rest: p.slice(2) };
  if (p.startsWith('~/')) return { anchor: 'home', rest: p.slice(2) };
  if (p.startsWith('/')) return { anchor: 'root', rest: p.slice(1) };
  return { anchor: 'rel', rest: p };
}

// gitignore-style: `**` crosses directories, `*` stays inside one segment. As deny or ask rules, a
// bare filename and a single-directory `dir/**` pattern match at any depth under their anchor.
function pathRegex(rest, anywhere) {
  let body = '';
  for (let i = 0; i < rest.length; i++) {
    if (rest.startsWith('**/', i)) { body += '(?:.*/)?'; i += 2; }
    else if (rest.startsWith('/**', i) && i + 3 === rest.length) { body += '(?:/.*)?'; i += 2; }
    else if (rest.startsWith('**', i)) { body += '.*'; i += 1; }
    else if (rest[i] === '*') body += '[^/]*';
    else if (rest[i] === '?') body += '[^/]';
    else body += esc(rest[i]);
  }
  return new RegExp(`^${anywhere ? '(?:.*/)?' : ''}${body}$`);
}

function pathCovers(denyPattern, target) {
  let d = splitAnchor(denyPattern);
  if (d.anchor === 'abs' && d.rest.startsWith('**/')) d = { anchor: 'any', rest: d.rest };
  if (d.anchor !== 'any' && d.anchor !== target.anchor) return false;
  const anywhere = d.anchor === 'rel' && (!d.rest.includes('/') || /^[^/*]+\/\*\*$/.test(d.rest));
  return pathRegex(d.rest, anywhere).test(target.rest);
}

const domainOf = (p) => p.replace(/^domain:/, '').replace(/\.$/, '').toLowerCase();
function domainRegex(pattern) {
  const d = domainOf(pattern);
  if (d === '*') return /^.*$/;
  if (d.startsWith('*.')) return new RegExp(`^(?:[^.]+\\.)+${esc(d.slice(2))}$`);
  return new RegExp(`^${d.split('*').map(esc).join('[^.]*')}$`);
}

const mcpName = (p) => { const [server, tool] = p.split('/'); return tool ? `${server}__${tool}` : `${server}__*`; };
const mcpRegex = (p) => new RegExp(`^${mcpName(p).split('*').map(esc).join('.*')}$`);

// Does broad rule `b` match everything narrow rule `n` matches? Same tool assumed.
export function covers(b, n) {
  if (!hasPattern(b) || b.pattern.trim() === '*') return true;
  if (!hasPattern(n)) return false;
  switch (b.tool) {
    case 'shell': return shellRegex(b.pattern).test(n.pattern.replace(/:\*$/, ' *'));
    case 'read': case 'edit': return pathCovers(b.pattern, splitAnchor(n.pattern));
    case 'fetch': return domainRegex(b.pattern).test(domainOf(n.pattern));
    case 'mcp': return mcpRegex(b.pattern).test(mcpName(n.pattern));
  }
  return false;
}

function findBlocklistKeys(node, path = '$', out = []) {
  if (Array.isArray(node)) node.forEach((v, i) => findBlocklistKeys(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (/blocklist/i.test(k)) out.push(`${path}.${k}`);
      findBlocklistKeys(v, `${path}.${k}`, out);
    }
  }
  return out;
}

export function lintPolicy(policy, { maxAllow = 20 } = {}) {
  const errors = [];
  const warnings = [];
  const err = (code, where, message, fix) => errors.push({ code, where, message, fix });
  const warn = (code, where, message, fix) => warnings.push({ code, where, message, fix });

  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    err('bad-shape', '$', 'policy must be a JSON object', 'start from the example in references/policy.md');
    return { errors, warnings };
  }
  if (policy.version !== 1) err('bad-version', '$.version', `version is ${JSON.stringify(policy.version)}, expected 1`, 'set "version": 1');
  if (policy.default !== 'deny') {
    err('default-not-deny', '$.default', `default is ${JSON.stringify(policy.default)}; anything not listed would be permitted`, 'set "default": "deny"');
  }
  for (const where of findBlocklistKeys(policy)) {
    err('blocklist', where, 'blocklist keys are not part of this format; a blocklist names what is forbidden and lets every unnamed call through', 'delete the key and express the intent as narrow allow rules');
  }
  for (const k of Object.keys(policy)) {
    if (!TOP_KEYS.has(k) && !/blocklist/i.test(k)) err('bad-shape', `$.${k}`, `unknown top-level key "${k}"`, `use only ${[...TOP_KEYS].join(', ')}`);
  }

  const rules = { allow: [], ask: [], deny: [] };
  for (const list of LISTS) {
    const v = policy[list] ?? [];
    if (!Array.isArray(v)) { err('bad-shape', `$.${list}`, `"${list}" must be an array`, `"${list}": []`); continue; }
    v.forEach((r, i) => {
      const id = `${list}[${i}]`;
      if (!r || typeof r !== 'object' || Array.isArray(r)) { err('bad-shape', id, 'rule must be an object', '{ "tool": "...", "pattern": "...", "why": "..." }'); return; }
      for (const k of Object.keys(r)) {
        if (!RULE_KEYS.has(k) && !/blocklist/i.test(k)) err('bad-shape', `${id}.${k}`, `unknown rule key "${k}"`, `use only ${[...RULE_KEYS].join(', ')}`);
      }
      if (!TOOLS.includes(r.tool)) {
        const hint = CLAUDE_NAMES[r.tool] ? `use "${CLAUDE_NAMES[r.tool]}"; the converter writes the ${r.tool} form` : `use one of ${TOOLS.join(', ')}`;
        err('unknown-tool', id, `unknown tool ${JSON.stringify(r.tool)}`, hint);
        return;
      }
      if (typeof r.why !== 'string' || r.why.trim() === '') err('missing-why', id, `${r.tool} rule has no "why"`, 'add "why": the task need this rule serves, in one line');
      if (r.pattern !== undefined && typeof r.pattern !== 'string') { err('bad-shape', `${id}.pattern`, 'pattern must be a string', 'quote the pattern'); return; }
      rules[list].push({ ...r, id });
    });
  }

  const counts = {};
  for (const r of rules.allow) {
    counts[r.tool] = (counts[r.tool] || 0) + 1;
    const p = hasPattern(r) ? r.pattern.trim() : '';
    const label = `${r.id} (${r.tool} ${JSON.stringify(p)})`;
    if (r.tool === 'fetch' && (p === '' || domainOf(p) === '*' || /[/:]/.test(domainOf(p)))) {
      err('fetch-without-domain', r.id, `${label} is not restricted to a domain`, 'use a hostname such as "docs.github.com" or "*.example.com"');
      continue;
    }
    if (p === '' || p === '*' || p === ':*') {
      err('wide-allow', r.id, `${label} allows every ${r.tool} call`, `give a pattern for the exact ${r.tool} use the task needs`);
      continue;
    }
    if (r.tool === 'shell') {
      if (p.startsWith('*')) err('wide-allow', r.id, `${label} starts with a wildcard, so it matches any program`, 'start the pattern with the program and subcommand, e.g. "npm run test *"');
      else if (RUNNERS.test(p)) err('wide-allow', r.id, `${label} lets a runner execute any inner command`, 'name the inner command too, e.g. "npx prettier --check *"');
      if (SHELL_META.test(p) && r.reviewed !== true) {
        err('shell-metachar', r.id, `${label} contains a shell operator or redirection; Claude Code splits compound commands and matches each part on its own, and checks redirect targets against file rules`, 'allow each command as its own rule, or set "reviewed": true if a person checked this exact string');
      }
    }
    if (r.tool === 'read' || r.tool === 'edit') {
      const { rest } = splitAnchor(p);
      if (/^[*/]*$/.test(rest)) err('wide-allow', r.id, `${label} covers a whole filesystem root`, 'scope it to the directory the task needs, e.g. "src/**"');
    }
    if (r.tool === 'mcp' && /[*?]/.test(p.split('/')[0])) {
      err('mcp-server-glob', r.id, `${label} has a wildcard in the server name; Claude Code skips such allow rules`, 'name the server literally, e.g. "github/get_*"');
    }
  }

  for (const a of rules.allow) {
    for (const d of rules.deny) {
      // A Read deny also blocks Edit and Write on the same path (permissions doc, Read and Edit).
      const sameTarget = d.tool === a.tool || (d.tool === 'read' && a.tool === 'edit');
      if (sameTarget && covers({ ...d, tool: a.tool }, a)) {
        err('allow-shadowed', a.id, `${a.id} can never apply: ${d.id} matches every call it matches, and deny is evaluated before allow regardless of specificity`, `narrow ${a.id} so it no longer falls inside ${d.id}, or delete it`);
      }
    }
    for (const q of rules.ask) {
      if (q.tool === a.tool && covers(q, a)) warn('allow-shadowed-by-ask', a.id, `${a.id} will still prompt: ${q.id} matches every call it matches, and ask is evaluated before allow`, `delete ${a.id} or narrow ${q.id}`);
    }
  }

  if (rules.allow.some((r) => r.tool === 'read' || r.tool === 'edit')) {
    // Read access is implicit for files in working directories even in dontAsk mode.
    // Edit denies never protect reads; Read denies do not cover NotebookEdit.
    const required = rules.allow.some((r) => r.tool === 'edit') ? ['read', 'edit'] : ['read'];
    for (const c of CREDENTIALS) {
      const target = { anchor: c.anchor, rest: c.path };
      for (const tool of required) {
        const fileDenies = rules.deny.filter((d) => d.tool === tool);
        if (!fileDenies.some((d) => !hasPattern(d) || (
          (!c.path.includes('**') || d.pattern.includes('**')) && pathCovers(d.pattern, target)
        ))) {
          err('credentials-not-denied', '$.deny', `read or edit is allowed but no deny rule covers ${c.label} for ${tool}`, `add ${c.fix.replace('"read"', `"${tool}"`)}`);
        }
      }
    }
  }

  for (const [tool, n] of Object.entries(counts)) {
    if (n > maxAllow) warn('too-many-allows', '$.allow', `${n} allow rules for ${tool} (limit ${maxAllow}); a list this long is rarely scoped to one task`, 'split the policy per task, or raise --max-allow');
  }
  for (const list of LISTS) {
    const seen = new Map();
    for (const r of rules[list]) {
      const key = `${r.tool}\u0000${hasPattern(r) ? r.pattern.trim() : ''}`;
      if (seen.has(key)) warn('duplicate-rule', r.id, `${r.id} repeats ${seen.get(key)}`, `delete ${r.id}`);
      else seen.set(key, r.id);
    }
  }
  return { errors, warnings };
}

export class PolicyLoadError extends Error {}
export function loadPolicy(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { throw new PolicyLoadError(`cannot read ${file}: ${e.code || e.message}`); }
  try { return JSON.parse(text.replace(/^﻿/, '')); } catch (e) { throw new PolicyLoadError(`${file} is not valid JSON: ${e.message}`); }
}

export function formatFinding(level, f) {
  return `${level} [${f.code}] ${f.where}: ${f.message}\n  fix: ${f.fix}`;
}

function main(argv) {
  const json = argv.includes('--json');
  const mi = argv.indexOf('--max-allow');
  const maxAllow = mi === -1 ? 20 : Number(argv[mi + 1]);
  const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--max-allow');
  if (!file || !Number.isInteger(maxAllow) || maxAllow < 1) {
    console.error('usage: node lint-policy.mjs <policy.json> [--json] [--max-allow N]');
    return 2;
  }
  let policy;
  try { policy = loadPolicy(file); } catch (e) {
    if (!(e instanceof PolicyLoadError)) throw e;
    if (json) console.log(JSON.stringify({ file, ok: false, fatal: e.message, errors: [], warnings: [] }, null, 2));
    else console.error(`fatal: ${e.message}`);
    return 2;
  }
  const { errors, warnings } = lintPolicy(policy, { maxAllow });
  if (json) {
    console.log(JSON.stringify({ file, ok: errors.length === 0, errors, warnings }, null, 2));
  } else {
    for (const e of errors) console.error(formatFinding('error', e));
    for (const w of warnings) console.error(formatFinding('warning', w));
    console.log(`${file}: ${errors.length} error(s), ${warnings.length} warning(s)`);
  }
  return errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
