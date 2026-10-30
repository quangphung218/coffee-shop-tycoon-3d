// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { SAVE_VERSION, loadGame, migrate, saveGame, saveKey } from '../../src/save/save';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { HISTORY_DAYS } from '../../src/sim/clock';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { profit } from '../../src/sim/economy';
import { dispatch } from '../../src/sim/index';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState } from '../../src/sim/types';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay } from '../integration/helpers';

let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

/** Opens `state` in the shell and goes from its report to the week summary. */
function openWeekEnd(state: GameState): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 1 });
  shell.startGame(state);
  shell.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
  const el = root.querySelector<HTMLElement>('[data-screen="weekEnd"]');
  if (!el) throw new Error('missing week-end screen');
  return el;
}

/** Days every migrated save must play on after loading. */
const PLAY_ON_DAYS = 8;

/** Loads `text` from a fresh in-memory slot and expects it to load. */
function loadText(text: string): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('1'), text);
  const r = loadGame('1', storage);
  expect(r.ok).toBe(true);
  return (r as { ok: true; value: GameState }).value;
}

/** Plays today (from the morning or the report) and `days` more days; returns every event. */
function playOn(state: GameState, days: number): GameEvent[] {
  const events: GameEvent[] = [];
  const lastDay = state.day + days;
  if (state.phase === 'report') expect(dispatch(state, { type: 'next_day' })).toBe(true);
  for (;;) {
    events.push(...state.events);
    state.events = [];
    dispatch(state, { type: 'apply_restock' });
    events.push(...playDay(state));
    if (state.day >= lastDay) return events;
    expect(dispatch(state, { type: 'next_day' })).toBe(true);
  }
}

/**
 * A v2 file of `state` as the pre-endless game wrote it: the week has no index
 * and no archive, and a scored week has no reward because v2 never paid one.
 */
function asV2(state: GameState): string {
  const raw: { state: Record<string, unknown> } = JSON.parse(JSON.stringify({ version: 2, savedAt: 1, state }));
  const week = raw.state.week as Record<string, unknown> | undefined;
  if (week) {
    delete week.index;
    delete week.archive;
    const result = week.result as Record<string, unknown> | undefined;
    if (result) {
      raw.state.money = (raw.state.money as number) - ((result.reward as number | undefined) ?? 0);
      delete result.reward;
    }
  }
  return JSON.stringify({ version: 2, savedAt: 1, state: raw.state });
}

/** Plays a new game from day 1 through the report of `lastDay`. */
function playedGame(seed: number, lastDay: number): GameState {
  const s = createNewGame('Quán Cũ', 'normal', seed);
  playOn(s, lastDay - 1);
  expect(s.day).toBe(lastDay);
  expect(s.phase).toBe('report');
  return s;
}

