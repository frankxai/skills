#!/usr/bin/env node
// Fail-closed gate over the result document written by `claude plugin eval --json <path>`.
// `claude plugin eval` reports the with-minus-without delta but never exits on it; this does.
// Exit 0: gate passed. Exit 1: the measured result missed the bar. Exit 2: the input cannot be trusted.
import { readFileSync } from 'node:fs';

const USAGE = 'usage: node delta-gate.mjs <results.json> [--min-delta 0] [--min-score 0.8] [--min-positive-share 1.0] [--json]';

class Untrusted extends Error {}
class UsageError extends Untrusted {}

function parseArgs(argv) {
  const opts = { file: null, minDelta: 0, minScore: 0.8, minPositiveShare: 1.0, json: false };
  const numeric = { '--min-delta': 'minDelta', '--min-score': 'minScore', '--min-positive-share': 'minPositiveShare' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg in numeric) {
      const raw = argv[++i];
      const value = Number(raw);
      if (raw === undefined || raw.trim() === '' || !Number.isFinite(value)) throw new UsageError(`${arg} needs a number, got ${raw ?? 'nothing'}`);
      opts[numeric[arg]] = value;
    } else if (arg.startsWith('--')) throw new UsageError(`unknown option ${arg}`);
    else if (opts.file === null) opts.file = arg;
    else throw new UsageError(`unexpected argument ${arg}`);
  }
  if (opts.file === null) throw new UsageError('missing <results.json>');
  if (opts.minPositiveShare < 0 || opts.minPositiveShare > 1) throw new UsageError('--min-positive-share must be between 0 and 1');
  return opts;
}

function load(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Untrusted(`cannot read ${file}: ${err.code ?? err.message}`);
  }
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new Untrusted(`${file} is not valid JSON: ${err.message}`);
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw new Untrusted('result document is not a JSON object');
  if (doc.schemaVersion !== 1) throw new Untrusted(`schemaVersion is ${JSON.stringify(doc.schemaVersion)}; this gate reads schemaVersion 1 only`);
  if (doc.partial === true) throw new Untrusted(`partial run (partialReason: ${doc.partialReason ?? 'unstated'}); a suite that did not finish cannot pass a gate`);
  if (!Array.isArray(doc.cases) || doc.cases.length === 0) throw new Untrusted('no cases in the result document');
  if (doc.aggregates === null || typeof doc.aggregates !== 'object') throw new Untrusted('aggregates object missing');
  if (!Number.isFinite(doc.aggregates.overallScore)) throw new Untrusted('aggregates.overallScore missing or not a number');
  const { casesPassed, casesTotal } = doc.aggregates;
  if (!Number.isInteger(casesPassed) || !Number.isInteger(casesTotal) || casesPassed < 0 || casesTotal < 1 || casesPassed > casesTotal) {
    throw new Untrusted('aggregates.casesPassed and casesTotal must be valid integer counts');
  }
  for (const [index, c] of doc.cases.entries()) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Untrusted(`case #${index} is not an object`);
    if (!Number.isFinite(c.aggregates?.score) || c.aggregates.score < 0 || c.aggregates.score > 1) {
      throw new Untrusted(`case #${index} aggregates.score missing or outside 0..1`);
    }
    for (const arm of ['with', 'without']) {
      const runs = c.arms?.[arm];
      if (!Array.isArray(runs)) continue; // evaluate() reports absent arms as gate failures.
      for (const [i, run] of runs.entries()) {
        if (!run || typeof run !== 'object' || Array.isArray(run)) throw new Untrusted(`case #${index} ${arm}-arm run ${i + 1} is not an object`);
      }
    }
  }
  return doc;
}

const fmt = (n) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : 'n/a');

