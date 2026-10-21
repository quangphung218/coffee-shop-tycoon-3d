import type { Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { buildSaves, cloudCheck, faceMarks, matchMood } from '../../scripts/capture-p30.mjs';
import * as rig from '../../src/render/actors/rig';
import * as save from '../../src/save/save';
import * as menu from '../../src/sim/data/menu';
import * as sim from '../../src/sim/index';
import * as orders from '../../src/sim/orders';
import * as stateMod from '../../src/sim/state';

const mods = { stateMod, sim, orders, menu };

describe('P30 cloud save', () => {
  const { saves, info } = buildSaves(mods, save, true);

  it('has a customer walk out over the empty stock soon after Tiếp tục, played as the browser does', () => {
    const start = JSON.parse(saves.cloud.text).state.minute as number;
    const r = cloudCheck(mods, save, saves.cloud);
    expect(r.at).not.toBeNull();
    expect(r.at! - start).toBeLessThanOrEqual(5);
    expect(info).toMatch(/sim: walk-out at \d\d:\d\d/);
  });

  it('finds no walk-out over the stock in the noon save, where nothing ran out', () => {
    expect(cloudCheck(mods, save, saves.noon).at).toBeNull();
  });
});

describe('P30 face marks', () => {
  const marks = faceMarks(rig);

  it('tells every mood of the rig apart by its face print, sad included', () => {
    expect(Object.keys(marks)).toEqual([...rig.MOODS]);
    for (const mood of rig.MOODS) expect(matchMood(marks[mood]!, marks)).toBe(mood);
  });

  it('reads the face a character wears after setMood, and nothing for another mesh', () => {
    const ch = rig.createCharacter({ role: 'customer', look: 3, persona: 'regular' });
    ch.setMood('sad');
    const g = (ch as unknown as { face: Mesh }).face.geometry;
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(matchMood([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z], marks)).toBe('sad');
    expect(matchMood([0, 0, 0, 1, 1, 1], marks)).toBeNull();
  });
});
