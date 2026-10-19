/**
 * Sim ids → icons, following "Bảng thay emoji" in design/t237-cartoon/README.md.
 * The emoji `icon` fields in src/sim/data stay as they are; the UI and the
 * 3D labels read these maps instead.
 */
import type { DayEventId, IngredientId, MarketingId, MenuItemId, Phase, ReviewReason, StaffRole, UpgradeId, Weather } from '../../sim/types';
import { icon, type IconId, type IconOptions } from './icons';

export const MENU_ICONS: Readonly<Record<MenuItemId, IconId>> = {
  espresso: 'i-espresso',
  americano: 'i-americano',
  latte: 'i-latte',
  cappuccino: 'i-cappuccino',
  mocha: 'i-mocha',
  frappe: 'i-frappe',
  milk_tea: 'i-bubble-tea',
  lemon_tea: 'i-lemon-tea',
  orange_juice: 'i-orange-juice',
  croissant: 'i-croissant',
  cake: 'i-cake',
};

export const INGREDIENT_ICONS: Readonly<Record<IngredientId, IconId>> = {
  coffee_beans: 'i-beans',
  milk: 'i-milk',
  sugar: 'i-sugar',
  cacao: 'i-cacao',
  tea: 'i-tea',
  pearls: 'i-pearls',
  lemon: 'i-lemon',
  orange: 'i-orange',
  flour: 'i-flour',
  butter: 'i-butter',
  ice: 'i-ice',
  cup: 'i-cup',
};

export const MARKETING_ICONS: Readonly<Record<MarketingId, IconId>> = {
  flyers: 'i-flyer',
  happy_hour: 'i-happy-hour',
  social_media: 'i-social',
  influencer: 'i-kol',
};

export const UPGRADE_ICONS: Readonly<Record<UpgradeId, IconId>> = {
  tables: 'i-tables',
  better_machine: 'i-machine',
  fast_machine: 'i-fast-machine',
  big_counter: 'i-counter',
  outdoor_seating: 'i-outdoor',
  expand_area: 'i-expand',
  plants: 'i-plants',
  paintings: 'i-paintings',
  lights: 'i-lights',
  window_bar: 'i-window-bar',
  grinder: 'i-grinder',
  pastry_case: 'i-pastry-case',
  blender: 'i-blender',
  ice_maker: 'i-ice-maker',
  dishwasher: 'i-dishwasher',
  // P27 furniture borrows the nearest upgrade icon, so its tiers 2–3 reuse that icon's tier cells (no new atlas).
  neon_sign: 'i-lights',
  bookshelf: 'i-window-bar',
  record_player: 'i-paintings',
  sofa_corner: 'i-tables',
};

/** HUD chip of the shop level, and the daily-mission cards. */
export const LEVEL_ICON: IconId = 'i-level';
export const MISSION_ICON: IconId = 'i-mission';

/** 'report' shares the moon of "Hết ngày". */
export const PHASE_ICONS: Readonly<Record<Phase, IconId>> = {
  preparation: 'i-phase-prep',
  opening: 'i-phase-open',
  peak: 'i-flame',
  closing: 'i-phase-close',
  report: 'i-phase-close',
};

/** The atlas has no sun or rain cloud: a sparkle for sun, the snowflake for cool rain, the flame for heat. */
export const WEATHER_ICONS: Readonly<Record<Weather, IconId>> = {
  sunny: 'i-sparkle',
  rainy: 'i-cold',
  hot: 'i-flame',
};

export const DAY_EVENT_ICONS: Readonly<Record<DayEventId, IconId>> = {
  none: 'i-dot-empty',
  grand_opening: 'i-open',
  fair: 'i-people',
  supplier_hike: 'i-trend-up',
};

export const ROLE_ICONS: Readonly<Record<StaffRole, IconId>> = {
  barista: 'i-cup-hot',
  server: 'i-role-server',
  cleaner: 'i-role-cleaner',
  marketer: 'i-marketing',
  none: 'i-rest',
};

export const REVIEW_REASON_ICONS: Readonly<Record<ReviewReason, IconId>> = {
  fast_service: 'i-thumb-up',
  tasty: 'i-thumb-up',
  nice_decor: 'i-thumb-up',
  long_wait: 'i-thumb-down',
  out_of_stock: 'i-thumb-down',
  dirty_table: 'i-thumb-down',
};

export interface AvatarLook {
  /** Token hex values; the icon studio builds atlas cell `i-avatar-<index>` from them. */
  skin: string;
  hair: string;
}

/** The 8 skin/hair pairs drawn in the design file (skin and hair tokens), replacing 8 person emoji. */
export const AVATAR_LOOKS: readonly AvatarLook[] = [
  { skin: '#ffdcbf', hair: '#3a2216' },
  { skin: '#f0b98d', hair: '#6b3f24' },
  { skin: '#c98a5e', hair: '#3a2216' },
  { skin: '#ffdcbf', hair: '#f2cf63' },
  { skin: '#f0b98d', hair: '#d9822b' },
  { skin: '#8d5a3b', hair: '#3a2216' },
  { skin: '#c98a5e', hair: '#6b3f24' },
  { skin: '#ffdcbf', hair: '#ecd3b2' },
];

/** Index into AVATAR_LOOKS: same staff id → same look, every session. */
export function avatarIndex(staffId: number): number {
  const n = AVATAR_LOOKS.length;
  return ((Math.trunc(staffId) % n) + n) % n;
}

export function avatarLook(staffId: number): AvatarLook {
  return AVATAR_LOOKS[avatarIndex(staffId)]!;
}

/** The staff member's face from the atlas (one rendered cell per look). */
export function avatarIcon(staffId: number, opts: IconOptions = {}): HTMLElement {
  return icon(`i-avatar-${avatarIndex(staffId)}`, opts);
}
