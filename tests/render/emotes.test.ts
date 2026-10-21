import { Scene, type Mesh } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActors } from '../../src/render/actors';
import { Emote, emoteGeometry, emotePose, type EmotePose } from '../../src/render/actors/emotes';
import { MOODS, createCharacter } from '../../src/render/actors/rig';
import {
  EMOTE_KINDS,
  EMOTE_SECONDS,
  IMPATIENT_FRAC,
  customerMood,
  emoteFor,
  emoteForEvent,
  moodWithEmote,
  type EmoteCue,
} from '../../src/render/actors/sync';
import { createNewGame } from '../../src/sim/state';
import type { Customer, GameState } from '../../src/sim/types';

function newState(): GameState {
  const state = createNewGame('Test', 'normal', 42);
  state.phase = 'opening';
  return state;
}

function addCustomer(state: GameState, over: Partial<Customer> = {}): Customer {
  const c: Customer = {
    id: state.nextId++,
    state: 'queueing',
    pos: { x: 0, z: 2 },
    target: { x: 0, z: 2 },
    patience: 30,
    maxPatience: 40,
    order: 'latte',
    tableId: null,
    timer: 0,
    look: 2,
    ...over,
  };
  state.customers.push(c);
  return c;
}

const pose = (): EmotePose => ({ scale: 0, lift: 0, sway: 0 });

describe('emote choice', () => {
  it('starts a heart on served and a cloud only when storming out with patience left', () => {
    const state = newState();
    const outOfStock = addCustomer(state, { state: 'angry_leave', patience: 12 });
    const tooLong = addCustomer(state, { state: 'angry_leave', patience: 0 });
    expect(emoteForEvent({ type: 'served', customerId: outOfStock.id, itemId: 'latte' }, outOfStock)).toBe('heart');
    expect(emoteForEvent({ type: 'angry', customerId: outOfStock.id }, outOfStock)).toBe('cloud');
    expect(emoteForEvent({ type: 'angry', customerId: tooLong.id }, tooLong)).toBeNull();
    // The customer already left the sim: no reason to read, no cloud.
    expect(emoteForEvent({ type: 'angry', customerId: 99 }, undefined)).toBeNull();
    expect(emoteForEvent({ type: 'doorbell', customerId: outOfStock.id }, outOfStock)).toBeNull();
  });

  it('shows a running cue first, then sweat while impatient, else nothing', () => {
    const heart: EmoteCue = { kind: 'heart', start: 0 };
    expect(emoteFor('drinking', 1, heart, 0)).toBe('heart');
    expect(emoteFor('drinking', 1, heart, EMOTE_SECONDS.heart - 0.01)).toBe('heart');
    // Ends on time, and never shows before it starts.
    expect(emoteFor('drinking', 1, heart, EMOTE_SECONDS.heart)).toBeNull();
    expect(emoteFor('drinking', 1, heart, -0.5)).toBeNull();
    const cloud: EmoteCue = { kind: 'cloud', start: 0 };
    expect(emoteFor('angry_leave', 0.5, cloud, EMOTE_SECONDS.cloud - 0.01)).toBe('cloud');
    expect(emoteFor('angry_leave', 0.5, cloud, EMOTE_SECONDS.cloud)).toBeNull();
    // Sweat follows the impatient face and waits behind a timed cue.
    const none: EmoteCue = { kind: 'heart', start: -Infinity };
    expect(emoteFor('queueing', IMPATIENT_FRAC - 0.01, none, 50)).toBe('sweat');
    expect(emoteFor('queueing', IMPATIENT_FRAC + 0.01, none, 50)).toBeNull();
    expect(emoteFor('ordering', 0.1, none, 50)).toBeNull();
    expect(emoteFor('queueing', 0.1, { kind: 'heart', start: 50 }, 50.5)).toBe('heart');
    expect(emoteFor('queueing', 0.1, null, 50)).toBe('sweat');
  });

  it('wears the sad face under the cloud and the usual face otherwise', () => {
    expect(moodWithEmote(customerMood('angry_leave', 0.5), 'cloud')).toBe('sad');
    expect(moodWithEmote(customerMood('angry_leave', 0.5), null)).toBe('angry');
    expect(moodWithEmote('happy', 'heart')).toBe('happy');
    expect(moodWithEmote('impatient', 'sweat')).toBe('impatient');
  });
});

