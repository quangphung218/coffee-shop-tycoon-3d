import { STAFF_TRAITS, staffTrait } from './data/staffTraits';
import { ensureRetention } from './retention';
import type { GameState, Staff, StaffTaskKind, StaffTraitId } from './types';

/** Team size cap before any expansion raises it. */
export const BASE_MAX_STAFF = 6;
/** Team size cap however far the shop expands. */
export const TOP_MAX_STAFF = 8;
/** expand_area levels above this add one staff slot each. */
const STAFF_FREE_EXPANSIONS = 2;

/** Busy minutes (cumulative) a staff member needs to be trained to level i + 1. */
export const STAFF_LEVEL_EXP: readonly number[] = [0, 240, 600, 1100, 1800];
export const MAX_STAFF_LEVEL = STAFF_LEVEL_EXP.length;
/** Work speed added per level above 1. */
export const LEVEL_SPEED_STEP = 0.06;
/** Daily wage multiplier on each promotion. */
export const PROMOTION_WAGE_MULT = 1.08;
/** Tickets ('Tem') training to a level costs on top of money; levels left out cost none. */
export const TRAIN_TICKETS: Readonly<Record<number, number>> = { 4: 3, 5: 5 };

export function staffLevel(member: Staff): number {
  return member.level ?? 1;
}

export function staffExp(member: Staff): number {
  return member.exp ?? 0;
}

/** The member's trait; staff from older saves without one get theirs from the same hash, without writing it. */
export function staffTraitOf(state: GameState, member: Staff): StaffTraitId {
  return member.trait ?? staffTrait(state.seed, member.id);
}

/** Speed multiplier from level and trait for one job kind ('promote' for a marketer's arrival bonus). */
export function growthSpeedMult(state: GameState, member: Staff, kind: StaffTaskKind): number {
  const levelMult = 1 + LEVEL_SPEED_STEP * (staffLevel(member) - 1);
  return levelMult * (STAFF_TRAITS[staffTraitOf(state, member)].taskMult[kind] ?? 1);
}

/** Price of training the member to the next level: money (rounded to 10.000 đ) and tickets. */
export function trainCost(member: Staff): { money: number; tickets: number } {
  const level = staffLevel(member);
  return {
    money: Math.round((2 * member.wagePerDay * level) / 10000) * 10000,
    tickets: TRAIN_TICKETS[level + 1] ?? 0,
  };
}

/** Why the member cannot be trained right now, or null when training is possible. */
export function canTrain(state: GameState, staffId: number): string | null {
  const member = state.staff.find((s) => s.id === staffId);
  if (!member) return 'Không tìm thấy nhân viên';
  const level = staffLevel(member);
  if (level >= MAX_STAFF_LEVEL) return `${member.name} đã đạt cấp tối đa`;
  if (state.phase !== 'preparation') return 'Chỉ đào tạo nhân viên lúc chuẩn bị';
  if (staffExp(member) < STAFF_LEVEL_EXP[level]!) return `${member.name} chưa đủ kinh nghiệm lên cấp ${level + 1}`;
  const cost = trainCost(member);
  if (state.money < cost.money) return 'Không đủ tiền đào tạo';
  if (ensureRetention(state).tickets < cost.tickets) return `Cần ${cost.tickets} Tem để đào tạo lên cấp ${level + 1}`;
  return null;
}

/**
 * Pays to train a staff member one level up. Returns false when the training
 * does not apply (unknown staff, top level, not enough money or tickets…).
 */
export function trainStaff(state: GameState, staffId: number): boolean {
  const reason = canTrain(state, staffId);
  if (reason) {
    state.events.push({ type: 'notify', level: 'error', text: reason });
    return false;
  }
  const member = state.staff.find((s) => s.id === staffId)!;
  const cost = trainCost(member);
  const level = staffLevel(member) + 1;
  state.money -= cost.money;
  ensureRetention(state).tickets -= cost.tickets;
  member.level = level;
  member.wagePerDay = Math.round((member.wagePerDay * PROMOTION_WAGE_MULT) / 1000) * 1000;
  state.events.push({
    type: 'spend',
    kind: 'upgrade',
    label: `Đào tạo ${member.name} lên cấp ${level}`,
    amount: cost.money,
    moneyLeft: state.money,
  });
  state.events.push({ type: 'staff_promoted', staffId, level });
  return true;
}

/** One tick of work experience for a staff member; called for every staff member each game minute. */
export function onStaffTick(state: GameState, member: Staff, dtMinutes: number): void {
  if (!member.busy || state.phase === 'preparation' || state.phase === 'report') return;
  member.exp = Math.min(staffExp(member) + dtMinutes, STAFF_LEVEL_EXP[MAX_STAFF_LEVEL - 1]!);
}

/** End-of-day staff growth (experience into levels); called from closeDay. Levels only rise by training. */
export function endOfDayStaffGrowth(_state: GameState): void {}

/** How many staff the shop can employ right now: one more per expand_area level above 2, up to TOP_MAX_STAFF. */
export function maxStaff(state: GameState): number {
  // Read the level directly: importing upgrades here would close an import cycle through marketing.
  const extra = Math.max(0, (state.upgrades.expand_area ?? 0) - STAFF_FREE_EXPANSIONS);
  return Math.min(TOP_MAX_STAFF, BASE_MAX_STAFF + extra);
}
