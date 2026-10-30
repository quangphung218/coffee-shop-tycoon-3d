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
  | 'cake'
  | 'cold_brew'
  | 'cookie';

/** Equipment upgrades, a subset of UpgradeId that a shop level unlocks as `tools`. */
export type ToolId = 'grinder' | 'pastry_case' | 'blender' | 'ice_maker' | 'dishwasher' | 'cold_brew_tower' | 'oven';

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
  | 'neon_sign'
  | 'bookshelf'
  | 'record_player'
  | 'sofa_corner'
  | 'chandelier'
  | 'marble_tables'
  | 'art_gallery'
  | 'grand_piano'
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
  /** Multiplier bonus on every sell price (0.04 = customers pay 4% more), on top of the price policy. */
  priceBonus?: number;
}

/**
 * A level above an upgrade's maxLevel: the shop level that opens it, its price
 * at normal difficulty and what it adds. Shop levels 4..10 open them; see
 * docs/spec/p27-retention.md.
 */
export interface ExtraUpgradeLevel {
  shopLevel: number;
  cost: number;
  effect: UpgradeEffect;
  /** Loyalty tickets ('Tem') the level costs on top of the money; absent = none. */
  tickets?: number;
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
  /** Loyalty tickets ('Tem') each level costs on top of the money, by level from 1 (index 0); absent = none. */
  ticketCost?: number[];
  /** Levels maxLevel+1, maxLevel+2… in order, each opened by a shop level (ascending); absent = none. */
  extraLevels?: ExtraUpgradeLevel[];
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

/** Part of the shop a style changes, see `src/sim/data/styles.ts`. */
export type StyleSlot = 'wall' | 'floor' | 'sign' | 'awning';

/** Shop styles: looks only, never read by the stars, customers or economy. */
export interface ShopStyles {
  /** Style id chosen per slot; a missing slot shows its default. */
  chosen: Partial<Record<StyleSlot, string>>;
  /** Style ids bought; defaults are owned without being listed. */
  owned: string[];
  /** Challenge-gated style ids a completed weekly challenge unlocked. */
  unlocked: string[];
}

/** Team uniform id, see `src/sim/data/uniforms.ts`. */
export type UniformId = 'classic' | 'mint' | 'latte' | 'coral';

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
  /** Regular who pays out tickets when served. Absent (old saves) = not a VIP. */
  vip?: boolean;
  /** Named regular (`REGULARS` id) this customer is; absent for anonymous customers and old saves. */
  regularId?: string;
}

/** How often a named regular has come in. */
export interface RegularVisits {
  visits: number;
  /** Game day of the first and the latest visit. */
  firstDay: number;
  lastDay: number;
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

/** Staff perk, chosen by a hash of the seed and the staff id (never from rngState). */
export type StaffTraitId = 'quick' | 'barista_pro' | 'tidy' | 'charming';

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
  /** Perk of this staff member. Absent (old saves) = no perk. */
  trait?: StaffTraitId;
  /** Skill level, 1..5. Absent (old saves) = 1. */
  level?: number;
  /** Experience toward the next level. Absent (old saves) = 0. */
  exp?: number;
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
  /**
   * Wages owed to staff fired after the doors opened today (wage policy
   * applied), paid with the others at the end of the day. Absent in old saves.
   */
  firedWages?: number;
  marketingCost: number;
  /** Shop rent paid at the end of the day (dailyRent). Absent in days closed before rent existed. */
  rent?: number;
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
  /**
   * Orders an item missed while it could not be made: each customer who
   * picked among the items in stock adds the item's share of the full menu
   * weight, and the item picked loses that total (so it can be negative).
   * Absent in old saves.
   */
  missedDemand?: Partial<Record<MenuItemId, number>>;
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
  /** Named regulars served today (the regular_visits challenge). Absent until the first one. */
  regularsServed?: number;
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
  /** Rent paid tonight; absent in reports saved before rent existed. */
  rent?: number;
  /** Rent the next day will pay at its close, shown ahead of time; absent in old reports. */
  rentNext?: number;
  /** revenue − ingredientCost − wages − marketingCost − rent. */
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
  /** Today's special order with its final progress and status; absent when there was none. */
  specialOrder?: SpecialOrder;
  /** Achievement tiers reached at the end of today; absent when none. */
  achievements?: { id: AchievementId; tier: number }[];
}

