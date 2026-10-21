export interface LockHolder {
  pid: number;
  label: string;
  at: string;
}

export interface PerfLock {
  file: string;
  release(): void;
}

/** Where the lock file lives: $PERF_LOCK_DIR, else the OS temp dir. */
export function lockDir(): string;
/** The machine's lock file (one for every worktree of the game) in `dir`, lockDir() by default; `root` is the checkout, for the record. */
export function lockPath(root: string, dir?: string): string;
export function readHolder(file: string): LockHolder | null;
export function alive(pid: number): boolean;
export function acquirePerfLock(
  root: string,
  options?: { label?: string; waitMs?: number; pollMs?: number; log?: (line: string) => void; dir?: string },
): Promise<PerfLock>;
