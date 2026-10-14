import { Group, type Object3D, type Raycaster, type Scene } from 'three';
import type { Quality } from '../../save/settings';
import { buildNavGrid, type NavGrid } from '../../sim/nav';
import type { Command, GameState, Vec2 } from '../../sim/types';
import { getShopLayout, type ShopLayout } from '../../sim/upgrades';
import { layoutKey } from '../scene/shop';
import { ANIM_PERIOD, IDLE_BOUNCE_PERIOD, MOVING_ANIMS, bounceFor, poseFor, type AnimName } from './animations';
import { CoinFx, Steam, puffTexture, steamFor } from './fx';
import { Label, LabelAssets, commandForCustomer, labelFor } from './labels';
import { Pool } from './pool';
import { createCharacter, disposeSharedRig, type Character, type CharacterRole } from './rig';
import {
  ANGRY_SPEED,
  SEPARATION_RATE,
  STAFF_SPEED,
  WALK_SPEED,
  advance,
  angleDelta,
  createMotion,
  customerAnim,
  customerGoal,
  headingOf,
  playerHome,
  playerSpot,
  separate,
  setGoal,
  shownX,
  shownZ,
  snap,
  stepDistance,
  workerAnim,
  workerGoal,
  type Goal,
  type Motion,
} from './sync';

/**
 * Customers, staff and the player as animated low-poly people. Reads the
 * state every frame, never changes it; clicks on customers become Commands.
 */
export interface Actors {
  /** Syncs people with `state`; `alpha` is the fraction of the next sim tick already elapsed. */
  update(state: GameState, alpha: number): void;
  /** Command for the customer under the ray (take an order, carry a ready drink), or null. */
  pick(ray: Raycaster): Command | null;
  /** Live and pooled character counts, plus live and ever-made coin popups (tests, debugging). */
  stats(): { live: number; free: number; created: number; coins: number; coinsCreated: number };
  /** Snapshot of one person: 'c<id>' customer, 's<id>' staff, 'player'. */
  inspect(key: string): ActorInfo | null;
  /** Low quality drops the steam, keeps coins still and softens the bounce. */
  setQuality(quality: Quality): void;
  dispose(): void;
}

export interface ActorsOptions {
  quality?: Quality;
}

export interface ActorInfo {
  anim: AnimName;
  pos: Vec2;
  heading: number;
  visible: boolean;
  label: string | null;
  /** Steam is rising from a hot drink in their hands. */
  steam: boolean;
  /** Vertical squash of the body (1 = none). */
  squash: number;
}

/** World units walked per animation loop of a moving animation. */
const STRIDE = 0.9;
/** Most stride loops per real second, so 4× speed does not turn legs into a blur. */
const MAX_STRIDES_PER_SECOND = 3;
/** A jump in the game clock bigger than this (new day, loaded save) snaps everyone into place. */
const MAX_GAME_STEP = 30;
const MAX_FRAME_DT = 0.1;
const TURN_RATE = 10;

interface Body {
  char: Character;
  label: Label;
  steam: Steam;
}

interface Actor {
  key: string;
  kind: 'customer' | 'staff' | 'player';
  id: number;
  body: Body;
  motion: Motion;
  goal: Goal;
  heading: number;
  phase: number;
  anim: AnimName;
  angry: boolean;
  /** Left the sim while still walking out; released once through the door. */
  ghost: boolean;
  /** Reached the exit; hidden until the sim drops the customer. */
  gone: boolean;
  seen: number;
  /** Offset into the standing bob, so people do not breathe in step. */
  bobOffset: number;
}

