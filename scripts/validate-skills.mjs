#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', 'skills');
const ALLOWED_KEYS = new Set(['name', 'description', 'version', 'argument-hint', 'allowed-tools']);
const BANNED = [
  [/[A-Z]:\\Users\\/i, 'windows user path'],
  [/\/c\/Users\//i, 'msys user path'],
  [/\/home\/[a-z]+\//, 'unix home path'],
  [/reality\.md/i, 'personal file reference'],
  [/sk-ant-[A-Za-z0-9-]{10,}/, 'anthropic api key'],
  [/sk-[A-Za-z0-9]{24,}/, 'api key'],
  [/AIza[A-Za-z0-9_-]{10,}/, 'google api key'],
  [/ghp_[A-Za-z0-9]{20,}/, 'github token'],
  [/xox[bap]-/, 'slack token'],
];

let failures = 0;
const fail = (file, msg) => {
  failures++;
  console.error(`FAIL ${path.relative(path.dirname(ROOT), file)}: ${msg}`);
};

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function parseFrontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const fields = {};
  let cur = null;
  for (const line of m[1].split(/\r?\n/)) {
    const km = line.match(/^([A-Za-z-]+):(.*)$/);
    if (km) { cur = km[1]; fields[cur] = km[2].trim(); }
    else if (cur !== null) fields[cur] += '\n' + line.trim();
  }
  return fields;
}

for (const category of fs.readdirSync(ROOT)) {
  const catDir = path.join(ROOT, category);
  if (!fs.statSync(catDir).isDirectory()) continue;
  for (const name of fs.readdirSync(catDir)) {
    const dir = path.join(catDir, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const skillFile = path.join(dir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) { fail(dir, 'missing SKILL.md'); continue; }

    const fields = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
    if (!fields) { fail(skillFile, 'missing frontmatter'); continue; }
    for (const k of Object.keys(fields)) {
      if (!ALLOWED_KEYS.has(k)) fail(skillFile, `disallowed frontmatter key: ${k}`);
    }
    if (fields.name !== name) fail(skillFile, `frontmatter name "${fields.name}" must equal folder name "${name}"`);
    const desc = (fields.description ?? '').replace(/^["'|>\s]+|["']$/g, '');
    if (desc.length < 20) fail(skillFile, 'description missing or too short');
    if (desc.length > 1024) fail(skillFile, 'description over 1024 chars');

    // Skill loaders substitute $<digit> as positional args, so "$0.05" in prose
    // renders corrupted ("<args>.05") in consuming harnesses. Write "USD n" instead.
    {
      const lines = fs.readFileSync(skillFile, 'utf8').split(/\r?\n/);
      let fence = false;
      lines.forEach((ln, i) => {
        if (/^\s*```/.test(ln)) { fence = !fence; return; }
        if (!fence && !ln.includes('lint-allow:') && /\$\d/.test(ln)) {
          fail(skillFile, `dollar-digit at line ${i + 1}: $<digit> corrupts at skill load — write "USD n"`);
        }
      });
    }

    for (const f of walk(dir)) {
      const text = fs.readFileSync(f, 'utf8');
      for (const [re, label] of BANNED) {
        if (re.test(text)) fail(f, `banned pattern: ${label}`);
      }
    }
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('all skills valid');
