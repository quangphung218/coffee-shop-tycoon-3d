import { describe, expect, it } from 'vitest';
import {
  PLAYLOG_FIELDS,
  PLAYLOG_KEY,
  PLAYLOG_MAX_ENTRIES,
  appendPlayLog,
  clearPlayLog,
  exportPlayLog,
  readPlayLog,
  type PlayLogEntry,
} from '../../src/save/playlog';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';

function entry(over: Partial<PlayLogEntry> = {}): PlayLogEntry {
  return { v: 1, run: 'run-a', kind: 'phase', day: 3, phase: 'peak', minute: 690, at: 1_700_000_000_000, ...over };
}

describe('play log', () => {
  it('keeps only whitelisted fields', () => {
    const storage = createMemoryStorage();
    const ok = appendPlayLog({ ...entry(), shopName: 'Quán Test', ua: 'Mozilla/5.0' }, storage);
    expect(ok).toBe(true);
    const [stored] = readPlayLog(storage);
    expect(Object.keys(stored!).sort()).toEqual([...PLAYLOG_FIELDS].sort());
    const raw = storage.getItem(PLAYLOG_KEY)!;
    expect(raw).not.toContain('Quán Test');
    expect(raw).not.toContain('Mozilla');
  });

  it('coerces types and drops invalid lines', () => {
    const storage = createMemoryStorage();
    expect(appendPlayLog({ ...entry(), day: '2', minute: '480' } as unknown as PlayLogEntry, storage)).toBe(true);
    expect(appendPlayLog(entry({ kind: 'bogus' as PlayLogEntry['kind'] }), storage)).toBe(false);
    expect(appendPlayLog(entry({ phase: 'lunch' as PlayLogEntry['phase'] }), storage)).toBe(false);
    expect(appendPlayLog(entry({ run: '' }), storage)).toBe(false);
    expect(appendPlayLog(entry({ day: Number.NaN }), storage)).toBe(false);
    const log = readPlayLog(storage);
    expect(log).toHaveLength(1);
    expect(log[0]!.day).toBe(2);
    expect(log[0]!.minute).toBe(480);
  });

  it('fills a missing at from now', () => {
    const storage = createMemoryStorage();
    const noAt: Partial<PlayLogEntry> = entry();
    delete noAt.at;
    appendPlayLog(noAt, storage, 42);
    expect(readPlayLog(storage)[0]!.at).toBe(42);
  });

  it('keeps only the newest 1000 lines', () => {
    const storage = createMemoryStorage();
    for (let i = 0; i < PLAYLOG_MAX_ENTRIES + 5; i++) appendPlayLog(entry({ minute: i }), storage);
    const log = readPlayLog(storage);
    expect(PLAYLOG_MAX_ENTRIES).toBe(1000);
    expect(log).toHaveLength(1000);
    expect(log[0]!.minute).toBe(5);
    expect(log[999]!.minute).toBe(1004);
  });

  it('reads broken JSON as empty and can append over it', () => {
    const storage = createMemoryStorage();
    storage.setItem(PLAYLOG_KEY, '{not json');
    expect(readPlayLog(storage)).toEqual([]);
    storage.setItem(PLAYLOG_KEY, JSON.stringify({ v: 1, entries: 'nope' }));
    expect(readPlayLog(storage)).toEqual([]);
    expect(appendPlayLog(entry(), storage)).toBe(true);
    expect(readPlayLog(storage)).toHaveLength(1);
  });

  it('exports entries and the last stop of each run', () => {
    const storage = createMemoryStorage();
    appendPlayLog(entry({ run: 'a', kind: 'run_start', day: 1, phase: 'preparation', minute: 420, at: 1000 }), storage);
    appendPlayLog(entry({ run: 'b', kind: 'run_start', day: 1, phase: 'preparation', minute: 420, at: 1500 }), storage);
    appendPlayLog(entry({ run: 'a', kind: 'hidden', day: 4, phase: 'peak', minute: 700, at: 2000 }), storage);
    const out = JSON.parse(exportPlayLog(storage, 9999));
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe(9999);
    expect(out.entries).toHaveLength(3);
    for (const e of out.entries) {
      expect(e).toHaveProperty('day');
      expect(e).toHaveProperty('phase');
      expect(e).toHaveProperty('minute');
      expect(e).toHaveProperty('at');
    }
    expect(out.lastStops).toEqual([
      { run: 'a', kind: 'hidden', day: 4, phase: 'peak', minute: 700, at: 2000 },
      { run: 'b', kind: 'run_start', day: 1, phase: 'preparation', minute: 420, at: 1500 },
    ]);
  });

  it('clears the log', () => {
    const storage = createMemoryStorage();
    appendPlayLog(entry(), storage);
    expect(clearPlayLog(storage)).toBe(true);
    expect(readPlayLog(storage)).toEqual([]);
  });

  it('never throws when storage fails', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(appendPlayLog(entry(), broken)).toBe(false);
    expect(readPlayLog(broken)).toEqual([]);
    expect(clearPlayLog(broken)).toBe(false);
    expect(JSON.parse(exportPlayLog(broken, 1)).entries).toEqual([]);
  });
});
