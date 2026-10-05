// Red/green tests for delta-gate.mjs. Run: node --test delta-gate.test.mjs
// Fixtures are hand-built from the documented schemaVersion 1 fields
// (code.claude.com/docs/en/plugin-evals, "JSON result"), not captured from a real run.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = fileURLToPath(new URL('./delta-gate.mjs', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'delta-gate-'));
let n = 0;
after(() => rmSync(dir, { recursive: true, force: true }));

const run = () => ({ error: null, skippedPaidGraders: false });

function kase(name, score, delta, patch = {}) {
  const c = { name, aggregates: { score }, arms: { with: [run(), run(), run()], without: [run(), run(), run()] } };
  if (delta !== undefined) c.aggregates.delta = delta;
  return { ...c, ...patch };
}

function doc(patch = {}) {
  return {
    schemaVersion: 1,
    partial: false,
    aggregates: { overallScore: 0.9, casesPassed: 2, casesTotal: 2, meanDelta: 0.35 },
    cases: [kase('drafts-commit-message', 1.0, 0.5), kase('summarises-diff', 0.8, 0.2)],
    costUsd: 1.42,
    durationSeconds: 300,
    claudeVersion: '2.1.290',
    ...patch,
  };
}

function write(content) {
  const file = join(dir, `r${n++}.json`);
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  return file;
}

function gate(fileOrDoc, ...args) {
  const file = typeof fileOrDoc === 'string' ? fileOrDoc : write(fileOrDoc);
  const r = spawnSync(process.execPath, [GATE, file, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('passes a complete two-arm run where every case beats the baseline', () => {
  const r = gate(doc());
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^PASS: 2\/2 cases above baseline/m);
});

test('ignores unknown fields at every level', () => {
  const d = doc({ suiteConfig: { threshold: 0.8 }, futureField: [1, 2] });
  d.aggregates.perfectRuns = 0.5;
  d.cases[0].graders = [{ name: 'x', scored: false }];
  d.cases[0].arms.with[0].transcriptPath = 'runs/0.jsonl';
  const r = gate(d);
  assert.equal(r.code, 0, r.out);
});

test('fails a case whose delta is exactly 0, naming it', () => {
  const d = doc();
  d.cases[1] = kase('summarises-diff', 0.8, 0);
  const r = gate(d);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL case "summarises-diff" \(delta 0, score 0\.8\): delta is not above 0/);
});

test('fails a case whose delta is negative, naming it with delta and score', () => {
  const d = doc({ aggregates: { overallScore: 0.85, casesPassed: 2, casesTotal: 2, meanDelta: 0.1 } });
  d.cases[1] = kase('summarises-diff', 0.7, -0.3);
  const r = gate(d);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL case "summarises-diff" \(delta -0\.3, score 0\.7\): delta is not above 0/);
});

test('a missing delta is a failure, never a pass', () => {
  const d = doc();
  d.cases[0] = kase('resumes-transcript', 1.0, undefined);
  const r = gate(d);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL case "resumes-transcript" \(delta n\/a, score 1\): no comparable delta/);
});

test('a single-arm run with no meanDelta fails the suite check', () => {
  const d = doc();
  delete d.aggregates.meanDelta;
  const r = gate(d);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL suite: aggregates\.meanDelta missing; run the suite with --ablation with-without/);
});

test('fails a run whose judge graders were skipped at the cost ceiling', () => {
  const d = doc();
  d.cases[0].arms.with[2].skippedPaidGraders = true;
  const r = gate(d);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL case "drafts-commit-message" \(delta 0\.5, score 1\): with-arm run 3 skipped its judge graders/);
});

test('fails when a baseline run errored, since it can inflate the delta', () => {
  const d = doc();
  d.cases[1].arms.without[0].error = 'rate limit reached';
  const r = gate(d);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL case "summarises-diff" \(delta 0\.2, score 0\.8\): without-arm run 1 ended abnormally: rate limit reached/);
});

test('fails a run aborted by a mock expectation', () => {
  const d = doc();
  d.cases[0].arms.with[0].aborted = { server: 'tracker', tool: 'create_issue', reason: 'title is not a string' };
  const r = gate(d);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL case "drafts-commit-message" \(delta 0\.5, score 1\): with-arm run 1 aborted by mock tracker\/create_issue/);
});

