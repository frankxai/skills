#!/usr/bin/env node
// Flags repeated tool calls in a JSONL log: one {"tool": "...", "args": {...}} per line.
// Usage: node detect-loop.mjs <calls.jsonl> [--max-repeats 3] [--window N] [--json]
//   --max-repeats  times a call, or a cycle of 2-4 calls, must repeat back to back (default 3, min 2)
//   --window       only inspect the last N calls (default: all)
// Exit 0 = no loop, 1 = loop found, 2 = unreadable input or bad option.
// A heuristic over what the caller logged; it sees nothing the log does not contain.
import fs from 'node:fs';

const die = (msg) => { console.error(msg); process.exit(2); };

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

const argv = process.argv.slice(2);
let file;
let maxRepeats = 3;
let windowSize = 0;
let asJson = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') asJson = true;
  else if (a === '--max-repeats' || a === '--window') {
    const n = Number(argv[++i]);
    const min = a === '--max-repeats' ? 2 : 1;
    if (!Number.isInteger(n) || n < min) die(`${a} needs an integer >= ${min}`);
    if (a === '--max-repeats') maxRepeats = n; else windowSize = n;
  } else if (!file) file = a;
  else die(`unexpected argument: ${a}`);
}
if (!file) die('usage: node detect-loop.mjs <calls.jsonl> [--max-repeats 3] [--window N] [--json]');

let text;
try { text = fs.readFileSync(file, 'utf8'); } catch (e) { die(`cannot read ${file}: ${e.message}`); }

let calls = [];
text.split(/\r?\n/).forEach((line, idx) => {
  if (!line.trim()) return;
  let obj;
  try { obj = JSON.parse(line); } catch (e) { die(`${file}:${idx + 1}: not JSON (${e.message})`); }
  if (!obj || typeof obj.tool !== 'string') die(`${file}:${idx + 1}: missing string field "tool"`);
  calls.push({ line: idx + 1, tool: obj.tool, args: obj.args ?? {}, key: `${obj.tool} ${stable(obj.args ?? {})}` });
});
if (windowSize && calls.length > windowSize) calls = calls.slice(-windowSize);

const keys = calls.map((c) => c.key);
const sameBlock = (a, b, len) => {
  for (let k = 0; k < len; k++) if (keys[a + k] !== keys[b + k]) return false;
  return true;
};
const hasShorterPeriod = (start, len) => {
  for (let p = 1; p < len; p++) {
    if (len % p === 0 && sameBlock(start, start + p, len - p)) return true;
  }
  return false;
};

const findings = [];
let i = 0;
while (i < calls.length) {
  let hit = null;
  for (let len = 1; len <= 4 && !hit; len++) {
    if (i + len * maxRepeats > calls.length || hasShorterPeriod(i, len)) continue;
    let reps = 1;
    while (i + (reps + 1) * len <= calls.length && sameBlock(i, i + reps * len, len)) reps++;
    if (reps >= maxRepeats) hit = { len, reps };
  }
  if (!hit) { i++; continue; }
  const span = calls.slice(i, i + hit.len * hit.reps);
  findings.push({
    kind: hit.len === 1 ? 'repeat' : 'cycle',
    cycleLength: hit.len,
    count: hit.reps,
    calls: span.slice(0, hit.len).map(({ tool, args }) => ({ tool, args })),
    lines: span.map((c) => c.line),
  });
  i += hit.len * hit.reps;
}

if (asJson) {
  console.log(JSON.stringify({ calls: calls.length, maxRepeats, loop: findings.length > 0, findings }, null, 2));
} else if (!findings.length) {
  console.log(`no loop in ${calls.length} call(s) (max repeats ${maxRepeats})`);
} else {
  for (const f of findings) {
    const what = f.calls.map((c) => `${c.tool} ${stable(c.args)}`).join(' -> ');
    const label = f.kind === 'repeat' ? 'same call' : `cycle of ${f.cycleLength}`;
    console.log(`LOOP ${label} x${f.count}: ${what}  (lines ${f.lines.join(', ')})`);
  }
}
process.exit(findings.length ? 1 : 0);
