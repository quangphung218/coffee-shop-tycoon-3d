// scripts/lib/saves.mjs playFirstDay: the day-1 report save check-layout.mjs resumes instead of playing the day in the browser.
import { describe, expect, it } from 'vitest';
import { loadSave, playFirstDay, saveText } from '../../scripts/lib/saves.mjs';
import * as save from '../../src/save/save';
import * as sim from '../../src/sim/index';
import * as orders from '../../src/sim/orders';
import * as staff from '../../src/sim/staff';
import * as stateMod from '../../src/sim/state';

const mods = { stateMod, sim, orders, staff };
/** What check-layout.mjs plays: the New Game form's name, Easy, its fixed clock as the seed, two hires. */
const SETUP = { shopName: 'Cà Phê Gió Mùa', difficulty: 'easy', seed: 1760400000000 >>> 0, hires: 2 };

describe('playFirstDay', () => {
  const s = playFirstDay(mods, SETUP);
  /** The browser's first tick after Tiếp tục. */
  const ended = structuredClone(s);
  sim.step(ended, 1);

  it('stops open on day 1, one tick before the report, with the two hires in the roles the Nhân viên panel gives', () => {
    expect(s.day).toBe(1);
    expect(['opening', 'peak', 'closing']).toContain(s.phase);
    expect(s.lastReport ?? null).toBeNull();
    expect(s.shopName).toBe(SETUP.shopName);
    expect(s.difficulty).toBe('easy');
    expect(s.staff.map((m) => m.role)).toEqual(['barista', 'server']);
    expect(ended.phase).toBe('report');
    expect(ended.events.some((e) => e.type === 'dayEnded')).toBe(true);
  });

  it('ends on a report with customers served and reviews, so the Daily Report and Đánh giá tab have content', () => {
    const r = ended.lastReport;
    expect(r).not.toBeNull();
    expect(r!.day).toBe(1);
    expect(r!.customersArrived).toBeGreaterThan(0);
    expect(r!.customersServed).toBeGreaterThan(0);
    expect(r!.revenue).toBeGreaterThan(0);
    expect(r!.reviews.length).toBeGreaterThan(0);
  });

  it('is deterministic and writes a save that loads back and ends the same way', () => {
    expect(playFirstDay(mods, SETUP)).toEqual(s);
    const back = loadSave(save, saveText(save, s));
    expect(back.phase).toBe(s.phase);
    expect(back.minute).toBe(s.minute);
    sim.step(back, 1);
    expect(back.phase).toBe('report');
    expect(back.lastReport).toEqual(ended.lastReport);
  });
});
