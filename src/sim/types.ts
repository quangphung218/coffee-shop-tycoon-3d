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
  | 'milk_tea'
  | 'lemon_tea'
  | 'orange_juice'
  | 'croissant'
  | 'cake';

export type UpgradeId =
  | 'tables'
  | 'better_machine'
  | 'fast_machine'
  | 'big_counter'
  | 'outdoor_seating'
  | 'expand_area'
  | 'plants'
  | 'paintings'
  | 'lights';

export type MarketingId = 'flyers' | 'social_media' | 'influencer' | 'happy_hour';

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
  /** Multiplier bonus on preparation speed (0.2 = 20% faster). */
  brewSpeed?: number;
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
}

export interface InventoryItem {
  id: IngredientId;
  qty: number;
}

export interface MenuEntry {
  id: MenuItemId;
  enabled: boolean;
  /** Current sell price chosen by the player. */
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

export interface Review {
  day: number;
  /** 1..5 */
  stars: number;
  text: string;
  author: string;
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
  /** Orders lost because the item ran out of ingredients. */
  outOfStock: Partial<Record<MenuItemId, number>>;
  ratingStart: number;
  ratingEnd: number;
}

export interface ActiveCampaign {
  id: MarketingId;
  daysLeft: number;
}

export interface GameState {
  shopName: string;
  difficulty: Difficulty;
  /** mulberry32 state, advanced by every random draw. */
  rngState: number;
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
  /** Fractional customers accumulated toward the next arrival. */
  spawnAccumulator: number;
  today: DayStats;
  history: DayStats[];
  reviews: Review[];
  events: GameEvent[];
  /** Next id handed out to customers, staff, tables and orders. */
  nextId: number;
}

export type Command =
  | { type: 'start_day' }
  | { type: 'end_day' }
  | { type: 'next_day' }
  | { type: 'set_menu_item'; itemId: MenuItemId; enabled: boolean }
  | { type: 'set_price'; itemId: MenuItemId; price: number }
  | { type: 'buy_ingredient'; ingredientId: IngredientId; packs: number }
  | { type: 'hire_staff'; candidateId: number; role: StaffRole }
  | { type: 'fire_staff'; staffId: number }
  | { type: 'assign_role'; staffId: number; role: StaffRole }
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
  | { type: 'low_stock'; ingredientId: IngredientId };