export type AchievementId = 'served' | 'revenue' | 'five_star' | 'perfect_day' | 'three_cups' | 'staff_master';

/** Daily gift, lifetime counters and achievements; absent in older saves (ensureRetention fills defaults). */
export interface RetentionState {
  /** Loyalty tickets ('Tem'), the side currency. */
  tickets: number;
  login: {
    /** Local date key 'YYYY-MM-DD' of the last gift claimed, sent by the UI; null before the first. */
    lastDate: string | null;
    /** Consecutive days with a gift claimed. */
    streak: number;
    /** Gifts claimed in total. */
    claimed: number;
  };
  lifetime: { served: number; revenue: number; fiveStar: number; perfectDays: number; threeCupWeeks: number };
  /** Highest tier reached per achievement. */
  achievements: Partial<Record<AchievementId, number>>;
}

/** A one-day order: serve `target` of an item before `byMinute` for a reward. */
export interface SpecialOrder {
  itemId: MenuItemId;
  target: number;
  /** Game minute the order is due by. */
  byMinute: number;
  progress: number;
  rewardTickets: number;
  rewardMoney: number;
  status: 'active' | 'completed' | 'failed';
}

/** Event of a week day; shifts arrivals or ingredient prices (DAY_EVENTS in src/sim/data/week.ts). */
export type DayEventId = 'none' | 'grand_opening' | 'fair' | 'supplier_hike';

/** Weather and event planned for one day of the week. */
export interface DayPlan {
  /** Day of the week, 1..7. */
  day: number;
  weather: Weather;
  event: DayEventId;
}

/**
 * The current 7-day week of play. The game goes on week after week; in week 1
 * menu items and upgrades also open by its calendar (src/sim/data/week.ts).
 */
export interface WeekState {
  length: 7;
  /** Which week this is, from 1. */
  index: number;
  /** Game day the week began on; week day 1 is this day. */
  startedDay: number;
  /** Weather and event of each week day, rolled from the seed and the index (rollWeekPlan). */
  plan: DayPlan[];
  /** What the week is scored against (weekGoal by difficulty and index). */
  goal: WeekGoal;
  /** Score of the week just finished; set when week day 7 closes, cleared when next_day starts the next week. */
  result?: WeekResult;
  /** One row per finished week, oldest first. */
  archive?: WeekSummary[];
  /**
   * Side challenge of the week (rollWeekChallenge), from CHALLENGE_FIRST_WEEK.
   * Absent before it and in the week a save from before E-16 was loaded in.
   */
  challenge?: WeekChallenge;
}

/** Templates of the weekly side challenge (WEEK_CHALLENGES in src/sim/data/challenges.ts). */
export type WeekChallengeId = 'regular_visits' | 'stars_week' | 'sell_item' | 'calm_day' | 'served_week' | 'perfect_days';

/** Something a challenge unlocks besides Tem: a shop style (`STYLES` id in src/sim/data/styles.ts) that can then be bought. */
export interface ChallengeUnlock {
  kind: 'decor';
  /** `StyleDef.id` of the style it unlocks. */
  id: string;
}

/** What a challenge pays once on completion. Tem only, no new currency. */
export interface ChallengeReward {
  tickets: number;
  unlock?: ChallengeUnlock;
}

/** The side challenge of a week: what to reach, how far it got, what it pays. */
export interface WeekChallenge {
  id: WeekChallengeId;
  target: number;
  /** sell_item: the menu item to sell. */
  itemId?: MenuItemId;
  reward: ChallengeReward;
  /** Value reached over the days of the week closed so far. */
  progress: number;
  /** Last game day folded into `progress`; 0 before the first close. */
  settledDay: number;
  /** 'failed' only for stars_week once a day closes below the stars. */
  status: 'active' | 'completed' | 'failed';
}

