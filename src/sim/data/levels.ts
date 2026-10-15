import type { LevelDef, MenuItemId, ToolId, Unlocks, UpgradeId } from '../types';

/** The highest shop level the game defines. */
export const MAX_SHOP_LEVEL = 6;

/**
 * Six shop levels, from a corner stall to a famous chain. Each level newly
 * unlocks menu items, upgrades and tools; levels 1..6 together cover every
 * menu item and every upgrade. `tools` are equipment ids a later milestone
 * wires up, listed here so the unlock table is already complete.
 */
export const LEVELS: readonly LevelDef[] = [
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
    xpToReach: 120,
    unlocks: { menu: ['cappuccino'], upgrades: ['fast_machine'], tools: ['grinder'] },
  },
  {
    level: 3,
    name: 'Quán đông khách',
    xpToReach: 320,
    unlocks: { menu: ['orange_juice'], upgrades: ['better_machine', 'big_counter'], tools: ['pastry_case'] },
  },
  {
    level: 4,
    name: 'Thương hiệu khu phố',
    xpToReach: 640,
    unlocks: { menu: ['mocha'], upgrades: ['paintings', 'lights'], tools: ['blender'] },
  },
  {
    level: 5,
    name: 'Quán nổi tiếng',
    xpToReach: 1200,
    unlocks: { menu: ['cake'], upgrades: ['window_bar', 'outdoor_seating'], tools: ['ice_maker'] },
  },
  {
    level: 6,
    name: 'Chuỗi nổi tiếng',
    xpToReach: 2200,
    unlocks: { menu: [], upgrades: ['expand_area'], tools: ['dishwasher'] },
  },
];

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
  for (const id of def.unlocks.upgrades) if (!UPGRADE_UNLOCK.has(id)) UPGRADE_UNLOCK.set(id, def.level);
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
