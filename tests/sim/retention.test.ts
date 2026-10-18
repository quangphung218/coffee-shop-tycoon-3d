import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, ACHIEVEMENT_IDS, GIFT_REWARDS } from '../../src/sim/data/retention';
import { dispatch } from '../../src/sim/index';
import { buildDailyReport, closeDay } from '../../src/sim/report';
import {
  achievementProgress,
  addTickets,
  claimDailyGift,
  endOfDayRetention,
  ensureRetention,
  giftPreview,
  parseDateKey,
  spendTickets,
} from '../../src/sim/retention';
import { createDayStats, createNewGame } from '../../src/sim/state';
import type { DailyReport, Difficulty, GameState, WeekSummary } from '../../src/sim/types';

function game(difficulty: Difficulty = 'normal'): GameState {
  return createNewGame('Quán Test', difficulty, 7);
}

function errors(s: GameState): string[] {
  return s.events.flatMap((e) => (e.type === 'notify' && e.level === 'error' ? [e.text] : []));
}

function utcDays(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** A report of `served` customers and `revenue` for the state's day, nothing else. */
function report(s: GameState, served = 0, revenue = 0): DailyReport {
  return { ...buildDailyReport(s), customersServed: served, revenue, missions: [] };
}

describe('parseDateKey', () => {
  it('counts days from the epoch like Date.UTC', () => {
    expect(parseDateKey('1970-01-01')).toBe(0);
    for (const [y, m, d] of [
      [1969, 12, 31],
      [2000, 2, 29],
      [2024, 2, 29],
      [2026, 10, 18],
      [2100, 3, 1],
    ] as const) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      expect(parseDateKey(key)).toBe(utcDays(y, m, d));
    }
  });

  it('steps one day across month, year and leap-day boundaries', () => {
    const next = (a: string, b: string) => expect(parseDateKey(b)! - parseDateKey(a)!).toBe(1);
    next('2026-01-31', '2026-02-01');
    next('2026-04-30', '2026-05-01');
    next('2025-12-31', '2026-01-01');
    next('2024-02-28', '2024-02-29');
    next('2024-02-29', '2024-03-01');
    next('2026-02-28', '2026-03-01');
    next('2000-02-28', '2000-02-29');
  });

  it('rejects bad formats and days that do not exist', () => {
    for (const key of [
      '2026-02-30',
      '2026-02-29',
      '1900-02-29',
      '2026-04-31',
      '2026-13-01',
      '2026-00-10',
      '2026-01-00',
      '2026-1-01',
      '26-01-01',
      '2026/01/01',
      '2026-01-01T00:00',
      '',
    ]) {
      expect(parseDateKey(key), key).toBeNull();
    }
  });
});

