// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SAVE_SLOTS, listSlots, saveGame, saveKey, type SlotInfo } from '../../src/save/save';
import { listSlotSummaries } from '../../src/save/slots';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { createNewGame } from '../../src/sim/state';
import { latestSave } from '../../src/ui/screens/mainMenu';

/** Every field the loader requires once a save is at SAVE_VERSION. */
const REQUIRED_FIELDS = [
  'shopName', 'difficulty', 'day', 'minute', 'phase', 'money', 'rating', 'rngState', 'seed', 'shopLevel', 'xp',
  'nextId', 'missions', 'menu', 'inventory', 'customers', 'staff', 'tables', 'events', 'upgrades', 'today',
];

function sampleState() {
  const s = createNewGame('Quán Test', 'normal', 2024);
  s.money = 1234000;
  s.day = 4;
  return s;
}

function plain(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(sampleState()));
}

/** Bare prototype state: no wrapper and none of the fields added since. */
function v0Text(): string {
  const legacy = plain();
  for (const k of ['events', 'campaigns', 'orders', 'history', 'reviews', 'candidates', 'spawnAccumulator', 'today']) {
    delete legacy[k];
  }
  for (const k of ['seed', 'shopLevel', 'xp', 'missions']) delete legacy[k];
  return JSON.stringify(legacy);
}

function v1Text(): string {
  const legacy = plain();
  for (const k of ['seed', 'shopLevel', 'xp', 'missions']) delete legacy[k];
  return JSON.stringify({ version: 1, savedAt: 11, state: legacy });
}

function v2Text(): string {
  const raw = plain();
  const week = raw.week as Record<string, unknown> | undefined;
  if (week) {
    delete week.index;
    delete week.archive;
  }
  return JSON.stringify({ version: 2, savedAt: 22, state: raw });
}

function v3Text(): string {
  const storage = createMemoryStorage();
  saveGame(sampleState(), '1', storage, 33);
  return storage.getItem(saveKey('1'))!;
}

function withoutShopName(): string {
  const raw = plain();
  delete raw.shopName;
  return JSON.stringify({ version: 3, savedAt: 44, state: raw });
}

const LOADED: SlotInfo = { slot: '2', empty: false, shopName: 'Quán Test', day: 4, money: 1234000 };

/** Each fixture sits in slot 2, with the summary listSlots gives for that slot. */
const FIXTURES: Record<string, [string | null, SlotInfo]> = {
  'empty slot': [null, { slot: '2', empty: true }],
  'v0 bare state': [v0Text(), { ...LOADED, savedAt: 0 }],
  v1: [v1Text(), { ...LOADED, savedAt: 11 }],
  v2: [v2Text(), { ...LOADED, savedAt: 22 }],
  'v3 written by saveGame': [v3Text(), { ...LOADED, savedAt: 33 }],
  'broken JSON': ['{"version":3,', { slot: '2', empty: false, error: 'corrupt' }],
  'version 99': [JSON.stringify({ version: 99, savedAt: 1, state: plain() }), { slot: '2', empty: false, error: 'version_unsupported' }],
  'version -1': [JSON.stringify({ version: -1, savedAt: 1, state: plain() }), { slot: '2', empty: false, error: 'invalid' }],
  'missing shopName': [withoutShopName(), { slot: '2', empty: false, error: 'invalid' }],
};

function storageWith(text: string | null): StorageLike {
  const storage = createMemoryStorage();
  if (text !== null) storage.setItem(saveKey('2'), text);
  return storage;
}