export function createActors(scene: Scene, options: ActorsOptions = {}): Actors {
  const root = new Group();
  root.name = 'actors';
  scene.add(root);
  const assets = new LabelAssets();
  const puff = puffTexture();
  const coins = new CoinFx(assets.face('i-coin').map);
  root.add(coins.group);
  let quality: Quality = options.quality ?? 'medium';
  const pool = new Pool<Body>(
    () => {
      const char = createCharacter({ role: 'customer', look: 0 });
      const label = new Label(assets);
      char.labelAnchor.add(label.group);
      const steam = new Steam(puff);
      char.steamAnchor.add(steam.group);
      root.add(char.root);
      return { char, label, steam };
    },
    (body) => {
      body.char.root.visible = false;
      body.steam.update(false, 0);
    },
  );
  const actors = new Map<string, Actor>();
  const byHitbox = new Map<Object3D, Actor>();
  const dir = { x: 0, z: 1 };
  let layout: ShopLayout | null = null;
  let grid: NavGrid | null = null;
  let layoutSig = -1;
  /** The player's spot, worked out again only when what it depends on changes (not every frame). */
  let playerAt: Vec2 | null = null;
  const playerKey = { clock: -1, layout: -1, task: null as GameState['playerTasks'][number] | null, customers: -1, staff: -1 };
  /** Motions of everyone on screen this frame, for separate(); reused so frames allocate nothing. */
  const walking: Motion[] = [];
  const walkingRoots: Object3D[] = [];
  let walkingCount = 0;
  let lastState: GameState | null = null;
  let lastClock = -1;
  let lastTime = -1;
  let frame = 0;

  function spawn(key: string, kind: Actor['kind'], id: number, role: CharacterRole, look: number, pos: Vec2): Actor {
    const body = pool.acquire();
    body.char.setLook({ role, look });
    body.char.root.visible = true;
    const actor: Actor = {
      key,
      kind,
      id,
      body,
      motion: createMotion(pos),
      goal: { pos, face: null, seated: false },
      heading: Math.PI,
      phase: (id * 0.37) % 3,
      anim: 'idle',
      angry: false,
      ghost: false,
      gone: false,
      seen: frame,
      // Golden-ratio spread keeps neighbouring ids far apart in the cycle.
      bobOffset: ((id * 0.618034) % 1) * IDLE_BOUNCE_PERIOD,
    };
    actors.set(key, actor);
    byHitbox.set(body.char.hitbox, actor);
    return actor;
  }

  function release(actor: Actor): void {
    actors.delete(actor.key);
    byHitbox.delete(actor.body.char.hitbox);
    pool.release(actor.body);
  }

  function markSeen(key: string): void {
    const actor = actors.get(key);
    if (actor) actor.seen = frame;
  }

  function ensure(key: string, kind: Actor['kind'], id: number, role: CharacterRole, look: number, pos: Vec2): Actor {
    let actor = actors.get(key);
    if (!actor) actor = spawn(key, kind, id, role, look, pos);
    else if (actor.body.char.role !== role || actor.body.char.look !== look) actor.body.char.setLook({ role, look });
    actor.seen = frame;
    return actor;
  }

  /** Low quality or prefers-reduced-motion: no steam, still coins, a softer bounce. */
  function calm(): boolean {
    return quality === 'low' || assets.reducedMotion;
  }

  /**
   * Walks, turns and poses one person for this frame. `now` is real seconds;
   * returns whether they are still walking (false before the shop has a layout).
   */
  function animate(
    actor: Actor,
    anim: (moving: boolean, seated: boolean) => AnimName,
    speed: number,
    dtGame: number,
    dtReal: number,
    snapNow: boolean,
    now: number,
  ): boolean {
    const m = actor.motion;
    if (!layout) return false;
    setGoal(m, actor.goal.pos, layout, actor.goal.seated);
    if (snapNow) snap(m);
    walking[walkingCount] = m;
    walkingRoots[walkingCount++] = actor.body.char.root;
    const moved = advance(m, stepDistance(m, speed, dtGame), dir);
    // Still on the way (also while paused mid-walk, which freezes the stride).
    const moving = m.path.length > 0;
    const seated = actor.goal.seated && !moving;
    const next = anim(moving, seated);
    actor.anim = next;

    const target = moved > 1e-4 ? headingOf(dir.x, dir.z) : (actor.goal.face ?? actor.heading);
    const k = snapNow ? 1 : 1 - Math.exp(-TURN_RATE * dtReal);
    actor.heading += angleDelta(actor.heading, target) * k;

    if (MOVING_ANIMS.has(next)) {
      const cycles = Math.min(moved / STRIDE, dtReal * MAX_STRIDES_PER_SECOND);
      actor.phase += cycles * ANIM_PERIOD[next];
    } else {
      actor.phase += dtReal;
    }
    // Keep the phase small so float precision holds over a long session.
    if (actor.phase > 1e4) actor.phase %= 120;

    const char = actor.body.char;
    char.applyPose(poseFor(next, actor.phase));
    char.applyBounce(bounceFor(next, actor.phase, now + actor.bobOffset, calm()));
    char.showProps(next);
    char.setAngry(actor.angry);
    char.root.position.set(m.pos.x, 0, m.pos.z);
    char.root.rotation.y = actor.heading;
    return moving;
  }

  function customerSpeed(actor: Actor): number {
    return actor.angry ? ANGRY_SPEED : WALK_SPEED;
  }

  /** True once a leaving customer has walked through the door and out of sight. */
  function reachedExit(actor: Actor): boolean {
    return actor.motion.path.length === 0 && actor.goal.face === null && !actor.goal.seated;
  }

  return {
    update(state: GameState, alpha: number): void {
      lastState = state;
      frame += 1;
      const now = performance.now() / 1000;
      const dtReal = lastTime < 0 ? 0 : Math.min(Math.max(0, now - lastTime), MAX_FRAME_DT);
      lastTime = now;
      const still = calm();
      const clock = state.day * 1440 + state.minute + Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0));
      let dtGame = lastClock < 0 ? 0 : clock - lastClock;
      const jump = lastClock < 0 || dtGame < 0 || dtGame > MAX_GAME_STEP;
      if (jump) dtGame = 0;
      lastClock = clock;

      const sig = layoutKey(state);
      if (!layout || sig !== layoutSig) {
        layout = getShopLayout(state);
        grid = buildNavGrid(layout);
        layoutSig = sig;
      }
      const shop = layout;
      walkingCount = 0;

      // Free the characters of people who left before handing out new ones.
      for (const c of state.customers) markSeen(`c${c.id}`);
      for (const s of state.staff) markSeen(`s${s.id}`);
      markSeen('player');
      for (const actor of [...actors.values()]) {
        if (actor.seen === frame) continue;
        // Customers dropped by the sim mid-exit finish walking out first.
        const walkingOut = actor.kind === 'customer' && actor.goal.face === null && !actor.gone && !jump;
        if (!walkingOut) {
          release(actor);
          continue;
        }
        actor.ghost = true;
        animate(actor, () => (actor.angry ? 'angry_leave' : 'walk'), customerSpeed(actor), dtGame, dtReal, false, now);
        if (reachedExit(actor)) {
          // Out of the separation list again: the body goes back to the pool.
          if (walkingCount > 0 && walking[walkingCount - 1] === actor.motion) walkingCount -= 1;
          release(actor);
        }
      }

      for (const c of state.customers) {
        const actor = ensure(`c${c.id}`, 'customer', c.id, 'customer', c.look, c.pos);
        actor.goal = customerGoal(state, c, shop);
        actor.angry = c.state === 'angry_leave';
        const leaving = c.state === 'leaving' || c.state === 'angry_leave';
        if (!leaving) actor.gone = false;
        if (actor.gone) continue;
        // New arrivals walk in from the door; after a clock jump everyone snaps into place.
        animate(actor, (moving, seated) => customerAnim(c.state, moving, seated), customerSpeed(actor), dtGame, dtReal, jump, now);
        actor.body.label.set(labelFor(state, c), now);
        if (leaving && reachedExit(actor)) {
          actor.gone = true;
          actor.body.char.root.visible = false;
        }
      }

      for (const s of state.staff) {
        const role: CharacterRole = s.role;
        const actor = ensure(`s${s.id}`, 'staff', s.id, role, s.look, s.pos);
        // s.pos is the spot the sim holds for them (staffSpots).
        actor.goal = workerGoal(state, s.task, shop, s.pos);
        const moving = animate(actor, (m) => workerAnim(s.task, m), STAFF_SPEED, dtGame, dtReal, jump || actor.motion.goal === null, now);
        actor.body.label.set(NO_LABEL, now);
        actor.body.steam.update(!still && steamFor(state, s.task, moving), now + actor.bobOffset);
      }

      const head = state.playerTasks[0] ?? null;
      const player = ensure('player', 'player', 0, 'player', 3, playerHome(shop));
      const tick = state.day * 1440 + state.minute;
      const k = playerKey;
      if (!playerAt || k.clock !== tick || k.layout !== sig || k.task !== head || k.customers !== state.customers.length || k.staff !== state.staff.length) {
        playerAt = playerSpot(state, head, shop);
        k.clock = tick;
        k.layout = sig;
        k.task = head;
        k.customers = state.customers.length;
        k.staff = state.staff.length;
      }
      player.goal = workerGoal(state, head, shop, playerAt);
      const playerMoving = animate(player, (m) => workerAnim(head, m), STAFF_SPEED * 1.1, dtGame, dtReal, jump || player.motion.goal === null, now);
      player.body.label.set(NO_LABEL, now);
      player.body.steam.update(!still && steamFor(state, head, playerMoving), now);

      // Walkers drift apart a little where they cross; only what is drawn moves.
      if (grid) {
        separate(walking, walkingCount, grid, SEPARATION_RATE * dtGame);
        for (let i = 0; i < walkingCount; i++) walkingRoots[i]!.position.set(shownX(walking[i]!), 0, shownZ(walking[i]!));
      }

      // Money coming in (take-away paid at the counter, cash picked up from a table).
      for (const e of state.events) {
        if (e.type === 'cash' && e.amount > 0) coins.spawn(e.amount, e.pos, now);
      }
      coins.update(now, still);
    },

    pick(ray: Raycaster): Command | null {
      const state = lastState;
      if (!state) return null;
      const targets: Object3D[] = [];
      for (const actor of actors.values()) {
        if (actor.kind === 'customer' && !actor.ghost && !actor.gone) targets.push(actor.body.char.hitbox);
      }
      if (targets.length === 0) return null;
      root.updateMatrixWorld();
      for (const hit of ray.intersectObjects(targets, false)) {
        const actor = byHitbox.get(hit.object);
        const cmd = actor ? commandForCustomer(state, actor.id) : null;
        if (cmd) return cmd;
      }
      return null;
    },

    stats() {
      const c = coins.stats();
      return { live: pool.liveCount, free: pool.freeCount, created: pool.created, coins: c.live, coinsCreated: c.created };
    },

    setQuality(q: Quality): void {
      quality = q;
    },

    inspect(key: string): ActorInfo | null {
      const actor = actors.get(key);
      if (!actor) return null;
      return {
        anim: actor.anim,
        pos: { x: shownX(actor.motion), z: shownZ(actor.motion) },
        heading: actor.heading,
        visible: actor.body.char.root.visible,
        label: actor.body.label.iconShown,
        steam: actor.body.steam.active,
        squash: actor.body.char.bounce.scale.y,
      };
    },

    dispose(): void {
      for (const actor of [...actors.values()]) release(actor);
      for (const body of pool.all()) body.steam.dispose();
      coins.dispose();
      puff?.dispose();
      root.removeFromParent();
      root.clear();
      assets.dispose();
      disposeSharedRig();
    },
  };
}

const NO_LABEL = { icon: null, patience: null, ready: false } as const;
