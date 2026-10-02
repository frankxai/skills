#!/usr/bin/env node
// Converts a policy that passes lint-policy.mjs into Claude Code's `permissions` object.
// Usage: node to-claude-settings.mjs <policy.json>
// Exit 0 = JSON on stdout, 1 = policy fails the linter (nothing written to stdout), 2 = unreadable input.
import { pathToFileURL } from 'node:url';
import { lintPolicy, loadPolicy, PolicyLoadError, formatFinding } from './lint-policy.mjs';

// Rule syntax from code.claude.com/docs/en/permissions (read 2026-10-02):
// Bash(cmd *), Read(path), Edit(path), WebFetch(domain:host), mcp__server__tool.
export function toClaudeRule(rule) {
  const p = typeof rule.pattern === 'string' ? rule.pattern.trim() : '';
  switch (rule.tool) {
    case 'shell': return p ? `Bash(${p})` : 'Bash';
    case 'read': return p ? `Read(${p})` : 'Read';
    case 'edit': return p ? `Edit(${p})` : 'Edit';
    case 'fetch': return p ? `WebFetch(domain:${p.replace(/^domain:/, '')})` : 'WebFetch';
    case 'mcp': {
      if (!p || p === '*') return 'mcp__*';
      const [server, tool] = p.split('/');
      return tool ? `mcp__${server}__${tool}` : `mcp__${server}`;
    }
  }
  throw new Error(`unknown tool ${rule.tool}`);
}

export function convert(policy) {
  const { errors, warnings } = lintPolicy(policy);
  if (errors.length) return { errors, warnings };
  const permissions = {};
  for (const list of ['allow', 'ask', 'deny']) permissions[list] = (policy[list] ?? []).map(toClaudeRule);
  return { errors, warnings, settings: { permissions } };
}

function main(argv) {
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) { console.error('usage: node to-claude-settings.mjs <policy.json>'); return 2; }
  let policy;
  try { policy = loadPolicy(file); } catch (e) {
    if (!(e instanceof PolicyLoadError)) throw e;
    console.error(`fatal: ${e.message}`);
    return 2;
  }
  const { errors, warnings, settings } = convert(policy);
  for (const w of warnings) console.error(formatFinding('warning', w));
  if (errors.length) {
    for (const e of errors) console.error(formatFinding('error', e));
    console.error(`refusing to convert ${file}: ${errors.length} lint error(s)`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(settings, null, 2)}\n`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
