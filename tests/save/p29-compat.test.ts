import { describe, expect, it } from 'vitest';
import { warmGlow } from '../../src/render/scene/ambient';
import { createLighting, lightingAt, type Lighting } from '../../src/render/street/layout';
import { loadGame, saveKey } from '../../src/save/save';
import { SAVE_VERSION } from '../../src/save/slots';
import { createMemoryStorage } from '../../src/save/storage';
import { dispatch, step } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameState, Weather } from '../../src/sim/types';
import { runOpenDay } from '../integration/helpers';

/**
 * P29 reads only state.minute and state.weather for the light, so saves of
 * every version (0..3) must load, keep playing and light up with finite
 * numbers, also when the weather is missing or one the game never rolls.
 */

const SAVED_AT = 1_700_000_000_000;
const DUSK = 18 * 60 + 10;

/** An open shop with a barista, played up to dusk on a rainy day, events cleared. */
function duskGame(weather: Weather = 'rainy'): GameState {
  const state = createNewGame('Quán P29', 'normal', 2929);
  const candidate = state.candidates[0]!;
  expect(dispatch(state, { type: 'hire_staff', candidateId: candidate.id, role: 'barista' })).toBe(true);
  dispatch(state, { type: 'apply_restock' });
  state.weather = weather;
  expect(dispatch(state, { type: 'start_day' })).toBe(true);
  runOpenDay(state, { untilMinute: DUSK });
  state.events = [];
  return state;
}

type Raw = Record<string, unknown>;

function raw(state: GameState): Raw {
  return JSON.parse(JSON.stringify(state)) as Raw;
}

/** Version 3: the current wrapper. */
function asV3(state: GameState): string {
  return JSON.stringify({ version: 3, savedAt: SAVED_AT, state: raw(state) });
}

/** Version 2: no week index or archive. */
function asV2(state: GameState): string {
  const s = raw(state);
  const week = s.week as Raw | undefined;
  if (week) {
    delete week.index;
    delete week.archive;
  }
  return JSON.stringify({ version: 2, savedAt: SAVED_AT, state: s });
}

/** Version 1: v2 without seed, shop level, XP and missions. */
function asV1(state: GameState): string {
  const s = (JSON.parse(asV2(state)) as { state: Raw }).state;
  for (const k of ['seed', 'shopLevel', 'xp', 'missions']) delete s[k];
  return JSON.stringify({ version: 1, savedAt: SAVED_AT, state: s });
}

/** Version 0: the prototype's bare state, without the lists and the weather a migration fills. */
function asV0(state: GameState): string {
  const s = (JSON.parse(asV1(state)) as { state: Raw }).state;
  for (const k of ['events', 'campaigns', 'orders', 'history', 'reviews', 'candidates', 'spawnAccumulator', 'today', 'weather']) {
    delete s[k];
  }
  return JSON.stringify(s);
}

function load(text: string): GameState {
  const storage = createMemoryStorage();
  storage.setItem(saveKey('1'), text);
  const r = loadGame('1', storage);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

function expectFinite(light: Lighting, label: string): void {
  const values = [light.sunScale, light.fillScale, light.lamps, ...light.sunDir, ...light.sun, ...light.sky];
  for (const v of values) expect(Number.isFinite(v), `${label}: ${values.join(', ')}`).toBe(true);
  expect(light.sunScale, label).toBeGreaterThan(0);
  expect(light.fillScale, label).toBeGreaterThan(0);
}

/** Steps the sim like the frame loop: 1/60 s frames at 1 game minute per real second for `seconds`. */
function play(state: GameState, seconds: number): void {
  for (let f = 0; f < seconds * 60; f++) step(state, 1 / 60);
}

const VERSIONS: readonly { version: number; text: (s: GameState) => string; weather: Weather }[] = [
  { version: 0, text: asV0, weather: 'sunny' },
  { version: 1, text: asV1, weather: 'rainy' },
  { version: 2, text: asV2, weather: 'rainy' },
  { version: 3, text: asV3, weather: 'rainy' },
];

describe('P29 save compatibility', { timeout: 60_000 }, () => {
  const saved = duskGame('rainy');

  it('starts from a mid-day rainy save at dusk', () => {
    expect(SAVE_VERSION).toBe(3);
    expect(['preparation', 'report']).not.toContain(saved.phase);
    expect(saved.minute).toBe(DUSK);
    expect(saved.weather).toBe('rainy');
  });

  for (const { version, text, weather } of VERSIONS) {
    it(`loads a v${version} save, keeps playing and lights it with finite numbers`, () => {
      const s = load(text(saved));
      expect(s.minute).toBe(DUSK);
      // Version 0 had no weather; the migration makes it sunny.
      expect(s.weather).toBe(weather);
      expect(s.phase).toBe(saved.phase);

      const out = createLighting();
      expectFinite(lightingAt(s.minute, s.weather, out), `v${version} loaded`);
      play(s, 5);
      expect(s.minute).toBeGreaterThan(DUSK);
      expectFinite(lightingAt(s.minute + s.tickAccumulator, s.weather, out), `v${version} played`);
      expect(warmGlow(s.minute, s.weather)).toBeGreaterThanOrEqual(0);
      expect(warmGlow(s.minute, s.weather)).toBeLessThanOrEqual(1);
    });
  }

  it('loads a save whose weather is unknown or missing and still lights it', () => {
    for (const bad of ['foggy', null, 42] as const) {
      const file = JSON.parse(asV3(saved)) as { state: Raw };
      file.state.weather = bad;
      const s = load(JSON.stringify(file));
      play(s, 2);
      for (const m of [s.minute, 7 * 60, 12 * 60, 21 * 60]) {
        expectFinite(lightingAt(m, s.weather, createLighting()), `${String(bad)} at ${m}`);
        expect(Number.isFinite(warmGlow(m, s.weather)), `${String(bad)} glow at ${m}`).toBe(true);
      }
    }
    const file = JSON.parse(asV3(saved)) as { state: Raw };
    delete file.state.weather;
    const s = load(JSON.stringify(file));
    expectFinite(lightingAt(s.minute, s.weather, createLighting()), 'missing weather');
    expect(Number.isFinite(warmGlow(s.minute, s.weather))).toBe(true);
  });

  it('gives finite light for odd clocks a hand-edited save could hold', () => {
    for (const w of ['sunny', 'rainy', 'hot', 'foggy', undefined] as unknown as Weather[]) {
      for (const m of [Number.NaN, Infinity, -Infinity, -60, 0, 1440, 99_999]) {
        expectFinite(lightingAt(m, w, createLighting()), `${String(w)} ${m}`);
      }
    }
  });
});
