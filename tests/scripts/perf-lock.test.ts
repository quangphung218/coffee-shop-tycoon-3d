// scripts/lib/perf-lock.mjs: one perf measurement at a time per machine.
// Every test locks in a temp dir of its own (the `dir` option), so a real
// measurement holding the machine's lock never fails or is disturbed by the tests.
import { afterAll, describe, expect, it } from 'vitest';
import { acquirePerfLock, alive, lockDir, lockPath, readHolder } from '../../scripts/lib/perf-lock.mjs';

// The project has no Node types, so node modules come through dynamically named imports.
const FS_MODULE = 'node:fs';
const OS_MODULE = 'node:os';
const PATH_MODULE = 'node:path';
const { existsSync, mkdtempSync, rmSync, writeFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  existsSync(path: string): boolean;
  mkdtempSync(prefix: string): string;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
  writeFileSync(path: string, text: string): void;
};
const { tmpdir } = (await import(/* @vite-ignore */ OS_MODULE)) as { tmpdir(): string };
const { join } = (await import(/* @vite-ignore */ PATH_MODULE)) as { join(...parts: string[]): string };
const proc = (globalThis as unknown as { process: { pid: number; env: Record<string, string | undefined> } }).process;

/** A lock dir of its own per test, removed at the end. */
const dirs: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'cst3d-perf-lock-test-'));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const root = '/repo/worktree';

describe('lockPath', () => {
  it('is one file per machine in the temp dir: two worktrees of the repo share it', () => {
    const a = lockPath('/repo/a');
    expect(a).toBe(join(lockDir(), 'cst3d-perf.lock'));
    expect(lockPath('/other/worktree/of/the/repo')).toBe(a);
  });

  it('goes to PERF_LOCK_DIR when set, else the OS temp dir; a dir argument wins', () => {
    const d = tempDir();
    const had = proc.env.PERF_LOCK_DIR;
    try {
      delete proc.env.PERF_LOCK_DIR;
      expect(lockDir()).toBe(tmpdir());
      proc.env.PERF_LOCK_DIR = d;
      expect(lockDir()).toBe(d);
      expect(lockPath('/repo/a')).toBe(join(d, 'cst3d-perf.lock'));
      expect(lockPath('/repo/a', tmpdir())).toBe(join(tmpdir(), 'cst3d-perf.lock'));
    } finally {
      if (had === undefined) delete proc.env.PERF_LOCK_DIR;
      else proc.env.PERF_LOCK_DIR = had;
    }
  });
});

describe('acquirePerfLock', () => {
  it('writes the holder, refuses a second run at once with waitMs 0 and frees the file on release', async () => {
    const dir = tempDir();
    const lock = await acquirePerfLock(root, { label: 'first', waitMs: 0, dir });
    expect(lock.file).toBe(lockPath(root, dir));
    expect(readHolder(lock.file)).toMatchObject({ pid: proc.pid, label: 'first' });
    await expect(acquirePerfLock(root, { label: 'second', waitMs: 0, dir })).rejects.toThrow(/another measurement is running: pid \d+ \(first/);
    lock.release();
    expect(existsSync(lock.file)).toBe(false);
  });

  it('waits for the holder to finish', async () => {
    const dir = tempDir();
    const lines: string[] = [];
    const first = await acquirePerfLock(root, { label: 'first', waitMs: 0, dir });
    setTimeout(() => first.release(), 300);
    const t0 = Date.now();
    const second = await acquirePerfLock(root, { label: 'second', waitMs: 5000, pollMs: 50, log: (l) => lines.push(l), dir });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
    expect(lines.some((l) => /waiting for the measurement of pid \d+ \(first/.test(l))).toBe(true);
    expect(readHolder(second.file)?.label).toBe('second');
    second.release();
  });

  it('takes over a lock whose process is gone', async () => {
    const dir = tempDir();
    const file = lockPath(root, dir);
    // PIDs this high are not handed out on macOS or Linux.
    const gone = 2 ** 22 + 12345;
    expect(alive(gone)).toBe(false);
    writeFileSync(file, JSON.stringify({ pid: gone, label: 'old run', at: '2026-01-01T00:00:00.000Z' }));
    const lines: string[] = [];
    const lock = await acquirePerfLock(root, { label: 'new', waitMs: 0, log: (l) => lines.push(l), dir });
    expect(readHolder(file)?.label).toBe('new');
    expect(lines[0]).toMatch(/left by pid \d+ \(gone\), taking it over/);
    lock.release();
  });

  it('knows its own process is alive', () => {
    expect(alive(proc.pid)).toBe(true);
  });
});
