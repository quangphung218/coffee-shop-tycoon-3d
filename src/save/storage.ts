/** Subset of the Web Storage API used by saves and settings; injectable for tests. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, String(value));
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

let fallback: StorageLike | null = null;

/** Browser localStorage, or an in-memory store when it is unavailable (private mode, tests). */
export function defaultStorage(): StorageLike {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (ls) return ls;
  } catch {
    // Accessing localStorage can throw when storage is disabled.
  }
  fallback ??= createMemoryStorage();
  return fallback;
}
