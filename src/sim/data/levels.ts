import type { LevelDef, MenuItemId, ToolId, Unlocks, UpgradeId } from '../types';

/** The highest shop level the game defines. */
export const MAX_SHOP_LEVEL = 10;

/** The level at which every menu item and upgrade but the sofa corner (level 8) is unlocked; levels above it mostly raise upgrade caps. */
export const FULL_UNLOCK_LEVEL = 6;

/** Price multiplier on upgrade levels above the upgrade's own maxLevel (the ones shop levels 7..10 open). */
export const BONUS_LEVEL_PRICE_MULT = 3;

/** A shop level, plus the extra upgrade levels it allows on top of each upgrade's maxLevel. */
export type ShopLevelDef = LevelDef & { maxLevelBonus?: Partial<Record<UpgradeId, number>> };

/**
 * Ten shop levels, from a corner stall to a legend of the street. Levels 1..6
 * newly unlock menu items, upgrades and tools and together cover every menu
 * item and every upgrade but the sofa corner, which level 8 opens. `tools` are
 * equipment upgrades (a subset of UpgradeId): they gate buying the same way as
 * `upgrades` but stay a separate list so the UI can present them as
 * equipment. Each of levels 7..10 raises the cap of a few owned upgrades by
 * one (`maxLevelBonus`): upgrades whose extra level needs no new model or
 * floor spot, and expand_area at 7 and 9, whose third and fourth levels add a
 * column of tables to the side room. Thresholds and picks are explained in
 * docs/reports/p23-long-economy.md.
 */
export const LEVELS: readonly ShopLevelDef[] = [
  {
    level: 1,
    name: 'Quán nhỏ',
    xpToReach: 0,
    unlocks: {
      menu: ['espresso', 'americano', 'latte', 'milk_tea', 'lemon_tea', 'croissant'],
      upgrades: ['tables', 'plants'],
      tools: [],
    },
  },
  {
    level: 2,
    name: 'Quán quen',
    xpToReach: 1100,
    unlocks: { menu: ['cappuccino'], upgrades: ['fast_machine'], tools: ['grinder'] },
  },
  {
    level: 3,
    name: 'Quán đông khách',
    xpToReach: 3500,
    unlocks: { menu: ['orange_juice'], upgrades: ['better_machine', 'big_counter', 'neon_sign'], tools: ['pastry_case'] },
  },
  {
    level: 4,
    name: 'Thương hiệu khu phố',
    xpToReach: 7000,
    unlocks: { menu: ['mocha', 'frappe'], upgrades: ['paintings', 'lights', 'bookshelf'], tools: ['blender'] },
  },
  {
    level: 5,
    name: 'Quán nổi tiếng',
    xpToReach: 12000,
    unlocks: { menu: ['cake'], upgrades: ['window_bar', 'outdoor_seating'], tools: ['ice_maker'] },
  },
  {
    level: 6,
    name: 'Chuỗi nổi tiếng',
    xpToReach: 19000,
    unlocks: { menu: [], upgrades: ['expand_area', 'record_player'], tools: ['dishwasher'] },
  },
  {
    level: 7,
    name: 'Điểm hẹn của quận',
    xpToReach: 27000,
    unlocks: { menu: [], upgrades: [], tools: [] },
    maxLevelBonus: { better_machine: 1, grinder: 1, expand_area: 1 },
  },
  {
    level: 8,
    name: 'Thương hiệu được săn đón',
    xpToReach: 37000,
    unlocks: { menu: [], upgrades: ['sofa_corner'], tools: [] },
    maxLevelBonus: { tables: 1, pastry_case: 1 },
  },
  {
    level: 9,
    name: 'Biểu tượng cà phê phố',
    xpToReach: 49000,
    unlocks: { menu: [], upgrades: [], tools: [] },
    maxLevelBonus: { lights: 1, blender: 1, expand_area: 1 },
  },
  {
    level: 10,
    name: 'Huyền thoại thành phố',
    xpToReach: 63000,
    unlocks: { menu: [], upgrades: [], tools: [] },
    maxLevelBonus: { better_machine: 1, dishwasher: 1 },
  },
];

/** Extra levels above `maxLevel` that shop level `level` allows for an upgrade (sum of levels 1..level). */
export function maxLevelBonus(level: number, id: UpgradeId): number {
  let bonus = 0;
  for (const def of LEVELS) if (def.level <= level) bonus += def.maxLevelBonus?.[id] ?? 0;
  return bonus;
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(MAX_SHOP_LEVEL, Math.floor(level)));
}

/** Definition of a level, clamped to the valid range. */
export function levelDef(level: number): LevelDef {
  return LEVELS[clampLevel(level) - 1]!;
}

/** Cumulative XP needed to reach a level. */
export function xpToReach(level: number): number {
  return levelDef(level).xpToReach;
}

/** Highest level whose XP threshold the total has passed, capped at MAX_SHOP_LEVEL. */
export function levelForXp(xp: number): number {
  let level = 1;
  for (const def of LEVELS) if (xp >= def.xpToReach) level = def.level;
  return level;
}

const MENU_UNLOCK = new Map<MenuItemId, number>();
const UPGRADE_UNLOCK = new Map<UpgradeId, number>();
for (const def of LEVELS) {
  for (const id of def.unlocks.menu) if (!MENU_UNLOCK.has(id)) MENU_UNLOCK.set(id, def.level);
  // Tools are equipment upgrades; gate buying them by the level that lists them.
  for (const id of [...def.unlocks.upgrades, ...def.unlocks.tools]) if (!UPGRADE_UNLOCK.has(id)) UPGRADE_UNLOCK.set(id, def.level);
}

/** Level at which a menu item unlocks (1 when it is not gated). */
export function menuUnlockLevel(id: MenuItemId): number {
  return MENU_UNLOCK.get(id) ?? 1;
}

/** Level at which an upgrade unlocks (1 when it is not gated). */
export function upgradeUnlockLevel(id: UpgradeId): number {
  return UPGRADE_UNLOCK.get(id) ?? 1;
}

/** Everything unlocked when moving from `from` up to and including `to`. */
export function unlocksBetween(from: number, to: number): Unlocks {
  const menu: MenuItemId[] = [];
  const upgrades: UpgradeId[] = [];
  const tools: ToolId[] = [];
  for (const def of LEVELS) {
    if (def.level <= from || def.level > to) continue;
    menu.push(...def.unlocks.menu);
    upgrades.push(...def.unlocks.upgrades);
    tools.push(...def.unlocks.tools);
  }
  return { menu, upgrades, tools };
}
