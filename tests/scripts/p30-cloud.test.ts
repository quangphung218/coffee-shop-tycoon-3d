import { describe, expect, it } from 'vitest';
import { buildSaves, cloudCheck } from '../../scripts/capture-p30.mjs';
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
