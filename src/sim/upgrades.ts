import { DOOR_POS, PICKUP_POS, totalSeats } from './customers';
import { DIFFICULTIES } from './data/difficulty';
import { getUpgrade, upgradeCost } from './data/upgrades';
import { SEATS_PER_TABLE, tablePosition } from './state';
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

export interface LayoutMachine {
  pos: Vec2;
  kind: 'espresso' | 'fast';
  /** better_machine level: shinier model, better drinks. */
  quality: number;
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
  counter: { pos: Vec2; width: number; level: number };
  machines: LayoutMachine[];
  tables: LayoutTable[];
  decor: LayoutDecor[];
  totalSeats: number;
}

/** The front wall (with the door) is at z = 6. */
export const INDOOR_AREA: Area = { minX: -4.5, maxX: 4.5, minZ: -4.5, maxZ: 6 };
const COUNTER_POS: Vec2 = { x: 0, z: -2 };
const COUNTER_WIDTH = 3;
const COUNTER_WIDTH_PER_LEVEL = 1.5;
const MACHINE_POS: Vec2 = { x: -1, z: -3.3 };
const OUTDOOR_TABLE_X: readonly number[] = [-2.5, 2.5, -4.5, 4.5];
const OUTDOOR_TABLE_Z = 7.8;
const DECOR_SLOTS: Readonly<Record<DecorKind, readonly Vec2[]>> = {
  plant: [
    { x: -4, z: -4 },
    { x: 4, z: 5.4 },
    { x: -4, z: 5.4 },
  ],
  painting: [
    { x: -3, z: -4.4 },
    { x: 3, z: -4.4 },
    { x: -4.4, z: 2 },
  ],
  light: [
    { x: -1, z: 2 },
    { x: 1, z: 4 },
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
      // One column of three tables per expansion level.
      return { x: 6 + Math.floor(index / 3) * 2, z: -1 + (index % 3) * 2.2 };
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

export function upgradeLevel(state: GameState, id: UpgradeId): number {
  return state.upgrades[id] ?? 0;
}

/** Price of the next level at this difficulty; null at max level. */
export function nextUpgradeCost(state: GameState, id: UpgradeId): number | null {
  return upgradeCost(getUpgrade(id), upgradeLevel(state, id), DIFFICULTIES[state.difficulty].priceMult);
}

export type UpgradeResult = { ok: true; cost: number; level: number } | { ok: false; reason: string };

/**
 * Buys the next level of an upgrade. Seating upgrades add tables to
 * `state.tables`; rating, appeal and brew speed take effect through the upgrade
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
  const level = upgradeLevel(state, id) + 1;
  state.upgrades[id] = level;
  if (def.effectPerLevel.capacity) addTables(state, id);
  state.events.push({ type: 'notify', level: 'success', text: `Đã nâng cấp ${def.name} lên cấp ${level}` });
  return { ok: true, cost, level };
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
  const machines: LayoutMachine[] = [{ pos: { ...MACHINE_POS }, kind: 'espresso', quality }];
  for (let i = 0; i < upgradeLevel(state, 'fast_machine'); i++) {
    machines.push({ pos: { x: MACHINE_POS.x + 1.2 * (i + 1), z: MACHINE_POS.z }, kind: 'fast', quality });
  }
  const expandLevel = upgradeLevel(state, 'expand_area');
  return {
    indoor: { ...INDOOR_AREA },
    expansion: expandLevel > 0 ? expansionArea(expandLevel) : null,
    outdoor: upgradeLevel(state, 'outdoor_seating') > 0 ? outdoorArea() : null,
    door: { ...DOOR_POS },
    pickup: { ...PICKUP_POS },
    counter: { pos: { ...COUNTER_POS }, width: COUNTER_WIDTH + COUNTER_WIDTH_PER_LEVEL * counterLevel, level: counterLevel },
    machines,
    tables: state.tables.map((t) => ({ id: t.id, pos: { ...t.pos }, seats: t.seats, zone: tableZone(t.pos) })),
    decor: decorFor(state),
    totalSeats: totalSeats(state),
  };
}