/** Totals of a finished week, kept in `WeekState.archive` for week-over-week stats. */
export interface WeekSummary {
  index: number;
  startedDay: number;
  revenue: number;
  /** Sum of the daily profits (revenue less ingredients, wages and marketing). */
  profit: number;
  customersServed: number;
  stars: number;
  score: number;
  cups: number;
  /**
   * Upgrade spending the week's score counted (weekUpgradeCharge). Absent on
   * weeks scored before upgrades were spread over weeks (week 1 before E-11,
   * later weeks before E-07): those paid their own upgrades in full, so none
   * of it carries on.
   */
  upgradeCharge?: number;
}

/** Targets of a week: total revenue over its 7 days and the rating at the end. */
export interface WeekGoal {
  revenue: number;
  stars: number;
}

/** End-of-week scoring (scoreWeek in src/sim/week.ts). */
export interface WeekResult {
  revenue: number;
  revenueTarget: number;
  /** Shop rating at the end of week day 7. */
  stars: number;
  starsTarget: number;
  /**
   * Week profit (weekProfit) and its target. Absent on weeks scored before
   * profit counted (v4 saves and older): their score and cups stay as stored.
   */
  profit?: number;
  profitTarget?: number;
  /** 0..100: 25 for the revenue share of the target, 55 for the profit share, 20 for the stars share (weekScore). */
  score: number;
  /** 0..3 cups from the score. */
  cups: number;
  /**
   * Cash the cups paid into `money` when the week closed (0 when too few cups).
   * Absent on weeks scored before the reward was paid (v2 saves): nothing was paid.
   */
  reward?: number;
  /** One row per week day, day 1 first (`day` is the week day). */
  days: { day: number; revenue: number; customersServed: number; weather: Weather; event: DayEventId }[];
}

/** Trade-off decisions the player sets (effects in src/sim/policies.ts). */
export type PolicyId = 'price' | 'wage';

export type PolicyLevel = 'low' | 'standard' | 'high';

export type Policies = Record<PolicyId, PolicyLevel>;

export interface ActiveCampaign {
  id: MarketingId;
  daysLeft: number;
}

