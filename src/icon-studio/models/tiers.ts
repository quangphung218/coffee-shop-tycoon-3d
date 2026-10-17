/**
 * Tier looks of the upgrade icons (UPGRADE_ICONS) for the tiers atlas. Tier 1
 * is the icon itself. Tier 2 stands it on a steel plinth with a steel rim and
 * adds a steel chevron; tier 3 turns the rim gold and swaps the chevron for a
 * gold star badge. Badges face the camera and sit at the bottom right of the
 * model on screen, whatever its pose.
 */
import { Box3, Matrix4, type Object3D, TorusGeometry, Vector3 } from 'three';
import { UPGRADE_ICONS } from '../../ui/core/iconMap';
import type { IconId } from '../../ui/core/icons';
import { tierIconId, UPGRADE_TIERS, type UpgradeTier } from '../atlas';
import { part, type PaletteKey, type Pose, POSES } from '../style';
import { slab } from './glyphs';
import { MODELS } from './index';
import { at, group, lathe, star, stroke } from './shapes';

export type Tier = 1 | UpgradeTier;

/** Rim colour of the plinth: steel at tier 2, gold at tier 3. */
const RIM: Readonly<Record<UpgradeTier, PaletteKey>> = { 2: 'skyLight', 3: 'honeyDeep' };
const PLINTH_HEIGHT = 0.22;
/** Badge width as a share of the model's larger side on screen. */
const BADGE = 0.42;

/** Round steel plinth under the footprint of `box`, its top on the model's lowest point. */
function plinth(box: Box3, tier: UpgradeTier): Object3D {
  const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 + 0.15;
  const body = part(lathe([[0, 0], [r, 0], [r, PLINTH_HEIGHT], [0, PLINTH_HEIGHT]], 28), 'sky');
  const rim = at(part(new TorusGeometry(r, 0.07, 6, 28).rotateX(Math.PI / 2), RIM[tier]), 0, PLINTH_HEIGHT);
  const g = group(body, rim);
  g.position.set((box.min.x + box.max.x) / 2, box.min.y - PLINTH_HEIGHT, (box.min.z + box.max.z) / 2);
  return g;
}

/** About 2 units across, facing +Z: an upward steel chevron (tier 2) or a gold star (tier 3). */
function badge(tier: UpgradeTier): Object3D {
  if (tier === 2) return stroke([[-0.75, -0.3], [0, 0.4], [0.75, -0.3]], 0.26, 'sky');
  return slab(star(5, 0.98, 0.45), 'honey');
}

/** Right, up and towards-camera axes of `pose`'s camera, as the stage aims it (style.ts). */
function cameraAxes(pose: Pose): { right: Vector3; up: Vector3; toCamera: Vector3 } {
  const el = (POSES[pose].elevationDeg * Math.PI) / 180;
  const az = (POSES[pose].azimuthDeg * Math.PI) / 180;
  const toCamera = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const right = new Vector3(0, 1, 0).cross(toCamera).normalize();
  const up = toCamera.clone().cross(right).normalize();
  return { right, up, toCamera };
}

/** `badge` turned to the camera and set over the bottom-right corner of `model` on screen, in front of it. */
function pinBadge(model: Object3D, badgeModel: Object3D, pose: Pose): Object3D {
  const { right, up, toCamera } = cameraAxes(pose);
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model);
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
  const along = (axis: Vector3) => corners.map((p) => p.dot(axis));
  const [r, u, d] = [along(right), along(up), along(toCamera)];
  const size = BADGE * Math.max(Math.max(...r) - Math.min(...r), Math.max(...u) - Math.min(...u));
  badgeModel.scale.setScalar(size / 2);
  badgeModel.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(right, up, toCamera));
  badgeModel.position
    .copy(right)
    .multiplyScalar(Math.max(...r) - size * 0.3)
    .addScaledVector(up, Math.min(...u) + size * 0.3)
    .addScaledVector(toCamera, Math.max(...d) + 0.3);
  return badgeModel;
}

/** The model of upgrade icon `id` at `tier`; tier 1 is its MODELS model unchanged. */
export function upgradeModel(id: IconId, tier: Tier): Object3D {
  const build = MODELS[id];
  if (!build) throw new Error(`No model for ${id}`);
  const base = build();
  if (tier === 1) return base;
  const pose = (base.userData.pose as Pose | undefined) ?? 'object';
  base.updateMatrixWorld(true);
  const g = group(base, plinth(new Box3().setFromObject(base), tier));
  g.add(pinBadge(g, badge(tier), pose));
  g.userData.pose = pose;
  return g;
}

/** Model builders of the tiers atlas, by TIER_IDS id. */
export const TIER_MODELS: Readonly<Record<string, () => Object3D>> = Object.fromEntries(
  Object.values(UPGRADE_ICONS).flatMap((id) => UPGRADE_TIERS.map((tier) => [tierIconId(id, tier), () => upgradeModel(id, tier)] as const)),
);
