import { describe, expect, it } from 'vitest';
import { STAFF_TRAITS, STAFF_TRAIT_IDS, staffTrait } from '../../src/sim/data/staffTraits';
import { dispatch, step } from '../../src/sim/index';
import { MARKETER_BONUS, customerMultiplier } from '../../src/sim/marketing';
import { hireStaff, startStaffDay, updateStaff, workSpeed } from '../../src/sim/staff';
import {
  MAX_STAFF_LEVEL,
  STAFF_LEVEL_EXP,
  canTrain,
  maxStaff,
  staffTraitOf,
  trainCost,
  trainStaff,
} from '../../src/sim/staffGrowth';
import { normalizeSeed } from '../../src/sim/rng';
import { CANDIDATE_COUNT, createNewGame, generateCandidates } from '../../src/sim/state';
import { loadGame, saveKey } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import type { GameState, Staff, StaffRole, StaffTraitId } from '../../src/sim/types';

function hire(s: GameState, role: StaffRole = 'barista'): Staff {
  return hireStaff(s, s.candidates[0]!.id, role)!;
}

/** A new game with one hired barista, enough experience for level 2 and plenty of money. */
function readyToTrain(): { s: GameState; member: Staff } {
  const s = createNewGame('Quán Test', 'normal', 7);
  const member = hire(s);
  member.exp = STAFF_LEVEL_EXP[1]!;
  s.money = 100_000_000;
  return { s, member };
}

function errors(s: GameState): string[] {
  return s.events.flatMap((e) => (e.type === 'notify' && e.level === 'error' ? [e.text] : []));
}

describe('staff traits', () => {
  it('are the same for the same seed and id, and spread over all four traits', () => {
    const seen = new Set<StaffTraitId>();
    for (let id = 1; id <= 200; id++) {
      expect(staffTrait(123, id)).toBe(staffTrait(123, id));
      seen.add(staffTrait(123, id));
    }
    expect([...seen].sort()).toEqual([...STAFF_TRAIT_IDS].sort());
    const differs = Array.from({ length: 50 }, (_, id) => staffTrait(1, id) !== staffTrait(2, id));
    expect(differs.some(Boolean)).toBe(true);
  });

  it('are given to candidates from the hash, without changing the rng sequence', () => {
    const a = createNewGame('A', 'normal', 42);
    const b = createNewGame('A', 'normal', 42);
    expect(a.candidates.map((c) => c.trait)).toEqual(a.candidates.map((c) => staffTrait(a.seed, c.id)));
    expect(a.candidates).toEqual(b.candidates);
    // The rng holds what plain generateCandidates leaves behind: traits draw nothing from it.
    const plain = generateCandidates({ rngState: normalizeSeed(42) }, a.candidates[0]!.id, CANDIDATE_COUNT, 1);
    expect(a.candidates.map(({ trait: _t, ...rest }) => rest)).toEqual(plain);

    const rngBefore = a.rngState;
    startStaffDay(a);
    const replay = generateCandidates({ rngState: rngBefore }, a.candidates[0]!.id, CANDIDATE_COUNT, 1);
    expect(a.candidates.map(({ trait: _t, ...rest }) => rest)).toEqual(replay);
    expect(a.candidates.every((c) => c.trait === staffTrait(a.seed, c.id))).toBe(true);
  });

  it('old staff without a trait read it lazily from the hash without writing it', () => {
    const s = createNewGame('A', 'normal', 9);
    const member = hire(s);
    delete member.trait;
    expect(staffTraitOf(s, member)).toBe(staffTrait(s.seed, member.id));
    expect(member.trait).toBeUndefined();
  });

  it('each trait has a Vietnamese name and description', () => {
    for (const id of STAFF_TRAIT_IDS) {
      expect(STAFF_TRAITS[id].name.length).toBeGreaterThan(0);
      expect(STAFF_TRAITS[id].description.length).toBeGreaterThan(0);
    }
  });
});

