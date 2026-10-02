#!/usr/bin/env node
// Lints a JSON description of an autonomous run's stop conditions.
// Usage: node check-stop-config.mjs <config.json>
// Exit 0 = no errors (warnings allowed), 1 = at least one error, 2 = unreadable input.
import fs from 'node:fs';

const isPos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isInt = (v, min) => Number.isInteger(v) && v >= min;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkStopConfig(cfg) {
  const errors = [];
  const warnings = [];
  const err = (field, msg) => errors.push({ field, msg });

  for (const f of ['maxTurns', 'maxBudgetUsd']) {
    if (!isPos(cfg[f])) err(f, `missing or not a positive number. Fix: set ${f} so the runtime ends the run, not the agent.`);
  }

  if (cfg.budgetCheck === 'after-call') {
    err('budgetCheck', 'after-call lets the call that crosses the cap run, so the run overshoots. Fix: "before-call" with perCallReserveUsd.');
  } else if (cfg.budgetCheck !== 'before-call') {
    err('budgetCheck', 'missing or unknown value. Fix: "before-call".');
  } else if (!isPos(cfg.perCallReserveUsd)) {
    err('perCallReserveUsd', 'before-call needs the maximum expected cost of one call to reserve. Fix: set perCallReserveUsd > 0.');
  }

  const r = cfg.retry;
  if (r !== undefined && !isObj(r)) {
    err('retry', 'must be an object. Fix: { "max": 2, "idempotentOnly": true, "idempotencyKey": true }.');
  } else if (r !== undefined) {
    if (!isInt(r.max, 0)) {
      err('retry.max', 'not a non-negative integer. Fix: set retry.max (0 disables retries).');
    } else if (r.max > 0) {
      if (r.idempotentOnly !== true) err('retry.idempotentOnly', 'retries are enabled for every operation. Fix: set idempotentOnly: true and retry only operations safe to repeat.');
      if (r.writes !== false && r.idempotencyKey !== true) err('retry.idempotencyKey', 'retried writes have no idempotency key, so a retry after a timeout can apply the write twice. Fix: set idempotencyKey: true, or writes: false if no write is ever retried.');
    }
  }

  const ew = cfg.errorWindow;
  if (ew === undefined) {
    err('errorWindow', 'missing, so errors are either uncounted or counted cumulatively forever. Fix: { "size": 10, "maxErrors": 3 } over the most recent calls.');
  } else if (!isObj(ew)) {
    err('errorWindow', 'must be an object. Fix: { "size": 10, "maxErrors": 3 }.');
  } else if (!isInt(ew.size, 3)) {
    err('errorWindow.size', 'must be an integer of at least 3; a smaller window stops on one transient failure. Fix: size >= 3.');
  } else if (!isInt(ew.maxErrors, 1) || ew.maxErrors > ew.size) {
    err('errorWindow.maxErrors', `must be an integer from 1 to size (${ew.size}). Fix: set maxErrors within the window.`);
  }

  const ld = cfg.loopDetection;
  if (ld === undefined) {
    err('loopDetection', 'missing; a run that repeats the same call stays under every budget until it exhausts it. Fix: { "window": 20, "maxRepeats": 3 }.');
  } else if (!isObj(ld)) {
    err('loopDetection', 'must be an object. Fix: { "window": 20, "maxRepeats": 3 }.');
  } else {
    if (!isInt(ld.maxRepeats, 2)) err('loopDetection.maxRepeats', 'must be an integer of at least 2. Fix: maxRepeats: 3.');
    if (!isInt(ld.window, 2)) err('loopDetection.window', 'must be an integer of at least 2. Fix: window: 20.');
    else if (isInt(ld.maxRepeats, 2) && ld.window < ld.maxRepeats) err('loopDetection.window', `is smaller than maxRepeats (${ld.maxRepeats}), so no loop can ever be seen. Fix: window >= 4 * maxRepeats to catch cycles up to length 4.`);
  }

  if (cfg.onLimit !== 'stop' && cfg.onLimit !== 'escalate') {
    err('onLimit', 'missing or unknown value, so nobody acts when a limit fires. Fix: "stop" or "escalate".');
  }

  if (cfg.wallClockSeconds === undefined) {
    warnings.push({ field: 'wallClockSeconds', msg: 'not set. Turn and budget caps do not bound a run that hangs; enforce a wall-clock limit in the launching process.' });
  } else if (!isPos(cfg.wallClockSeconds)) {
    err('wallClockSeconds', 'not a positive number. Fix: seconds, or remove the field.');
  }

  return { errors, warnings };
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node check-stop-config.mjs <config.json>');
  process.exit(2);
}
let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`cannot read ${file}: ${e.message}`);
  process.exit(2);
}
if (!isObj(cfg)) {
  console.error(`cannot read ${file}: top level must be a JSON object`);
  process.exit(2);
}
const { errors, warnings } = checkStopConfig(cfg);
for (const e of errors) console.log(`ERROR ${e.field}: ${e.msg}`);
for (const w of warnings) console.log(`WARN  ${w.field}: ${w.msg}`);
console.log(errors.length ? `${errors.length} error(s), ${warnings.length} warning(s)` : `ok, ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
