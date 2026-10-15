import { Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createActors } from '../../src/render/actors';
import { LabelAssets, popScale } from '../../src/render/actors/labels';
import { ALL_ANIMS, CALM_BOUNCE, IDLE_BOUNCE_PERIOD, SEATED_ANIMS, bounceFor } from '../../src/render/actors/animations';
import { COIN_SECONDS, CoinFx, HOT_ITEMS, STEAM_PUFFS, Steam, steamFor } from '../../src/render/actors/fx';
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
    const steam = new Steam(null);
    expect(steam.group.children).toHaveLength(STEAM_PUFFS);
    steam.update(true, 0.4);
    expect(steam.active).toBe(true);
    const ys = steam.group.children.map((s) => s.position.y);
    expect(new Set(ys).size).toBe(STEAM_PUFFS);
    steam.update(false, 0.8);
    expect(steam.active).toBe(false);
    steam.dispose();
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

  it('rises and fades, or stays put and fades when calm', () => {
    const fx = new CoinFx(null);
    fx.spawn(10000, { x: 0, z: 0 }, 0);
    fx.update(0.1, false);
    const early = fx.peek(0)!;
    fx.update(0.8, false);
    const late = fx.peek(0)!;
    expect(late.y).toBeGreaterThan(early.y);
    expect(early.opacity).toBe(1);
    expect(late.opacity).toBeLessThan(0.5);

    const still = new CoinFx(null);
    still.spawn(10000, { x: 0, z: 0 }, 0);
    still.update(0.1, true);
    const a = still.peek(0)!;
    still.update(0.8, true);
    const b = still.peek(0)!;
    expect(b.y).toBe(a.y);
    expect(b.opacity).toBeLessThan(a.opacity);
    fx.dispose();
    still.dispose();
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
