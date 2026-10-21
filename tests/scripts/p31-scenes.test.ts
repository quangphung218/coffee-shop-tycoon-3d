import { afterEach, describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Scene } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SCENES, saveText, sceneState } from '../../scripts/lib/saves.mjs';
import { clearBox } from '../../scripts/lib/shots.mjs';
import { parseArgs } from '../../scripts/measure-frames.mjs';
import * as save from '../../src/save/save';
import * as sim from '../../src/sim/index';
import * as orders from '../../src/sim/orders';
import * as stateMod from '../../src/sim/state';

const mods = { stateMod, sim, orders };
const TOOLS = ['cold_brew_tower', 'oven'];

describe('tools-p31 scene', () => {
  it('is a measure-frames --scene id', () => {
    expect(parseArgs(['--scene', 'tools-p31', '--runs', '5']).scene).toBe('tools-p31');
  });

  it('plays to noon at shop level 8 with both tools at level 2 and their items on', () => {
    const s = sceneState(mods, SCENES['tools-p31']);
    expect(s.minute).toBe(12 * 60);
    expect(s.phase).toBe('peak');
    expect(s.shopLevel).toBe(8);
    expect(s.upgrades.cold_brew_tower).toBe(2);
    expect(s.upgrades.oven).toBe(2);
    expect(s.menu.filter((m) => m.id === 'cold_brew' || m.id === 'cookie').map((m) => m.enabled)).toEqual([true, true]);
    expect(s.customers.length).toBeGreaterThan(0);
    const raw = JSON.parse(saveText(save, s).text) as { version: number };
    expect(raw.version).toBe(save.SAVE_VERSION);
  });

  it('gives a build without the tools the same save without them', () => {
    const base = {
      ...mods,
      sim: {
        ...sim,
        nextUpgradeCost: (s: Parameters<typeof sim.nextUpgradeCost>[0], id: string) => {
          if (TOOLS.includes(id)) throw new Error(`Unknown upgrade: ${id}`);
          return sim.nextUpgradeCost(s, id as Parameters<typeof sim.nextUpgradeCost>[1]);
        },
      },
    };
    const s = sceneState(base, SCENES['tools-p31']);
    const cur = sceneState(mods, SCENES['tools-p31']);
    expect(s.shopLevel).toBe(8);
    expect(s.minute).toBe(cur.minute);
    expect(s.upgrades.cold_brew_tower).toBeUndefined();
    expect(s.upgrades.oven).toBeUndefined();
    expect(s.money).toBe(SCENES['tools-p31'].money);
  });

  it('throws when the build knows an upgrade but refuses to sell it', () => {
    expect(() => sceneState(mods, { weather: 'sunny', minute: 12 * 60, buy: { oven: 1 } })).toThrow(/buy_upgrade oven refused/);
  });
});

describe('clearBox', () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it('drops the triangles inside the box, hides a mesh left empty and leaves picked meshes alone', () => {
    const material = new MeshBasicMaterial();
    const low = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const high = new BoxGeometry(0.4, 0.2, 0.4).translate(0, 2.3, -2);
    const merged = new Mesh(mergeGeometries([low, high]), material);
    const lamp = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), material);
    lamp.position.set(1, 2.2, -2);
    const machine = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), material);
    machine.position.set(0, 2.2, -2);
    machine.userData.pick = 'machine';
    const scene = new Scene();
    scene.add(merged, lamp, machine);
    g.window = { __mediaScene: scene };

    const dropped = clearBox({ min: { x: -2, y: 1.95, z: -2.45 }, max: { x: 2, y: 3.5, z: -1.55 } });

    expect(dropped).toBe(24);
    expect(merged.geometry.index!.count).toBe(36);
    expect(merged.visible).toBe(true);
    expect(lamp.visible).toBe(false);
    expect(machine.visible).toBe(true);
    expect(machine.geometry.index!.count).toBe(36);
  });

  it('drops nothing without a scene', () => {
    g.window = {};
    expect(clearBox({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } })).toBe(0);
  });
});