describe('daily gift', () => {
  it('pays the first gift as day 1 and records the claim', () => {
    const s = game();
    const money = s.money;
    expect(claimDailyGift(s, '2026-10-18')).toBe(true);
    const r = ensureRetention(s);
    expect(r.login).toEqual({ lastDate: '2026-10-18', streak: 1, claimed: 1 });
    expect(s.money).toBe(money + GIFT_REWARDS[0]!.money);
    expect(r.tickets).toBe(GIFT_REWARDS[0]!.tickets);
    expect(s.events).toContainEqual({ type: 'gift_claimed', streak: 1, money: 50000, tickets: 1 });
    expect(s.events).toContainEqual({ type: 'tickets_earned', amount: 1, total: 1, reason: 'gift' });
  });

  it('cannot be claimed twice on the same day', () => {
    const s = game();
    claimDailyGift(s, '2026-10-18');
    const money = s.money;
    const before = structuredClone(s.retention);
    expect(claimDailyGift(s, '2026-10-18')).toBe(false);
    expect(errors(s)).toContain('Hôm nay đã nhận quà');
    expect(s.retention).toEqual(before);
    expect(s.money).toBe(money);
  });

  it('refuses a date before the last claim and keeps the streak', () => {
    const s = game();
    claimDailyGift(s, '2026-10-18');
    claimDailyGift(s, '2026-10-19');
    const money = s.money;
    expect(claimDailyGift(s, '2026-10-17')).toBe(false);
    expect(errors(s)).toContain('Ngày trên máy lùi lại, không nhận được quà');
    expect(ensureRetention(s).login).toEqual({ lastDate: '2026-10-19', streak: 2, claimed: 2 });
    expect(s.money).toBe(money);
    // The next real day carries the streak on.
    expect(claimDailyGift(s, '2026-10-20')).toBe(true);
    expect(ensureRetention(s).login.streak).toBe(3);
  });

  it('refuses an invalid date key', () => {
    const s = game();
    expect(claimDailyGift(s, '2026-02-30')).toBe(false);
    expect(errors(s)).toHaveLength(1);
    expect(ensureRetention(s).login.claimed).toBe(0);
  });

  it('continues the streak across month and year ends and resets it after a missed day', () => {
    const s = game();
    claimDailyGift(s, '2025-12-31');
    claimDailyGift(s, '2026-01-01');
    expect(ensureRetention(s).login.streak).toBe(2);
    claimDailyGift(s, '2026-01-03');
    expect(ensureRetention(s).login.streak).toBe(1);
    claimDailyGift(s, '2024-02-28'); // clock back: refused
    expect(ensureRetention(s).login.streak).toBe(1);

    const leap = game();
    claimDailyGift(leap, '2024-02-28');
    claimDailyGift(leap, '2024-02-29');
    claimDailyGift(leap, '2024-03-01');
    expect(ensureRetention(leap).login.streak).toBe(3);
  });

  it('pays the 7 gifts in order, then starts again at day 1', () => {
    const s = game();
    const paid: { streak: number; money: number; tickets: number }[] = [];
    for (let d = 1; d <= 9; d++) {
      expect(claimDailyGift(s, `2026-03-0${d}`)).toBe(true);
      const e = s.events.filter((x) => x.type === 'gift_claimed').at(-1)!;
      paid.push({ streak: e.streak, money: e.money, tickets: e.tickets });
    }
    expect(paid.map((p) => p.streak)).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2]);
    expect(paid.slice(0, 7).map(({ money, tickets }) => ({ money, tickets }))).toEqual(GIFT_REWARDS);
    expect(ensureRetention(s).tickets).toBe(1 + 1 + 2 + 1 + 2 + 2 + 5 + 1 + 1);
    expect(ensureRetention(s).login.claimed).toBe(9);
  });

  it('scales the money by the difficulty, not the tickets', () => {
    const easy = game('easy');
    const hard = game('hard');
    claimDailyGift(easy, '2026-10-18');
    claimDailyGift(hard, '2026-10-18');
    expect(easy.money - createNewGame('Quán Test', 'easy', 7).money).toBe(45000);
    expect(hard.money - createNewGame('Quán Test', 'hard', 7).money).toBe(58000);
    expect(ensureRetention(easy).tickets).toBe(1);
    expect(ensureRetention(hard).tickets).toBe(1);
  });

  it('can be claimed in any phase through the command', () => {
    for (const phase of ['preparation', 'opening', 'peak', 'closing', 'report'] as const) {
      const s = game();
      s.phase = phase;
      expect(dispatch(s, { type: 'claim_daily_gift', dateKey: '2026-10-18' })).toBe(true);
    }
  });

  it('previews without changing the state', () => {
    const s = game();
    const before = structuredClone(s);
    expect(giftPreview(s, '2026-10-18')).toEqual({
      canClaim: true,
      reason: null,
      nextStreak: 1,
      reward: { money: 50000, tickets: 1 },
    });
    expect(s).toEqual(before);
    claimDailyGift(s, '2026-10-18');
    expect(giftPreview(s, '2026-10-19')).toMatchObject({ canClaim: true, nextStreak: 2, reward: { money: 60000 } });
    expect(giftPreview(s, '2026-10-18')).toMatchObject({ canClaim: false, reason: 'Hôm nay đã nhận quà' });
    expect(giftPreview(s, '2026-10-21')).toMatchObject({ canClaim: true, nextStreak: 1 });
  });

  it('gives the same result for the same state and commands', () => {
    const run = () => {
      const s = game();
      for (const key of ['2026-10-18', '2026-10-18', '2026-10-19', '2026-10-17', '2026-10-25', '2026-10-26']) {
        dispatch(s, { type: 'claim_daily_gift', dateKey: key });
      }
      return s;
    };
    expect(run()).toEqual(run());
  });
});

