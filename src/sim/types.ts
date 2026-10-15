/**
 * Coffee Shop Tycoon 3D — shared game types.
 *
 * Architecture:
 * - src/sim is the pure TypeScript core: deterministic, never imports the DOM
 *   or three. GameState is plain JSON (no classes, Maps or functions) so it can
 *   be saved, cloned and compared directly.
 * - The seeded RNG state lives inside GameState (`rngState`), so the same state
 *   plus the same commands always produces the same day.
 * - The core exposes `step(state, dtMinutes)` to advance game time and
 *   `dispatch(state, cmd)` to apply player commands.
 * - The sim pushes GameEvents into `state.events` (doorbell, brew, cash,
 *   notify, angry, served, cleaned…). Render, UI and audio read them and then
 *   clear the queue once per frame.
 * - src/render (three) only reads state. src/ui (DOM) reads state and sends
 *   Commands. src/audio plays sounds in response to events.
 *
 * Money is stored as integer đồng (25000 = 25.000đ). Time is game minutes
 * since midnight (420 = 07:00).
 */

export type Difficulty = 'easy' | 'normal' | 'hard';

export type Phase = 'preparation' | 'opening' | 'peak' | 'closing' | 'report';

/** Rolled once per day; shifts arrivals and the hot/cold drink mix. */
export type Weather = 'sunny' | 'rainy' | 'hot';

/** Ground-plane position in world units (y is up in the renderer). */
export interface Vec2 {
  x: number;
  z: number;
}

export type IngredientId =
  | 'coffee_beans'
  | 'milk'
  | 'sugar'
  | 'cacao'
  | 'tea'
  | 'pearls'
  | 'lemon'
  | 'orange'
  | 'flour'
  | 'butter'
  | 'ice'
  | 'cup';

export type MenuItemId =
  | 'espresso'
  | 'americano'
  | 'latte'
  | 'cappuccino'
  | 'mocha'
  | 'frappe'
  | 'milk_tea'
  | 'lemon_tea'
  | 'orange_juice'
  | 'croissant'
  | 'cake';

/** Equipment upgrades, a subset of UpgradeId that a shop level unlocks as `tools`. */
export type ToolId = 'grinder' | 'pastry_case' | 'blender' | 'ice_maker' | 'dishwasher';

export type UpgradeId =
  | 'tables'
  | 'better_machine'
  | 'fast_machine'
  | 'big_counter'
  | 'outdoor_seating'
  | 'expand_area'
  | 'plants'
  | 'paintings'
  | 'lights'
  | 'window_bar'
  | ToolId;

export type MarketingId = 'flyers' | 'social_media' | 'influencer' | 'happy_hour';

/** Menu items, upgrades and tools a shop level makes available. */
export interface Unlocks {
  menu: MenuItemId[];
  upgrades: UpgradeId[];
  tools: ToolId[];
}

export interface LevelDef {
  /** 1..MAX_SHOP_LEVEL. */
  level: number;
  name: string;
  /** Cumulative XP needed to reach this level (0 for level 1). */
  xpToReach: number;
  /** What this level newly unlocks. */
  unlocks: Unlocks;
}

export type MissionId =
  | 'serve_customers'
  | 'no_stockout_loss'
  | 'food_cost'
  | 'sell_food'
  | 'end_rating'
  | 'low_abandon';

export type MissionStatus = 'active' | 'completed' | 'failed';

/** One of today's three daily missions. */
export interface Mission {
  id: MissionId;
  /** Goal value: customers, cups, a 1..5 rating or a 0..100 percentage, by mission. */
  target: number;
  /** Measured value toward the goal, filled in when the day is scored. */
  progress: number;
  rewardXp: number;
  rewardMoney: number;
  status: MissionStatus;
}

export interface IngredientDef {
  id: IngredientId;
  name: string;
  icon: string;
  /** Display unit for quantities, e.g. 'g', 'ml', 'quả'. */
  unit: string;
  /** Price in đồng for one unit. */
  unitPrice: number;
  /** Units bought per purchase. */
  packSize: number;
  /** Below this many units the UI warns about low stock. */
  lowStock: number;
}

export interface IngredientAmount {
  id: IngredientId;
  qty: number;
}

export interface MenuItemDef {
  id: MenuItemId;
  name: string;
  icon: string;
  category: 'drink' | 'food';
  /** Default sell price in đồng. */
  price: number;
  /** Ingredient cost in đồng, derived from `ingredients`. */
  cost: number;
  /** Preparation time in game minutes at brewSpeed 1. */
  prepMinutes: number;
  ingredients: IngredientAmount[];
  temperature: 'hot' | 'cold';
  /** Relative order weight, 0..1. */
  popularity: number;
}