describe('emote pose', () => {
  it('pops in with an overshoot, floats and shrinks away by the end', () => {
    const scales = Array.from({ length: 12 }, (_, i) => emotePose('heart', (i * EMOTE_SECONDS.heart) / 12, false, pose()).scale);
    expect(scales[0]).toBeLessThan(0.2);
    expect(Math.max(...scales)).toBeGreaterThan(1.01);
    expect(emotePose('heart', EMOTE_SECONDS.heart, false, pose()).scale).toBe(0);
    expect(emotePose('heart', EMOTE_SECONDS.heart * 0.8, false, pose()).lift).toBeGreaterThan(0.1);
    expect(emotePose('sweat', EMOTE_SECONDS.sweat * 0.5, false, pose()).lift).toBeLessThan(0);
  });

  it('stands still at full size with reduced motion: no bounce, rise or sway', () => {
    for (const kind of EMOTE_KINDS) {
      for (let t = 0; t < 3; t += 0.05) {
        expect(emotePose(kind, t, true, pose())).toEqual({ scale: 1, lift: 0, sway: 0 });
      }
    }
  });
});

describe('Emote meshes', () => {
  it('share one merged geometry and one material per kind across every character, without shadows', () => {
    const a = new Emote();
    const b = new Emote();
    for (const kind of EMOTE_KINDS) {
      const ma = a.meshFor(kind);
      expect(ma.geometry).toBe(emoteGeometry()[kind]);
      expect(ma.geometry).toBe(b.meshFor(kind).geometry);
      expect(ma.material).toBe(b.meshFor(kind).material);
      expect(ma.castShadow).toBe(false);
      expect(ma.visible).toBe(false);
    }
    expect(a.group.children).toHaveLength(EMOTE_KINDS.length);
  });

  it('shows one kind at a time and hides them all again', () => {
    const e = new Emote();
    const visible = (): string[] => EMOTE_KINDS.filter((k) => e.meshFor(k).visible);
    e.update('heart', 0.4, false);
    expect(visible()).toEqual(['heart']);
    e.update('cloud', 0.4, true);
    expect(visible()).toEqual(['cloud']);
    expect(e.meshFor('cloud').scale.x).toBe(1);
    e.update(null, 0, false);
    expect(visible()).toEqual([]);
    e.update('sweat', 0.1, false);
    e.hide();
    expect(visible()).toEqual([]);
    expect(e.kindShown).toBeNull();
  });
});

describe('sad face', () => {
  it('builds for every mood in place, sad included', () => {
    expect(MOODS).toContain('sad');
    const char = createCharacter({ role: 'customer', look: 1 });
    const count = (): number => {
      let n = 0;
      char.root.traverse((o) => {
        if ((o as Mesh).isMesh) n += 1;
      });
      return n;
    };
    const before = count();
    char.setMood('sad');
    expect(count()).toBe(before);
    expect(char.isAngry).toBe(false);
  });
});

