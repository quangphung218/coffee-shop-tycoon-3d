import { Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createActors } from '../../src/render/actors';
import { LabelAssets, popScale } from '../../src/render/actors/labels';
import { ALL_ANIMS, CALM_BOUNCE, IDLE_BOUNCE_PERIOD, SEATED_ANIMS, bounceFor } from '../../src/render/actors/animations';
import {
  CHIP_SECONDS,
  COIN_APEX,
  COIN_BURST,
  COIN_JUMP,
  COIN_POOL,
  COIN_SECONDS,
  CoinFx,
  DEBRIS_BY_QUALITY,
  HOT_ITEMS,
  STEAM_PUFFS,
  STEAM_PUFFS_BY_QUALITY,
  Steam,
  coinPose,
  setSteamQuality,
  steamFor,
  steamPuffCount,
} from '../../src/render/actors/fx';
import { createNewGame } from '../../src/sim/state';
import type { GameState, MenuItemId, StaffTask } from '../../src/sim/types';

function newState(): GameState {
  const state = createNewGame('Test', 'normal', 42);
  state.phase = 'opening';
  return state;
}

/** A waiting customer with a ready order of `itemId`; returns the order id. */
function addOrder(state: GameState, itemId: MenuItemId): number {
  const customerId = state.nextId++;
  state.customers.push({
    id: customerId,
    state: 'waiting',
    pos: { x: 0, z: -1 },
    target: { x: 0, z: -1 },
    patience: 30,
    maxPatience: 40,
    order: itemId,
    tableId: null,
    timer: 0,
    look: 1,
  });
  const id = state.nextId++;
  state.orders.push({ id, customerId, itemId, status: 'ready', remaining: 0, staffId: null });
  return id;
}

