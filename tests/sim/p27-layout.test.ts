import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../../src/sim/data/difficulty';
import { MAX_SHOP_LEVEL, maxLevelBonus } from '../../src/sim/data/levels';
import { getUpgrade, upgradeCost } from '../../src/sim/data/upgrades';
import { dispatch } from '../../src/sim/index';
import {
  BOOKSHELF_SIZE,
  CHAIR_OFFSET,
  SOFA_SIZE,
  backCounterSpan,
  buildNavGrid,
  findPath,
  layoutFootprints,
  nearestFree,
  validateLayout,
} from '../../src/sim/nav';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import type { GameState, UpgradeId, Vec2 } from '../../src/sim/types';
import {
  buyUpgrade,
  getShopLayout,
  isRemovableDecor,
  maxUpgradeLevel,
  nextUpgradeCost,
  nextUpgradeTicketCost,
  removeDecor,
  upgradeBlockedReason,
  upgradeLevel,
  upgradeLevelPrice,
  type ShopLayout,
} from '../../src/sim/upgrades';

const FURNITURE = ['neon_sign', 'bookshelf', 'record_player', 'sofa_corner'] as const;
const DECOR: readonly UpgradeId[] = ['plants', 'paintings', 'lights', ...FURNITURE];
const EQUIPMENT: readonly UpgradeId[] = [
  'better_machine',
  'fast_machine',
  'big_counter',
  'grinder',
  'pastry_case',
  'blender',
  'ice_maker',
  'dishwasher',
  'cold_brew_tower',
  'oven',
];
const OUTSIDE: Vec2 = { x: 0, z: 9.2 };

/** A Normal game at `shopLevel` with money and tickets to spare. */
function rich(shopLevel = MAX_SHOP_LEVEL): GameState {
  const s = createNewGame('Quán P27', 'normal', 27);
  s.shopLevel = shopLevel;
  s.money = 1e15;
  ensureRetention(s).tickets = 1000;
  return s;
}

function buy(s: GameState, id: UpgradeId, levels: number): void {
  for (let i = 0; i < levels; i++) expect(buyUpgrade(s, id).ok, id).toBe(true);
}

function maxOut(s: GameState, id: UpgradeId): void {
  while (upgradeLevel(s, id) < maxUpgradeLevel(s, id)) expect(buyUpgrade(s, id).ok, id).toBe(true);
}

interface Combo {
  expand: number;
  outdoor: number;
  windowBar: number;
  equipment: boolean;
}

/** Shop level 10 with the tables at their cap, every decor item at its cap, and the given side room, patio, window bar and equipment. */
function comboLayout({ expand, outdoor, windowBar, equipment }: Combo): ShopLayout {
  const s = rich();
  maxOut(s, 'tables');
  buy(s, 'expand_area', expand);
  buy(s, 'outdoor_seating', outdoor);
  buy(s, 'window_bar', windowBar);
  if (equipment) for (const id of EQUIPMENT) maxOut(s, id);
  for (const id of DECOR) if (!upgradeBlockedReason(s, id)) maxOut(s, id);
  return getShopLayout(s);
}

const COMBOS: Combo[] = [];
for (let expand = 0; expand <= 4; expand++) {
  for (const outdoor of [0, 2]) for (const windowBar of [0, 2]) for (const equipment of [false, true]) COMBOS.push({ expand, outdoor, windowBar, equipment });
}
const name = (c: Combo): string => `expand ${c.expand}, outdoor ${c.outdoor}, window bar ${c.windowBar}, ${c.equipment ? 'all' : 'no'} equipment`;

