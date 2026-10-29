import { Box3, Mesh, type Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  ATLAS_IDS,
  type AtlasManifest,
  CELL,
  checkManifest,
  packAtlas,
  SMALL_CELL,
  SMALL_QUALITY,
  TIER_BUDGET,
  TIER_IDS,
  tierIconId,
} from '../../src/icon-studio/atlas';
import { MODELS } from '../../src/icon-studio/models';
import { TIER_MODELS, upgradeModel } from '../../src/icon-studio/models/tiers';
import { mat, PALETTE, type PaletteKey, POSES } from '../../src/icon-studio/style';
import { UPGRADE_ICONS } from '../../src/ui/core/iconMap';

// The project has no Node types, so node:fs comes in through a dynamically
// named import; paths are relative to the repo root.
const FS_MODULE = 'node:fs';
const fs = (await import(/* @vite-ignore */ FS_MODULE)) as {
  existsSync(path: string): boolean;
  readFileSync(path: string): Uint8Array;
  readFileSync(path: string, encoding: 'utf8'): string;
};

/** Canvas size from a WebP header (VP8X, lossless VP8L or lossy VP8). */
function webpSize(b: Uint8Array): { width: number; height: number } {
  const tag = String.fromCharCode(...b.subarray(0, 4), ...b.subarray(8, 16));
  if (tag !== 'RIFFWEBPVP8X' && tag !== 'RIFFWEBPVP8L' && tag !== 'RIFFWEBPVP8 ') throw new Error(`not a WebP: ${tag}`);
  const u24 = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
  if (tag.endsWith('VP8X')) return { width: u24(24) + 1, height: u24(27) + 1 };
  if (tag.endsWith('VP8L')) {
    const bits = (b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return { width: (b[26]! | (b[27]! << 8)) & 0x3fff, height: (b[28]! | (b[29]! << 8)) & 0x3fff };
}

function meshes(model: Object3D): Mesh[] {
  const out: Mesh[] = [];
  model.traverse((o) => {
    if (o instanceof Mesh) out.push(o);
  });
  return out;
}

const colours = (model: Object3D) => new Set(meshes(model).map((m) => m.material));
// P27: the 4 new furniture upgrades reuse existing upgrade icons, and so do the 4 E-05 premium items: 25 upgrades share 17 icons.
const UPGRADE_ICON_IDS = [...new Set(Object.values(UPGRADE_ICONS))];

describe('tier ids', () => {
  it('give each of the 17 upgrade icons a -t2 and a -t3 id, in UPGRADE_ICONS order', () => {
    expect(Object.values(UPGRADE_ICONS)).toHaveLength(25);
    expect(UPGRADE_ICON_IDS).toHaveLength(17);
    expect(TIER_IDS).toHaveLength(34);
    expect(TIER_IDS).toEqual(UPGRADE_ICON_IDS.flatMap((id) => [`${id}-t2`, `${id}-t3`]));
    expect(tierIconId('i-machine', 3)).toBe('i-machine-t3');
    expect(new Set(TIER_IDS).size).toBe(TIER_IDS.length);
  });

  it('never reuse an id of the main atlas', () => {
    for (const id of TIER_IDS) expect(ATLAS_IDS, id).not.toContain(id);
  });
});

describe('tier models', () => {
  it('cover every tier id and nothing else', () => {
    expect(Object.keys(TIER_MODELS).sort()).toEqual([...TIER_IDS].sort());
  });

  it('each build into finite geometry in palette colours and the pose of their base icon', () => {
    const palette = new Set<unknown>((Object.keys(PALETTE) as PaletteKey[]).map(mat));
    for (const [id, build] of Object.entries(TIER_MODELS)) {
      const model = build();
      expect(meshes(model).length, id).toBeGreaterThan(0);
      for (const m of meshes(model)) expect(palette.has(m.material), id).toBe(true);
      const size = new Box3().setFromObject(model).getSize(new Vector3());
      expect([size.x, size.y, size.z].every((v) => Number.isFinite(v) && v > 0), id).toBe(true);
      expect(Object.keys(POSES), id).toContain(model.userData.pose ?? 'object');
    }
    expect(upgradeModel('i-expand', 2).userData.pose).toBe('top');
  });

  it('keep tier 1 as the icon itself and add parts at tiers 2 and 3', () => {
    for (const id of UPGRADE_ICON_IDS) {
      const base = meshes(MODELS[id]!()).length;
      expect(meshes(upgradeModel(id, 1)), id).toHaveLength(base);
      expect(meshes(upgradeModel(id, 2)).length, id).toBeGreaterThan(base);
      expect(meshes(upgradeModel(id, 3)).length, id).toBeGreaterThan(base);
    }
  });

  it('trim tier 2 in steel and tier 3 in gold with a honey star', () => {
    // The base machine has no honeyDeep and only one honey part (its button).
    const honeyParts = (model: Object3D) => meshes(model).filter((m) => m.material === mat('honey')).length;
    const t2 = upgradeModel('i-machine', 2);
    const t3 = upgradeModel('i-machine', 3);
    expect(colours(t2).has(mat('skyLight'))).toBe(true);
    expect(colours(t2).has(mat('honeyDeep'))).toBe(false);
    expect(colours(t3).has(mat('honeyDeep'))).toBe(true);
    // Tier 3 adds the star and paints the body and its lip honey (MACHINE_TIER_COLORS).
    expect(honeyParts(t3)).toBe(honeyParts(MODELS['i-machine']!()) + 3);
  });
});

const TIERS = 'public/icons3d/tiers.json';

describe.skipIf(!fs.existsSync(TIERS))('committed tiers atlas', () => {
  const m = JSON.parse(fs.existsSync(TIERS) ? fs.readFileSync(TIERS, 'utf8') : '{}') as AtlasManifest;

  it('holds a 48 px and a 24 px cell for every tier id, laid out by the packer', () => {
    expect(checkManifest(m, TIER_IDS)).toEqual([]);
    expect(Object.keys(m.icons)).toEqual([...TIER_IDS]);
    expect(Object.keys(m.smallIcons)).toEqual([...TIER_IDS]);
    for (const id of TIER_IDS) {
      expect(m.icons[id], id).toMatchObject({ w: CELL, h: CELL });
      expect(m.smallIcons[id], id).toMatchObject({ w: SMALL_CELL, h: SMALL_CELL });
    }
    expect({ ...m, smallQuality: undefined }).toEqual(packAtlas(TIER_IDS));
  });

  it('shares no id with the main atlas', () => {
    const main = JSON.parse(fs.readFileSync('public/icons3d/atlas.json', 'utf8')) as AtlasManifest;
    for (const id of Object.keys(m.icons)) expect(Object.keys(main.icons), id).not.toContain(id);
  });

  it('measured every 24 px cell as ink-edged and clear of the cream HUD', () => {
    expect(Object.keys(m.smallQuality ?? {})).toEqual([...TIER_IDS]);
    for (const [id, q] of Object.entries(m.smallQuality ?? {})) {
      expect(q.edgeInk, id).toBeGreaterThanOrEqual(SMALL_QUALITY.edgeInk);
      expect(q.edgeContrast, id).toBeGreaterThanOrEqual(SMALL_QUALITY.edgeContrast);
    }
  });

  it('has WebP images at 1x and 2x the manifest size, inside 60 kB and 150 kB', () => {
    const x1 = fs.readFileSync('public/icons3d/tiers@1x.webp');
    const x2 = fs.readFileSync('public/icons3d/tiers@2x.webp');
    expect(webpSize(x1)).toEqual({ width: m.width, height: m.height });
    expect(webpSize(x2)).toEqual({ width: m.width * 2, height: m.height * 2 });
    expect(x1.length).toBeLessThanOrEqual(TIER_BUDGET[1]);
    expect(x2.length).toBeLessThanOrEqual(TIER_BUDGET[2]);
  });
});