describe('tickets', () => {
  it('adds with an event and spends only what the balance covers', () => {
    const s = game();
    addTickets(s, 3, 'vip');
    expect(s.events).toContainEqual({ type: 'tickets_earned', amount: 3, total: 3, reason: 'vip' });
    addTickets(s, 0, 'vip');
    expect(s.events.filter((e) => e.type === 'tickets_earned')).toHaveLength(1);
    expect(spendTickets(s, 4)).toBe(false);
    expect(spendTickets(s, -1)).toBe(false);
    expect(spendTickets(s, 2)).toBe(true);
    expect(ensureRetention(s).tickets).toBe(1);
  });
});

describe('lifetime backfill', () => {
  function week(startedDay: number, customersServed: number, revenue: number): WeekSummary {
    return { index: 1, startedDay, revenue, profit: 0, customersServed, stars: 4, score: 50, cups: 1 };
  }

  it('counts archived weeks once and the history days outside them', () => {
    const s = game();
    delete s.retention;
    s.history = [];
    for (let d = 1; d <= 10; d++) s.history.push({ ...createDayStats(d, 3), customersServed: d, revenue: d * 1000 });
    s.week!.archive = [week(1, 500, 9_000_000)];
    s.today = createDayStats(11, 3);
    s.phase = 'preparation';
    // Days 8..10 are outside the archived week 1..7.
    expect(ensureRetention(s).lifetime).toEqual({
      served: 500 + 8 + 9 + 10,
      revenue: 9_000_000 + 27_000,
      fiveStar: 0,
      perfectDays: 0,
      threeCupWeeks: 0,
    });
  });

  it('counts the finished day once when the save is in its report', () => {
    const s = game();
    delete s.retention;
    s.history = [];
    for (let d = 1; d <= 6; d++) s.history.push({ ...createDayStats(d, 3), customersServed: 10, revenue: 100 });
    // Week 1 was archived tonight, so it includes today; its days are counted one by one.
    s.week!.archive = [week(1, 70, 700)];
    s.today = { ...createDayStats(7, 3), customersServed: 10, revenue: 100 };
    s.phase = 'report';
    expect(ensureRetention(s).lifetime).toMatchObject({ served: 70, revenue: 700 });
  });

  it('starts at 0 on a new game and adds each closed day', () => {
    const s = game();
    s.today.customersServed = 12;
    s.today.revenue = 345_000;
    closeDay(s);
    expect(ensureRetention(s).lifetime).toMatchObject({ served: 12, revenue: 345_000 });
  });

  it('does not count the closing day twice when an old save is first closed on week day 7', () => {
    const s = game();
    delete s.retention;
    s.history = [];
    for (let d = 1; d <= 6; d++) s.history.push({ ...createDayStats(d, 3), customersServed: 10, revenue: 0 });
    s.day = 7;
    s.today = { ...createDayStats(7, 3), customersServed: 10 };
    s.phase = 'closing';
    closeDay(s);
    expect(s.week!.archive?.at(-1)?.customersServed).toBe(70);
    expect(ensureRetention(s).lifetime.served).toBe(70);
  });
});

