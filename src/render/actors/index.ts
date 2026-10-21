import { Group, type Object3D, type Raycaster, type Scene, type Texture } from 'three';
import type { Quality } from '../../save/settings';
import { PERSONA_IDS } from '../../sim/data/personas';
import { UNIFORMS, uniformOf } from '../../sim/data/uniforms';
import { buildNavGrid, type NavGrid } from '../../sim/nav';
import type { Command, GameState, PersonaId, UniformId, Vec2 } from '../../sim/types';
import { getShopLayout, type ShopLayout } from '../../sim/upgrades';
import { layoutKey } from '../scene/shop';
import {
  ANIM_PERIOD,
  IDLE_BOUNCE_PERIOD,
  MOVING_ANIMS,
  blendBounce,
  blendPose,
  blinkFor,
  bounceFor,
  gaitFor,
  poseFor,
  restPose,
  strideCycles,
  stylePose,
  type AnimName,
  type Mood,
} from './animations';
import { Emote, disposeEmoteGeometry } from './emotes';
import { CoinFx, Steam, puffTexture, setSteamQuality, steamFor } from './fx';
import { LABEL_BUBBLES, Label, LabelAssets, commandForCustomer, faceFor, labelFor } from './labels';
import { Pool } from './pool';
import { MOODS, createCharacter, disposeSharedRig, type Character, type CharacterRole } from './rig';
import {
  ANGRY_SPEED,
  SEPARATION_RATE,
  STAFF_SPEED,
  WALK_SPEED,
  advance,
  createMotion,
  customerAnim,
  customerGoal,
  customerMood,
  EMOTE_KINDS,
  easedStep,
  emoteFor,
  emoteForEvent,
  headingOf,
  lookAhead,
  moodWithEmote,
  playerHome,
  playerSpot,
  separate,
  setGoal,
  shownX,
  shownZ,
  snap,
  turnToward,
  workerAnim,
  workerGoal,
  type EmoteCue,
  type EmoteKind,
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
  /** Low quality drops the steam, keeps coins still and softens the bounce; higher ones add steam puffs and burst coins. */
  setQuality(quality: Quality): void;
  /** Force reduced motion on (true) or leave it to the OS media query (false). */
  setReducedMotion(reduce: boolean): void;
  /** Steam, coin bounce, bubble pop and body bounce are toned down (low quality or reduced motion). */
  calm(): boolean;
  /**
   * Before the scene shows: makes the tag of every icon, WARM_BODIES pooled
   * characters and WARM_COINS coin popups (hidden, so a shader compile of
   * the scene covers them). Returns the tag and steam textures to upload.
   */
  prebuild(): Texture[];
  /**
   * Shows the pooled characters in every persona and mood, with tags, steam
   * and a coin, for one call of `draw` (a frame nobody sees), so their GPU
   * uploads happen now; then puts them back.
   */
  drawWarm(draw: () => void): void;
  dispose(): void;
}

export interface ActorsOptions {
  quality?: Quality;
  /** Force reduced motion on regardless of the OS (the "Luôn giảm" setting). */
  reducedMotion?: boolean;
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
  /** 3D emote over the head (heart, sweat, cloud), or null. */
  emote: EmoteKind | null;
}

/** A jump in the game clock bigger than this (new day, loaded save) snaps everyone into place. */
const MAX_GAME_STEP = 30;
const MAX_FRAME_DT = 0.1;
/** Real seconds per game minute at 1× (src/main.ts runs 2 game minutes a second). */
const SECONDS_PER_GAME_MINUTE = 0.5;
/** Walkers face the point this far ahead on their path. */
const LOOK_AHEAD = 0.3;
/** Seconds to blend between the stride and the standing pose when starting or stopping. */
const BLEND_SECONDS = 0.18;
/** Characters built before the scene shows: one per persona and a staff member per uniform. */
export const WARM_BODIES = PERSONA_IDS.length + UNIFORMS.length;
/** Coin popups built before the scene shows. */
export const WARM_COINS = 3;
/** Every face, sad included, so none uploads mid-game. */
const WARM_MOODS: readonly Mood[] = MOODS;
/** Seconds past every coin's life, so CoinFx.update puts the warm-up coins back. */
const COIN_FORGET_S = 1e6;

interface Body {
  char: Character;
  label: Label;
  steam: Steam;
  emote: Emote;
}

