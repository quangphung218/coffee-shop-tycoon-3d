import { DOOR_POS, PICKUP_POS, totalSeats } from './customers';
import { DIFFICULTIES } from './data/difficulty';
import { BONUS_LEVEL_PRICE_MULT, maxLevelBonus } from './data/levels';
import { getUpgrade, upgradeCost, upgradeTier } from './data/upgrades';
import { CHAIR_OFFSET } from './nav/footprints';
import { SEATS_PER_TABLE, TABLE_PITCH, TABLE_ROW_PITCH, TABLE_ROW_Z, tablePosition } from './state';
import type { GameState, Table, UpgradeId, Vec2 } from './types';

/** Axis-aligned floor area in world units. */
export interface Area {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type TableZone = 'indoor' | 'expansion' | 'outdoor';

export interface LayoutTable {
  id: number;
  pos: Vec2;
  seats: number;
  zone: TableZone;
}

/** espresso and fast brew coffee; the rest are equipment that change the sim. */
export type MachineKind = 'espresso' | 'fast' | 'grinder' | 'pastry_case' | 'blender' | 'ice_maker' | 'dishwasher';

export interface LayoutMachine {
  pos: Vec2;
  kind: MachineKind;
  /** better_machine level: shinier model, better drinks. */
  quality: number;
  /** Look tier 0..3 (upgradeTier): better_machine for espresso and fast, the machine's own level otherwise. */
  tier: number;
}

export type DecorKind = 'plant' | 'painting' | 'light';

export interface LayoutDecor {
  kind: DecorKind;
  pos: Vec2;
}

/** Everything the renderer needs to place the shop's furniture. */
export interface ShopLayout {
  indoor: Area;
  /** Side room from expand_area; null until bought. */
  expansion: Area | null;
  /** Sidewalk seating from outdoor_seating; null until bought. */
  outdoor: Area | null;
  door: Vec2;
  pickup: Vec2;
  /** `tier` is the big_counter look tier (upgradeTier). */
  counter: { pos: Vec2; width: number; level: number; tier: number };
  machines: LayoutMachine[];
  tables: LayoutTable[];
  decor: LayoutDecor[];
  totalSeats: number;
  /** Look tiers 0..3 (upgradeTier) of the tables, the outdoor seating, each decor kind and the window bar. */
  furnitureTier: number;
  outdoorTier: number;
  decorTier: Record<DecorKind, number>;
  windowBarTier: number;
}

/** The front wall (with the door) is at z = 6. */
export const INDOOR_AREA: Area = { minX: -4.5, maxX: 4.5, minZ: -4.5, maxZ: 6 };
const COUNTER_POS: Vec2 = { x: 0, z: -2 };
const COUNTER_WIDTH = 3;
const COUNTER_WIDTH_PER_LEVEL = 1.5;
const MACHINE_POS: Vec2 = { x: -1, z: -3.3 };
/**
 * Where each equipment unit stands on the back counter: the grinder and the
 * pastry case left of the espresso machine, the rest in the gaps between the
 * fast machines. No two machine tops (MACHINE_SIZE) overlap at any combination
 * of owned machines, and the extended back counter still clears the back-left
 * planter and both side walls. Shown only when owned.
 */
const EQUIPMENT_SPOTS: Readonly<Record<Exclude<MachineKind, 'espresso' | 'fast'>, Vec2>> = {
  grinder: { x: -2.45, z: MACHINE_POS.z },
  pastry_case: { x: -1.92, z: MACHINE_POS.z },
  blender: { x: 0.8, z: MACHINE_POS.z },
  ice_maker: { x: 2, z: MACHINE_POS.z },
  dishwasher: { x: 3.24, z: MACHINE_POS.z },
};
const OUTDOOR_TABLE_X: readonly number[] = [-2.5, 2.5, -2.5 - TABLE_PITCH, 2.5 + TABLE_PITCH];
const OUTDOOR_TABLE_Z = 7.8;
/** First expansion column; each expand_area level adds a column of three tables on the indoor rows. */
const EXPANSION_TABLE_X = 6.25;
const EXPANSION_ROWS = 3;
const DECOR_SLOTS: Readonly<Record<DecorKind, readonly Vec2[]>> = {
  plant: [
    { x: -4, z: -4 },
    // The front corners, between the last table row and the front wall.
    { x: 4, z: 5.55 },
    { x: -4, z: 5.55 },
  ],
  painting: [
    { x: -3, z: -4.4 },
    { x: 3, z: -4.4 },
    // Left wall, at the cross aisle between the first two rows.
    { x: -4.4, z: TABLE_ROW_Z + TABLE_ROW_PITCH / 2 },
  ],
  // Pendants over the two inner tables of the middle row; the third (shop level 9) over the first inner table.
  light: [
    { x: -1.5, z: TABLE_ROW_Z + TABLE_ROW_PITCH },
    { x: 1.5, z: TABLE_ROW_Z + TABLE_ROW_PITCH },
    { x: -1.5, z: TABLE_ROW_Z },
  ],
};
const DECOR_UPGRADE: Readonly<Record<DecorKind, UpgradeId>> = { plant: 'plants', painting: 'paintings', light: 'lights' };

function expansionArea(level: number): Area {
  return { minX: INDOOR_AREA.maxX, maxX: 5.5 + 2 * level, minZ: INDOOR_AREA.minZ, maxZ: INDOOR_AREA.maxZ };
}

function outdoorArea(): Area {
  return { minX: -6, maxX: 6, minZ: INDOOR_AREA.maxZ + 0.5, maxZ: 9 };
}

/** Zone of a table, read from its position. */
export function tableZone(pos: Vec2): TableZone {
  if (pos.z > INDOOR_AREA.maxZ) return 'outdoor';
  if (pos.x > INDOOR_AREA.maxX) return 'expansion';
  return 'indoor';
}

/** Spot for the `index`-th table of a zone (0-based within the zone). */
export function zoneTablePosition(zone: TableZone, index: number): Vec2 {
  switch (zone) {
    case 'indoor':
      return tablePosition(index);
    case 'expansion':
      // One column of three tables per expansion level, on the indoor rows so the cross aisles run through.
      return {
        x: EXPANSION_TABLE_X + Math.floor(index / EXPANSION_ROWS) * TABLE_PITCH,
        z: TABLE_ROW_Z + (index % EXPANSION_ROWS) * TABLE_ROW_PITCH,
      };
    case 'outdoor':
      return { x: OUTDOOR_TABLE_X[index % OUTDOOR_TABLE_X.length]!, z: OUTDOOR_TABLE_Z + Math.floor(index / OUTDOOR_TABLE_X.length) };
  }
}

function zoneFor(id: UpgradeId): TableZone {
  if (id === 'outdoor_seating') return 'outdoor';
  if (id === 'expand_area') return 'expansion';
  return 'indoor';
}

/** Adds the tables that one level of a seating upgrade brings, at the next free spots of its zone. */
function addTables(state: GameState, id: UpgradeId): void {
  const seats = getUpgrade(id).effectPerLevel.capacity ?? 0;
  const zone = zoneFor(id);
  let index = state.tables.filter((t) => tableZone(t.pos) === zone).length;
  for (let added = 0; added < seats; added += SEATS_PER_TABLE) {
    const table: Table = {
      id: state.nextId++,
      seats: Math.min(SEATS_PER_TABLE, seats - added),
      cash: 0,
      trash: 0,
      pos: zoneTablePosition(zone, index++),
      occupants: [],
    };
    state.tables.push(table);
  }
}

/**
 * Puts every table on the spot of the current floor plan: the n-th table of
 * a zone, by id, takes the zone's n-th spot. Customers who sit at or head for
 * a table keep their chair side but move onto the current chair offset, even
 * when the table itself does not move (an older save may have used a different
 * offset). Used on load, so saves from an older floor plan get the current one.
 */
export function relayoutTables(state: GameState): void {
  const counts: Record<TableZone, number> = { indoor: 0, expansion: 0, outdoor: 0 };
  for (const t of [...state.tables].sort((a, b) => a.id - b.id)) {
    const zone = tableZone(t.pos);
    const pos = zoneTablePosition(zone, counts[zone]++);
    for (const c of state.customers) {
      if (c.tableId !== t.id || !c.target) continue;
      const chair = { x: pos.x + (c.target.x < t.pos.x ? -CHAIR_OFFSET : CHAIR_OFFSET), z: pos.z };
      const seated = c.pos.x === c.target.x && c.pos.z === c.target.z;
      c.target = chair;
      if (seated) c.pos = { ...chair };
    }
    t.pos = pos;
  }
}

export function upgradeLevel(state: GameState, id: UpgradeId): number {
  return state.upgrades[id] ?? 0;
}

/** Highest level of an upgrade at the shop's level: its maxLevel plus the bonus of shop levels 7..10. */
export function maxUpgradeLevel(state: GameState, id: UpgradeId): number {
  return getUpgrade(id).maxLevel + maxLevelBonus(state.shopLevel, id);
}

/**
 * Price the `level`-th level (from 1) of an upgrade costs at this difficulty,
 * cap aside; levels above the upgrade's maxLevel cost BONUS_LEVEL_PRICE_MULT times more.
 */
export function upgradeLevelPrice(state: GameState, id: UpgradeId, level: number): number {
  const base = getUpgrade(id);
  const price = upgradeCost({ ...base, maxLevel: Infinity }, level - 1, DIFFICULTIES[state.difficulty].priceMult)!;
  return level > base.maxLevel ? price * BONUS_LEVEL_PRICE_MULT : price;
}

/** Price of the next level at this difficulty; null at max level (maxUpgradeLevel). */
export function nextUpgradeCost(state: GameState, id: UpgradeId): number | null {
  const level = upgradeLevel(state, id);
  return level >= maxUpgradeLevel(state, id) ? null : upgradeLevelPrice(state, id, level + 1);
}

/**
 * Raises an upgrade one level without charging for it, adding the tables a
 * seating upgrade brings. Returns the new level. The caller checks the max level.
 */
export function grantUpgradeLevel(state: GameState, id: UpgradeId): number {
  const level = upgradeLevel(state, id) + 1;
  state.upgrades[id] = level;
  if (getUpgrade(id).effectPerLevel.capacity) addTables(state, id);
  return level;
}

export type UpgradeResult = { ok: true; cost: number; level: number } | { ok: false; reason: string };

/**
 * Buys the next level of an upgrade. Upgrades with capacity (seating, and
 * decor such as the window bar) add tables to `state.tables`; rating, appeal and brew speed take effect through the upgrade
 * levels. Refused at max level or when the money does not cover the price.
 */
export function buyUpgrade(state: GameState, id: UpgradeId): UpgradeResult {
  const def = getUpgrade(id);
  const cost = nextUpgradeCost(state, id);
  if (cost === null || state.money < cost) {
    const reason = cost === null ? `${def.name} đã ở cấp tối đa` : `Không đủ tiền mua ${def.name}`;
    state.events.push({ type: 'notify', level: 'error', text: reason });
    return { ok: false, reason };
  }
  state.money -= cost;
  state.today.upgradeCost += cost;
  const level = grantUpgradeLevel(state, id);
  state.events.push({ type: 'spend', kind: 'upgrade', label: `${def.name} lên cấp ${level}`, amount: cost, moneyLeft: state.money });
  return { ok: true, cost, level };
}

/** Share of a level's price given back when the decor is taken down. */
export const DECOR_REFUND_SHARE = 0.5;

/** Decor without seats (plants, paintings, lights) can be taken down; the window bar has tables. */
export function isRemovableDecor(id: UpgradeId): boolean {
  const def = getUpgrade(id);
  return def.category === 'decor' && !def.effectPerLevel.capacity;
}

export type RemoveDecorResult = { ok: true; refund: number; level: number } | { ok: false; reason: string };

/**
 * Takes down one level of a removable decor item and refunds half of what
 * that level cost. Its rating bonus, appeal and layout slot go with the level.
 * Refused for other upgrades or when none is owned.
 */
export function removeDecor(state: GameState, id: UpgradeId): RemoveDecorResult {
  const def = getUpgrade(id);
  const level = upgradeLevel(state, id);
  if (!isRemovableDecor(id) || level <= 0) {
    const reason = !isRemovableDecor(id) ? `Không gỡ được ${def.name}` : `Chưa có ${def.name} để gỡ`;
    state.events.push({ type: 'notify', level: 'error', text: reason });
    return { ok: false, reason };
  }
  const paid = upgradeLevelPrice(state, id, level);
  const refund = Math.round(paid * DECOR_REFUND_SHARE);
  state.upgrades[id] = level - 1;
  state.money += refund;
  state.events.push({ type: 'notify', level: 'info', text: `Đã gỡ ${def.name}, còn cấp ${level - 1}` });
  return { ok: true, refund, level: level - 1 };
}

function decorFor(state: GameState): LayoutDecor[] {
  const out: LayoutDecor[] = [];
  for (const kind of Object.keys(DECOR_SLOTS) as DecorKind[]) {
    const level = upgradeLevel(state, DECOR_UPGRADE[kind]);
    for (const pos of DECOR_SLOTS[kind].slice(0, level)) out.push({ kind, pos: { ...pos } });
  }
  return out;
}

/** Positions of the shop's areas, counter, machines, tables and decor for the renderer. */
export function getShopLayout(state: GameState): ShopLayout {
  const counterLevel = upgradeLevel(state, 'big_counter');
  const quality = upgradeLevel(state, 'better_machine');
  const tier = (id: UpgradeId): number => upgradeTier(id, upgradeLevel(state, id));
  const brewTier = tier('better_machine');
  const machines: LayoutMachine[] = [{ pos: { ...MACHINE_POS }, kind: 'espresso', quality, tier: brewTier }];
  for (let i = 0; i < upgradeLevel(state, 'fast_machine'); i++) {
    machines.push({ pos: { x: MACHINE_POS.x + 1.2 * (i + 1), z: MACHINE_POS.z }, kind: 'fast', quality, tier: brewTier });
  }
  for (const kind of Object.keys(EQUIPMENT_SPOTS) as (keyof typeof EQUIPMENT_SPOTS)[]) {
    const level = upgradeLevel(state, kind);
    if (level > 0) machines.push({ pos: { ...EQUIPMENT_SPOTS[kind] }, kind, quality: level, tier: tier(kind) });
  }
  const expandLevel = upgradeLevel(state, 'expand_area');
  return {
    indoor: { ...INDOOR_AREA },
    expansion: expandLevel > 0 ? expansionArea(expandLevel) : null,
    outdoor: upgradeLevel(state, 'outdoor_seating') > 0 ? outdoorArea() : null,
    door: { ...DOOR_POS },
    pickup: { ...PICKUP_POS },
    counter: {
      pos: { ...COUNTER_POS },
      width: COUNTER_WIDTH + COUNTER_WIDTH_PER_LEVEL * counterLevel,
      level: counterLevel,
      tier: tier('big_counter'),
    },
    machines,
    tables: state.tables.map((t) => ({ id: t.id, pos: { ...t.pos }, seats: t.seats, zone: tableZone(t.pos) })),
    decor: decorFor(state),
    totalSeats: totalSeats(state),
    furnitureTier: tier('tables'),
    outdoorTier: tier('outdoor_seating'),
    decorTier: { plant: tier(DECOR_UPGRADE.plant), painting: tier(DECOR_UPGRADE.painting), light: tier(DECOR_UPGRADE.light) },
    windowBarTier: tier('window_bar'),
  };
}