export interface UpgradeEffect {
  /** Extra seats. */
  capacity?: number;
  /** Added to the star rating of each served order. */
  ratingBonus?: number;
  /** Multiplier bonus on arriving customers (0.1 = +10%). */
  appeal?: number;
  /** Multiplier bonus on preparation speed of every item (0.2 = 20% faster). */
  brewSpeed?: number;
  /** Extra brew-speed bonus for coffee drinks (grinder). */
  coffeeBrewSpeed?: number;
  /** Extra brew-speed bonus for cold drinks (blender). */
  coldBrewSpeed?: number;
  /** Extra brew-speed bonus for food items (pastry case). */
  foodBrewSpeed?: number;
  /** Multiplier bonus on how often customers order food (0.3 = +30%, pastry case). */
  foodAppeal?: number;
  /** Multiplier bonus on table-cleaning speed (0.4 = 40% faster, dishwasher). */
  cleanSpeed?: number;
  /** Fraction knocked off the price of ice, buying and brewing (0.6 = −60%, ice maker). Clamped to 0.9. */
  iceCostReduction?: number;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  description: string;
  category: 'equipment' | 'space' | 'decor';
  maxLevel: number;
  /** Price of level 1 in đồng. */
  baseCost: number;
  /** Price multiplier for each further level. */
  costGrowth: number;
  /** Effect added per level owned. */
  effectPerLevel: UpgradeEffect;
}

export interface MarketingDef {
  id: MarketingId;
  name: string;
  icon: string;
  description: string;
  cost: number;
  days: number;
  /** Multiplier on customer arrivals while active. */
  customerMult: number;
}

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  startMoney: number;
  /** Multiplier on customer arrival rate. */
  customerMult: number;
  /** Multiplier on customer patience. */
  patienceMult: number;
  /** Multiplier on ingredient, upgrade and wage prices. */
  priceMult: number;
  startRating: number;
  /** Multiplier on all XP earned, so the shop levels up faster on Easy and slower on Hard. */
  xpMult: number;
}

export interface InventoryItem {
  id: IngredientId;
  qty: number;
}

export interface MenuEntry {
  id: MenuItemId;
  enabled: boolean;
  /** Sell price, copied from the item's default price. */
  price: number;
}

export type CustomerState =
  | 'entering'
  | 'queueing'
  | 'ordering'
  | 'waiting'
  | 'drinking'
  | 'paying'
  | 'leaving'
  | 'angry_leave';

/** Customer personality, chosen by a hash of the seed and the customer id. */
export type PersonaId = 'office' | 'student' | 'regular' | 'connoisseur' | 'family';

export interface Customer {
  id: number;
  state: CustomerState;
  pos: Vec2;
  target: Vec2 | null;
  /** Remaining patience in game minutes. */
  patience: number;
  maxPatience: number;
  order: MenuItemId | null;
  tableId: number | null;
  /** Minutes left in the current state (drinking, paying…). */
  timer: number;
  /** Visual variant picked at spawn (outfit color etc.). */
  look: number;
  /** Personality that shapes the order, patience and review. Absent (old saves) = neutral. */
  persona?: PersonaId;
  /** Food ordered alongside the drink; absent when the customer orders no food. */
  extraItem?: MenuItemId;
  /** Game minute the customer came through the door; used to measure wait time. Absent in old saves. */
  arrivedMinute?: number;
}

export type StaffRole = 'barista' | 'server' | 'cleaner' | 'marketer' | 'none';

export type StaffTaskKind = 'brew' | 'take_order' | 'serve' | 'clean' | 'collect' | 'promote' | 'idle';

export interface StaffTask {
  kind: StaffTaskKind;
  /** Customer or table id the task refers to. */
  targetId: number | null;
  /** Minutes left until the task completes. */
  remaining: number;
}

export interface Staff {
  id: number;
  name: string;
  role: StaffRole;
  wagePerDay: number;
  /** Work speed multiplier, 1 = average. */
  speed: number;
  busy: boolean;
  task: StaffTask | null;
  pos: Vec2;
  look: number;
}

export interface Table {
  id: number;
  seats: number;
  /** Unpaid money left on the table, in đồng. */
  cash: number;
  /** Dirty cups/plates, 0 = clean. */
  trash: number;
  pos: Vec2;
  /** Customer ids currently seated. */
  occupants: number[];
}

export type OrderStatus = 'pending' | 'brewing' | 'ready' | 'delivered';

/** An order waiting at the counter or being prepared. */
export interface Order {
  id: number;
  customerId: number;
  itemId: MenuItemId;
  status: OrderStatus;
  /** Minutes of preparation left; 0 = ready to serve. */
  remaining: number;
  staffId: number | null;
}

/** Main thing a customer liked or disliked. */
export type ReviewReason = 'fast_service' | 'tasty' | 'nice_decor' | 'long_wait' | 'out_of_stock' | 'dirty_table';

