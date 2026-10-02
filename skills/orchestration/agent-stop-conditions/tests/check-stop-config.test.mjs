import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'check-stop-config.mjs');
const EXAMPLE = path.join(HERE, '..', 'scripts', 'stop-config.example.json');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-config-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

function run(cfg, raw) {
  const file = path.join(tmp, `${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(file, raw ?? JSON.stringify(cfg));
  const r = spawnSync(process.execPath, [SCRIPT, file], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

const valid = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
const without = (key) => { const c = structuredClone(valid); delete c[key]; return c; };
const merge = (patch) => ({ ...structuredClone(valid), ...patch });

test('the shipped example config passes with no warnings', () => {
  const r = run(valid);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ok, 0 warning/);
});

test('reads-only retry config without an idempotency key passes', () => {
  const r = run(merge({ retry: { max: 2, idempotentOnly: true, writes: false } }));
  assert.equal(r.code, 0, r.out);
});

test('no retries at all passes', () => {
  assert.equal(run(without('retry')).code, 0);
  assert.equal(run(merge({ retry: { max: 0 } })).code, 0);
});

test('missing wallClockSeconds is a warning, not an error', () => {
  const r = run(without('wallClockSeconds'));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARN\s+wallClockSeconds/);
});

const errorCases = [
  ['maxTurns missing', without('maxTurns'), 'maxTurns'],
  ['maxTurns zero', merge({ maxTurns: 0 }), 'maxTurns'],
  ['maxBudgetUsd missing', without('maxBudgetUsd'), 'maxBudgetUsd'],
  ['maxBudgetUsd negative', merge({ maxBudgetUsd: -1 }), 'maxBudgetUsd'],
  ['budgetCheck after-call', merge({ budgetCheck: 'after-call' }), 'budgetCheck'],
  ['budgetCheck missing', without('budgetCheck'), 'budgetCheck'],
  ['before-call without reserve', without('perCallReserveUsd'), 'perCallReserveUsd'],
  ['retry without idempotentOnly', merge({ retry: { max: 3, idempotentOnly: false, idempotencyKey: true } }), 'retry.idempotentOnly'],
  ['retried writes without idempotency key', merge({ retry: { max: 3, idempotentOnly: true } }), 'retry.idempotencyKey'],
  ['errorWindow missing (cumulative counter)', without('errorWindow'), 'errorWindow'],
  ['errorWindow size below 3', merge({ errorWindow: { size: 2, maxErrors: 1 } }), 'errorWindow.size'],
  ['errorWindow maxErrors above size', merge({ errorWindow: { size: 5, maxErrors: 6 } }), 'errorWindow.maxErrors'],
  ['loopDetection missing', without('loopDetection'), 'loopDetection'],
  ['loopDetection window below maxRepeats', merge({ loopDetection: { window: 2, maxRepeats: 3 } }), 'loopDetection.window'],
  ['onLimit missing', without('onLimit'), 'onLimit'],
  ['onLimit unknown', merge({ onLimit: 'retry' }), 'onLimit'],
];

for (const [name, cfg, field] of errorCases) {
  test(`error: ${name} -> exit 1 naming ${field}`, () => {
    const r = run(cfg);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, new RegExp(`ERROR ${field.replace('.', '\\.')}:[^\\n]*Fix:`));
  });
}

test('unreadable JSON exits 2', () => {
  assert.equal(run(null, '{ "maxTurns": 10, ').code, 2);
});

test('missing file exits 2', () => {
  const r = spawnSync(process.execPath, [SCRIPT, path.join(tmp, 'nope.json')], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('after-call is rejected because it overshoots, not merely as an unknown value', () => {
  assert.match(run(merge({ budgetCheck: 'after-call' })).out, /ERROR budgetCheck: after-call[^\n]*overshoots/);
});

test('a JSON array is not a config and exits 2', () => {
  assert.equal(run(null, '[]').code, 2);
});
