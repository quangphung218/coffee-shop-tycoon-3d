/** Model builders by icon id (ids from src/ui/core/icons.ts). Each call returns a fresh model. */
import type { Object3D } from 'three';
import type { IconId } from '../../ui/core/icons';
import { close, inventory, menu, pause, reviews, upgrades } from './hud';
import { avatar, beans, latte } from './items';

export const MODELS: Partial<Record<IconId, () => Object3D>> = {
  'i-menu': menu,
  'i-inventory': inventory,
  'i-upgrades': upgrades,
  'i-reviews': reviews,
  'i-pause': pause,
  'i-close': close,
  'i-latte': latte,
  'i-beans': beans,
  'i-avatar': avatar,
};
