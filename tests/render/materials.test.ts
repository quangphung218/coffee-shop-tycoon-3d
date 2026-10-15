import { Mesh, type Material, type Object3D, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../../src/render/actors/rig';
import { GRAIN_TILE_METRES, SHARED_MATERIAL, WOOD_MATERIAL, grainTexture } from '../../src/render/scene/parts';
import { ShopView } from '../../src/render/scene/shop';
import { createStreet } from '../../src/render/street';
import { createNewGame } from '../../src/sim/state';

type WithMap = Material & { map?: unknown };

function mapOf(mesh: Mesh): unknown {
  return (mesh.material as WithMap).map ?? null;
}

function meshes(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) out.push(o);
  });
  return out;
}

/** The private meshes of a ShopView this test checks. */
interface ShopParts {
  root: Object3D;
  indoorFloor: Mesh;
  expansionFloor: Mesh;
  patioFloor: Mesh;
  walls: { mesh: Mesh }[];
  counter: Mesh;
  backCounter: Mesh;
  tables: Mesh;
  chairs: Mesh;
}

describe('wood grain', () => {
  it('lives on its own wood material, not on the shared flat one', () => {
    expect(SHARED_MATERIAL.map).toBeNull();
    expect(WOOD_MATERIAL.map).not.toBeNull();
    expect(WOOD_MATERIAL).not.toBe(SHARED_MATERIAL);
  });

  it('is a faint, low-contrast grain', () => {
    const tex = grainTexture();
    const data = tex.image.data as Uint8Array;
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      min = Math.min(min, data[i]!);
      max = Math.max(max, data[i]!);
    }
    expect(max).toBe(255);
    // Darkest line stays within ~10% of white, so palette colours keep their hue.
    expect(min).toBeGreaterThanOrEqual(225);
    expect(min).toBeLessThan(max);
    tex.dispose();
  });

  it('tiles by world size, so it never stretches into wide stripes', () => {
    expect(GRAIN_TILE_METRES).toBeGreaterThan(0.2);
    expect(GRAIN_TILE_METRES).toBeLessThan(1.5);
    const shader = { vertexShader: '#include <project_vertex>', fragmentShader: '', uniforms: {} } as never;
    WOOD_MATERIAL.onBeforeCompile(shader, null as never);
    const vs = (shader as { vertexShader: string }).vertexShader;
    expect(vs).toContain('modelMatrix');
    expect(vs).toContain('vMapUv');
  });
});

describe('which surfaces get the grain', () => {
  it('gives the counter, tables, chairs and wooden floor the grain; grass, walls and patio stay flat', () => {
    const state = createNewGame('Quán Mây', 'normal', 1);
    const scene = new Scene();
    const view = new ShopView(scene, 'medium');
    view.update(state, 0, 0, 0);
    const shop = view as unknown as ShopParts;

    for (const wood of [shop.indoorFloor, shop.expansionFloor, shop.counter, shop.backCounter, shop.tables, shop.chairs]) {
      expect(wood.material).toBe(WOOD_MATERIAL);
      expect(mapOf(wood)).not.toBeNull();
    }
    for (const wall of shop.walls) expect(mapOf(wall.mesh)).toBeNull();
    expect(mapOf(shop.patioFloor)).toBeNull();
    const ground = shop.root.children[0] as Mesh;
    expect(ground.material).toBe(SHARED_MATERIAL);
    expect(mapOf(ground)).toBeNull();

    // Nothing but the wood carries the grain.
    const woodMeshes = new Set<Mesh>([shop.indoorFloor, shop.expansionFloor, shop.counter, shop.backCounter, shop.tables, shop.chairs]);
    for (const mesh of meshes(shop.root)) {
      if (!woodMeshes.has(mesh)) expect(mesh.material).not.toBe(WOOD_MATERIAL);
    }
    view.dispose();
  });

  it('keeps the street flat', () => {
    const scene = new Scene();
    const street = createStreet(scene, { quality: 'high' });
    const root = scene.getObjectByName('street')!;
    const all = meshes(root);
    expect(all.length).toBeGreaterThan(0);
    for (const mesh of all) {
      expect(mesh.material).not.toBe(WOOD_MATERIAL);
      expect(mapOf(mesh)).toBeNull();
    }
    street.dispose();
  });

  it('keeps the characters flat', () => {
    const char = createCharacter({ role: 'customer', look: 2 });
    const all = meshes(char.root);
    expect(all.length).toBeGreaterThan(0);
    for (const mesh of all) {
      if (Array.isArray(mesh.material)) continue;
      expect(mapOf(mesh)).toBeNull();
    }
  });
});
