/**
 * Model builders by atlas id: every icon id from src/ui/core/icons.ts (the
 * Record type makes a missing one a type error) plus one avatar per
 * AVATAR_LOOKS entry. Each call returns a fresh model.
 */
import type { Object3D } from 'three';
import type { IconId } from '../../ui/core/icons';
import * as G from './glyphs';
import * as H from './hud';
import * as I from './items';
import { AVATAR_MODELS, avatar } from './people';
import * as S from './shop';
import * as Small from './small';

const ICON_MODELS: Readonly<Record<IconId, () => Object3D>> = {
  // HUD & navigation
  'i-tasks': H.tasks,
  'i-menu': H.menu,
  'i-inventory': H.inventory,
  'i-people': H.people,
  'i-marketing': H.marketing,
  'i-upgrades': H.upgrades,
  'i-reviews': H.reviews,
  'i-open': H.open,
  'i-next-day': H.nextDay,
  'i-camera': H.camera,
  'i-settings': H.settings,
  'i-pause': G.pause,
  'i-speed-1': G.speed1,
  'i-speed-2': G.speed2,
  'i-speed-4': G.speed4,
  'i-close': G.close,
  'i-home': H.home,
  'i-back': G.back,
  'i-forward': G.forward,
  // Day phases
  'i-phase-prep': S.phasePrep,
  'i-phase-open': S.phaseOpen,
  'i-flame': S.flame,
  'i-phase-close': S.phaseClose,
  'i-clock': H.clock,
  // Status & feedback
  'i-ok': G.ok,
  'i-check': G.check,
  'i-warning': G.warning,
  'i-error': G.error,
  'i-info': G.info,
  'i-lock': H.lock,
  'i-sparkle': G.sparkle,
  'i-tip': H.tip,
  'i-busy': H.busy,
  'i-free': G.free,
  'i-rest': G.rest,
  'i-auto': H.auto,
  'i-trend-up': G.trendUp,
  'i-trend-down': G.trendDown,
  'i-equal': G.equal,
  'i-todo': G.todo,
  'i-dot': G.dot,
  'i-dot-empty': G.dotEmpty,
  'i-chevron-down': G.chevronDown,
  'i-retry': G.retry,
  'i-reset': G.reset,
  // Money & stars
  'i-coin': H.coin,
  'i-star': G.starFull,
  'i-star-empty': G.starEmpty,
  // Reports & reviews
  'i-chart': H.chart,
  'i-trophy': H.trophy,
  'i-thumb-up': G.thumbUp,
  'i-thumb-down': G.thumbDown,
  // System & settings
  'i-load': H.load,
  'i-delete': H.del,
  'i-save': H.save,
  'i-music': H.music,
  'i-sound': H.sound,
  'i-quality': H.quality,
  // Difficulty, temperature
  'i-easy': S.easy,
  'i-cup-hot': S.cupHot,
  'i-cold': S.cold,
  // Staff
  'i-role-server': S.roleServer,
  'i-role-cleaner': S.roleCleaner,
  'i-chef': S.chef,
  'i-avatar': avatar,
  // Customer faces
  'i-face-happy': G.faceHappy,
  'i-face-ok': G.faceOk,
  'i-face-worried': G.faceWorried,
  'i-face-angry': G.faceAngry,
  // Menu items
  'i-espresso': I.espresso,
  'i-americano': I.americano,
  'i-latte': I.latte,
  'i-cappuccino': I.cappuccino,
  'i-mocha': I.mocha,
  'i-bubble-tea': I.bubbleTea,
  'i-lemon-tea': I.lemonTea,
  'i-orange-juice': I.orangeJuice,
  'i-croissant': I.croissant,
  'i-cake': I.cake,
  // Ingredients
  'i-beans': I.beans,
  'i-milk': I.milk,
  'i-sugar': I.sugar,
  'i-cacao': I.cacao,
  'i-tea': I.tea,
  'i-pearls': I.pearls,
  'i-lemon': I.lemon,
  'i-orange': I.orange,
  'i-flour': I.flour,
  'i-butter': I.butter,
  'i-ice': I.ice,
  'i-cup': I.cup,
  // Marketing
  'i-flyer': S.flyer,
  'i-happy-hour': S.happyHour,
  'i-social': S.social,
  'i-kol': S.kol,
  // Upgrades
  'i-tables': S.tables,
  'i-machine': S.machine,
  'i-fast-machine': S.fastMachine,
  'i-counter': S.counter,
  'i-outdoor': S.outdoor,
  'i-expand': S.expand,
  'i-plants': S.plants,
  'i-paintings': S.paintings,
  'i-lights': S.lights,
  'i-window-bar': S.windowBar,
};

export const MODELS: Readonly<Record<string, () => Object3D>> = { ...ICON_MODELS, ...AVATAR_MODELS };

/** Models drawn in the 24 px cell instead of the MODELS one (small.ts); every other id uses its MODELS model in both cells. */
export const SMALL_MODELS: Readonly<Record<string, () => Object3D>> = {
  'i-coin': Small.coin,
  'i-camera': Small.camera,
  'i-close': Small.close,
  'i-settings': Small.settings,
  'i-pause': Small.pause,
  'i-speed-4': Small.speed4,
} satisfies Partial<Record<IconId, () => Object3D>>;
