/**
 * Tier looks of the upgrade icons (UPGRADE_ICONS) for the tiers atlas. Each
 * tier redraws the thing itself the way the game scene does at that tier
 * (src/render/scene/equipment.ts, shop.ts): tier 2 adds a working detail with
 * steel trim, tier 3 turns the trim gold, some with a small star on the
 * front. Nothing stands under or beside the thing, so it fills the cell like
 * the tier 1 icon.
 */
import type { Object3D } from 'three';
import { UPGRADE_ICONS } from '../../ui/core/iconMap';
import type { IconId } from '../../ui/core/icons';
import { tierIconId, UPGRADE_TIERS } from '../atlas';
import * as E from './equipment';
import { MODELS } from './index';
import * as S from './shop';
import type { Tier } from './shapes';

export type { Tier };

/** Model builders of the upgrade icons by look tier; tier 1 is the MODELS model. */
const TIERED: Readonly<Record<string, (tier: Tier) => Object3D>> = {
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
  'i-grinder': E.grinder,
  'i-pastry-case': E.pastryCase,
  'i-blender': E.blender,
  'i-ice-maker': E.iceMaker,
  'i-dishwasher': E.dishwasher,
  'i-cold-brew-tower': E.coldBrewTower,
  'i-oven': E.oven,
};

/** The model of upgrade icon `id` at `tier`; tier 1 is its MODELS model unchanged. */
export function upgradeModel(id: IconId, tier: Tier): Object3D {
  if (tier === 1) {
    const build = MODELS[id];
    if (!build) throw new Error(`No model for ${id}`);
    return build();
  }
  const build = TIERED[id];
  if (!build) throw new Error(`No tier model for ${id}`);
  return build(tier);
}

/** Model builders of the tiers atlas, by TIER_IDS id. */
export const TIER_MODELS: Readonly<Record<string, () => Object3D>> = Object.fromEntries(
  Object.values(UPGRADE_ICONS).flatMap((id) => UPGRADE_TIERS.map((tier) => [tierIconId(id, tier), () => upgradeModel(id, tier)] as const)),
);