describe('migrate v2 → v3', { timeout: 300_000 }, () => {
  it('gives a mid-week save index 1 and an empty archive, then rolls into week 2', () => {
    const s = playedGame(4242, 3);
    const g = loadText(asV2(s));
    expect(g.week!.index).toBe(1);
    expect(g.week!.archive).toEqual([]);
    expect(g.week!.result).toBeUndefined();
    expect(g.week!.plan).toEqual(s.week!.plan);

    const events = playOn(g, PLAY_ON_DAYS);
    expect(g.day).toBe(3 + PLAY_ON_DAYS);
    expect(events.filter((e) => e.type === 'week_ended')).toHaveLength(1);
    expect(g.week!.index).toBe(2);
    expect(g.week!.archive!.map((w) => w.index)).toEqual([1]);
  });

  it('archives a week 1 the old game already scored, keeps its result and opens week 2 on next_day', () => {
    const s = playedGame(77, WEEK_LENGTH);
    const result = s.week!.result!;
    expect(result).toBeTruthy();
    const g = loadText(asV2(s));

    expect(g.phase).toBe('report');
    expect(g.week!.index).toBe(1);
    expect(g.week!.result).toEqual({ ...result, reward: undefined });
    const weekDays = [...s.history, s.today];
    expect(g.week!.archive).toEqual([
      {
        index: 1,
        startedDay: 1,
        revenue: result.revenue,
        profit: weekDays.reduce((sum, d) => sum + profit(d), 0),
        customersServed: weekDays.reduce((sum, d) => sum + d.customersServed, 0),
        stars: result.stars,
        score: result.score,
        cups: result.cups,
      },
    ]);
    // The row matches what the endless sim itself archived for that week, less
    // the upgradeCharge the sim records from E-11: v2 paid week-1 upgrades in full.
    const { upgradeCharge, ...simRow } = s.week!.archive![0]!;
    expect(upgradeCharge).toBeDefined();
    expect(g.week!.archive).toEqual([simRow]);

    expect(dispatch(g, { type: 'next_day' })).toBe(true);
    expect(g.day).toBe(WEEK_LENGTH + 1);
    expect(g.week!.index).toBe(2);
    expect(g.week!.startedDay).toBe(WEEK_LENGTH + 1);
    expect(g.week!.result).toBeUndefined();
    expect(g.week!.archive).toHaveLength(1);

    playOn(g, PLAY_ON_DAYS - 1);
    expect(g.day).toBe(WEEK_LENGTH + PLAY_ON_DAYS);
    expect(g.week!.index).toBe(3);
    expect(g.week!.archive!.map((w) => w.index)).toEqual([1, 2]);
  });

  it('pays nothing for a week v2 scored and shows no reward line', () => {
    // A seed whose week still earns 2 cups with the daily rent.
    const s = playedGame(7, WEEK_LENGTH);
    // The sim would pay this week, so the reward line would show if it were recounted.
    expect(s.week!.result!.reward).toBeGreaterThan(0);
    const file = asV2(s);
    const v2Money = JSON.parse(file).state.money as number;
    const g = loadText(file);
    expect(g.week!.result!.reward).toBeUndefined();
    expect(g.money).toBe(v2Money);

    const el = openWeekEnd(g);
    expect(el.querySelector('h3')?.textContent).toBe('Tổng kết tuần 1');
    expect(el.querySelector('[data-block="reward"]')).toBeNull();
    expect(el.textContent).not.toContain('Thưởng');
    expect(g.money).toBe(v2Money);
  });

  it('archives a scored week with profit 0 when the save has no history', () => {
    const s = playedGame(77, WEEK_LENGTH);
    const raw = JSON.parse(asV2(s));
    raw.state.history = [];
    raw.state.today = createDayStats(WEEK_LENGTH, s.rating);
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = r.value.state.week!.archive![0]!;
    expect(row.profit).toBe(0);
    expect(row.revenue).toBe(s.week!.result!.revenue);
  });

  it('does not archive the same week twice', () => {
    const s = playedGame(77, WEEK_LENGTH);
    const raw = JSON.parse(JSON.stringify({ version: 2, savedAt: 1, state: s }));
    const r = migrate(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state.week!.archive).toEqual(s.week!.archive);
  });

  it(`cuts history longer than ${HISTORY_DAYS} days to the last ${HISTORY_DAYS}`, () => {
    const s = createNewGame('Quán Lâu', 'normal', 5);
    delete s.week;
    s.day = 40;
    s.today = createDayStats(40, s.rating);
    s.history = Array.from({ length: 39 }, (_, i) => createDayStats(i + 1, 3));
    const r = migrate(JSON.parse(asV2(s)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.version).toBe(SAVE_VERSION);
    expect(r.value.state.history.map((d) => d.day)).toEqual(Array.from({ length: HISTORY_DAYS }, (_, i) => 12 + i));
  });
});

describe('migrate v1 → v3', { timeout: 300_000 }, () => {
  it('keeps a save without a week weekless and plays on past day 8', () => {
    const s = createNewGame('Quán Xưa', 'normal', 11);
    const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(s));
    for (const k of ['week', 'seed', 'shopLevel', 'xp', 'missions']) delete legacy[k];
    const g = loadText(JSON.stringify({ version: 1, savedAt: 1, state: legacy }));
    expect(g.week).toBeUndefined();

    const events = playOn(g, PLAY_ON_DAYS);
    expect(g.day).toBe(1 + PLAY_ON_DAYS);
    expect(g.week).toBeUndefined();
    expect(events.some((e) => e.type === 'week_ended')).toBe(false);
  });
});

describe('migrate v0 → v3', { timeout: 300_000 }, () => {
  it(`loads a bare prototype save and plays on ${PLAY_ON_DAYS} days like v1 and v2`, () => {
    const s = createNewGame('Quán Mẫu', 'normal', 13);
    const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(s));
    const v0Fields = ['events', 'campaigns', 'orders', 'history', 'reviews', 'candidates', 'spawnAccumulator', 'weather', 'tickAccumulator', 'playerTasks'];
    for (const k of [...v0Fields, 'week', 'seed', 'shopLevel', 'xp', 'missions']) delete legacy[k];
    const g = loadText(JSON.stringify(legacy));
    expect(g.day).toBe(1);
    expect(g.week).toBeUndefined();
    expect(g.shopLevel).toBeGreaterThanOrEqual(1);
    expect(g.missions.length).toBeGreaterThan(0);

    const events = playOn(g, PLAY_ON_DAYS);
    expect(g.day).toBe(1 + PLAY_ON_DAYS);
    expect(g.phase).toBe('report');
    expect(g.history.map((d) => d.day)).toEqual(Array.from({ length: PLAY_ON_DAYS }, (_, i) => i + 1));
    expect(events.some((e) => e.type === 'week_ended')).toBe(false);
  });
});

describe('a v3 save', { timeout: 300_000 }, () => {
  it('keeps week.index and the archive through save and load', () => {
    const g = loadText(asV2(playedGame(77, WEEK_LENGTH)));
    playOn(g, PLAY_ON_DAYS);
    expect(g.week!.index).toBe(3);
    expect(g.week!.archive).toHaveLength(2);

    const storage = createMemoryStorage();
    const saved = saveGame(g, '2', storage, 1000);
    expect(saved.ok).toBe(true);
    expect(JSON.parse(storage.getItem(saveKey('2'))!).version).toBe(SAVE_VERSION);
    const loaded = loadGame('2', storage);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.value.week!.index).toBe(g.week!.index);
    expect(loaded.value.week!.archive).toEqual(g.week!.archive);
    expect(loaded.value.week!.startedDay).toBe(g.week!.startedDay);
  });
});