describe('P27 side room levels 3–4', () => {
  it('open expand_area 3 at shop level 7 and 4 at level 9', () => {
    const base = getUpgrade('expand_area').maxLevel;
    expect(base).toBe(2);
    expect(maxLevelBonus(6, 'expand_area')).toBe(0);
    expect(maxLevelBonus(7, 'expand_area')).toBe(1);
    expect(maxLevelBonus(8, 'expand_area')).toBe(1);
    expect(maxLevelBonus(9, 'expand_area')).toBe(2);
    expect(maxLevelBonus(MAX_SHOP_LEVEL, 'expand_area')).toBe(2);
    expect(maxUpgradeLevel(rich(6), 'expand_area')).toBe(2);
    expect(maxUpgradeLevel(rich(7), 'expand_area')).toBe(3);
    expect(maxUpgradeLevel(rich(9), 'expand_area')).toBe(4);
  });

  it('price levels 3–4 at their own extraLevels cost (E-05)', () => {
    const s = rich();
    const def = getUpgrade('expand_area');
    const mult = DIFFICULTIES.normal.priceMult;
    for (const level of [3, 4]) {
      const own = def.extraLevels![level - def.maxLevel - 1]!.cost;
      expect(upgradeLevelPrice(s, 'expand_area', level), `level ${level}`).toBe(Math.round((own * mult) / 1000) * 1000);
    }
    expect(upgradeLevelPrice(s, 'expand_area', 2)).toBe(upgradeCost(def, 1, mult));
    buy(s, 'expand_area', 2);
    const money = s.money;
    const cost = nextUpgradeCost(s, 'expand_area')!;
    expect(cost).toBe(upgradeLevelPrice(s, 'expand_area', 3));
    buy(s, 'expand_area', 1);
    expect(s.money).toBe(money - cost);
  });

  it('add a column of three tables per level, inside a wider side room', () => {
    const s = rich();
    for (let level = 1; level <= 4; level++) {
      buy(s, 'expand_area', 1);
      const layout = getShopLayout(s);
      const tables = layout.tables.filter((t) => t.zone === 'expansion');
      expect(tables, `level ${level}`).toHaveLength(3 * level);
      expect(new Set(tables.map((t) => t.pos.x)).size).toBe(level);
      for (const t of tables) expect(t.pos.x + CHAIR_OFFSET).toBeLessThan(layout.expansion!.maxX);
    }
  });

  it('reach every side room table of levels 3–4 from the street', () => {
    for (const expand of [3, 4]) {
      const layout = comboLayout({ expand, outdoor: 2, windowBar: 2, equipment: true });
      const grid = buildNavGrid(layout);
      for (const t of layout.tables.filter((t) => t.zone === 'expansion')) {
        const reached = [-1, 1].some((side) => {
          const seat = nearestFree(grid, { x: t.pos.x + side * CHAIR_OFFSET, z: t.pos.z });
          return seat !== null && findPath(grid, OUTSIDE, seat) !== null;
        });
        expect(reached, `expand ${expand}, table ${t.id}`).toBe(true);
      }
    }
  });
});

describe('P27 layout with every furniture item', () => {
  it.each(COMBOS.map((c) => [name(c), c] as const))('validates clean: %s', (_, combo) => {
    const layout = comboLayout(combo);
    expect(validateLayout(layout)).toEqual([]);
    const kinds = new Set(layout.decor.map((d) => d.kind));
    for (const kind of ['neon', 'bookshelf', 'record_player'] as const) expect(kinds.has(kind), kind).toBe(true);
    expect(kinds.has('sofa')).toBe(combo.expand > 0);
  });

  it('keep the door open and a path from the street to the counter with everything bought', () => {
    const layout = comboLayout({ expand: 4, outdoor: 2, windowBar: 2, equipment: true });
    expect(validateLayout(layout).filter((i) => i.kind === 'door_blocked' || i.kind === 'counter_blocked')).toEqual([]);
    const grid = buildNavGrid(layout);
    expect(findPath(grid, OUTSIDE, { x: layout.door.x, z: layout.door.z - 0.5 })).not.toBeNull();
    expect(findPath(grid, OUTSIDE, { x: layout.counter.pos.x, z: layout.counter.pos.z + 1 })).not.toBeNull();
  });

  it('give the bookshelf and the sofa a footprint, not the neon sign or the record player', () => {
    const layout = comboLayout({ expand: 1, outdoor: 0, windowBar: 0, equipment: false });
    const fps = layoutFootprints(layout);
    expect(fps.filter((f) => f.kind === 'bookshelf')).toHaveLength(getUpgrade('bookshelf').maxLevel);
    expect(fps.filter((f) => f.kind === 'sofa')).toHaveLength(1);
    const sofa = fps.find((f) => f.kind === 'sofa')!.shape;
    expect(sofa).toMatchObject({ type: 'rect' });
    if (sofa.type === 'rect') {
      expect(sofa.maxX - sofa.minX).toBeCloseTo(SOFA_SIZE.width);
      expect(sofa.minX).toBeGreaterThanOrEqual(layout.indoor.maxX);
      expect(sofa.maxX).toBeLessThanOrEqual(layout.expansion!.maxX);
    }
    const shelf = fps.find((f) => f.kind === 'bookshelf')!.shape;
    if (shelf.type === 'rect') expect(shelf.maxX - shelf.minX).toBeCloseTo(BOOKSHELF_SIZE.depth);
    // Neon signs hang on the front wall and the record player sits on the back counter.
    const ids = fps.map((f) => f.id);
    expect(ids.some((id) => id.startsWith('neon') || id.startsWith('record'))).toBe(false);
  });

  it('run the back counter under the record player even without the far-right machines', () => {
    const s = rich();
    const before = backCounterSpan(getShopLayout(s))!;
    buy(s, 'record_player', 1);
    const layout = getShopLayout(s);
    const player = layout.decor.find((d) => d.kind === 'record_player')!;
    const span = backCounterSpan(layout)!;
    expect(span.minX).toBe(before.minX);
    expect(span.maxX).toBeGreaterThan(player.pos.x);
    expect(span.maxX).toBeLessThan(layout.indoor.maxX);
    expect(validateLayout(layout)).toEqual([]);
  });

  it('report the tier of each new kind', () => {
    const s = rich();
    buy(s, 'neon_sign', 2);
    buy(s, 'bookshelf', 1);
    expect(getShopLayout(s).decorTier).toMatchObject({ neon: 2, bookshelf: 1, record_player: 0, sofa: 0 });
  });
});

