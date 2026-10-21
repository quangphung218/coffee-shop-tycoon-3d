// One measurement at a time: perf:frames and measure-startup take this lock
// (a file in os.tmpdir() named after the repo) before they open a browser, so
// two runs never share the GPU and the CPU and spoil each other's numbers.
// A second run waits (PERF_LOCK_WAIT_S, default 1800 s), printing who holds
// the lock, or refuses at once with PERF_LOCK_WAIT_S=0. A lock whose process
// is gone is taken over.
import { createHash } from 'node:crypto';
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/** Lock file of the repo at `root`. */
export function lockPath(root) {
  return join(tmpdir(), `cst3d-perf-${createHash('sha1').update(root).digest('hex').slice(0, 10)}.lock`);
}

/** The holder written in the lock file, or null when unreadable. */
export function readHolder(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** True when a process with `pid` exists. */
export function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/**
 * Takes the lock of `root`; resolves `{ file, release }` once held. Waits up
 * to `waitMs` (default $PERF_LOCK_WAIT_S, 1800 s) for a live holder, polling
 * every `pollMs`; throws when the wait runs out. `label` names this run in
 * the lock file.
 */
export async function acquirePerfLock(root, { label = process.argv.slice(1).join(' '), waitMs, pollMs = 2000, log = console.error } = {}) {
  const file = lockPath(root);
  const wait = waitMs ?? Number(process.env.PERF_LOCK_WAIT_S ?? 1800) * 1000;
  const deadline = Date.now() + wait;
  let told = 0;
  for (;;) {
    try {
      const fd = openSync(file, 'wx');
      writeSync(fd, JSON.stringify({ pid: process.pid, label, at: new Date().toISOString() }));
      closeSync(fd);
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const holder = readHolder(file);
    if (!holder || !alive(holder.pid)) {
      log(`perf lock ${file} left by pid ${holder?.pid ?? '?'} (gone), taking it over`);
      try {
        unlinkSync(file);
      } catch {
        // taken by someone else in between; loop and see
      }
      continue;
    }
    const who = `pid ${holder.pid} (${holder.label}, since ${holder.at})`;
    if (Date.now() >= deadline) throw new Error(`another measurement is running: ${who}. Measurements run one at a time; wait for it, or set PERF_LOCK_WAIT_S to wait longer (0 refuses at once). Lock: ${file}`);
    if (Date.now() - told > 10_000) {
      log(`waiting for the measurement of ${who} to finish (perf lock ${file})…`);
      told = Date.now();
    }
    await sleep(pollMs);
  }
  const release = () => {
    if (readHolder(file)?.pid !== process.pid) return;
    try {
      unlinkSync(file);
    } catch {
      // already gone
    }
  };
  process.once('exit', release);
  return { file, release };
}
