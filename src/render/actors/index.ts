import { Group, type Object3D, type Raycaster, type Scene } from 'three';
import type { Command, GameState, Vec2 } from '../../sim/types';
import { getShopLayout, type ShopLayout } from '../../sim/upgrades';
import { layoutKey } from '../scene/shop';
import { ANIM_PERIOD, MOVING_ANIMS, poseFor, type AnimName } from './animations';
import { Label, LabelAssets, commandForCustomer, labelFor } from './labels';
import { Pool } from './pool';
import { createCharacter, disposeSharedRig, type Character, type CharacterRole } from './rig';
import {
  ANGRY_SPEED,
  STAFF_SPEED,
  WALK_SPEED,
  advance,
  angleDelta,
  createMotion,
  customerAnim,
  customerGoal,
  headingOf,
  playerHome,
  setGoal,
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
  /** Live and pooled character counts (tests, debugging). */
  stats(): { live: number; free: number; created: number };
  /** Snapshot of one person: 'c<id>' customer, 's<id>' staff, 'player'. */
  inspect(key: string): ActorInfo | null;
  dispose(): void;
}

export interface ActorInfo {
  anim: AnimName;
  pos: Vec2;
  heading: number;
  visible: boolean;
  label: string | null;
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
}

export function createActors(scene: Scene): Actors {
  const root = new Group();
  root.name = 'actors';
  scene.add(root);
  const assets = new LabelAssets();
  const pool = new Pool<Body>(
    () => {
      const char = createCharacter({ role: 'customer', look: 0 });
      const label = new Label(assets);
      char.labelAnchor.add(label.group);
      root.add(char.root);
      return { char, label };
    },
    (body) => {
      body.char.root.visible = false;
    },
  );
  const actors = new Map<string, Actor>();
  const byHitbox = new Map<Object3D, Actor>();
  const dir = { x: 0, z: 1 };
  let layout: ShopLayout | null = null;
  let layoutSig = -1;
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

  /** Walks, turns and poses one person for this frame. */
  function animate(actor: Actor, anim: (moving: boolean, seated: boolean) => AnimName, speed: number, dtGame: number, dtReal: number, snapNow: boolean): void {
    const m = actor.motion;
    if (!layout) return;
    setGoal(m, actor.goal.pos, layout);
    if (snapNow) snap(m);
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
    char.showProps(next);
    char.setAngry(actor.angry);
    char.root.position.set(m.pos.x, 0, m.pos.z);
    char.root.rotation.y = actor.heading;
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
      const clock = state.day * 1440 + state.minute + Math.min(1, Math.max(0, Number.isFinite(alpha) ? alpha : 0));
      let dtGame = lastClock < 0 ? 0 : clock - lastClock;
      const jump = lastClock < 0 || dtGame < 0 || dtGame > MAX_GAME_STEP;
      if (jump) dtGame = 0;
      lastClock = clock;

      const sig = layoutKey(state);
      if (!layout || sig !== layoutSig) {
        layout = getShopLayout(state);
        layoutSig = sig;
      }
      const shop = layout;

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
        animate(actor, () => (actor.angry ? 'angry_leave' : 'walk'), customerSpeed(actor), dtGame, dtReal, false);
        if (reachedExit(actor)) release(actor);
      }

      for (const c of state.customers) {
        const actor = ensure(`c${c.id}`, 'customer', c.id, 'customer', c.look, c.pos);
        actor.goal = customerGoal(state, c, shop);
        actor.angry = c.state === 'angry_leave';
        const leaving = c.state === 'leaving' || c.state === 'angry_leave';
        if (!leaving) actor.gone = false;
        if (actor.gone) continue;
        // New arrivals walk in from the door; after a clock jump everyone snaps into place.
        animate(actor, (moving, seated) => customerAnim(c.state, moving, seated), customerSpeed(actor), dtGame, dtReal, jump);
        actor.body.label.set(labelFor(state, c), now);
        if (leaving && reachedExit(actor)) {
          actor.gone = true;
          actor.body.char.root.visible = false;
        }
      }

      state.staff.forEach((s, slot) => {
        const role: CharacterRole = s.role;
        const actor = ensure(`s${s.id}`, 'staff', s.id, role, s.look, s.pos);
        actor.goal = workerGoal(state, s.task, shop, s.pos, slot);
        animate(actor, (moving) => workerAnim(s.task, moving), STAFF_SPEED, dtGame, dtReal, jump || actor.motion.goal === null);
        actor.body.label.set(NO_LABEL, now);
      });

      const head = state.playerTasks[0] ?? null;
      const player = ensure('player', 'player', 0, 'player', 3, playerHome(shop));
      player.goal = workerGoal(state, head, shop, playerHome(shop), state.staff.length);
      animate(player, (moving) => workerAnim(head, moving), STAFF_SPEED * 1.1, dtGame, dtReal, jump || player.motion.goal === null);
      player.body.label.set(NO_LABEL, now);
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
      return { live: pool.liveCount, free: pool.freeCount, created: pool.created };
    },

    inspect(key: string): ActorInfo | null {
      const actor = actors.get(key);
      if (!actor) return null;
      return {
        anim: actor.anim,
        pos: { x: actor.motion.pos.x, z: actor.motion.pos.z },
        heading: actor.heading,
        visible: actor.body.char.root.visible,
        label: actor.body.label.iconShown,
      };
    },

    dispose(): void {
      for (const actor of [...actors.values()]) release(actor);
      root.removeFromParent();
      root.clear();
      assets.dispose();
      disposeSharedRig();
    },
  };
}

const NO_LABEL = { icon: null, patience: null, ready: false } as const;
