// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SAVE_SLOTS, listSlots, saveGame, saveKey, type SlotInfo } from '../../src/save/save';
import { listSlotSummaries } from '../../src/save/slots';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { createNewGame } from '../../src/sim/state';

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
