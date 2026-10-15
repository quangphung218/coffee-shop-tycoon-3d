import { DIFFICULTIES } from './data/difficulty';
import { INGREDIENTS } from './data/ingredients';
import { MENU } from './data/menu';
import { STAFF_NAMES } from './data/staffNames';
import { rollMissions } from './progression';
import { normalizeSeed, pick, randInt, randRange, type RngHolder } from './rng';
import type { DayStats, Difficulty, GameState, IngredientId, MenuItemId, Staff, Table } from './types';

/** 07:00 */
export const DAY_START_MINUTE = 7 * 60;
/** 21:00 */
export const DAY_END_MINUTE = 21 * 60;

export const STARTING_TABLES = 3;
export const SEATS_PER_TABLE = 2;
export const CANDIDATE_COUNT = 3;
const BASE_WAGE = 150000;

/** Items on the menu on day 1; the rest can be enabled once stocked. */
const STARTER_MENU: readonly MenuItemId[] = ['espresso', 'americano', 'latte', 'lemon_tea'];

/** Day-1 stock, enough for a slow first morning. */
const STARTER_STOCK: Partial<Record<IngredientId, number>> = {
  coffee_beans: 500,
  milk: 2000,
  sugar: 1000,
  tea: 100,
  lemon: 10,
  ice: 5000,
  cup: 50,
};

export function createDayStats(day: number, rating: number): DayStats {
  return {
    day,
    revenue: 0,
    ingredientCost: 0,
    wages: 0,
    marketingCost: 0,
    upgradeCost: 0,
    customersArrived: 0,
    customersServed: 0,
    customersLost: 0,
    sold: {},
    outOfStock: {},
    ratingStart: rating,
    ratingEnd: rating,
    arrivalsByHour: new Array(24).fill(0),
    revenueByHour: new Array(24).fill(0),
    waitMinutesSum: 0,
    waitCount: 0,
    seatMinutesUsed: 0,
    wasteCost: 0,
    soldRevenue: {},
  };
}

/** Centre-to-centre distance of two neighbouring tables in a block. Table spots sit on the nav grid. */
export const TABLE_PITCH = 2;
/** Indoor table columns in fill order: inner then outer, left then right of the main aisle (x = 0) from the door to the counter. */
const TABLE_COLUMN_X: readonly number[] = [-1.5, 1.5, -1.5 - TABLE_PITCH, 1.5 + TABLE_PITCH];
/** Table rows from the counter toward the door, with a cross aisle between two rows. */
export const TABLE_ROW_Z = 0.75;
export const TABLE_ROW_PITCH = 2;

export function tablePosition(index: number): { x: number; z: number } {
  // Two blocks of two columns on either side of the main aisle, filled row by row.
  const columns = TABLE_COLUMN_X.length;
  return { x: TABLE_COLUMN_X[index % columns]!, z: TABLE_ROW_Z + Math.floor(index / columns) * TABLE_ROW_PITCH };
}

/** Hire candidates with random names, speed and matching wage. Advances the RNG. */
export function generateCandidates(rng: RngHolder, firstId: number, count: number, priceMult: number): Staff[] {
  const out: Staff[] = [];
  for (let i = 0; i < count; i++) {
    const speed = Math.round(randRange(rng, 0.8, 1.3) * 100) / 100;
    out.push({
      id: firstId + i,
      name: pick(rng, STAFF_NAMES),
      role: 'none',
      wagePerDay: Math.round((BASE_WAGE * speed * priceMult) / 10000) * 10000,
      speed,
      busy: false,
      task: null,
      pos: { x: 0, z: -3 },
      look: randInt(rng, 0, 7),
    });
  }
  return out;
}

export function createNewGame(shopName: string, difficulty: Difficulty, seed: number): GameState {
  const diff = DIFFICULTIES[difficulty];
  const normSeed = normalizeSeed(seed);
  const rng: RngHolder = { rngState: normSeed };
  let nextId = 1;

  const tables: Table[] = [];
  for (let i = 0; i < STARTING_TABLES; i++) {
    tables.push({ id: nextId++, seats: SEATS_PER_TABLE, cash: 0, trash: 0, pos: tablePosition(i), occupants: [] });
  }

  const candidates = generateCandidates(rng, nextId, CANDIDATE_COUNT, diff.priceMult);
  nextId += candidates.length;

  const name = shopName.trim() || 'Quán của tôi';

  return {
    shopName: name,
    difficulty,
    seed: normSeed,
    rngState: rng.rngState,
    shopLevel: 1,
    xp: 0,
    missions: rollMissions(normSeed, 1, 1),
    day: 1,
    minute: DAY_START_MINUTE,
    phase: 'preparation',
    // Day 1 is always sunny; later days roll the weather in startNextDay.
    weather: 'sunny',
    tickAccumulator: 0,
    paused: false,
    speed: 1,
    money: diff.startMoney,
    rating: diff.startRating,
    menu: MENU.map((m) => ({ id: m.id, enabled: STARTER_MENU.includes(m.id), price: m.price })),
    inventory: INGREDIENTS.map((i) => ({ id: i.id, qty: STARTER_STOCK[i.id] ?? 0 })),
    customers: [],
    staff: [],
    candidates,
    tables,
    orders: [],
    playerTasks: [],
    upgrades: {},
    campaigns: [],
    spawnAccumulator: 0,
    today: createDayStats(1, diff.startRating),
    history: [],
    reviews: [],
    events: [],
    nextId,
  };
}