describe('work speed', () => {
  it('multiplies level and trait for the current job kind', () => {
    const s = createNewGame('A', 'normal', 3);
    const member = hire(s);
    member.speed = 1;
    member.trait = 'barista_pro';
    member.task = { kind: 'brew', targetId: null, remaining: 3 };
    expect(workSpeed(s, member)).toBeCloseTo(1.1);
    member.task = { kind: 'serve', targetId: null, remaining: 1 };
    expect(workSpeed(s, member)).toBeCloseTo(1);
    member.trait = 'tidy';
    member.task = { kind: 'clean', targetId: null, remaining: 1 };
    member.level = 3;
    expect(workSpeed(s, member)).toBeCloseTo(1.12 * 1.12);
    member.trait = 'quick';
    member.task = null;
    expect(workSpeed(s, member)).toBeCloseTo(1.12);
  });

  it('a charming marketer brings 10% more of the marketer bonus', () => {
    const s = createNewGame('A', 'normal', 1);
    const member = hire(s, 'marketer');
    member.speed = 1;
    member.trait = 'charming';
    expect(customerMultiplier(s)).toBeCloseTo(1 + MARKETER_BONUS * 1.1);
    member.trait = 'tidy';
    expect(customerMultiplier(s)).toBeCloseTo(1 + MARKETER_BONUS);
  });
});

describe('experience', () => {
  it('grows by busy minutes while the shop is open, not while idle or closed', () => {
    const s = createNewGame('A', 'normal', 5);
    for (const i of s.inventory) i.qty = 100000;
    const marketer = hire(s, 'marketer');
    const cleaner = hire(s, 'cleaner');
    updateStaff(s);
    expect(marketer.exp ?? 0).toBe(0);

    dispatch(s, { type: 'start_day' });
    for (let i = 0; i < 10; i++) updateStaff(s);
    // A marketer always has a promote task; a cleaner with clean tables has nothing to do.
    expect(marketer.exp).toBe(10);
    expect(cleaner.exp ?? 0).toBe(0);

    s.phase = 'report';
    updateStaff(s);
    expect(marketer.exp).toBe(10);
  });

  it('is capped at the top level threshold', () => {
    const s = createNewGame('A', 'normal', 5);
    const marketer = hire(s, 'marketer');
    marketer.exp = STAFF_LEVEL_EXP[MAX_STAFF_LEVEL - 1]!;
    dispatch(s, { type: 'start_day' });
    updateStaff(s);
    expect(marketer.exp).toBe(STAFF_LEVEL_EXP[MAX_STAFF_LEVEL - 1]);
  });
});

