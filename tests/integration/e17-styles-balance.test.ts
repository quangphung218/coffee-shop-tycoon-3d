import { describe, expect, it } from 'vitest';
import { LEVELS } from '../../src/sim/data/levels';
import { getMenuItem } from '../../src/sim/data/menu';
import { STYLES } from '../../src/sim/data/styles';
import { UPGRADES } from '../../src/sim/data/upgrades';
import { WEEK_LENGTH, dayUnlockDay } from '../../src/sim/data/week';
import { dailyRent, totalWages } from '../../src/sim/economy';
import { dispatch, nextUpgradeCost, ownsStyle, unlockStyle } from '../../src/sim/index';
import { autoRestockSuggestion } from '../../src/sim/inventory';
import { isUnlocked, weekDay, weekIndex } from '../../src/sim/progression';
import { createNewGame } from '../../src/sim/state';
import { nextUpgradeTicketCost, upgradeBlockedReason } from '../../src/sim/upgrades';
import type { GameState, UpgradeId } from '../../src/sim/types';
import { playDay } from './helpers';

/**
 * E-17 style prices against a long game: b_steady (as in e16-challenges: hires
 * on day 2, one revenue upgrade every 3rd morning, relaxed challenge play)
 * plus a style buyer that, every morning after the upgrade, buys the cheapest
 * style it does not own while the money leaves tonight's wages, rent and
 * tomorrow's restock, and the Tem cover it. Challenge-gated styles count as
 * obtainable (unlocked from the start). 20 weeks on Normal, seeds 1 and 42;
 * the week the last style is bought must not come before STYLE_ALL_MIN_WEEK.
 * Prices are tuned in src/sim/data/styles.ts only.
 */

const SEEDS = [1, 42];
const WEEKS = 20;
const STYLE_ALL_MIN_WEEK = 18;

const STEADY_VISIT_EVERY = 3;
const REVENUE_EFFECTS = ['capacity', 'ratingBonus', 'appeal', 'brewSpeed', 'coffeeBrewSpeed', 'coldBrewSpeed', 'foodBrewSpeed', 'foodAppeal', 'priceBonus'] as const;
const TOOLS = new Set<UpgradeId>(LEVELS.flatMap((l) => l.unlocks.tools));
const BOUGHT = STYLES.filter((s) => s.price > 0 || s.tickets > 0);

function steadyPick(id: UpgradeId): boolean {
  if (TOOLS.has(id) && dayUnlockDay('upgrade', id) > WEEK_LENGTH) return false;
  const def = UPGRADES.find((u) => u.id === id)!;
  return REVENUE_EFFECTS.some((e) => (def.effectPerLevel[e] ?? 0) > 0);
}

const narrowed = new Set<string>();

function enableUnlocked(state: GameState): void {
  for (const m of state.menu) {
    if (narrowed.has(m.id)) continue;
    if (!m.enabled && isUnlocked(state, 'menu', m.id)) dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: true });
  }
}

function reserve(state: GameState): number {
  const drained = structuredClone(state);
  for (const item of drained.inventory) item.qty = 0;
  return totalWages(state) + dailyRent(state) + autoRestockSuggestion(drained).totalCost;
}

function buySteadyUpgrade(state: GameState): void {
  let best: { id: UpgradeId; cost: number } | null = null;
  for (const def of UPGRADES) {
    if (!steadyPick(def.id) || !isUnlocked(state, 'upgrade', def.id)) continue;
    const cost = nextUpgradeCost(state, def.id);
    if (cost === null || state.money - reserve(state) < cost) continue;
    if ((nextUpgradeTicketCost(state, def.id) ?? 0) > (state.retention?.tickets ?? 0) || upgradeBlockedReason(state, def.id)) continue;
    if (best === null || cost < best.cost) best = { id: def.id, cost };
  }
  if (best) expect(dispatch(state, { type: 'buy_upgrade', upgradeId: best.id })).toBe(true);
}

