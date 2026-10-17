import { Box3, Mesh, type Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MACHINE_TIER_COLORS } from '../../src/icon-studio/models/shop';
import { type Tier, upgradeModel } from '../../src/icon-studio/models/tiers';
import { mat, PALETTE, type PaletteKey, type Pose, POSES } from '../../src/icon-studio/style';
import { PALETTE as SCENE_PALETTE } from '../../src/render/scene/palette';
import { UPGRADE_ICONS } from '../../src/ui/core/iconMap';

const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};

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

/** [body, accent] per better_machine level, read from MACHINE_TIERS in the scene source so the test follows it. */
function sceneMachineTiers(): (readonly [number, number])[] {
  const src = readFileSync('src/render/scene/equipment.ts', 'utf8');
  const table = src.match(/const MACHINE_TIERS[^=]*=\s*\[([\s\S]*?)\n\];/)?.[1] ?? '';
  const hex = (v: string): number => (v.startsWith('0x') ? parseInt(v, 16) : SCENE_PALETTE[v.replace('PALETTE.', '') as keyof typeof SCENE_PALETTE]);
  return [...table.matchAll(/\[\s*([\w.]+)\s*,\s*([\w.]+)\s*\]/g)].map((m) => [hex(m[1]!), hex(m[2]!)] as const);
}

/** The icon token nearest (RGB distance) to a scene colour. */
function nearestToken(hex: number): PaletteKey {
  const rgb = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const dist = (k: PaletteKey) => {
    const [a, b] = [rgb(hex), rgb(parseInt(PALETTE[k].slice(1), 16))];
    return a.reduce((s, v, i) => s + (v - b[i]!) ** 2, 0);
  };
  return (Object.keys(PALETTE) as PaletteKey[]).reduce((best, k) => (dist(k) < dist(best) ? k : best));
}

/** The biggest mesh by box volume: the machine body. */
function body(model: Object3D): Mesh {
  model.updateMatrixWorld(true);
  const volume = (m: Mesh) => new Box3().setFromObject(m, true).getSize(new Vector3()).toArray().reduce((a, b) => a * b, 1);
  return meshes(model).reduce((best, m) => (volume(m) > volume(best) ? m : best));
}

describe('machine tier colours', () => {
  // better_machine has maxLevel 3, so look tier n is level n: MACHINE_TIERS[n].
  const tiers = sceneMachineTiers();

  it('read the scene table', () => {
    expect(tiers).toHaveLength(4);
  });

  for (const id of ['i-machine', 'i-fast-machine'] as const) {
    it(`${id} tiers 2 and 3 take the body and accent colours of the scene at that tier`, () => {
      const base = body(upgradeModel(id, 1)).material;
      for (const tier of [2, 3] as const) {
        const [sceneBody, sceneAccent] = tiers[tier]!;
        const model = upgradeModel(id, tier);
        expect(MACHINE_TIER_COLORS[tier]).toEqual([nearestToken(sceneBody), nearestToken(sceneAccent)]);
        expect(body(model).material, `${id} t${tier} body`).toBe(mat(nearestToken(sceneBody)));
        expect(body(model).material, `${id} t${tier} body`).not.toBe(base);
        expect(meshes(model).some((m) => m.material === mat(nearestToken(sceneAccent))), `${id} t${tier} accent`).toBe(true);
      }
    });
  }
});