describe('trainStaff', () => {
  it('trains with enough experience and money: charges, levels up, raises wage and speed', () => {
    const { s, member } = readyToTrain();
    member.speed = 1;
    member.trait = 'tidy';
    member.task = { kind: 'brew', targetId: null, remaining: 1 };
    const wage = member.wagePerDay;
    const fee = Math.round((2 * wage) / 10000) * 10000;
    expect(trainCost(member)).toEqual({ money: fee, tickets: 0 });
    expect(canTrain(s, member.id)).toBeNull();
    const speedBefore = workSpeed(s, member);

    expect(dispatch(s, { type: 'train_staff', staffId: member.id })).toBe(true);
    expect(member.level).toBe(2);
    expect(s.money).toBe(100_000_000 - fee);
    expect(member.wagePerDay).toBe(Math.round((wage * 1.08) / 1000) * 1000);
    expect(workSpeed(s, member)).toBeCloseTo(speedBefore * 1.06);
    expect(s.events).toContainEqual({
      type: 'spend',
      kind: 'upgrade',
      label: `Đào tạo ${member.name} lên cấp 2`,
      amount: fee,
      moneyLeft: s.money,
    });
    expect(s.events).toContainEqual({ type: 'staff_promoted', staffId: member.id, level: 2 });

    // Level 3 needs more experience.
    expect(trainStaff(s, member.id)).toBe(false);
    expect(member.level).toBe(2);
  });

  it('refuses without enough money', () => {
    const { s, member } = readyToTrain();
    s.money = trainCost(member).money - 1;
    expect(trainStaff(s, member.id)).toBe(false);
    expect(member.level ?? 1).toBe(1);
    expect(s.money).toBe(trainCost(member).money - 1);
    expect(errors(s)).toContain('Không đủ tiền đào tạo');
  });

  it('refuses training to level 4 without 3 tickets, and charges them when there are enough', () => {
    const { s, member } = readyToTrain();
    member.level = 3;
    member.exp = STAFF_LEVEL_EXP[3]!;
    s.retention = { tickets: 2, login: { lastDate: null, streak: 0, claimed: 0 }, lifetime: { served: 0, revenue: 0, fiveStar: 0, perfectDays: 0, threeCupWeeks: 0 }, achievements: {} };
    expect(trainCost(member).tickets).toBe(3);
    expect(trainStaff(s, member.id)).toBe(false);
    expect(errors(s)).toContain('Cần 3 Tem để đào tạo lên cấp 4');
    expect(s.money).toBe(100_000_000);

    s.retention.tickets = 3;
    expect(trainStaff(s, member.id)).toBe(true);
    expect(s.retention.tickets).toBe(0);
    expect(member.level).toBe(4);
    expect(trainCost(member).tickets).toBe(5);
  });

  it('refuses outside preparation', () => {
    const { s, member } = readyToTrain();
    dispatch(s, { type: 'start_day' });
    expect(trainStaff(s, member.id)).toBe(false);
    expect(errors(s)).toContain('Chỉ đào tạo nhân viên lúc chuẩn bị');
    expect(member.level ?? 1).toBe(1);
  });

  it('refuses at level 5', () => {
    const { s, member } = readyToTrain();
    member.level = MAX_STAFF_LEVEL;
    member.exp = STAFF_LEVEL_EXP[MAX_STAFF_LEVEL - 1]!;
    expect(trainStaff(s, member.id)).toBe(false);
    expect(member.level).toBe(5);
    expect(s.money).toBe(100_000_000);
    expect(errors(s)).toContain(`${member.name} đã đạt cấp tối đa`);
  });

  it('a save without trait, level, exp or retention plays on and trains from defaults', () => {
    const { s, member } = readyToTrain();
    delete member.trait;
    delete member.level;
    delete member.exp;
    delete s.retention;
    const storage = createMemoryStorage();
    storage.setItem(saveKey('1'), JSON.stringify({ version: 3, savedAt: 1_700_000_000_000, state: s }));
    const r = loadGame('1', storage);
    if (!r.ok) throw new Error(r.error.message);
    const loaded = r.value;
    const old = loaded.staff[0]!;
    expect(old.level).toBeUndefined();
    expect(staffTraitOf(loaded, old)).toBe(staffTrait(loaded.seed, old.id));
    expect(canTrain(loaded, old.id)).toBe(`${old.name} chưa đủ kinh nghiệm lên cấp 2`);

    loaded.events = [];
    dispatch(loaded, { type: 'start_day' });
    for (let i = 0; i < 60; i++) step(loaded, 1);
    expect(old.exp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(workSpeed(loaded, old))).toBe(true);
    expect(old.level).toBeUndefined();
  });
});

describe('maxStaff', () => {
  it('is 6, plus one per expand_area level above 2, up to 8', () => {
    const s = createNewGame('A', 'normal', 1);
    expect(maxStaff(s)).toBe(6);
    s.upgrades.expand_area = 2;
    expect(maxStaff(s)).toBe(6);
    s.upgrades.expand_area = 3;
    expect(maxStaff(s)).toBe(7);
    s.upgrades.expand_area = 4;
    expect(maxStaff(s)).toBe(8);
    s.upgrades.expand_area = 6;
    expect(maxStaff(s)).toBe(8);
  });
});
