/**
 * Sim ids → icons, following "Bảng thay emoji" in design/t237-cartoon/README.md.
 * The emoji `icon` fields in src/sim/data stay as they are; the UI and the
 * 3D labels read these maps instead.
 */
import type { IngredientId, MarketingId, MenuItemId, Phase, ReviewReason, StaffRole, UpgradeId } from '../../sim/types';
import { icon, type IconId, type IconOptions } from './icons';

export const MENU_ICONS: Readonly<Record<MenuItemId, IconId>> = {
  espresso: 'i-espresso',
  americano: 'i-americano',
  latte: 'i-latte',
  cappuccino: 'i-cappuccino',
  mocha: 'i-mocha',
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
};

/** 'report' shares the moon of "Hết ngày". */
export const PHASE_ICONS: Readonly<Record<Phase, IconId>> = {
  preparation: 'i-phase-prep',
  opening: 'i-phase-open',
  peak: 'i-flame',
  closing: 'i-phase-close',
  report: 'i-phase-close',
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
  /** CSS values for --av-skin / --av-hair (token with its hex as fallback). */
  skinVar: string;
  hairVar: string;
  /** Plain hex, for canvas drawing through iconSvgMarkup(). */
  skin: string;
  hair: string;
}

function look(skinToken: string, skin: string, hairToken: string, hair: string): AvatarLook {
  return { skinVar: `var(${skinToken}, ${skin})`, hairVar: `var(${hairToken}, ${hair})`, skin, hair };
}

/** The 8 skin/hair pairs drawn in the design file, replacing 8 person emoji. */
export const AVATAR_LOOKS: readonly AvatarLook[] = [
  look('--color-skin-1', '#ffdcbf', '--color-hair-1', '#3a2216'),
  look('--color-skin-2', '#f0b98d', '--color-hair-2', '#6b3f24'),
  look('--color-skin-3', '#c98a5e', '--color-hair-1', '#3a2216'),
  look('--color-skin-1', '#ffdcbf', '--color-hair-4', '#f2cf63'),
  look('--color-skin-2', '#f0b98d', '--color-hair-3', '#d9822b'),
  look('--color-skin-4', '#8d5a3b', '--color-hair-1', '#3a2216'),
  look('--color-skin-3', '#c98a5e', '--color-hair-2', '#6b3f24'),
  look('--color-skin-1', '#ffdcbf', '--color-cream-200', '#ecd3b2'),
];

/** Same staff id → same look, every session. */
export function avatarLook(staffId: number): AvatarLook {
  const n = AVATAR_LOOKS.length;
  return AVATAR_LOOKS[((Math.trunc(staffId) % n) + n) % n]!;
}

export function avatarIcon(staffId: number, opts: Omit<IconOptions, 'vars'> = {}): SVGSVGElement {
  const l = avatarLook(staffId);
  return icon('i-avatar', { ...opts, vars: { '--av-skin': l.skinVar, '--av-hair': l.hairVar } });
}