export interface GameState {
  /**
   * Which run (one game from Ván mới or Chơi lại) this state belongs to, so
   * the autosave of this run is told from another's. Set by the UI when the
   * run starts; a save without one gets it from the seed and shop name.
   */
  runId?: string;
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
  /** Consecutive closed days that ended with the money past the debt limit; 0 once a day ends within it. */
  debtDays: number;
  /** Set when debtDays reached BANKRUPT_DAYS; the run is over and stays so. */
  bankrupt: boolean;
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
  /** Finished days, oldest first; only the last HISTORY_DAYS are kept (older weeks live in `week.archive`). */
  history: DayStats[];
  reviews: Review[];
  /** Report of the last finished day; absent before the first day ends. */
  lastReport?: DailyReport | null;
  /** The current week of a new game; absent in older saves, which unlock by shop level only. */
  week?: WeekState;
  /** Price and wage decisions; absent (older saves) = standard. */
  policies?: Policies;
  /** Daily gift, lifetime counters and achievements; absent in older saves. */
  retention?: RetentionState;
  /** Today's special order; absent or null when there is none. */
  specialOrder?: SpecialOrder | null;
  /** Visits per named regular id; absent in older saves and before the first regular comes in. */
  regulars?: Record<string, RegularVisits>;
  /** Team uniform (`UNIFORMS` id); absent in older saves = 'classic'. Looks only. */
  uniform?: UniformId;
  /** Shop styles (wall, floor, sign, awning); absent in older saves = every slot on its default. Looks only. */
  styles?: ShopStyles;
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
  | { type: 'remove_decor'; upgradeId: UpgradeId }
  | { type: 'set_policy'; policy: PolicyId; level: PolicyLevel }
  | { type: 'start_campaign'; campaignId: MarketingId }
  | { type: 'set_speed'; speed: number }
  | { type: 'set_paused'; paused: boolean }
  | { type: 'take_order'; customerId: number }
  | { type: 'brew'; orderId: number }
  | { type: 'deliver'; orderId: number }
  | { type: 'collect_cash'; tableId: number }
  | { type: 'clean_table'; tableId: number }
  | { type: 'train_staff'; staffId: number }
  /** Any phase; refused with a notify when the uniform is locked at this shop level or unknown. */
  | { type: 'set_uniform'; uniformId: UniformId }
  /** Any phase; pays the style's money and Tem once and wears it. Refused when locked, owned or unaffordable. */
  | { type: 'buy_style'; styleId: string }
  /** Any phase; wears a style already owned (or a default). */
  | { type: 'select_style'; styleId: string }
  /** `dateKey` is the player's local date 'YYYY-MM-DD'; the sim only compares keys. */
  | { type: 'claim_daily_gift'; dateKey: string };

export type NotifyLevel = 'info' | 'success' | 'warning' | 'error';

export type SpendKind = 'restock' | 'upgrade' | 'campaign';

export type GameEvent =
  | { type: 'doorbell'; customerId: number }
  | { type: 'brew'; staffId: number | null; itemId: MenuItemId }
  | { type: 'cash'; amount: number; pos: Vec2 }
  | { type: 'notify'; level: NotifyLevel; text: string }
  /** Money left the till for a purchase; `moneyLeft` is the balance after it. */
  | { type: 'spend'; kind: SpendKind; label: string; amount: number; moneyLeft: number }
  | { type: 'angry'; customerId: number }
  | { type: 'served'; customerId: number; itemId: MenuItemId }
  | { type: 'cleaned'; tableId: number }
  | { type: 'phase'; phase: Phase }
  | { type: 'review'; review: Review }
  | { type: 'low_stock'; ingredientId: IngredientId }
  | { type: 'level_up'; level: number; unlocks: Unlocks }
  /** A new day of the week opened what the calendar lists for it (`day` is the week day). */
  | { type: 'week_unlocks'; day: number; unlocks: Unlocks }
  /** The daily report is in `state.lastReport`; the UI autosaves on this. */
  | { type: 'dayEnded'; day: number }
  /** Week day 7 closed; the score is also in `state.week.result` and the week's row in `archive`. Comes after 'dayEnded'. */
  | { type: 'week_ended'; result: WeekResult }
  | { type: 'staff_promoted'; staffId: number; level: number }
  | { type: 'gift_claimed'; streak: number; money: number; tickets: number }
  /** Tickets were added; `total` is the balance after it. */
  | { type: 'tickets_earned'; amount: number; total: number; reason: 'gift' | 'achievement' | 'special_order' | 'vip' | 'challenge' }
  | { type: 'achievement_unlocked'; id: AchievementId; tier: number }
  /** The week's side challenge reached its target at the close of a day; its Tem come in the 'tickets_earned' after it. */
  | { type: 'challenge_completed'; challenge: WeekChallenge }
  | { type: 'special_order'; status: 'completed' | 'failed'; itemId: MenuItemId }
  | { type: 'vip_arrived'; customerId: number }
  /** A named regular came through the door; `visits` counts this one. Comes after 'doorbell'. */
  | { type: 'regular_arrived'; customerId: number; regularId: string; visits: number }
  /** `set_uniform` switched the team to another uniform. */
  | { type: 'uniform_changed'; uniformId: UniformId }
  /** `buy_style` paid for a style; it is worn from now on ('style_changed' follows). */
  | { type: 'style_bought'; styleId: string; slot: StyleSlot; money: number; tickets: number }
  /** A slot now wears another style. */
  | { type: 'style_changed'; slot: StyleSlot; styleId: string }
  /** A completed weekly challenge unlocked a style for sale. */
  | { type: 'style_unlocked'; styleId: string; slot: StyleSlot };