function evaluate(doc, opts) {
  const failures = [];
  const notes = [];
  let positive = 0;

  doc.cases.forEach((c, index) => {
    const name = typeof c?.name === 'string' && c.name ? c.name : `#${index}`;
    const score = c?.aggregates?.score;
    const delta = c?.aggregates?.delta;
    const fail = (reason) => failures.push({ case: name, delta: Number.isFinite(delta) ? delta : null, score: Number.isFinite(score) ? score : null, reason });

    if (!Number.isFinite(delta)) {
      fail('no comparable delta (single-arm run or arms not comparable)');
    } else if (delta > 0) {
      positive++;
    } else {
      const line = 'delta is not above 0';
      if (opts.minPositiveShare >= 1) fail(line);
      else notes.push(`case "${name}" (delta ${fmt(delta)}, score ${fmt(score)}): ${line}`);
    }

    for (const arm of ['with', 'without']) {
      const runs = c?.arms?.[arm];
      if (!Array.isArray(runs) || runs.length === 0) {
        fail(`no ${arm}-arm runs recorded; cannot confirm the ${arm === 'with' ? 'plugin' : 'baseline'} runs completed`);
        continue;
      }
      runs.forEach((run, i) => {
        if (run?.skippedPaidGraders === true) fail(`${arm}-arm run ${i + 1} skipped its judge graders at the cost ceiling; score not comparable`);
        if (run?.error != null) fail(`${arm}-arm run ${i + 1} ended abnormally: ${run.error}`);
        if (run?.aborted) fail(`${arm}-arm run ${i + 1} aborted by mock ${run.aborted.server ?? '?'}/${run.aborted.tool ?? '?'}: ${run.aborted.reason ?? 'no reason given'}`);
      });
    }
  });

  const total = doc.cases.length;
  const share = positive / total;
  const agg = doc.aggregates;
  const suite = [];
  if (opts.minPositiveShare < 1 && share < opts.minPositiveShare) {
    suite.push(`only ${positive} of ${total} cases have delta above 0 (${fmt(share)}); --min-positive-share is ${opts.minPositiveShare}`);
  }
  if (!Number.isFinite(agg.meanDelta)) suite.push('aggregates.meanDelta missing; run the suite with --ablation with-without');
  else if (!(agg.meanDelta > opts.minDelta)) suite.push(`aggregates.meanDelta ${fmt(agg.meanDelta)} is not above --min-delta ${opts.minDelta}`);
  if (!(agg.overallScore >= opts.minScore)) suite.push(`aggregates.overallScore ${fmt(agg.overallScore)} is below --min-score ${opts.minScore}`);
  if (Number.isFinite(agg.casesPassed) && Number.isFinite(agg.casesTotal) && agg.casesPassed < agg.casesTotal) {
    suite.push(`${agg.casesPassed} of ${agg.casesTotal} cases met the eval's --threshold`);
  }

  return {
    pass: failures.length === 0 && suite.length === 0,
    failures,
    suite,
    notes,
    summary: { cases: total, positiveDeltaCases: positive, meanDelta: agg.meanDelta ?? null, overallScore: agg.overallScore, costUsd: doc.costUsd ?? null, claudeVersion: doc.claudeVersion ?? null },
  };
}

function main() {
  const argv = process.argv.slice(2);
  const wantJson = argv.includes('--json');
  let opts;
  let result;
  try {
    opts = parseArgs(argv);
    result = evaluate(load(opts.file), opts);
  } catch (err) {
    if (!(err instanceof Untrusted)) throw err;
    if (wantJson) console.log(JSON.stringify({ pass: false, exitCode: 2, error: err.message }, null, 2));
    else console.error(err instanceof UsageError ? `${err.message}\n${USAGE}` : `UNTRUSTED ${err.message}`);
    process.exit(2);
  }

  const exitCode = result.pass ? 0 : 1;
  if (opts.json) {
    console.log(JSON.stringify({ exitCode, ...result }, null, 2));
  } else {
    for (const f of result.failures) console.log(`FAIL case "${f.case}" (delta ${fmt(f.delta)}, score ${fmt(f.score)}): ${f.reason}`);
    for (const s of result.suite) console.log(`FAIL suite: ${s}`);
    for (const n of result.notes) console.log(`note ${n}`);
    const s = result.summary;
    console.log(`${result.pass ? 'PASS' : 'GATE FAILED'}: ${s.positiveDeltaCases}/${s.cases} cases above baseline, meanDelta ${fmt(s.meanDelta)}, overallScore ${fmt(s.overallScore)}`);
  }
  process.exit(exitCode);
}

main();