describe('bounceFor', () => {
  it('keeps the volume while squashing', () => {
    for (const anim of ALL_ANIMS) {
      for (let t = 0; t < 3; t += 0.07) {
        const b = bounceFor(anim, t, t, false);
        expect(b.sx * b.sx * b.sy).toBeCloseTo(1, 6);
        expect(b.lift).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('bobs standing people every 1.2 s down to 0.96 and leaves seated ones still', () => {
    const top = bounceFor('idle', 0, 0, false);
    const low = bounceFor('idle', 0, IDLE_BOUNCE_PERIOD / 2, false);
    expect(top.sy).toBeCloseTo(1, 6);
    expect(low.sy).toBeCloseTo(0.96, 6);
    expect(bounceFor('idle', 0, IDLE_BOUNCE_PERIOD * 3.5, false).sy).toBeCloseTo(low.sy, 6);
    for (const anim of SEATED_ANIMS) expect(bounceFor(anim, 1, 0.6, false)).toEqual({ sx: 1, sy: 1, lift: 0 });
  });

  it('hops and squashes on landing while walking', () => {
    const land = bounceFor('walk', 0, 0, false);
    const air = bounceFor('walk', 0.2, 0, false);
    expect(land.sy).toBeCloseTo(0.94, 6);
    expect(land.lift).toBeCloseTo(0, 6);
    expect(air.lift).toBeCloseTo(0.06, 6);
    expect(air.sy).toBeGreaterThan(1);
  });

  it('shrinks the motion when calm', () => {
    const full = bounceFor('walk', 0, 0, false);
    const calm = bounceFor('walk', 0, 0, true);
    expect(1 - calm.sy).toBeCloseTo((1 - full.sy) * CALM_BOUNCE, 6);
    expect(bounceFor('walk', 0.2, 0, true).lift).toBeCloseTo(0.06 * CALM_BOUNCE, 6);
  });
});

describe('steam', () => {
  it('knows the hot menu items from the sim data', () => {
    expect(HOT_ITEMS.has('latte')).toBe(true);
    expect(HOT_ITEMS.has('espresso')).toBe(true);
    expect(HOT_ITEMS.has('americano')).toBe(false);
    expect(HOT_ITEMS.has('milk_tea')).toBe(false);
  });

  it('rises only from a hot drink being carried or brewed in place', () => {
    const state = newState();
    const hot = addOrder(state, 'latte');
    const cold = addOrder(state, 'orange_juice');
    const task = (kind: StaffTask['kind'], targetId: number | null): StaffTask => ({ kind, targetId, remaining: 1 });
    expect(steamFor(state, task('serve', hot), true)).toBe(true);
    expect(steamFor(state, task('serve', hot), false)).toBe(true);
    expect(steamFor(state, task('brew', hot), false)).toBe(true);
    // Walking to the machine: nothing made yet.
    expect(steamFor(state, task('brew', hot), true)).toBe(false);
    expect(steamFor(state, task('serve', cold), true)).toBe(false);
    expect(steamFor(state, task('brew', cold), false)).toBe(false);
    expect(steamFor(state, task('clean', hot), false)).toBe(false);
    expect(steamFor(state, task('serve', 9999), true)).toBe(false);
    expect(steamFor(state, null, false)).toBe(false);
  });

  it('animates its puffs only while on', () => {
    setSteamQuality('high');
    const steam = new Steam(null);
    expect(steam.group.children).toHaveLength(STEAM_PUFFS);
    steam.update(true, 0.4);
    expect(steam.active).toBe(true);
    const ys = steam.group.children.map((s) => s.position.y);
    expect(new Set(ys).size).toBe(STEAM_PUFFS);
    steam.update(false, 0.8);
    expect(steam.active).toBe(false);
    expect(steam.shown).toBe(0);
    steam.dispose();
    setSteamQuality('medium');
  });

  it('shows 3 puffs at medium and 5 at high, for every plume including one built before the change', () => {
    expect(STEAM_PUFFS_BY_QUALITY).toEqual({ low: 0, medium: 3, high: 5 });
    const steam = new Steam(null);
    setSteamQuality('medium');
    steam.update(true, 0.4);
    expect(steam.shown).toBe(3);
    setSteamQuality('high');
    expect(steamPuffCount()).toBe(5);
    steam.update(true, 0.5);
    expect(steam.shown).toBe(5);
    const visible = steam.group.children.filter((s) => s.visible);
    expect(new Set(visible.map((s) => s.position.y)).size).toBe(5);
    setSteamQuality('medium');
    steam.update(true, 0.6);
    expect(steam.shown).toBe(3);
    steam.dispose();
  });

  it('follows the actors quality, which the machine steam shares', () => {
    const actors = createActors(new Scene(), { quality: 'high' });
    expect(steamPuffCount()).toBe(5);
    actors.setQuality('medium');
    expect(steamPuffCount()).toBe(3);
    actors.setQuality('low');
    expect(steamPuffCount()).toBe(0);
    actors.setQuality('medium');
    actors.dispose();
  });

  it('shows on a worker carrying a hot drink, not a cold one, and never at low quality', () => {
    const state = newState();
    const hot = addOrder(state, 'cappuccino');
    const cold = addOrder(state, 'lemon_tea');
    state.playerTasks = [{ kind: 'serve', targetId: hot, remaining: 1 }];
    const actors = createActors(new Scene());
    actors.update(state, 0);
    expect(actors.inspect('player')!.steam).toBe(true);

    state.playerTasks = [{ kind: 'serve', targetId: cold, remaining: 1 }];
    actors.update(state, 0);
    expect(actors.inspect('player')!.steam).toBe(false);

    state.playerTasks = [{ kind: 'serve', targetId: hot, remaining: 1 }];
    actors.setQuality('low');
    actors.update(state, 0);
    expect(actors.inspect('player')!.steam).toBe(false);
    actors.setQuality('medium');
    actors.update(state, 0);
    expect(actors.inspect('player')!.steam).toBe(true);
    actors.dispose();
  });

  it('starts off at low quality', () => {
    const state = newState();
    state.playerTasks = [{ kind: 'serve', targetId: addOrder(state, 'mocha'), remaining: 1 }];
    const actors = createActors(new Scene(), { quality: 'low' });
    actors.update(state, 0);
    expect(actors.inspect('player')!.steam).toBe(false);
    actors.dispose();
  });
});

describe('reduced motion setting', () => {
  function stubMedia(matches: boolean): () => void {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches, media: query }) as MediaQueryList);
    return () => vi.unstubAllGlobals();
  }

  it('calms the actors when forced on at creation, even if the OS does not ask', () => {
    const restore = stubMedia(false);
    const state = newState();
    state.playerTasks = [{ kind: 'serve', targetId: addOrder(state, 'mocha'), remaining: 1 }];
    const actors = createActors(new Scene(), { reducedMotion: true });
    expect(actors.calm()).toBe(true);
    actors.update(state, 0);
    expect(actors.inspect('player')!.steam).toBe(false);
    actors.dispose();
    restore();
  });

  it('follows the setting when it changes at runtime', () => {
    const restore = stubMedia(false);
    const state = newState();
    state.playerTasks = [{ kind: 'serve', targetId: addOrder(state, 'mocha'), remaining: 1 }];
    const actors = createActors(new Scene());
    expect(actors.calm()).toBe(false);
    actors.update(state, 0);
    expect(actors.inspect('player')!.steam).toBe(true);

    actors.setReducedMotion(true);
    expect(actors.calm()).toBe(true);
    actors.update(state, 0);
    expect(actors.inspect('player')!.steam).toBe(false);

    actors.setReducedMotion(false);
    expect(actors.calm()).toBe(false);
    actors.dispose();
    restore();
  });

  it('still honours the OS media query when the setting is off', () => {
    const restore = stubMedia(true);
    const actors = createActors(new Scene(), { reducedMotion: false });
    expect(actors.calm()).toBe(true);
    actors.dispose();
    restore();
  });

  it('skips the bubble pop-in when forced on', () => {
    const restore = stubMedia(false);
    const assets = new LabelAssets();
    expect(assets.reducedMotion).toBe(false);
    assets.forceReducedMotion = true;
    expect(assets.reducedMotion).toBe(true);
    expect(popScale(0.05, assets.reducedMotion)).toBe(1);
    assets.dispose();
    restore();
  });
});

describe('coins', () => {
  it('reuses pooled coins once they have faded', () => {
    const fx = new CoinFx(null);
    for (let i = 0; i < 4; i++) fx.spawn(25000, { x: i, z: 0 }, 0);
    fx.update(0.5, false);
    expect(fx.stats()).toEqual({ live: 4, free: 0, created: 4 });
    fx.update(COIN_SECONDS + 0.01, false);
    expect(fx.stats()).toEqual({ live: 0, free: 4, created: 4 });
    for (let round = 1; round <= 5; round++) {
      for (let i = 0; i < 3; i++) fx.spawn(40000, { x: 0, z: i }, round * 2);
      fx.update(round * 2 + 0.1, false);
      fx.update(round * 2 + COIN_SECONDS + 0.1, false);
    }
    expect(fx.stats().created).toBe(4);
    expect(fx.stats().live).toBe(0);
    fx.dispose();
  });

  it('lives at most 1.1 s and keeps the chip on its old 0.9 s popup', () => {
    expect(COIN_SECONDS).toBeLessThanOrEqual(1.1);
    expect(CHIP_SECONDS).toBe(0.9);
  });

  it('hops up an arc that tops out at COIN_APEX and ends burst and gone', () => {
    const apexAge = COIN_APEX * COIN_SECONDS;
    const apex = coinPose(apexAge, false).y;
    expect(apex).toBeCloseTo(COIN_JUMP, 6);
    for (let age = 0; age <= COIN_SECONDS; age += 0.01) expect(coinPose(age, false).y).toBeLessThanOrEqual(apex + 1e-9);
    expect(coinPose(0, false).y).toBe(0);
    expect(coinPose(apexAge * 0.5, false).y).toBeGreaterThan(0);
    expect(coinPose(apexAge * 0.5, false).y).toBeLessThan(apex);
    // Spins about y and leans while flying, not yet bursting.
    const mid = coinPose(COIN_SECONDS * 0.3, false);
    expect(mid.spin).toBeLessThan(1);
    expect(mid.tilt).toBeGreaterThan(0);
    expect(mid.burst).toBe(0);
    expect(mid.opacity).toBe(1);
    const end = coinPose(COIN_SECONDS, false);
    expect(end.burst).toBe(1);
    expect(end.opacity).toBe(0);
    expect(end.size).toBe(0);
    expect(end.y).toBeGreaterThan(0);
    expect(coinPose(COIN_BURST * COIN_SECONDS - 0.001, false).burst).toBe(0);
  });

  it('is pure: the same age gives the same pose, written into the given object', () => {
    const out = coinPose(0.2, false);
    const again = coinPose(0.2, false, out);
    expect(again).toBe(out);
    expect(again).toEqual(coinPose(0.2, false));
  });

  it('floats still and fades without spin or burst when calm', () => {
    for (let age = 0; age <= COIN_SECONDS; age += 0.05) {
      const p = coinPose(age, true);
      expect(p).toMatchObject({ y: 0, spin: 1, tilt: 0, size: 1, burst: 0 });
    }
    expect(coinPose(0.1, true).opacity).toBe(1);
    expect(coinPose(0.8, true).opacity).toBeLessThan(0.5);
    expect(coinPose(CHIP_SECONDS, true).opacity).toBe(0);
  });

  it('arcs up and bursts into small coins by quality', () => {
    expect(DEBRIS_BY_QUALITY.low).toBe(0);
    const late = COIN_SECONDS * 0.9;
    for (const q of ['low', 'medium', 'high'] as const) {
      const fx = new CoinFx(null);
      fx.setQuality(q);
      fx.spawn(10000, { x: 0, z: 0 }, 0);
      fx.update(0.05, false);
      const start = fx.peek(0)!;
      expect(start.debris).toBe(0);
      fx.update(COIN_APEX * COIN_SECONDS, false);
      expect(fx.peek(0)!.y).toBeCloseTo(start.y - coinPose(0.05, false).y + COIN_JUMP, 6);
      fx.update(late, false);
      const burst = fx.peek(0)!;
      expect(burst.debris).toBe(DEBRIS_BY_QUALITY[q]);
      expect(burst.opacity).toBeLessThan(1);
      fx.dispose();
    }
    expect(DEBRIS_BY_QUALITY.medium).toBeGreaterThanOrEqual(4);
    expect(DEBRIS_BY_QUALITY.high).toBeLessThanOrEqual(6);
  });

  it('keeps the chip rising and fading as before', () => {
    const fx = new CoinFx(null);
    fx.spawn(10000, { x: 0, z: 0 }, 0);
    fx.update(0.1, false);
    const early = fx.peek(0)!;
    fx.update(0.8, false);
    const late = fx.peek(0)!;
    expect(late.chipY).toBeGreaterThan(early.chipY);
    expect(early.chipOpacity).toBe(1);
    expect(late.chipOpacity).toBeLessThan(0.5);
    fx.dispose();
  });

  it('throws no small coins and stays put when calm, even at high quality', () => {
    const still = new CoinFx(null);
    still.setQuality('high');
    still.spawn(10000, { x: 0, z: 0 }, 0);
    still.update(0.1, true);
    const a = still.peek(0)!;
    for (let age = 0.1; age < COIN_SECONDS; age += 0.05) {
      still.update(age, true);
      expect(still.peek(0)!.debris).toBe(0);
    }
    still.update(0.8, true);
    const b = still.peek(0)!;
    expect(b.y).toBe(a.y);
    expect(b.chipY).toBe(a.chipY);
    expect(b.opacity).toBeLessThan(a.opacity);
    still.dispose();
  });

  it('never grows past COIN_POOL coins, over 100 spawns or a 4x lunch rush', () => {
    const fx = new CoinFx(null);
    fx.setQuality('high');
    for (let i = 0; i < 100; i++) fx.spawn(10000, { x: 0, z: 0 }, 0);
    fx.update(0.5, false);
    expect(fx.stats().created).toBe(COIN_POOL);
    expect(fx.stats().live).toBe(COIN_POOL);
    fx.update(COIN_SECONDS + 1, false);
    expect(fx.stats()).toEqual({ live: 0, free: COIN_POOL, created: COIN_POOL });
    // 4x: a sale every 0.125 s of real time for a minute, a frame every 1/60 s.
    let t = 10;
    for (let frame = 0; frame < 3600; frame++) {
      t += 1 / 60;
      if (frame % 8 === 0) fx.spawn(25000, { x: 0, z: 0 }, t);
      fx.update(t, false);
      expect(fx.stats().live).toBeLessThanOrEqual(COIN_POOL);
    }
    expect(fx.stats().created).toBe(COIN_POOL);
    fx.dispose();
  });

  it('pops a coin for each cash event the actors see', () => {
    const state = newState();
    const actors = createActors(new Scene());
    state.events.push({ type: 'cash', amount: 35000, pos: { x: 0, z: 0 } }, { type: 'served', customerId: 1, itemId: 'latte' });
    actors.update(state, 0);
    expect(actors.stats().coins).toBe(1);
    state.events.length = 0;
    actors.update(state, 0);
    expect(actors.stats().coins).toBe(1);
    actors.dispose();
  });
});
