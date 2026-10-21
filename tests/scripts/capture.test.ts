// scripts/capture.mjs: the scenario runner's arguments, templates, step selection and the shipped scenarios.
import { describe, expect, it } from 'vitest';
import { fill, loadScenario, parseArgs, selectSteps } from '../../scripts/capture.mjs';
import { SHOTS } from '../../scripts/lib/shots.mjs';

describe('parseArgs', () => {
  it('takes the scenario and the switches', () => {
    expect(parseArgs(['p30'])).toMatchObject({ scenario: 'p30', only: null, savesOnly: false, out: null, base: null });
    expect(parseArgs(['p29', '--only', 'coin,dusk', '--saves-only', '--headed', '--out', '/tmp/x', '--base', 'abc123'])).toMatchObject({
      scenario: 'p29',
      only: ['coin', 'dusk'],
      savesOnly: true,
      headed: true,
      out: '/tmp/x',
      base: 'abc123',
    });
  });

  it('refuses no scenario, two scenarios and an unknown switch', () => {
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(() => parseArgs(['p29', 'p30'])).toThrow(/One scenario at a time/);
    expect(() => parseArgs(['p29', '--loud'])).toThrow(/Unknown argument: --loud/);
  });
});

describe('fill', () => {
  it('fills {paths} from the context and leaves unknown ones', () => {
    expect(fill('Sau · {head} · HUD {after.clock}', { head: 'abc1234', after: { clock: '12:05' } })).toBe('Sau · abc1234 · HUD 12:05');
    expect(fill('{missing.path}', {})).toBe('{missing.path}');
    expect(fill('{rows[0].text}', { rows: [{ text: 'x' }] })).toBe('x');
  });

  it('calls a function with the context and passes other values through', () => {
    expect(fill((c: { n: number }) => `n=${c.n}`, { n: 3 })).toBe('n=3');
    expect(fill(42, {})).toBe(42);
  });
});

describe('selectSteps', () => {
  const steps = [{ id: 'a', tags: ['coin'] }, { id: 'b', tags: ['dusk'] }, { id: 'c' }];
  it('keeps the steps tagged in only, and untagged steps always', () => {
    expect(selectSteps(steps, ['coin']).map((s) => s.id)).toEqual(['a', 'c']);
    expect(selectSteps(steps, null).map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('the shipped scenarios', () => {
  it('p29 and p30 load, use known shot kinds and name the files docs/media.md lists', async () => {
    const p29 = await loadScenario('p29');
    const p30 = await loadScenario('p30');
    for (const sc of [p29, p30]) {
      for (const s of sc.steps) {
        if (s.kind === 'shot' || s.kind === 'pair') expect(Object.keys(SHOTS), `${sc.id} ${s.id}`).toContain(s.shot);
        if (s.kind === 'board') expect(typeof s.file === 'string' || typeof s.file === 'function').toBe(true);
      }
    }
    const boards = (sc: { steps: { kind: string; file?: unknown }[] }) => sc.steps.filter((s) => s.kind === 'board').map((s) => s.file);
    expect(boards(p30)).toEqual(['emotes-before-after-p30.jpg', 'uniform-latte-before-after-p30.jpg', 'uniform-picker-390-before-after-p30.jpg', 'regulars-390-before-after-p30.jpg']);
    expect(boards(p29)).toEqual(['hours-sunny-high-1280-p29.jpg', 'coin-before-after-p29.jpg', 'dusk-sunny-high-before-after-p29.jpg']);
    expect(p29.steps.filter((s) => s.kind === 'shot' && s.shot === 'scene')).toHaveLength(24);
    expect(p29.tags).toEqual(['scenes', 'coin', 'dusk', 'levelup']);
    expect(p30.out).toBe('docs/reports/p30-characters');
  });

  it('refuses a scenario that is not there', async () => {
    await expect(loadScenario('p99')).rejects.toThrow(/no scenario at/);
  });
});
