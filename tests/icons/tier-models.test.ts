import { Box3, Mesh, type Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { type Tier, upgradeModel } from '../../src/icon-studio/models/tiers';
import { mat, type Pose, POSES } from '../../src/icon-studio/style';
import { UPGRADE_ICONS } from '../../src/ui/core/iconMap';

// P25 fix: tiers 2 and 3 redraw the thing itself (no plinth under it, no
// badge beside it), so the stage frames it as big as the tier 1 icon.

const IDS = Object.values(UPGRADE_ICONS);

function meshes(model: Object3D): Mesh[] {
  const out: Mesh[] = [];
  model.traverse((o) => {
    if (o instanceof Mesh) out.push(o);
  });
  return out;
}

/** World box of every mesh vertex: what the stage frames. */
function worldBox(model: Object3D): Box3 {
  model.updateMatrixWorld(true);
  return new Box3().setFromObject(model, true);
}

/** Width and height on screen of `model` seen from the camera of its pose (style.ts aims it the same way). */
function screenSize(model: Object3D): { w: number; h: number } {
  const pose = POSES[(model.userData.pose as Pose | undefined) ?? 'object'];
  const [el, az] = [(pose.elevationDeg * Math.PI) / 180, (pose.azimuthDeg * Math.PI) / 180];
  const toCamera = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const right = new Vector3(0, 1, 0).cross(toCamera).normalize();
  const up = toCamera.clone().cross(right).normalize();
  model.updateMatrixWorld(true);
  const b = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
  const v = new Vector3();
  for (const m of meshes(model)) {
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const [x, y] = [v.dot(right), v.dot(up)];
      b.left = Math.min(b.left, x);
      b.right = Math.max(b.right, x);
      b.bottom = Math.min(b.bottom, y);
      b.top = Math.max(b.top, y);
    }
  }
  return { w: b.right - b.left, h: b.top - b.bottom };
}

const TIERS: readonly Tier[] = [2, 3];
const gold = (model: Object3D) => meshes(model).filter((m) => m.material === mat('honey') || m.material === mat('honeyDeep')).length;
const colourCounts = (model: Object3D) => {
  const counts = new Map<unknown, number>();
  for (const m of meshes(model)) counts.set(m.material, (counts.get(m.material) ?? 0) + 1);
  return counts;
};

describe('upgrade tier models', () => {
  it('put nothing under the thing: no plinth below the tier 1 base', () => {
    for (const id of IDS) {
      const floor = worldBox(upgradeModel(id, 1)).min.y;
      for (const tier of TIERS) expect(worldBox(upgradeModel(id, tier)).min.y, `${id} t${tier}`).toBeGreaterThanOrEqual(floor - 0.02);
    }
  });

  it('frame the thing at least 90% as big and as tall as tier 1', () => {
    for (const id of IDS) {
      const base = screenSize(upgradeModel(id, 1));
      const baseExtent = Math.max(base.w, base.h);
      for (const tier of TIERS) {
        const s = screenSize(upgradeModel(id, tier));
        // The stage fits the larger side to the cell: a larger side grows, everything shrinks.
        expect(baseExtent / Math.max(s.w, s.h), `${id} t${tier} scale`).toBeGreaterThanOrEqual(0.9);
        expect(s.h / base.h, `${id} t${tier} height`).toBeGreaterThanOrEqual(0.9);
      }
    }
  });

  it('look different at tiers 2 and 3, with more gold at tier 3', () => {
    for (const id of IDS) {
      const [t2, t3] = [upgradeModel(id, 2), upgradeModel(id, 3)];
      expect(colourCounts(t3), id).not.toEqual(colourCounts(t2));
      expect(gold(t3), id).toBeGreaterThan(gold(t2));
    }
  });

  it('use steel trim at tier 2', () => {
    for (const id of IDS) expect(meshes(upgradeModel(id, 2)).some((m) => m.material === mat('skyLight')), id).toBe(true);
  });
});
