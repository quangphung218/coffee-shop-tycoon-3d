// One measurement at a time on this machine: perf:frames, measure-startup
// and the layout check take this lock (one file in os.tmpdir(), the same for
// every checkout and worktree of the game, since they all share the GPU)
// before they open a browser, so two runs never share the GPU and the CPU
// and spoil each other's numbers.
// A second run waits (PERF_LOCK_WAIT_S, default 1800 s), printing who holds
// the lock, or refuses at once with PERF_LOCK_WAIT_S=0. A lock whose process
// is gone is taken over. PERF_LOCK_DIR (or the `dir` option) moves the lock
// file elsewhere: the tests use a temp dir of their own, never the machine's lock.
import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/** Where the lock file lives: $PERF_LOCK_DIR, else the OS temp dir. */
export const lockDir = () => process.env.PERF_LOCK_DIR || tmpdir();

/** The machine's lock file in `dir` (lockDir() by default); `root` (the checkout) only names the run in the log, every worktree shares the lock. */
export function lockPath(root, dir = lockDir()) {
  void root;
  return join(dir, 'cst3d-perf.lock');
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
 * Takes the machine's perf lock for the run at `root`; resolves `{ file, release }` once held. Waits up
 * to `waitMs` (default $PERF_LOCK_WAIT_S, 1800 s) for a live holder, polling
 * every `pollMs`; throws when the wait runs out. `label` names this run in
 * the lock file; `dir` puts the file elsewhere than lockDir().
 */
export async function acquirePerfLock(root, { label = process.argv.slice(1).join(' '), waitMs, pollMs = 2000, log = console.error, dir } = {}) {
  const file = lockPath(root, dir);
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
