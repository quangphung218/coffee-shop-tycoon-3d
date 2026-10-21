import { describe, expect, it } from 'vitest';
import { SCENES, SCENE_DAY, SHOT_MINUTES, SHOT_WEATHERS, hhmm, playToScene, saveText, shotName } from '../../scripts/lib/saves.mjs';
import { parseArgs } from '../../scripts/measure-frames.mjs';
import * as save from '../../src/save/save';
import * as sim from '../../src/sim/index';
import * as orders from '../../src/sim/orders';
import * as stateMod from '../../src/sim/state';

const mods = { stateMod, sim, orders };

describe('measure-frames parseArgs --scene', () => {
  it('takes each P29 scene id', () => {
    expect(parseArgs(['--scene', 'dusk-rain']).scene).toBe('dusk-rain');
    expect(parseArgs(['--scene', 'noon-sunny', '--runs', '2']).scene).toBe('noon-sunny');
    expect(parseArgs(['--fx']).scene).toBeNull();
  });

  it('refuses an unknown id, a missing id and --fx with --scene', () => {
    expect(() => parseArgs(['--scene', 'midnight-snow'])).toThrow(/Unknown scene: midnight-snow/);
    expect(() => parseArgs(['--scene'])).toThrow(/Unknown scene/);
    expect(() => parseArgs(['--fx', '--scene', 'dusk-rain'])).toThrow(/pick one/);
  });
});

describe('P29 scene saves', () => {
  it('plays to the minute and weather of each scene', () => {
    for (const scene of Object.values(SCENES)) {
      const s = playToScene(mods, scene);
      expect(s.day).toBe(SCENE_DAY);
      expect(s.minute).toBe(scene.minute);
      expect(s.weather).toBe(scene.weather);
      expect(['opening', 'peak']).toContain(s.phase);
    }
    expect(playToScene(mods, SCENES['dusk-rain']).customers.length).toBeGreaterThan(0);
  });

  it('writes a save of the current version that loads back at the same minute and weather', () => {
    const s = playToScene(mods, { weather: 'rainy', minute: 19 * 60 + 30 });
    const { key, text } = saveText(save, s);
    expect(key).toBe(save.saveKey('auto'));
    const raw = JSON.parse(text) as { version: number };
    expect(raw.version).toBe(save.SAVE_VERSION);
    const back = save.migrate(raw);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.state.minute).toBe(19 * 60 + 30);
    expect(back.value.state.weather).toBe('rainy');
  });

  it('names each shot by hour, weather, quality and width', () => {
    expect(SHOT_MINUTES.map(hhmm)).toEqual(['0700', '1200', '1930']);
    expect(SHOT_WEATHERS).toEqual(['sunny', 'rainy']);
    expect(shotName({ minute: 19 * 60 + 30, weather: 'rainy', quality: 'low', width: 390 })).toBe('scene-1930-rainy-low-390-p29.jpg');
  });
});