describe('listSlotSummaries', () => {
  for (const [name, [text, expected]] of Object.entries(FIXTURES)) {
    it(`matches listSlots for ${name}`, () => {
      const summaries = listSlotSummaries(storageWith(text));
      expect(summaries).toEqual(listSlots(storageWith(text)));
      expect(summaries[2]).toEqual(expected);
    });
  }

  it('matches listSlots when storage throws', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {},
      removeItem: () => {},
    };
    const summaries = listSlotSummaries(broken);
    expect(summaries).toEqual(listSlots(broken));
    expect(summaries.every((s) => s.error === 'storage')).toBe(true);
  });

  it('reports a v3 save with only name, day and money as invalid', () => {
    const text = JSON.stringify({ version: 3, savedAt: 99, state: { shopName: 'Quán Hỏng', day: 9, money: 1 } });
    const summaries = listSlotSummaries(storageWith(text));
    expect(summaries).toEqual(listSlots(storageWith(text)));
    expect(summaries[2]).toEqual({ slot: '2', empty: false, error: 'invalid' });
  });

  it('reports a v3 save with a field of the wrong type as invalid', () => {
    const raw = plain();
    raw.rngState = 'x';
    const text = JSON.stringify({ version: 3, savedAt: 1, state: raw });
    expect(listSlotSummaries(storageWith(text))[2]?.error).toBe('invalid');
    expect(listSlots(storageWith(text))[2]?.error).toBe('invalid');
  });

  const versions: Record<string, () => string> = { v0: v0Text, v1: v1Text, v2: v2Text, v3: v3Text };
  for (const [version, make] of Object.entries(versions)) {
    for (const field of REQUIRED_FIELDS) {
      it(`matches listSlots for ${version} without ${field}`, () => {
        const file = JSON.parse(make()) as Record<string, unknown>;
        const state = (version === 'v0' ? file : file.state) as Record<string, unknown>;
        delete state[field];
        const text = JSON.stringify(file);
        expect(listSlotSummaries(storageWith(text))).toEqual(listSlots(storageWith(text)));
      });
    }
  }

  // Fields migration does not fill must be in the save; those it fills may be missing.
  const MISSING: [string, () => string, string, boolean][] = [
    ['v3', v3Text, 'rngState', false],
    ['v3', v3Text, 'menu', false],
    ['v3', v3Text, 'today', false],
    ['v3', v3Text, 'seed', false],
    ['v2', v2Text, 'events', false],
    ['v2', v2Text, 'missions', false],
    ['v1', v1Text, 'today', false],
    ['v1', v1Text, 'nextId', false],
    ['v1', v1Text, 'seed', true],
    ['v0', v0Text, 'today', true],
    ['v0', v0Text, 'difficulty', false],
  ];
  for (const [version, make, field, loadable] of MISSING) {
    it(`reports ${version} without ${field} as ${loadable ? 'loadable' : 'invalid'}`, () => {
      const file = JSON.parse(make()) as Record<string, unknown>;
      delete ((version === 'v0' ? file : file.state) as Record<string, unknown>)[field];
      const summary = listSlotSummaries(storageWith(JSON.stringify(file)))[2]!;
      expect(summary.error).toBe(loadable ? undefined : 'invalid');
    });
  }

  it('does not let a newer broken slot hide an older good one from Tiếp tục', () => {
    const storage = createMemoryStorage();
    saveGame(sampleState(), '1', storage, 100);
    const raw = plain();
    delete raw.rngState;
    storage.setItem(saveKey('2'), JSON.stringify({ version: 3, savedAt: 200, state: raw }));
    storage.setItem(saveKey('3'), JSON.stringify({ version: 3, savedAt: 300, state: { shopName: 'X', day: 1, money: 0 } }));
    expect(latestSave(listSlotSummaries(storage))?.slot).toBe('1');
    expect(latestSave(listSlots(storage))?.slot).toBe('1');
  });

  it('never writes to storage', () => {
    const inner = createMemoryStorage();
    const texts: string[] = [v0Text(), v1Text(), v2Text(), '{oops'];
    SAVE_SLOTS.forEach((slot, i) => inner.setItem(saveKey(slot), texts[i]!));
    const writes: string[] = [];
    const storage: StorageLike = {
      getItem: (key) => inner.getItem(key),
      setItem: (key) => writes.push(`set ${key}`),
      removeItem: (key) => writes.push(`remove ${key}`),
    };
    listSlotSummaries(storage);
    expect(writes).toEqual([]);
    SAVE_SLOTS.forEach((slot, i) => expect(inner.getItem(saveKey(slot))).toBe(texts[i]));
  });
});
