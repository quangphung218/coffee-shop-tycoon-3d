// scripts/lib/perf-lock.mjs: one perf measurement at a time per repo.
import { describe, expect, it } from 'vitest';
import { acquirePerfLock, alive, lockPath, readHolder } from '../../scripts/lib/perf-lock.mjs';

// The project has no Node types, so node:fs comes through a dynamically named import.
const FS_MODULE = 'node:fs';
const { existsSync, writeFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  existsSync(path: string): boolean;
  writeFileSync(path: string, text: string): void;
};
const proc = (globalThis as unknown as { process: { pid: number } }).process;

/** A root of its own per test, so a real measurement running on the repo is never touched. */
const root = (name: string) => `perf-lock-test-${name}-${Date.now()}-${Math.random()}`;

describe('lockPath', () => {
  it('is one file per repo in the temp dir', () => {
    const a = lockPath('/repo/a');
    expect(a).toMatch(/cst3d-perf-[0-9a-f]{10}\.lock$/);
    expect(lockPath('/repo/a')).toBe(a);
    expect(lockPath('/repo/b')).not.toBe(a);
  });
});

describe('acquirePerfLock', () => {
  it('writes the holder, refuses a second run at once with waitMs 0 and frees the file on release', async () => {
    const r = root('refuse');
    const lock = await acquirePerfLock(r, { label: 'first', waitMs: 0 });
    expect(lock.file).toBe(lockPath(r));
    expect(readHolder(lock.file)).toMatchObject({ pid: proc.pid, label: 'first' });
    await expect(acquirePerfLock(r, { label: 'second', waitMs: 0 })).rejects.toThrow(/another measurement is running: pid \d+ \(first/);
    lock.release();
    expect(existsSync(lock.file)).toBe(false);
  });

  it('waits for the holder to finish', async () => {
    const r = root('wait');
    const lines: string[] = [];
    const first = await acquirePerfLock(r, { label: 'first', waitMs: 0 });
    setTimeout(() => first.release(), 300);
    const t0 = Date.now();
    const second = await acquirePerfLock(r, { label: 'second', waitMs: 5000, pollMs: 50, log: (l) => lines.push(l) });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
    expect(lines.some((l) => /waiting for the measurement of pid \d+ \(first/.test(l))).toBe(true);
    expect(readHolder(second.file)?.label).toBe('second');
    second.release();
  });

  it('takes over a lock whose process is gone', async () => {
    const r = root('stale');
    const file = lockPath(r);
    // PIDs this high are not handed out on macOS or Linux.
    const gone = 2 ** 22 + 12345;
    expect(alive(gone)).toBe(false);
    writeFileSync(file, JSON.stringify({ pid: gone, label: 'old run', at: '2026-01-01T00:00:00.000Z' }));
    const lines: string[] = [];
    const lock = await acquirePerfLock(r, { label: 'new', waitMs: 0, log: (l) => lines.push(l) });
    expect(readHolder(file)?.label).toBe('new');
    expect(lines[0]).toMatch(/left by pid \d+ \(gone\), taking it over/);
    lock.release();
  });

  it('knows its own process is alive', () => {
    expect(alive(proc.pid)).toBe(true);
  });
});
