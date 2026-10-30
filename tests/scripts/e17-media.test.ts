// scripts/scenarios/e17.mjs: the three E-17 looks, one scene shot each, with saves the sim really buys.
import { describe, expect, it } from 'vitest';
import { SHOTS } from '../../scripts/lib/shots.mjs';
import { loadSave, type SaveText } from '../../scripts/lib/saves.mjs';
import e17, { LOOKS, shotFile } from '../../scripts/scenarios/e17.mjs';
import * as save from '../../src/save/save';
import * as sim from '../../src/sim/index';
import * as orders from '../../src/sim/orders';
import * as stateMod from '../../src/sim/state';
import type { StyleSlot } from '../../src/sim/types';

const mods = { stateMod, sim, orders, save };

describe('e17 scenario', () => {
  it('shoots one scene per look, each to a file of its own', () => {
    expect(Object.keys(LOOKS)).toHaveLength(3);
    const shots = e17.steps.filter((s) => s.kind === 'shot');
    expect(shots).toHaveLength(3);
    for (const s of shots) expect(Object.keys(SHOTS)).toContain(s.shot);
    expect(shots.map((s) => (s.opts as { file: string }).file)).toEqual(Object.keys(LOOKS).map(shotFile));
    expect(e17.out).toBe('docs/media/e17');
  });

  it('gives each look a noon save wearing it on every slot, none on its default', async () => {
    const { saves } = await e17.saves(mods, { isBase: false, only: null, ctx: {} });
    for (const [look, slots] of Object.entries(LOOKS)) {
      const s = loadSave(save, saves[look] as SaveText);
      expect(s.minute, look).toBe(12 * 60);
      expect(s.weather, look).toBe('sunny');
      for (const [slot, id] of Object.entries(slots) as [StyleSlot, string][]) {
        expect(sim.styleOf(s, slot).id, `${look} ${slot}`).toBe(id);
        expect(sim.defaultStyle(slot).id, `${look} ${slot}`).not.toBe(id);
      }
    }
  }, 60_000);
});