describe('P27 furniture purchase', () => {
  it('unlocks at shop levels 3, 4, 6 and 8 through dispatch', () => {
    for (const [id, level] of [['neon_sign', 3], ['bookshelf', 4], ['record_player', 6], ['sofa_corner', 8]] as const) {
      const low = rich(level - 1);
      buy(low, 'expand_area', 1);
      expect(dispatch(low, { type: 'buy_upgrade', upgradeId: id }), `${id} below level ${level}`).toBe(false);
      const at = rich(level);
      buy(at, 'expand_area', 1);
      expect(dispatch(at, { type: 'buy_upgrade', upgradeId: id }), `${id} at level ${level}`).toBe(true);
    }
  });

  it('charges the ticket price on top of the money when the tickets cover it', () => {
    const s = rich();
    ensureRetention(s).tickets = 10;
    const tickets = nextUpgradeTicketCost(s, 'record_player')!;
    expect(tickets).toBe(getUpgrade('record_player').ticketCost![0]);
    expect(tickets).toBeGreaterThan(0);
    const money = s.money;
    const cost = nextUpgradeCost(s, 'record_player')!;
    expect(buyUpgrade(s, 'record_player')).toEqual({ ok: true, cost, level: 1 });
    expect(s.money).toBe(money - cost);
    expect(s.retention!.tickets).toBe(10 - tickets);
    expect(nextUpgradeTicketCost(s, 'record_player')).toBeNull();
  });

  it('refuses when the tickets are short, without spending anything', () => {
    const s = rich();
    buy(s, 'expand_area', 1);
    const need = nextUpgradeTicketCost(s, 'sofa_corner')!;
    ensureRetention(s).tickets = need - 2;
    const before = JSON.stringify({ money: s.money, upgrades: s.upgrades, retention: s.retention });
    s.events = [];
    expect(buyUpgrade(s, 'sofa_corner')).toEqual({ ok: false, reason: 'Thiếu 2 Tem' });
    expect(s.events).toContainEqual({ type: 'notify', level: 'error', text: 'Thiếu 2 Tem' });
    expect(JSON.stringify({ money: s.money, upgrades: s.upgrades, retention: s.retention })).toBe(before);
  });

  it('treats an older save without retention as zero tickets', () => {
    const s = rich();
    delete s.retention;
    expect(buyUpgrade(s, 'record_player')).toMatchObject({ ok: false, reason: `Thiếu ${getUpgrade('record_player').ticketCost![0]} Tem` });
    // Money-only upgrades leave the missing retention state alone.
    expect(buyUpgrade(s, 'neon_sign').ok).toBe(true);
    expect(nextUpgradeTicketCost(s, 'neon_sign')).toBe(0);
  });

  it('blocks the sofa corner until the side room is bought, with a reason', () => {
    const s = rich();
    ensureRetention(s).tickets = 100;
    const reason = upgradeBlockedReason(s, 'sofa_corner');
    expect(reason).toContain(getUpgrade('expand_area').name);
    const money = s.money;
    s.events = [];
    expect(buyUpgrade(s, 'sofa_corner')).toEqual({ ok: false, reason });
    expect(s.events).toContainEqual({ type: 'notify', level: 'error', text: reason });
    expect(s.money).toBe(money);
    expect(s.retention!.tickets).toBe(100);
    expect(getShopLayout(s).decor.some((d) => d.kind === 'sofa')).toBe(false);

    buy(s, 'expand_area', 1);
    expect(upgradeBlockedReason(s, 'sofa_corner')).toBeNull();
    expect(buyUpgrade(s, 'sofa_corner').ok).toBe(true);
    expect(getShopLayout(s).decor.some((d) => d.kind === 'sofa')).toBe(true);
    for (const id of FURNITURE.filter((f) => f !== 'sofa_corner')) expect(upgradeBlockedReason(s, id), id).toBeNull();
  });

  it('can take every new item down like the older decor, refunding half the money', () => {
    const s = rich();
    buy(s, 'expand_area', 1);
    for (const id of FURNITURE) {
      expect(isRemovableDecor(id), id).toBe(true);
      buy(s, id, 1);
      const paid = upgradeLevelPrice(s, id, 1);
      const money = s.money;
      expect(removeDecor(s, id)).toEqual({ ok: true, refund: Math.round(paid / 2), level: 0 });
      expect(s.money).toBe(money + Math.round(paid / 2));
    }
    expect(getShopLayout(s).decor).toEqual([]);
  });
});