export interface Review {
  day: number;
  /** 1..5 */
  stars: number;
  text: string;
  author: string;
  reason?: ReviewReason;
}

export interface DayStats {
  day: number;
  revenue: number;
  ingredientCost: number;
  wages: number;
  marketingCost: number;
  upgradeCost: number;
  customersArrived: number;
  customersServed: number;
  /** Customers who left angry (out of patience or out of stock). */
  customersLost: number;
  sold: Partial<Record<MenuItemId, number>>;
  /**
   * Base-price cost of every serving taken out of stock today, including
   * drinks made for customers who left before getting them. Absent in old saves.
   */
  ingredientsUsed?: number;
  /** Orders lost because the item ran out of ingredients. */
  outOfStock: Partial<Record<MenuItemId, number>>;
  ratingStart: number;
  ratingEnd: number;
  /** Sum over served customers of the share of patience spent waiting for the drink (0..1 each). */
  waitShareSum?: number;
  /** Takeaway customers who could not sit because the free seats were dirty. */
  dirtyTableHits?: number;
  /** Arrivals bucketed by hour of day (index 0..23). Absent in old saves. */
  arrivalsByHour?: number[];
  /** Revenue recognised bucketed by hour of day (index 0..23). Absent in old saves. */
  revenueByHour?: number[];
  /** Sum of wait minutes from joining the line to getting the drink, over served customers. Absent in old saves. */
  waitMinutesSum?: number;
  /** Count of served customers folded into waitMinutesSum. Absent in old saves. */
  waitCount?: number;
  /** Seat-minutes used in opening hours: occupied seats summed once per open minute. Absent in old saves. */
  seatMinutesUsed?: number;
  /** Base-price ingredient cost of servings made for customers who then left; a subset of ingredientsUsed. Absent in old saves. */
  wasteCost?: number;
  /** Revenue per menu item sold, in đồng. Absent in old saves. */
  soldRevenue?: Partial<Record<MenuItemId, number>>;
}

export type SuggestionKind = 'restock' | 'hire_barista' | 'hire_server' | 'hire_cleaner' | 'marketing' | 'upgrade';

export interface Suggestion {
  kind: SuggestionKind;
  text: string;
}

/** How a management metric is doing against its F&B benchmark. */
export type InsightStatus = 'good' | 'watch' | 'bad';

/** UI panel an insight's advice points the player at. */
export type InsightPanel = 'menu' | 'staff' | 'upgrades' | 'inventory' | 'marketing';

export type MetricId =
  | 'food_cost'
  | 'labor_cost'
  | 'prime_cost'
  | 'aov'
  | 'seat_fill'
  | 'avg_wait'
  | 'waste'
  | 'peak_hour'
  | 'abandon_rate';

/** One management figure for the day with its benchmark status and an action hint. */
export interface InsightMetric {
  id: MetricId;
  /** Value in the metric's unit (pct, minutes, đồng, hour), or null when it cannot be computed. */
  value: number | null;
  /** Benchmark status, or null for informational metrics and uncomputable values. */
  status: InsightStatus | null;
  /** Action hint shown when the status is watch or bad; empty string otherwise. */
  advice: string;
  /** Panel the UI should open to act on the advice, when there is one. */
  panel?: InsightPanel;
}

/** Gross margin of one menu item at today's prices. */
export interface ItemMargin {
  id: MenuItemId;
  /** Sell price minus ingredient cost of one serving, in đồng. */
  grossProfit: number;
  /** grossProfit / price as a 0..100 percentage (0 when the price is 0). */
  marginPct: number;
  status: InsightStatus;
}

/** Profit of one menu item sold today: price, cost and how many sold. */
export interface ItemProfit {
  id: MenuItemId;
  /** Servings sold today. */
  qty: number;
  /** Sell price per serving, in đồng. */
  price: number;
  /** Ingredient cost per serving at today's prices, in đồng. */
  cost: number;
  /** (price − cost) / price as a 0..100 percentage (0 when the price is 0). */
  marginPct: number;
  /** Day gross profit for the item: (price − cost) × qty, in đồng. */
  grossProfit: number;
  status: InsightStatus;
}

/** Business insights derived from a day's stats; attached to the daily report. */
export interface Insights {
  metrics: InsightMetric[];
  /** Day gross profit: revenue − COGS, in đồng; null without revenue. */
  grossProfit: number | null;
  /** Gross margin per enabled menu item, in menu order. */
  itemMargins: ItemMargin[];
  /** Profit per item sold today, highest day gross profit first. */
  itemProfits: ItemProfit[];
  /** Arrivals bucketed by hour of day (index 0..23). Absent when the save lacks the hourly stat. */
  arrivalsByHour?: number[];
}

