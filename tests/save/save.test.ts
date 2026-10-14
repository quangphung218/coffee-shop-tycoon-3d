import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, autosave, deleteSave, listSlots, loadGame, migrate, saveGame, saveKey } from '../../src/save/save';
import { DEFAULT_SETTINGS, SETTINGS_KEY, loadSettings, saveSettings } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { dispatch, step } from '../../src/sim';
import { CHAIR_OFFSET, buildNavGrid, isWalkable } from '../../src/sim/nav';
import { createNewGame, tablePosition } from '../../src/sim/state';
import type { Customer, Vec2 } from '../../src/sim/types';
import { getShopLayout } from '../../src/sim/upgrades';

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

  it('moves people saved inside furniture out to the nearest free floor', () => {
    const s = sampleState();
    for (let i = s.tables.length; i < 8; i++) {
      s.tables.push({ id: s.nextId++, seats: 2, cash: 0, trash: 0, pos: tablePosition(i), occupants: [] });
    }
    const grid = buildNavGrid(getShopLayout(s));
    // The last spot of the old line down x = 0, between the chairs of the back row.
    const oldSpot = { x: 0, z: -1 + 5 * 0.8 };
    expect(isWalkable(grid, oldSpot)).toBe(false);
    const fine = { x: 3, z: -1 };
    expect(isWalkable(grid, fine)).toBe(true);
    const customer = (id: number, pos: Vec2): Customer => ({
      id,
      state: 'queueing',
      pos: { ...pos },
      target: { ...pos },
      patience: 30,
      maxPatience: 40,
      order: 'latte',
      tableId: null,
      timer: 0,
      look: 0,
    });
    s.customers.push(customer(s.nextId++, oldSpot), customer(s.nextId++, fine));
    // The old unassigned-staff spot, inside the back counter.
    s.staff.push({ ...s.candidates[0]!, role: 'none', pos: { x: 0, z: -3.8 } });
    expect(isWalkable(grid, s.staff[0]!.pos)).toBe(false);

    const storage = createMemoryStorage();
    storage.setItem('cst3d:save:1', JSON.stringify({ version: SAVE_VERSION, savedAt: 1, state: s }));
    const r = loadGame('1', storage);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [moved, stayed] = r.value.customers;
    for (const p of [moved!.pos, stayed!.pos, r.value.staff[0]!.pos]) expect(isWalkable(grid, p), `${p.x},${p.z}`).toBe(true);
    expect(Math.hypot(moved!.pos.x - oldSpot.x, moved!.pos.z - oldSpot.z)).toBeLessThan(1);
    expect(stayed!.pos).toEqual(fine);
  });

  it('keeps people loaded from inside furniture on free floor as the day goes on', () => {
    const s = sampleState();
    for (let i = s.tables.length; i < 8; i++) {
      s.tables.push({ id: s.nextId++, seats: 2, cash: 0, trash: 0, pos: tablePosition(i), occupants: [] });
    }
    expect(dispatch(s, { type: 'start_day' })).toBe(true);
    const grid = buildNavGrid(getShopLayout(s));
    // One saved on the old line between the chairs of the back row, one on a chair heading into a table.
    const inChairs = { x: 0, z: -1 + 5 * 0.8 };
    const onChair = { x: s.tables[1]!.pos.x + CHAIR_OFFSET, z: s.tables[1]!.pos.z };
    const table = s.tables[0]!.pos;
    for (const p of [inChairs, onChair, table]) expect(isWalkable(grid, p), `${p.x},${p.z}`).toBe(false);
    const customer = (id: number, state: Customer['state'], pos: Vec2, target: Vec2): Customer => ({
      id,
      state,
      pos: { ...pos },
      target: { ...target },
      patience: 30,
      maxPatience: 40,
      order: 'latte',
      tableId: null,
      timer: 1,
      look: 0,
    });
    s.customers.push(customer(s.nextId++, 'queueing', inChairs, inChairs), customer(s.nextId++, 'entering', onChair, table));
    s.staff.push({ ...s.candidates[0]!, role: 'none', pos: { x: 0, z: -3.8 } });

    const storage = createMemoryStorage();
    storage.setItem('cst3d:save:1', JSON.stringify({ version: SAVE_VERSION, savedAt: 1, state: s }));
    const r = loadGame('1', storage);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const game = r.value;
    const loaded = game.customers.map((c) => c.id);
    const arrived = new Set<number>();
    for (let t = 1; t <= 40; t++) {
      step(game, 1);
      for (const p of [...game.customers, ...game.staff]) {
        expect(isWalkable(grid, p.pos), `tick ${t}: #${p.id} at ${p.pos.x},${p.pos.z}`).toBe(true);
      }
      for (const c of game.customers) {
        const at = c.target;
        if (loaded.includes(c.id) && at && isWalkable(grid, at) && Math.hypot(c.pos.x - at.x, c.pos.z - at.z) < 1e-6) arrived.add(c.id);
      }
    }
    // Each one reached a free spot the sim gave them, or has walked out of the shop.
    for (const id of loaded) expect(arrived.has(id) || !game.customers.some((c) => c.id === id), `customer #${id}`).toBe(true);
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
    const s = { musicVolume: 0.2, sfxVolume: 1, quality: 'high', gameSpeed: 4, cameraKeys: 'qa-arrows', cameraRotateSpeed: 'fast' } as const;
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
    storage.setItem(SETTINGS_KEY, JSON.stringify({ cameraRotateSpeed: 'turbo' }));
    expect(loadSettings(storage).cameraRotateSpeed).toBe('normal');
  });

  it('gives settings saved before the rotate speed existed the normal speed', () => {
    const storage = createMemoryStorage();
    const old = { musicVolume: 0.3, sfxVolume: 0.6, quality: 'low', gameSpeed: 2, cameraKeys: 'qa-arrows' };
    storage.setItem(SETTINGS_KEY, JSON.stringify(old));
    expect(loadSettings(storage)).toEqual({ ...old, cameraRotateSpeed: 'normal' });
  });
});
