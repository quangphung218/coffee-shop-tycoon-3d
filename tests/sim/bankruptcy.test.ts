import { describe, expect, it } from 'vitest';
import { loadGame, migrate, saveGame, saveKey } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { BANKRUPT_DAYS, DEBT_LIMIT, debtDaysLeft, updateBankruptcy } from '../../src/sim/economy';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { playDay } from '../integration/helpers';

const OVER = -DEBT_LIMIT.normal - 1;

function game(): GameState {
  return createNewGame('Quán nợ', 'normal', 7);
}

/** Ends a day with `money` in the till. */
function endWith(state: GameState, money: number): void {
  state.money = money;
  updateBankruptcy(state);
}

describe('bankruptcy counter', () => {
  it('starts clean', () => {
    const s = game();
    expect(s.debtDays).toBe(0);
    expect(s.bankrupt).toBe(false);
    expect(debtDaysLeft(s)).toBe(BANKRUPT_DAYS);
  });

  it('counts each day ending past the limit and goes bankrupt on the third', () => {
    const s = game();
    endWith(s, OVER);
    expect([s.debtDays, s.bankrupt, debtDaysLeft(s)]).toEqual([1, false, 2]);
    endWith(s, OVER);
    expect([s.debtDays, s.bankrupt, debtDaysLeft(s)]).toEqual([2, false, 1]);
    endWith(s, OVER);
    expect([s.debtDays, s.bankrupt, debtDaysLeft(s)]).toEqual([3, true, 0]);
  });

  it('does not count a day ending exactly at the limit or merely negative', () => {
    const s = game();
    endWith(s, -DEBT_LIMIT.normal);
    expect(s.debtDays).toBe(0);
    endWith(s, -1);
    expect(s.debtDays).toBe(0);
  });

  it('resets the count when a day ends back within the limit', () => {
    const s = game();
    endWith(s, OVER);
    endWith(s, OVER);
    endWith(s, 0);
    expect([s.debtDays, s.bankrupt]).toEqual([0, false]);
    endWith(s, OVER);
    endWith(s, OVER);
    expect([s.debtDays, s.bankrupt]).toEqual([2, false]);
  });

  it('uses the difficulty limit', () => {
    const s = createNewGame('Quán khó', 'hard', 7);
    endWith(s, -DEBT_LIMIT.hard - 1);
    expect(s.debtDays).toBe(1);
  });

  it('stays bankrupt once reached', () => {
    const s = game();
    for (let i = 0; i < BANKRUPT_DAYS; i++) endWith(s, OVER);
    endWith(s, 1_000_000);
    expect(s.bankrupt).toBe(true);
    expect(debtDaysLeft(s)).toBe(0);
  });

  it('is updated by the end of a played day, deterministically', () => {
    const run = (): GameState => {
      const s = game();
      s.money = OVER;
      playDay(s);
      return s;
    };
    const a = run();
    const b = run();
    expect(a.phase).toBe('report');
    expect(a.debtDays).toBe(a.money < -DEBT_LIMIT.normal ? 1 : 0);
    expect([b.debtDays, b.bankrupt, b.money]).toEqual([a.debtDays, a.bankrupt, a.money]);
  });
});

describe('bankruptcy save migration', () => {
  it('fills the new fields when loading a version 3 save', () => {
    const old = JSON.parse(JSON.stringify(game())) as Record<string, unknown>;
    delete old.debtDays;
    delete old.bankrupt;
    const storage = createMemoryStorage();
    storage.setItem(saveKey('1'), JSON.stringify({ version: 3, savedAt: 1, state: old }));
    const r = loadGame('1', storage);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.debtDays).toBe(0);
    expect(r.value.bankrupt).toBe(false);
  });

  it('migrates a version 0 prototype save up to the current version', () => {
    const old = JSON.parse(JSON.stringify(game())) as Record<string, unknown>;
    for (const k of ['debtDays', 'bankrupt', 'seed', 'shopLevel', 'xp', 'missions', 'week']) delete old[k];
    const r = migrate(old);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(5);
    expect([r.value.state.debtDays, r.value.state.bankrupt]).toEqual([0, false]);
  });

  it('round-trips the counter and flag', () => {
    const s = game();
    endWith(s, OVER);
    endWith(s, OVER);
    const storage = createMemoryStorage();
    expect(saveGame(s, '2', storage, 1).ok).toBe(true);
    const r = loadGame('2', storage);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([r.value.debtDays, r.value.bankrupt]).toEqual([2, false]);
  });
});