/** End-of-day summary shown on the Daily Report screen. */
export interface DailyReport {
  day: number;
  revenue: number;
  ingredientCost: number;
  wages: number;
  marketingCost: number;
  /** revenue − ingredientCost − wages − marketingCost. */
  profit: number;
  money: number;
  customersArrived: number;
  customersServed: number;
  customersLost: number;
  /** Best sellers, most sold first. */
  topSellers: { id: MenuItemId; qty: number }[];
  /** Items that ran out today or cannot be made with the stock left. */
  outOfStock: MenuItemId[];
  ratingStart: number;
  ratingEnd: number;
  /** Today's reviews, newest last. */
  reviews: Review[];
  suggestions: Suggestion[];
  /** Management insights for the day; absent when built from a save without the extra day stats. */
  insights?: Insights;
  /** Today's daily missions with their final progress and status. */
  missions?: Mission[];
  /** XP earned today from service, 4–5 star reviews and completed missions. */
  xpGained?: number;
  /** Set when the shop reached a new level at the end of today. */
  levelUp?: { level: number; unlocks: Unlocks };
}

export interface ActiveCampaign {
  id: MarketingId;
  daysLeft: number;
}

export interface GameState {
  shopName: string;
  difficulty: Difficulty;
  /** Original seed the game started from; daily missions hash from it, never from rngState. */
  seed: number;
  /** mulberry32 state, advanced by every random draw. */
  rngState: number;
  /** Shop level, 1..MAX_SHOP_LEVEL; gates which menu items and upgrades are available. */
  shopLevel: number;
  /** Total experience earned so far; the level follows from it. */
  xp: number;
  /** Today's three daily missions, rolled from the seed and the day. */
  missions: Mission[];
  day: number;
  /** Game minutes since midnight. */
  minute: number;
  phase: Phase;
  weather: Weather;
  /** Fraction of a game minute carried toward the next fixed tick (render interpolation alpha). */
  tickAccumulator: number;
  paused: boolean;
  /** Game speed multiplier chosen by the player (1, 2 or 4). */
  speed: number;
  money: number;
  /** Shop rating, 0..5 stars. */
  rating: number;
  menu: MenuEntry[];
  inventory: InventoryItem[];
  customers: Customer[];
  staff: Staff[];
  /** People available to hire today. */
  candidates: Staff[];
  tables: Table[];
  orders: Order[];
  /** Work queued by the player when serving alone; only the head task progresses. */
  playerTasks: StaffTask[];
  upgrades: Partial<Record<UpgradeId, number>>;
  campaigns: ActiveCampaign[];
  /** Roles are set every morning from yesterday's bottleneck; manual role changes are off. */
  autoAssign?: boolean;
  /** Fractional customers accumulated toward the next arrival. */
  spawnAccumulator: number;
  today: DayStats;
  history: DayStats[];
  reviews: Review[];
  /** Report of the last finished day; absent before the first day ends. */
  lastReport?: DailyReport | null;
  events: GameEvent[];
  /** Next id handed out to customers, staff, tables and orders. */
  nextId: number;
}

export type Command =
  | { type: 'start_day' }
  | { type: 'end_day' }
  | { type: 'next_day' }
  | { type: 'set_menu_item'; itemId: MenuItemId; enabled: boolean }
  | { type: 'buy_ingredient'; ingredientId: IngredientId; packs: number }
  | { type: 'apply_restock' }
  | { type: 'hire_staff'; candidateId: number; role: StaffRole }
  | { type: 'fire_staff'; staffId: number }
  | { type: 'assign_role'; staffId: number; role: StaffRole }
  | { type: 'set_auto_assign'; enabled: boolean }
  | { type: 'buy_upgrade'; upgradeId: UpgradeId }
  | { type: 'start_campaign'; campaignId: MarketingId }
  | { type: 'set_speed'; speed: number }
  | { type: 'set_paused'; paused: boolean }
  | { type: 'take_order'; customerId: number }
  | { type: 'brew'; orderId: number }
  | { type: 'deliver'; orderId: number }
  | { type: 'collect_cash'; tableId: number }
  | { type: 'clean_table'; tableId: number };

export type NotifyLevel = 'info' | 'success' | 'warning' | 'error';

export type GameEvent =
  | { type: 'doorbell'; customerId: number }
  | { type: 'brew'; staffId: number | null; itemId: MenuItemId }
  | { type: 'cash'; amount: number; pos: Vec2 }
  | { type: 'notify'; level: NotifyLevel; text: string }
  | { type: 'angry'; customerId: number }
  | { type: 'served'; customerId: number; itemId: MenuItemId }
  | { type: 'cleaned'; tableId: number }
  | { type: 'phase'; phase: Phase }
  | { type: 'review'; review: Review }
  | { type: 'low_stock'; ingredientId: IngredientId }
  | { type: 'level_up'; level: number; unlocks: Unlocks }
  /** The daily report is in `state.lastReport`; the UI autosaves on this. */
  | { type: 'dayEnded'; day: number };