interface Actor {
  key: string;
  kind: 'customer' | 'staff' | 'player';
  id: number;
  body: Body;
  motion: Motion;
  goal: Goal;
  heading: number;
  /** Seconds into the standing animations. */
  phase: number;
  /** Stride loops walked so far (drives the moving animations). */
  stride: number;
  /** 0 = standing pose, 1 = stride pose; eases between them. */
  walkBlend: number;
  /** Moving animation last played, blended out after stopping. */
  lastMove: AnimName;
  anim: AnimName;
  angry: boolean;
  /** Left the sim while still walking out; released once through the door. */
  ghost: boolean;
  /** Reached the exit; hidden until the sim drops the customer. */
  gone: boolean;
  seen: number;
  /** Offset into the standing bob, so people do not breathe in step. */
  bobOffset: number;
  /** Customer personality, which styles the walk and the wait; absent for staff and the player. */
  persona: PersonaId | undefined;
  /** Heart or cloud a sim event started (start -Infinity = none). */
  cue: EmoteCue;
  /** When the emote now shown came up (sweat counts its drip cycles from here). */
  emoteSince: number;
}

export function createActors(scene: Scene, options: ActorsOptions = {}): Actors {
  const root = new Group();
  root.name = 'actors';
  scene.add(root);
  const assets = new LabelAssets();
  assets.forceReducedMotion = options.reducedMotion ?? false;
  const puff = puffTexture();
  const coins = new CoinFx(assets.face('i-coin').map);
  root.add(coins.group);
  let quality: Quality = options.quality ?? 'medium';
  coins.setQuality(quality);
  setSteamQuality(quality);
  const pool = new Pool<Body>(
    () => {
      const char = createCharacter({ role: 'customer', look: 0 });
      const label = new Label(assets);
      char.labelAnchor.add(label.group);
      const steam = new Steam(puff);
      char.steamAnchor.add(steam.group);
      const emote = new Emote();
      char.labelAnchor.add(emote.group);
      root.add(char.root);
      return { char, label, steam, emote };
    },
    (body) => {
      body.char.root.visible = false;
      body.steam.update(false, 0);
      body.emote.hide();
    },
  );
  const actors = new Map<string, Actor>();
  const byHitbox = new Map<Object3D, Actor>();
  const dir = { x: 0, z: 1 };
  // Scratch poses and bounces, reused every frame.
  const standPose = restPose();
  const movePose = restPose();
  const standBounce = { sx: 1, sy: 1, lift: 0 };
  const moveBounce = { sx: 1, sy: 1, lift: 0 };
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
  /** Seconds the coin popups and cup steam have run: real time, frozen while the game is paused. */
  let coinTime = 0;
  let frame = 0;

  function spawn(key: string, kind: Actor['kind'], id: number, role: CharacterRole, look: number, pos: Vec2, persona?: PersonaId, uniform?: UniformId): Actor {
    const body = pool.acquire();
    body.char.setLook({ role, look, persona, uniform });
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
      stride: 0,
      walkBlend: 0,
      lastMove: 'walk',
      anim: 'idle',
      angry: false,
      ghost: false,
      gone: false,
      seen: frame,
      // Golden-ratio spread keeps neighbouring ids far apart in the cycle.
      bobOffset: ((id * 0.618034) % 1) * IDLE_BOUNCE_PERIOD,
      persona,
      cue: { kind: 'heart', start: -Infinity },
      emoteSince: 0,
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

  /** Finds or spawns a person; a new role, look or uniform re-dresses the same body in place. */
  function ensure(key: string, kind: Actor['kind'], id: number, role: CharacterRole, look: number, pos: Vec2, persona?: PersonaId, uniform?: UniformId): Actor {
    let actor = actors.get(key);
    if (!actor) actor = spawn(key, kind, id, role, look, pos, persona, uniform);
    else {
      const char = actor.body.char;
      if (char.role !== role || char.look !== look || (uniform !== undefined && char.uniform !== uniform)) char.setLook({ role, look, persona, uniform });
    }
    actor.seen = frame;
    return actor;
  }

  /** Low quality or reduced motion (setting or OS): no steam, still coins, a softer bounce. */
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
    const moved = advance(m, easedStep(m, speed, dtGame), dir);
    // Still on the way (also while paused mid-walk, which freezes the stride).
    const moving = m.path.length > 0;
    const seated = actor.goal.seated && !moving;
    const next = anim(moving, seated);
    actor.anim = next;

    // Face along the path a little ahead, so corners turn the body early and smoothly.
    let target = actor.goal.face ?? actor.heading;
    if (moving && lookAhead(m, LOOK_AHEAD, dir)) target = headingOf(dir.x, dir.z);
    else if (moved > 1e-4) target = headingOf(dir.x, dir.z);
    // Turns keep up with the walk at higher game speeds.
    actor.heading = snapNow ? target : turnToward(actor.heading, target, Math.max(dtReal, dtGame * SECONDS_PER_GAME_MINUTE));

    const gait = gaitFor(actor.persona);
    const striding = MOVING_ANIMS.has(next);
    if (striding) {
      actor.lastMove = next;
      actor.stride += strideCycles(moved, dtReal, gait.stride);
    }
    actor.phase += dtReal;
    // Keep the clocks small so float precision holds over a long session.
    if (actor.phase > 1e4) actor.phase %= 120;
    if (actor.stride > 1e4) actor.stride %= 1;
    const w = striding ? 1 : 0;
    const blendStep = dtReal / BLEND_SECONDS;
    if (snapNow) actor.walkBlend = w;
    else if (w > actor.walkBlend) actor.walkBlend = Math.min(w, actor.walkBlend + blendStep);
    else actor.walkBlend = Math.max(w, actor.walkBlend - blendStep);
    const blend = actor.walkBlend * actor.walkBlend * (3 - 2 * actor.walkBlend);
    // Stopping eases the legs from the stride into the standing pose (and back when starting).
    const stand = striding ? anim(false, seated) : next;
    const standTime = MOVING_ANIMS.has(stand) ? actor.stride * ANIM_PERIOD[stand] : actor.phase;
    const moveTime = actor.stride * ANIM_PERIOD[actor.lastMove];
    const bob = now + actor.bobOffset;
    const quiet = calm();
    stylePose(actor.persona, stand, standTime, quiet, poseFor(stand, standTime, standPose));
    stylePose(actor.persona, actor.lastMove, moveTime, quiet, poseFor(actor.lastMove, moveTime, movePose));
    bounceFor(stand, standTime, bob, quiet, standBounce);
    bounceFor(actor.lastMove, moveTime, bob, quiet, moveBounce, gait.hop);

    const char = actor.body.char;
    char.applyPose(blendPose(standPose, movePose, blend, standPose));
    char.applyBounce(blendBounce(standBounce, moveBounce, blend, standBounce));
    char.showProps(next);
    // Eyes blink on a per-character clock; reduced motion keeps them open.
    char.setBlink(quiet ? 1 : blinkFor(now, actor.bobOffset));
    char.root.position.set(m.pos.x, 0, m.pos.z);
    char.root.rotation.y = actor.heading;
    return moving;
  }

  /** Shows `kind` over a customer on the coin clock (frozen while paused); calm keeps it still. */
  function showEmote(actor: Actor, kind: EmoteKind | null): void {
    const emote = actor.body.emote;
    if (kind !== emote.kindShown) actor.emoteSince = coinTime;
    const start = kind === 'sweat' ? actor.emoteSince : actor.cue.start;
    emote.update(kind, coinTime - start, calm(), actor.heading);
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
      const elapsed = lastTime < 0 ? 0 : Math.max(0, now - lastTime);
      const dtReal = Math.min(elapsed, MAX_FRAME_DT);
      lastTime = now;
      // Not capped like dtReal, so a coin still ends on time after a slow frame.
      if (!state.paused && Number.isFinite(elapsed)) coinTime += elapsed;
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
        const ghostEmote = emoteFor(actor.angry ? 'angry_leave' : 'leaving', 1, actor.cue, coinTime);
        actor.body.char.setMood(moodWithEmote(actor.angry ? 'angry' : 'neutral', ghostEmote));
        showEmote(actor, ghostEmote);
        if (reachedExit(actor)) {
          // Out of the separation list again: the body goes back to the pool.
          if (walkingCount > 0 && walking[walkingCount - 1] === actor.motion) walkingCount -= 1;
          release(actor);
        }
      }

      // A served drink starts a heart; storming out over an empty stock starts a cloud.
      for (const e of state.events) {
        if (e.type !== 'served' && e.type !== 'angry') continue;
        const actor = actors.get(`c${e.customerId}`);
        const kind = actor ? emoteForEvent(e, state.customers.find((c) => c.id === e.customerId)) : null;
        if (actor && kind) {
          actor.cue.kind = kind;
          actor.cue.start = coinTime;
        }
      }

      for (const c of state.customers) {
        const actor = ensure(`c${c.id}`, 'customer', c.id, 'customer', c.look, c.pos, c.persona);
        actor.goal = customerGoal(state, c, shop);
        actor.angry = c.state === 'angry_leave';
        const leaving = c.state === 'leaving' || c.state === 'angry_leave';
        if (!leaving) actor.gone = false;
        if (actor.gone) continue;
        const frac = c.maxPatience > 0 ? c.patience / c.maxPatience : 1;
        // New arrivals walk in from the door; after a clock jump everyone snaps into place.
        animate(actor, (moving, seated) => customerAnim(c.state, moving, seated, frac), customerSpeed(actor), dtGame, dtReal, jump, now);
        const emote = emoteFor(c.state, frac, actor.cue, coinTime);
        actor.body.char.setMood(moodWithEmote(customerMood(c.state, frac), emote));
        showEmote(actor, emote);
        actor.body.label.set(labelFor(state, c), now);
        if (leaving && reachedExit(actor)) {
          actor.gone = true;
          actor.body.char.root.visible = false;
        }
      }

      // The team uniform; switching it re-dresses staff and the player, the scene stays as is.
      const uniform = uniformOf(state).id;
      for (const s of state.staff) {
        const role: CharacterRole = s.role;
        const actor = ensure(`s${s.id}`, 'staff', s.id, role, s.look, s.pos, undefined, uniform);
        // s.pos is the spot the sim holds for them (staffSpots).
        actor.goal = workerGoal(state, s.task, shop, s.pos);
        const moving = animate(actor, (m) => workerAnim(s.task, m), STAFF_SPEED, dtGame, dtReal, jump || actor.motion.goal === null, now);
        actor.body.char.setMood('neutral');
        actor.body.label.set(NO_LABEL, now);
        actor.body.steam.update(!still && steamFor(state, s.task, moving), coinTime + actor.bobOffset);
      }

      const head = state.playerTasks[0] ?? null;
      const player = ensure('player', 'player', 0, 'player', 3, playerHome(shop), undefined, uniform);
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
      player.body.char.setMood('neutral');
      player.body.label.set(NO_LABEL, now);
      player.body.steam.update(!still && steamFor(state, head, playerMoving), coinTime);

      // Walkers drift apart a little where they cross; only what is drawn moves.
      if (grid) {
        separate(walking, walkingCount, grid, SEPARATION_RATE * dtGame);
        for (let i = 0; i < walkingCount; i++) walkingRoots[i]!.position.set(shownX(walking[i]!), 0, shownZ(walking[i]!));
      }

      // Money coming in (take-away paid at the counter, cash picked up from a table).
      for (const e of state.events) {
        if (e.type === 'cash' && e.amount > 0) coins.spawn(e.amount, e.pos, coinTime);
      }
      coins.update(coinTime, still);
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
      coins.setQuality(q);
      // Shared with the machine steam in AmbientView.
      setSteamQuality(q);
    },

    setReducedMotion(reduce: boolean): void {
      assets.forceReducedMotion = reduce;
    },

    calm,

    prebuild(): Texture[] {
      const bodies = Array.from({ length: WARM_BODIES }, () => pool.acquire());
      for (const body of bodies) pool.release(body);
      for (let i = 0; i < WARM_COINS; i++) coins.spawn(1, { x: 0, z: 0 }, coinTime);
      coins.update(coinTime + COIN_FORGET_S, true);
      const textures = assets.prebuild();
      return puff ? [...textures, puff] : textures;
    },

    drawWarm(draw: () => void): void {
      const home = layout ? playerHome(layout) : { x: 0, z: 0 };
      const now = performance.now() / 1000;
      const bodies = Array.from({ length: WARM_BODIES }, () => pool.acquire());
      bodies.forEach((body, i) => {
        const persona = PERSONA_IDS[i];
        // After the personas, one worker per uniform, so every hat and shirt colour uploads now;
        // the 'classic' one is the player, for the red cap.
        const uniform = UNIFORMS[i - PERSONA_IDS.length]?.id;
        const role = uniform === 'classic' ? 'player' : 'barista';
        body.char.setLook(persona ? { role: 'customer', look: i, persona } : { role, look: i, uniform });
        body.char.setMood(WARM_MOODS[i % WARM_MOODS.length]!);
        body.char.root.position.set(home.x + (i % 3) * 0.5 - 0.5, 0, home.z + Math.floor(i / 3) * 0.5);
        body.char.root.visible = true;
        body.label.set({ icon: LABEL_BUBBLES[i % LABEL_BUBBLES.length]!, patience: 0.5, ready: false, face: faceFor(0.5) }, now);
        body.steam.update(true, now);
        body.emote.update(EMOTE_KINDS[i % EMOTE_KINDS.length]!, 0.5, true);
      });
      coins.spawn(1, home, coinTime);
      try {
        draw();
      } finally {
        for (const body of bodies) {
          body.label.set(NO_LABEL, now);
          pool.release(body);
        }
        coins.update(coinTime + COIN_FORGET_S, true);
      }
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
        emote: actor.body.emote.kindShown,
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
      disposeEmoteGeometry();
    },
  };
}

const NO_LABEL = { icon: null, patience: null, ready: false } as const;