/** Relaxed sell_item play on the Nâng cấp days, as b_steady does in e16-challenges. */
function playChallenge(state: GameState): void {
  const c = state.week?.challenge;
  if (!c || c.status !== 'active' || state.day % STEADY_VISIT_EVERY !== 0 || c.id !== 'sell_item' || !c.itemId) return;
  const category = getMenuItem(c.itemId as never).category;
  for (const m of state.menu) {
    if (m.id === c.itemId || !m.enabled || getMenuItem(m.id).category !== category) continue;
    expect(dispatch(state, { type: 'set_menu_item', itemId: m.id, enabled: false })).toBe(true);
    narrowed.add(m.id);
  }
}

/** Buys styles cheapest first while the next one fits the money over the reserve and the Tem. */
function buyStyles(state: GameState): string[] {
  const bought: string[] = [];
  for (;;) {
    const next = BOUGHT.filter((s) => !ownsStyle(state, s.id)).sort((a, b) => a.price - b.price || a.tickets - b.tickets)[0];
    if (!next || state.money - reserve(state) < next.price || (state.retention?.tickets ?? 0) < next.tickets) return bought;
    expect(dispatch(state, { type: 'buy_style', styleId: next.id })).toBe(true);
    bought.push(next.id);
  }
}

interface StyleRun {
  /** Week the last style was bought, or null when some were still missing after WEEKS. */
  allWeek: number | null;
  owned: number;
  /** Styles bought per week, index 0 = week 1. */
  perWeek: number[];
  /** Styles still not owned after WEEKS. */
  missing: string[];
  money: number;
  tickets: number;
  bankrupt: boolean;
}

function playStyles(seed: number): StyleRun {
  const state = createNewGame('Quán E17', 'normal', seed);
  for (const s of STYLES) if (s.challenge) unlockStyle(state, s.id);
  narrowed.clear();
  const perWeek = Array.from({ length: WEEKS }, () => 0);
  let allWeek: number | null = null;
  for (let day = 1; day <= WEEKS * WEEK_LENGTH; day++) {
    if (day > 1) expect(dispatch(state, { type: 'next_day' })).toBe(true);
    state.events = [];
    if (weekDay(state) === 1) narrowed.clear();
    enableUnlocked(state);
    playChallenge(state);
    dispatch(state, { type: 'apply_restock' });
    if (state.day === 2) {
      const pick = [...state.candidates].sort((a, b) => a.wagePerDay - b.wagePerDay || a.id - b.id)[0]!;
      expect(dispatch(state, { type: 'hire_staff', candidateId: pick.id, role: 'barista' })).toBe(true);
    }
    if (state.day % STEADY_VISIT_EVERY === 0) buySteadyUpgrade(state);
    const week = weekIndex(state);
    perWeek[week - 1]! += buyStyles(state).length;
    if (allWeek === null && BOUGHT.every((s) => ownsStyle(state, s.id))) allWeek = week;
    playDay(state);
  }
  const missing = BOUGHT.filter((s) => !ownsStyle(state, s.id)).map((s) => s.id);
  return { allWeek, owned: BOUGHT.length - missing.length, perWeek, missing, money: state.money, tickets: state.retention?.tickets ?? 0, bankrupt: state.bankrupt };
}

describe('E-17 style prices: b_steady style buyer, 20 weeks on Normal, seeds 1 and 42', { timeout: 600_000 }, () => {
  const runs = SEEDS.map((seed) => playStyles(seed));

  it('prints when the styles are bought', () => {
    const head = ['seed', 'all styles at week', 'owned', 'missing', 'money / Tem at end', ...Array.from({ length: WEEKS }, (_, w) => `w${w + 1}`)];
    const body = runs.map((r, i) => [String(SEEDS[i]), String(r.allWeek ?? `>${WEEKS}`), `${r.owned}/${BOUGHT.length}`, r.missing.join(' ') || '-', `${r.money.toLocaleString('en')} / ${r.tickets}`, ...r.perWeek.map(String)]);
    console.log([`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`)].join('\n'));
    for (const r of runs) expect(r.bankrupt).toBe(false);
  });

  it(`has b_steady own every style no sooner than week ${STYLE_ALL_MIN_WEEK}`, () => {
    runs.forEach((r, i) => expect(r.allWeek ?? Infinity, `seed ${SEEDS[i]}`).toBeGreaterThanOrEqual(STYLE_ALL_MIN_WEEK));
  });
});