describe('achievements', () => {
  it('grants a tier once, with tickets and no XP', () => {
    const s = game();
    const r = ensureRetention(s);
    r.lifetime.served = 95;
    const xp = s.xp;
    const first = report(s, 10);
    endOfDayRetention(s, first);
    expect(r.achievements.served).toBe(1);
    expect(r.tickets).toBe(ACHIEVEMENTS.served.tiers[0]!.tickets);
    expect(first.achievements).toEqual([{ id: 'served', tier: 1 }]);
    expect(s.events).toContainEqual({ type: 'achievement_unlocked', id: 'served', tier: 1 });
    expect(s.events).toContainEqual({ type: 'tickets_earned', amount: 2, total: 2, reason: 'achievement' });
    expect(s.xp).toBe(xp);

    s.events = [];
    const second = report(s, 10);
    endOfDayRetention(s, second);
    expect(second.achievements).toBeUndefined();
    expect(r.tickets).toBe(2);
    expect(s.events.filter((e) => e.type === 'achievement_unlocked')).toEqual([]);
  });

  it('pays every tier passed in one day', () => {
    const s = game();
    const r = ensureRetention(s);
    const rep = report(s, 0, 40_000_000);
    endOfDayRetention(s, rep);
    expect(rep.achievements).toEqual([
      { id: 'revenue', tier: 1 },
      { id: 'revenue', tier: 2 },
    ]);
    expect(r.tickets).toBe(2 + 4);
  });

  it('counts five-star reviews, perfect days and three-cup weeks', () => {
    const s = game();
    const r = ensureRetention(s);
    s.reviews = [
      { day: s.today.day, stars: 5, text: '', author: 'A' },
      { day: s.today.day, stars: 4, text: '', author: 'B' },
      { day: s.today.day - 1, stars: 5, text: '', author: 'C' },
    ];
    const rep = report(s);
    rep.missions = [
      { id: 'serve_customers', target: 1, progress: 1, rewardXp: 0, rewardMoney: 0, status: 'completed' },
      { id: 'serve_customers', target: 1, progress: 1, rewardXp: 0, rewardMoney: 0, status: 'completed' },
      { id: 'serve_customers', target: 1, progress: 1, rewardXp: 0, rewardMoney: 0, status: 'completed' },
    ] as DailyReport['missions'];
    endOfDayRetention(s, rep);
    expect(r.lifetime.fiveStar).toBe(1);
    expect(r.lifetime.perfectDays).toBe(1);
    expect(r.achievements.perfect_day).toBe(1);
    expect(r.lifetime.threeCupWeeks).toBe(0);

    const failed = report(s);
    failed.missions = rep.missions!.map((m, i) => ({ ...m, status: i === 0 ? 'failed' : 'completed' }));
    s.reviews = [];
    endOfDayRetention(s, failed);
    expect(r.lifetime.perfectDays).toBe(1);

    s.day = s.week!.startedDay + 6;
    s.week!.result = { revenue: 0, revenueTarget: 0, stars: 5, starsTarget: 4, score: 100, cups: 3, days: [] };
    endOfDayRetention(s, report(s));
    expect(r.lifetime.threeCupWeeks).toBe(1);
    expect(r.achievements.three_cups).toBe(1);
  });

  it('counts staff at level 3 or more for staff_master', () => {
    const s = game();
    const hired = s.candidates.slice(0, 3).map((c, i) => ({ ...c, role: 'barista' as const, level: 3 + (i % 2) }));
    s.staff.push(...hired);
    const rep = report(s);
    endOfDayRetention(s, rep);
    expect(ensureRetention(s).achievements.staff_master).toBe(2);
    expect(achievementProgress(s).find((a) => a.id === 'staff_master')).toMatchObject({ tier: 2, value: 3, next: 6 });
  });

  it('lists progress for every achievement without changing the state', () => {
    const s = game();
    const before = structuredClone(s);
    const list = achievementProgress(s);
    expect(s).toEqual(before);
    expect(list.map((a) => a.id)).toEqual(ACHIEVEMENT_IDS);
    expect(list.every((a) => a.tier === 0 && a.value === 0)).toBe(true);
    expect(list.map((a) => a.next)).toEqual(ACHIEVEMENT_IDS.map((id) => ACHIEVEMENTS[id].tiers[0]!.target));
    const r = ensureRetention(s);
    r.achievements.served = 3;
    r.lifetime.served = 2500;
    expect(achievementProgress(s)[0]).toMatchObject({ id: 'served', tier: 3, value: 2500, next: null });
  });

  it('every achievement has 3 tiers paying 2, 4 and 8 tickets', () => {
    for (const id of ACHIEVEMENT_IDS) {
      expect(ACHIEVEMENTS[id].tiers.map((t) => t.tickets)).toEqual([2, 4, 8]);
      const targets = ACHIEVEMENTS[id].tiers.map((t) => t.target);
      expect([...targets].sort((a, b) => a - b)).toEqual(targets);
    }
  });
});