describe('emotes in the actors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a heart on served for its life, sweat while impatient, and a cloud on an out-of-stock exit', () => {
    let ms = 100_000;
    vi.spyOn(performance, 'now').mockImplementation(() => ms);
    const actors = createActors(new Scene(), { quality: 'high', reducedMotion: false });
    const state = newState();
    const drinker = addCustomer(state, { state: 'drinking', timer: 20 });
    const restless = addCustomer(state, { state: 'queueing', patience: 5, pos: { x: 1, z: 2 }, target: { x: 1, z: 2 } });
    actors.update(state, 0);
    expect(actors.inspect(`c${drinker.id}`)!.emote).toBeNull();
    expect(actors.inspect(`c${restless.id}`)!.emote).toBe('sweat');

    state.events.push({ type: 'served', customerId: drinker.id, itemId: 'latte' });
    ms += 16;
    actors.update(state, 0);
    state.events.length = 0;
    expect(actors.inspect(`c${drinker.id}`)!.emote).toBe('heart');
    ms += (EMOTE_SECONDS.heart - 0.1) * 1000;
    actors.update(state, 0);
    expect(actors.inspect(`c${drinker.id}`)!.emote).toBe('heart');
    ms += 200;
    actors.update(state, 0);
    expect(actors.inspect(`c${drinker.id}`)!.emote).toBeNull();

    // The order ran out: the sim turns them around with patience left.
    restless.state = 'angry_leave';
    state.events.push({ type: 'angry', customerId: restless.id });
    ms += 16;
    actors.update(state, 0);
    state.events.length = 0;
    expect(actors.inspect(`c${restless.id}`)!.emote).toBe('cloud');
    ms += EMOTE_SECONDS.cloud * 1000 + 50;
    actors.update(state, 0);
    expect(actors.inspect(`c${restless.id}`)!.emote).toBeNull();
    actors.dispose();
  });

  /** Local scale and position of the shown `kind` mesh at each frame, through the real actors. */
  function emoteFrames(options: { quality: 'low' | 'high'; reducedMotion: boolean }, kind: 'heart' | 'sweat'): string[] {
    let ms = 100_000;
    vi.spyOn(performance, 'now').mockImplementation(() => ms);
    const scene = new Scene();
    const actors = createActors(scene, options);
    const state = newState();
    const c =
      kind === 'heart'
        ? addCustomer(state, { state: 'drinking', timer: 20 })
        : addCustomer(state, { state: 'queueing', patience: 5 });
    actors.update(state, 0);
    if (kind === 'heart') state.events.push({ type: 'served', customerId: c.id, itemId: 'latte' });
    const frames: string[] = [];
    for (let i = 0; i < 12; i++) {
      actors.update(state, 0);
      state.events.length = 0;
      expect(actors.inspect(`c${c.id}`)!.emote).toBe(kind);
      const shown: Mesh[] = [];
      scene.traverse((o) => {
        if ((o as Mesh).isMesh && o.visible && (o as Mesh).geometry === emoteGeometry()[kind]) shown.push(o as Mesh);
      });
      expect(shown).toHaveLength(1);
      const m = shown[0]!;
      frames.push(JSON.stringify([m.scale.toArray(), m.position.toArray().map((v) => v.toFixed(5))]));
      ms += (EMOTE_SECONDS.heart * 1000) / 14;
    }
    actors.dispose();
    return frames;
  }

  it('keeps the emote shown but still on low quality and with reduced motion', () => {
    for (const options of [
      { quality: 'low', reducedMotion: false },
      { quality: 'high', reducedMotion: true },
    ] as const) {
      for (const kind of ['heart', 'sweat'] as const) {
        const frames = emoteFrames(options, kind);
        expect(new Set(frames).size, `${options.quality}/${options.reducedMotion}/${kind}`).toBe(1);
        expect(JSON.parse(frames[0]!)[0]).toEqual([1, 1, 1]);
      }
    }
    // The same frames move on high quality without reduced motion, so the check above can fail.
    expect(new Set(emoteFrames({ quality: 'high', reducedMotion: false }, 'heart')).size).toBeGreaterThan(1);
  });

  it('freezes emotes while paused and hides them when the body goes back to the pool', () => {
    let ms = 100_000;
    vi.spyOn(performance, 'now').mockImplementation(() => ms);
    const actors = createActors(new Scene(), { quality: 'high', reducedMotion: false });
    const state = newState();
    const c = addCustomer(state, { state: 'drinking', timer: 20 });
    actors.update(state, 0);
    state.events.push({ type: 'served', customerId: c.id, itemId: 'latte' });
    actors.update(state, 0);
    state.events.length = 0;
    state.paused = true;
    ms += 5000;
    actors.update(state, 0);
    expect(actors.inspect(`c${c.id}`)!.emote).toBe('heart');
    state.paused = false;
    const made = actors.stats().created;
    state.customers.length = 0;
    // A clock jump drops them at once instead of walking out.
    state.day += 1;
    actors.update(state, 0);
    expect(actors.inspect(`c${c.id}`)).toBeNull();
    // The reused body comes back with no heart left on it.
    const next = addCustomer(state, { state: 'ordering' });
    actors.update(state, 0);
    expect(actors.stats().created).toBe(made);
    expect(actors.inspect(`c${next.id}`)!.emote).toBeNull();
    actors.dispose();
  });
});
