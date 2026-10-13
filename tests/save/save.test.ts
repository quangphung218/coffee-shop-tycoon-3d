import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, autosave, deleteSave, listSlots, loadGame, migrate, saveGame, saveKey } from '../../src/save/save';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { createNewGame } from '../../src/sim/state';

function sampleState() {
  const s = createNewGame('Quán Test', 'normal', 2024);
  s.money = 1234000;
  s.day = 4;
  return s;
}

describe('saveGame / loadGame', () => {
  it('round-trips a game state', () => {
    const storage = createMemoryStorage();
    const s = sampleState();
    expect(saveGame(s, '1', storage, 1000).ok).toBe(true);
    const r = loadGame('1', storage);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(s);
    expect(JSON.parse(storage.getItem('cst3d:save:1')!).version).toBe(SAVE_VERSION);
  });

  it('drops transient events from the save', () => {
    const storage = createMemoryStorage();
    const s = sampleState();
    s.events.push({ type: 'notify', level: 'info', text: 'hi' });
    saveGame(s, '2', storage);
    const r = loadGame('2', storage);
    expect(r.ok && r.value.events).toEqual([]);
    expect(s.events).toHaveLength(1);
  });

  it('autosaves to the auto slot', () => {
    const storage = createMemoryStorage();
    autosave(sampleState(), storage);
    expect(storage.getItem(saveKey('auto'))).not.toBeNull();
  });

  it('reports an empty slot as not_found', () => {
    const r = loadGame('3', createMemoryStorage());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not_found');
  });

  it('returns a typed error for broken JSON without overwriting it', () => {
    const storage = createMemoryStorage();
    storage.setItem('cst3d:save:1', '{not json');
    const r = loadGame('1', storage);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('corrupt');
    expect(storage.getItem('cst3d:save:1')).toBe('{not json');
  });

  it('rejects valid JSON that is not a game', () => {
    const storage = createMemoryStorage();
    storage.setItem('cst3d:save:1', JSON.stringify({ version: 1, state: { hello: 1 } }));
    const r = loadGame('1', storage);
    expect(!r.ok && r.error.kind).toBe('invalid');
  });

  it('rejects saves from a newer version', () => {
    const r = migrate({ version: SAVE_VERSION + 1, savedAt: 0, state: sampleState() });
    expect(!r.ok && r.error.kind).toBe('version_unsupported');
  });

  it('does not throw when storage fails', () => {
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
    expect(saveGame(sampleState(), '1', broken).ok).toBe(false);
    const r = loadGame('1', broken);
    expect(!r.ok && r.error.kind).toBe('storage');
    expect(deleteSave('1', broken).ok).toBe(false);
  });
});

describe('migrate', () => {
  it('upgrades a version-0 bare state', () => {
    const current = sampleState();
    const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(current));
    for (const k of ['events', 'campaigns', 'orders', 'history', 'reviews', 'candidates', 'spawnAccumulator', 'today']) {
      delete legacy[k];
    }
    const storage = createMemoryStorage();
    storage.setItem('cst3d:save:2', JSON.stringify(legacy));
    const r = loadGame('2', storage);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.shopName).toBe('Quán Test');
    expect(r.value.money).toBe(1234000);
    expect(r.value.events).toEqual([]);
    expect(r.value.history).toEqual([]);
    expect(r.value.today.day).toBe(4);
  });

  it('upgrades an explicit version-0 wrapper', () => {
    const legacy = JSON.parse(JSON.stringify(sampleState()));
    delete legacy.events;
    const r = migrate({ version: 0, savedAt: 5, state: legacy });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.version).toBe(SAVE_VERSION);
      expect(r.value.savedAt).toBe(5);
      expect(r.value.state.events).toEqual([]);
    }
  });
});

describe('listSlots', () => {
  it('lists auto plus three manual slots with summaries', () => {
    const storage = createMemoryStorage();
    saveGame(sampleState(), '1', storage, 42);
    storage.setItem('cst3d:save:3', 'garbage');
    const slots = listSlots(storage);
    expect(slots.map((s) => s.slot)).toEqual(['auto', '1', '2', '3']);
    expect(slots[0]).toEqual({ slot: 'auto', empty: true });
    expect(slots[1]).toMatchObject({ empty: false, shopName: 'Quán Test', day: 4, money: 1234000, savedAt: 42 });
    expect(slots[3]).toEqual({ slot: '3', empty: false, error: 'corrupt' });
  });

  it('deletes a slot', () => {
    const storage = createMemoryStorage();
    saveGame(sampleState(), '2', storage);
    deleteSave('2', storage);
    expect(listSlots(storage)[2]).toEqual({ slot: '2', empty: true });
  });
});

describe('settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(createMemoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips under its own key', () => {
    const storage = createMemoryStorage();
    const s = { musicVolume: 0.2, sfxVolume: 1, quality: 'high', gameSpeed: 4, cameraKeys: 'qa-arrows' } as const;
    expect(saveSettings(s, storage)).toBe(true);
    expect(storage.getItem(SETTINGS_KEY)).not.toBeNull();
    expect(loadSettings(storage)).toEqual(s);
  });

  it('repairs broken or out-of-range values', () => {
    const storage = createMemoryStorage();
    storage.setItem(SETTINGS_KEY, '{oops');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.setItem(SETTINGS_KEY, JSON.stringify({ musicVolume: 3, quality: 'ultra', gameSpeed: 3 }));
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, musicVolume: 1 });
  });
});
