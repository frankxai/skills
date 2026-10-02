import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'detect-loop.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-loop-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function run(lines, ...flags) {
  const file = path.join(tmp, `${Math.random().toString(36).slice(2)}.jsonl`);
  const body = typeof lines === 'string' ? lines : lines.map((l) => JSON.stringify(l)).join('\n');
  fs.writeFileSync(file, body);
  const r = spawnSync(process.execPath, [SCRIPT, file, ...flags], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}
const json = (r) => JSON.parse(r.out);

const read = (p) => ({ tool: 'Read', args: { path: p } });
const grep = (q) => ({ tool: 'Grep', args: { pattern: q } });
const edit = (p) => ({ tool: 'Edit', args: { path: p, old: 'a', new: 'b' } });

test('clean transcript: exit 0', () => {
  const r = run([read('a'), grep('x'), edit('a'), read('b'), grep('y')]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /no loop in 5 call/);
});

test('same call three times in a row: exit 1 with call, count and lines', () => {
  const r = run([grep('x'), read('a'), read('a'), read('a'), edit('a')]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /same call x3: Read \{"path":"a"\}/);
  assert.match(r.out, /lines 2, 3, 4/);
});

test('two in a row is below the default threshold', () => {
  assert.equal(run([read('a'), read('a'), grep('x')]).code, 0);
});

test('--max-repeats 2 lowers the threshold', () => {
  assert.equal(run([read('a'), read('a'), grep('x')], '--max-repeats', '2').code, 1);
});

test('2-cycle repeated three times: exit 1', () => {
  const r = run([read('a'), edit('a'), read('a'), edit('a'), read('a'), edit('a')], '--json');
  assert.equal(r.code, 1);
  const f = json(r).findings[0];
  assert.equal(f.kind, 'cycle');
  assert.equal(f.cycleLength, 2);
  assert.equal(f.count, 3);
  assert.deepEqual(f.lines, [1, 2, 3, 4, 5, 6]);
});

test('3-cycle repeated three times: exit 1', () => {
  const cycle = [read('a'), grep('x'), edit('a')];
  const r = run([grep('start'), ...cycle, ...cycle, ...cycle], '--json');
  assert.equal(r.code, 1);
  const f = json(r).findings[0];
  assert.equal(f.cycleLength, 3);
  assert.equal(f.count, 3);
  assert.equal(f.lines[0], 2);
});

test('args in a different key order are the same call', () => {
  const r = run([
    { tool: 'Edit', args: { path: 'a', old: 'x', new: 'y' } },
    { tool: 'Edit', args: { new: 'y', path: 'a', old: 'x' } },
    { tool: 'Edit', args: { old: 'x', new: 'y', path: 'a' } },
  ]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /same call x3/);
});

test('nested key order is normalized too', () => {
  const r = run([
    { tool: 'Q', args: { f: { b: 1, a: 2 } } },
    { tool: 'Q', args: { f: { a: 2, b: 1 } } },
    { tool: 'Q', args: { f: { b: 1, a: 2 } } },
  ]);
  assert.equal(r.code, 1, r.out);
});

test('near miss: same tool, different args, is not a loop', () => {
  const r = run([read('a'), read('b'), read('c'), read('d')]);
  assert.equal(r.code, 0, r.out);
});

test('near miss: a cycle broken on its third pass is not a loop', () => {
  const r = run([read('a'), edit('a'), read('a'), edit('a'), read('a'), edit('b')]);
  assert.equal(r.code, 0, r.out);
});

test('--window only inspects the last N calls', () => {
  const lines = [read('a'), read('a'), read('a'), grep('1'), grep('2'), grep('3')];
  assert.equal(run(lines).code, 1);
  assert.equal(run(lines, '--window', '3').code, 0);
});

test('empty input: no calls, exit 0', () => {
  const r = run('');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /no loop in 0 call/);
});

test('bad JSON line: exit 2 naming the line', () => {
  const r = run(`${JSON.stringify(read('a'))}\n{"tool": "Read", `);
  assert.equal(r.code, 2);
  assert.match(r.out, /:2: not JSON/);
});

test('line without a tool field: exit 2', () => {
  assert.equal(run('{"args": {}}').code, 2);
});

test('bad option: exit 2', () => {
  assert.equal(run([read('a')], '--max-repeats', '1').code, 2);
});
