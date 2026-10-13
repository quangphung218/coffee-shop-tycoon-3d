import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/sim/data/difficulty';
import { MENU, getMenuItem } from '../../src/sim/data/menu';
import { mulberry32, random, randInt } from '../../src/sim/rng';
import { DAY_START_MINUTE, createNewGame } from '../../src/sim/state';

describe('rng', () => {
  it('is deterministic for a seed and stores its state', () => {
    const a = { rngState: 42 };
    const b = { rngState: 42 };
    const seqA = [random(a), random(a), random(a)];
    const seqB = [random(b), random(b), random(b)];
    expect(seqA).toEqual(seqB);
    expect(a.rngState).toBe(b.rngState);
    expect(a.rngState).not.toBe(42);
  });

  it('stays in range', () => {
    const h = { rngState: 7 };
    for (let i = 0; i < 1000; i++) {
      const v = random(h);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = randInt(h, 2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
    expect(mulberry32(0).value).toBeGreaterThanOrEqual(0);
  });
});

describe('createNewGame', () => {
  it('starts small on day 1 in preparation', () => {
    const s = createNewGame('Cà Phê Sáng', 'normal', 123);
    expect(s.shopName).toBe('Cà Phê Sáng');
    expect(s.day).toBe(1);
    expect(s.phase).toBe('preparation');
    expect(s.minute).toBe(DAY_START_MINUTE);
    expect(s.money).toBe(DIFFICULTIES.normal.startMoney);
    expect(s.rating).toBe(DIFFICULTIES.normal.startRating);
    expect(s.tables.length).toBeGreaterThanOrEqual(2);
    expect(s.tables.length).toBeLessThanOrEqual(3);
    expect(s.staff).toEqual([]);
    expect(s.customers).toEqual([]);
    expect(s.events).toEqual([]);
    expect(s.candidates.length).toBeGreaterThan(0);
  });

  it('uses difficulty for starting money', () => {
    expect(createNewGame('A', 'easy', 1).money).toBe(DIFFICULTIES.easy.startMoney);
    expect(createNewGame('A', 'hard', 1).money).toBe(DIFFICULTIES.hard.startMoney);
  });

  it('lists every menu item and stocks the enabled ones', () => {
    const s = createNewGame('A', 'normal', 1);
    expect(s.menu).toHaveLength(MENU.length);
    const enabled = s.menu.filter((m) => m.enabled);
    expect(enabled.length).toBeGreaterThan(0);
    for (const entry of enabled) {
      for (const need of getMenuItem(entry.id).ingredients) {
        const stock = s.inventory.find((i) => i.id === need.id)?.qty ?? 0;
        expect(stock, `${entry.id} needs ${need.id}`).toBeGreaterThanOrEqual(need.qty);
      }
    }
  });

  it('hands out unique ids and keeps nextId ahead of them', () => {
    const s = createNewGame('A', 'normal', 9);
    const ids = [...s.tables.map((t) => t.id), ...s.candidates.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.nextId).toBeGreaterThan(Math.max(...ids));
  });

  it('is deterministic and JSON-serialisable', () => {
    const a = createNewGame('A', 'normal', 555);
    const b = createNewGame('A', 'normal', 555);
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(createNewGame('A', 'normal', 556).candidates).not.toEqual(a.candidates);
  });

  it('falls back to a default name when blank', () => {
    expect(createNewGame('   ', 'normal', 1).shopName).not.toBe('');
  });
});