test('fails a case with no baseline runs recorded', () => {
  const d = doc();
  d.cases[1].arms.without = [];
  const r = gate(d);
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL case "summarises-diff" \(delta 0\.2, score 0\.8\): no without-arm runs recorded/);
});

test('fails when meanDelta is not above --min-delta', () => {
  const r = gate(doc(), '--min-delta', '0.4');
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL suite: aggregates\.meanDelta 0\.35 is not above --min-delta 0\.4/);
});

test('fails when overallScore is below --min-score', () => {
  const r = gate(doc(), '--min-score', '0.95');
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL suite: aggregates\.overallScore 0\.9 is below --min-score 0\.95/);
});

test('fails when a case missed the eval threshold even if deltas look fine', () => {
  const r = gate(doc({ aggregates: { overallScore: 0.9, casesPassed: 1, casesTotal: 2, meanDelta: 0.35 } }));
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL suite: 1 of 2 cases met the eval's --threshold/);
});

test('--min-positive-share below 1 tolerates a flat case but still names it', () => {
  const d = doc();
  d.cases[1] = kase('summarises-diff', 0.8, 0);
  const r = gate(d, '--min-positive-share', '0.5');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /note case "summarises-diff" \(delta 0, score 0\.8\): delta is not above 0/);
});

test('--min-positive-share fails when too few cases beat the baseline', () => {
  const d = doc();
  d.cases.push(kase('third', 0.9, 0), kase('fourth', 0.9, -0.1));
  const r = gate(d, '--min-positive-share', '0.75');
  assert.equal(r.code, 1);
  assert.match(r.out, /FAIL suite: only 2 of 4 cases have delta above 0/);
  assert.match(r.out, /note case "fourth" \(delta -0\.1, score 0\.9\)/);
});

test('--json reports failures as data with the same exit code', () => {
  const d = doc();
  d.cases[1] = kase('summarises-diff', 0.7, -0.3);
  const r = gate(d, '--json');
  assert.equal(r.code, 1);
  const out = JSON.parse(r.out);
  assert.equal(out.pass, false);
  assert.deepEqual(out.failures[0], { case: 'summarises-diff', delta: -0.3, score: 0.7, reason: 'delta is not above 0' });
});

test('exit 2 on a partial run, with its reason', () => {
  const r = gate(doc({ partial: true, partialReason: 'cost_ceiling' }));
  assert.equal(r.code, 2);
  assert.match(r.out, /UNTRUSTED partial run \(partialReason: cost_ceiling\)/);
});

test('exit 2 on a wrong schemaVersion', () => {
  const r = gate(doc({ schemaVersion: 2 }));
  assert.equal(r.code, 2);
  assert.match(r.out, /UNTRUSTED schemaVersion is 2/);
});

test('exit 2 on malformed JSON', () => {
  const r = gate(write('{"schemaVersion": 1, "cases": ['));
  assert.equal(r.code, 2);
  assert.match(r.out, /UNTRUSTED .* is not valid JSON/);
});

test('exit 2 on a missing file', () => {
  const r = gate(join(dir, 'does-not-exist.json'));
  assert.equal(r.code, 2);
  assert.match(r.out, /UNTRUSTED cannot read .*does-not-exist\.json: ENOENT/);
});

test('exit 2 when the document has no cases', () => {
  const r = gate(doc({ cases: [] }));
  assert.equal(r.code, 2);
  assert.match(r.out, /UNTRUSTED no cases in the result document/);
});

test('exit 2 on a bad option, with usage', () => {
  const r = gate(doc(), '--min-delta', 'abc');
  assert.equal(r.code, 2);
  assert.match(r.out, /--min-delta needs a number, got abc\nusage:/);
});

test('exit 2 with --json still emits a parseable verdict', () => {
  const r = gate(doc({ partial: true, partialReason: 'auth_failed' }), '--json');
  assert.equal(r.code, 2);
  assert.equal(JSON.parse(r.out).exitCode, 2);
});

test('a null arm run is untrusted input', () => {
  const d = doc();
  d.cases[0].arms.with[0] = null;
  assert.equal(gate(d).code, 2);
});

test('a missing case score is untrusted input', () => {
  const d = doc();
  delete d.cases[0].aggregates.score;
  assert.equal(gate(d).code, 2);
});

test('missing case totals cannot bypass the threshold gate', () => {
  const d = doc();
  delete d.aggregates.casesPassed;
  assert.equal(gate(d).code, 2);
});
