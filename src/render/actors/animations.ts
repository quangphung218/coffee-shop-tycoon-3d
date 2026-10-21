import type { PersonaId } from '../../sim/types';

/**
 * Code-driven character animations. poseFor() is a pure function of the
 * animation and its phase, so every pose can be tested without three.
 *
 * Angles are radians. Arms and legs swing around x (positive = toward the
 * back, negative = forward); arm z spreads the arm sideways (outward is
 * positive on both sides).
 */

/** The six animations from the spec, plus a few extra standing and seated poses. */
export type AnimName =
  | 'idle'
  | 'walk'
  | 'carry_tray'
  | 'serve'
  | 'clean'
  | 'angry_leave'
  | 'queue'
  | 'drink'
  | 'sit'
  | 'work'
  | 'wave'
  | 'brew'
  | 'handoff'
  | 'impatient';

/** Face expression; the rig swaps the brows and mouth to match. */
export type Mood = 'happy' | 'neutral' | 'impatient' | 'angry' | 'sad';

export const SPEC_ANIMS: readonly AnimName[] = ['idle', 'walk', 'carry_tray', 'serve', 'clean', 'angry_leave'];
export const ALL_ANIMS: readonly AnimName[] = [...SPEC_ANIMS, 'queue', 'drink', 'sit', 'work', 'wave', 'brew', 'handoff', 'impatient'];

/** Joint angles and offsets for one frame. */
export interface Pose {
  /** Hips height offset from standing, in world units (bob, sitting). */
  hipsY: number;
  /** Torso tilt around x: positive leans forward. */
  lean: number;
  /** Torso twist around y. */
  twist: number;
  /** Head nod around x (positive looks down) and turn around y. */
  headX: number;
  headY: number;
  armLX: number;
  armLZ: number;
  armRX: number;
  armRZ: number;
  legL: number;
  legR: number;
}

/** Seconds per loop of each animation (moving loops are one full stride). */
export const ANIM_PERIOD: Readonly<Record<AnimName, number>> = {
  idle: 3,
  walk: 0.8,
  carry_tray: 0.8,
  serve: 1.6,
  clean: 0.9,
  angry_leave: 0.5,
  queue: 4,
  drink: 4,
  sit: 5,
  work: 1.2,
  wave: 1.4,
  // Four beats of the brew: grind, tamp, pull, pour.
  brew: 4.8,
  handoff: 1.6,
  impatient: 1.2,
};

/** Animations whose loop is driven by distance walked rather than time. */
export const MOVING_ANIMS: ReadonlySet<AnimName> = new Set<AnimName>(['walk', 'carry_tray', 'angry_leave']);
/** Animations played sitting on a chair. */
export const SEATED_ANIMS: ReadonlySet<AnimName> = new Set<AnimName>(['drink', 'sit']);

/** Hips drop from standing (0.55) to the chair seat. */
export const SIT_DROP = -0.05;
const SIT_LEGS = -Math.PI / 2;
const TAU = Math.PI * 2;

/** The standing rest pose, written into `out` when given. */
export function restPose(out?: Pose): Pose {
  if (!out) return { hipsY: 0, lean: 0, twist: 0, headX: 0, headY: 0, armLX: 0, armLZ: 0.06, armRX: 0, armRZ: 0.06, legL: 0, legR: 0 };
  out.hipsY = 0;
  out.lean = 0;
  out.twist = 0;
  out.headX = 0;
  out.headY = 0;
  out.armLX = 0;
  out.armLZ = 0.06;
  out.armRX = 0;
  out.armRZ = 0.06;
  out.legL = 0;
  out.legR = 0;
  return out;
}

/**
 * Pose of `anim` at time `t` seconds into the loop (any real t; the result
 * repeats every ANIM_PERIOD). Written into `out` when given, so a frame
 * allocates nothing.
 */
export function poseFor(anim: AnimName, t: number, out?: Pose): Pose {
  const period = ANIM_PERIOD[anim];
  const phase = Number.isFinite(t) ? (((t % period) + period) % period) / period : 0;
  const a = phase * TAU;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const p = restPose(out);
  switch (anim) {
    case 'idle':
      // Breathes, shifts its weight from foot to foot and glances slowly around;
      // the per-character phase offset (index.ts) keeps a crowd out of lockstep.
      p.hipsY = Math.sin(a) * 0.008;
      p.twist = Math.sin(a) * 0.03;
      p.headX = Math.sin(a) * 0.04;
      p.headY = Math.sin(a * 0.5) * 0.18 + Math.sin(a * 2) * 0.05;
      p.legL = Math.max(0, s) * 0.03;
      p.legR = Math.max(0, -s) * 0.03;
      p.armLX = Math.sin(a) * 0.04;
      p.armRX = -Math.sin(a) * 0.04;
      break;
    case 'queue':
      // Weight shifts from foot to foot, glances around, checks the counter.
      p.hipsY = Math.sin(a * 2) * 0.006;
      p.twist = Math.sin(a) * 0.06;
      p.headY = Math.sin(a) * 0.35;
      p.headX = -0.05 + Math.sin(a * 3) * 0.03;
      p.armLX = 0.1;
      p.armRX = 0.1;
      p.legL = Math.max(0, s) * 0.08;
      p.legR = Math.max(0, -s) * 0.08;
      break;
    case 'walk':
      p.hipsY = Math.abs(c) * 0.04 - 0.02;
      p.lean = 0.05;
      p.legL = s * 0.6;
      p.legR = -s * 0.6;
      p.armLX = -s * 0.55;
      p.armRX = s * 0.55;
      p.headX = -0.03;
      break;
    case 'carry_tray':
      // Legs walk, both arms hold the tray steady in front at chest height.
      p.hipsY = Math.abs(c) * 0.025 - 0.0125;
      p.legL = s * 0.5;
      p.legR = -s * 0.5;
      p.armLX = -1.35 + Math.sin(a * 2) * 0.03;
      p.armRX = -1.35 + Math.sin(a * 2) * 0.03;
      p.armLZ = 0.18;
      p.armRZ = 0.18;
      p.headX = 0.12;
      break;
    case 'serve':
      // Holds the tray out, sets the cup down, straightens up again.
      p.lean = 0.2 * (0.5 - 0.5 * c);
      p.armLX = -1.2 - 0.3 * (0.5 - 0.5 * c);
      p.armRX = -1.2 - 0.3 * (0.5 - 0.5 * c);
      p.armLZ = 0.15;
      p.armRZ = 0.15;
      p.headX = 0.15 + 0.1 * (0.5 - 0.5 * c);
      break;
    case 'clean':
      // Bent over the table, right hand wipes in circles, left hand rests.
      p.lean = 0.45;
      p.hipsY = -0.02;
      p.armRX = -1.1 + c * 0.15;
      p.armRZ = 0.25 + s * 0.3;
      p.armLX = -0.6;
      p.armLZ = 0.1;
      p.headX = 0.35;
      p.twist = s * 0.08;
      break;
    case 'angry_leave':
      // Fast stomping walk, fists pumping, head down.
      p.hipsY = Math.abs(c) * 0.06 - 0.03;
      p.lean = 0.18;
      p.legL = s * 0.8;
      p.legR = -s * 0.8;
      p.armLX = -s * 0.9 - 0.2;
      p.armRX = s * 0.9 - 0.2;
      p.armLZ = 0.3;
      p.armRZ = 0.3;
      p.headX = 0.15 + Math.abs(s) * 0.1;
      p.headY = Math.sin(a * 2) * 0.15;
      break;
    case 'sit':
      p.hipsY = SIT_DROP;
      p.legL = SIT_LEGS;
      p.legR = SIT_LEGS;
      p.armLX = -0.5;
      p.armRX = -0.5;
      p.headY = Math.sin(a) * 0.3;
      p.headX = Math.sin(a * 2) * 0.04;
      break;
    case 'drink': {
      // Seated; lifts the cup to the mouth for the first third of the loop.
      const sip = phase < 1 / 3 ? Math.sin(phase * 3 * Math.PI) : 0;
      p.hipsY = SIT_DROP;
      p.legL = SIT_LEGS;
      p.legR = SIT_LEGS;
      p.armLX = -0.5;
      p.armRX = -0.7 - sip * 1.6;
      p.armRZ = 0.06 + sip * 0.25;
      p.headX = -sip * 0.3;
      break;
    }
    case 'work':
      // Hands busy in front: tamping and pulling the lever, or counting cash.
      p.lean = 0.08;
      p.armLX = -1 + s * 0.25;
      p.armRX = -1.1 - Math.max(0, c) * 0.35;
      p.armLZ = 0.1;
      p.armRZ = 0.1;
      p.headX = 0.2;
      p.headY = s * 0.1;
      break;
    case 'wave':
      // Handing out flyers: right arm raised and waving, left arm holds the stack.
      p.armRX = -2.6;
      p.armRZ = 0.25 + s * 0.35;
      p.armLX = -0.9;
      p.armLZ = 0.1;
      p.headY = s * 0.15;
      p.hipsY = Math.abs(s) * 0.01;
      break;
    case 'brew':
      // One loop reads as four moves: grind, tamp, pull the lever, pour. Built
      // from smooth harmonics of the phase so it stays continuous and periodic.
      p.lean = 0.14;
      p.headX = 0.22;
      p.twist = 0.04 * Math.sin(a);
      // Right hand works four moves per loop; the two harmonics make each differ.
      p.armRX = -1.2 - 0.25 * Math.sin(a) - 0.15 * Math.sin(a * 2);
      p.armRZ = 0.12 + 0.1 * Math.cos(a * 2);
      // Left hand steadies the portafilter, then comes forward to hold the cup.
      p.armLX = -0.85 - 0.5 * Math.max(0, Math.sin(a));
      p.armLZ = 0.14;
      break;
    case 'handoff': {
      // Offers the cup forward with both hands, gives a small bow, straightens.
      const reach = 0.5 - 0.5 * c;
      p.lean = 0.12 * reach;
      p.armLX = -1.15 - 0.25 * reach;
      p.armRX = -1.15 - 0.25 * reach;
      p.armLZ = 0.22;
      p.armRZ = 0.22;
      p.headX = 0.12 + 0.08 * reach;
      break;
    }
    case 'impatient': {
      // Arms crossed, taps a foot hard, and uncrosses to glance at a wrist
      // watch once a loop: a silhouette that reads from the isometric camera.
      const tap = Math.max(0, Math.sin(a * 3));
      p.legR = tap * 0.5;
      p.hipsY = -tap * 0.006;
      p.lean = -0.04;
      const check = phase < 0.4 ? Math.sin((phase / 0.4) * Math.PI) : 0;
      p.armRX = -0.75;
      p.armRZ = -0.35;
      p.armLX = -0.75 - check * 0.65;
      p.armLZ = -0.35 + check * 0.45;
      p.headX = 0.05 + check * 0.25;
      p.headY = Math.sin(a) * 0.2;
      p.twist = Math.sin(a * 0.5) * 0.03;
      break;
    }
  }
  return p;
}

/** Writes a + (b - a)·w into `out` (which may be a or b): w = 0 is a, 1 is b. */
export function blendPose(a: Pose, b: Pose, w: number, out: Pose): Pose {
  const k = Math.min(1, Math.max(0, w));
  out.hipsY = a.hipsY + (b.hipsY - a.hipsY) * k;
  out.lean = a.lean + (b.lean - a.lean) * k;
  out.twist = a.twist + (b.twist - a.twist) * k;
  out.headX = a.headX + (b.headX - a.headX) * k;
  out.headY = a.headY + (b.headY - a.headY) * k;
  out.armLX = a.armLX + (b.armLX - a.armLX) * k;
  out.armLZ = a.armLZ + (b.armLZ - a.armLZ) * k;
  out.armRX = a.armRX + (b.armRX - a.armRX) * k;
  out.armRZ = a.armRZ + (b.armRZ - a.armRZ) * k;
  out.legL = a.legL + (b.legL - a.legL) * k;
  out.legR = a.legR + (b.legR - a.legR) * k;
  return out;
}

/** World units walked per loop of a moving animation (one full stride). */
export const STRIDE = 0.9;
/** Most stride loops per real second, so 4× speed does not turn legs into a blur. */
export const MAX_STRIDES_PER_SECOND = 3;

/**
 * Stride loops to play for `moved` world units walked in `dtReal` seconds:
 * in step with the distance, so slow walking takes slow steps and feet do
 * not slide, up to MAX_STRIDES_PER_SECOND.
 */
export function strideCycles(moved: number, dtReal: number, stride = STRIDE): number {
  return Math.max(0, Math.min(moved / stride, dtReal * MAX_STRIDES_PER_SECOND));
}

/**
 * How a customer personality carries itself while walking. Looks only: the
 * walking speed and the path stay the same for everyone, so the sim and the
 * week's results never see it.
 */
export interface Gait {
  /** World units per stride loop; shorter is quicker steps over the same ground. */
  stride: number;
  /** Scales the leg and arm swing of the walk. */
  swing: number;
  /** Added torso lean (positive forward) and head nod (positive looks down). */
  lean: number;
  head: number;
  /** Scales the hop of each step (bounceFor). */
  hop: number;
}

const PLAIN_GAIT: Gait = { stride: STRIDE, swing: 1, lean: 0, head: 0, hop: 1 };

/**
 * Office workers hurry with short steps and the head down, students bounce
 * along, connoisseurs stroll upright with the chin up, families amble.
 */
export const PERSONA_GAITS: Readonly<Record<PersonaId, Gait>> = {
  office: { stride: 0.72, swing: 0.75, lean: 0.1, head: 0.1, hop: 0.6 },
  student: { stride: 1, swing: 1.3, lean: -0.02, head: -0.04, hop: 1.7 },
  regular: PLAIN_GAIT,
  connoisseur: { stride: 1.05, swing: 0.5, lean: -0.05, head: -0.14, hop: 0.45 },
  family: { stride: 0.95, swing: 0.85, lean: 0.03, head: 0.04, hop: 0.8 },
};

/** Gait of a persona; staff, the player and customers without one walk plainly. */
export function gaitFor(persona: PersonaId | undefined): Gait {
  return persona ? PERSONA_GAITS[persona] : PLAIN_GAIT;
}

/** Animations a persona restyles: the plain walk and the two standing waits. */
const STYLED_ANIMS: ReadonlySet<AnimName> = new Set<AnimName>(['walk', 'queue', 'idle']);

/**
 * Restyles `p` (a pose of `anim` at `t` from poseFor) for a customer
 * personality, in place: the walk's swing and lean, and a standing habit while
 * waiting (office checks a phone, student bobs to music, connoisseur clasps
 * hands behind the back, family looks all around). `calm` (low quality or
 * reduced motion) keeps the posture but drops the extra movement. Any other
 * animation, or no persona, is left as it is.
 */
export function stylePose(persona: PersonaId | undefined, anim: AnimName, t: number, calm: boolean, p: Pose): Pose {
  if (!persona || !STYLED_ANIMS.has(anim)) return p;
  const g = PERSONA_GAITS[persona];
  const period = ANIM_PERIOD[anim];
  const a = Number.isFinite(t) ? ((((t % period) + period) % period) / period) * TAU : 0;
  const move = calm ? 0 : 1;
  p.lean += g.lean;
  p.headX += g.head;
  if (anim === 'walk') {
    p.legL *= g.swing;
    p.legR *= g.swing;
    p.armLX *= g.swing;
    p.armRX *= g.swing;
    // The arm carrying a bag (rig.ts ACCESSORIES) hangs still beside it.
    if (persona === 'office') p.armRX = 0.05;
    if (persona === 'family') p.armLX = 0.05;
    if (persona === 'connoisseur') {
      p.armLX = 0.45;
      p.armRX = 0.45;
      p.armLZ = 0.12;
      p.armRZ = 0.12;
    }
    return p;
  }
  switch (persona) {
    case 'office':
      // Reads a phone held in front, head down; glances around less.
      p.armRX = -1.05;
      p.armRZ = -0.15;
      p.headX += 0.22;
      p.headY *= 0.3;
      break;
    case 'student':
      // Leans back with the hands in the back pockets, nodding along to music.
      p.lean -= 0.05;
      p.armLX = 0.25;
      p.armRX = 0.25;
      p.armLZ = 0;
      p.armRZ = 0;
      p.headX += Math.sin(a * 4) * 0.08 * move;
      p.twist += Math.sin(a * 2) * 0.05 * move;
      break;
    case 'connoisseur':
      // Hands clasped behind the back, upright, studying the menu board.
      p.armLX = 0.45;
      p.armRX = 0.45;
      p.armLZ = 0.12;
      p.armRZ = 0.12;
      p.headY *= 0.5;
      break;
    case 'family':
      // Looks all around the room.
      p.headY *= 1 + 0.7 * move;
      p.twist *= 1 + move;
      break;
    default:
      break;
  }
  return p;
}

/** Whole-body squash and stretch on top of the pose, scaled around the feet. */
export interface Bounce {
  /** Width and depth scale; 1/√sy so the volume holds. */
  sx: number;
  sy: number;
  /** Lift off the floor, in world units. */
  lift: number;
}

/** Seconds per breath of the standing bob (design/t237-cartoon motion notes). */
export const IDLE_BOUNCE_PERIOD = 1.2;
/** Share of the bounce kept at low quality or with prefers-reduced-motion. */
export const CALM_BOUNCE = 0.35;
const IDLE_SQUASH = 0.04;
const IDLE_LIFT = 0.02;
const HOP_HEIGHT = 0.06;
const LAND_SQUASH = 0.06;
const HOP_STRETCH = 0.04;

/**
 * Bounce of `anim`. Moving animations hop once per step from `phase` (the
 * same stride clock as poseFor) and squash on landing; standing ones bob
 * every IDLE_BOUNCE_PERIOD of `idleTime`; seated ones stay still. `calm`
 * shrinks the motion to CALM_BOUNCE. `hopScale` scales the step hop (a
 * persona's Gait.hop). Written into `out` when given.
 */
export function bounceFor(anim: AnimName, phase: number, idleTime: number, calm: boolean, out?: Bounce, hopScale = 1): Bounce {
  const k = calm ? CALM_BOUNCE : 1;
  let sy = 1;
  let lift = 0;
  if (MOVING_ANIMS.has(anim)) {
    const period = ANIM_PERIOD[anim];
    const t = Number.isFinite(phase) ? phase / period : 0;
    const kh = k * hopScale;
    // Two steps per stride: |sin| is 0 at each footfall and 1 mid-air.
    const hop = Math.abs(Math.sin(t * TAU));
    lift = hop * HOP_HEIGHT * kh;
    sy = 1 + kh * (HOP_STRETCH * hop - LAND_SQUASH * (1 - hop) ** 4);
  } else if (!SEATED_ANIMS.has(anim)) {
    const a = Number.isFinite(idleTime) ? (idleTime / IDLE_BOUNCE_PERIOD) * TAU : 0;
    // 0 → 1 → 0 over one breath: sinks to 0.96 while the lift drops to 0.
    const d = 0.5 - 0.5 * Math.cos(a);
    sy = 1 - IDLE_SQUASH * d * k;
    lift = IDLE_LIFT * (1 - d) * k;
  }
  if (!out) return { sx: 1 / Math.sqrt(sy), sy, lift };
  out.sx = 1 / Math.sqrt(sy);
  out.sy = sy;
  out.lift = lift;
  return out;
}

/** Writes the bounce between a (w = 0) and b (w = 1) into `out`, keeping the volume. */
export function blendBounce(a: Bounce, b: Bounce, w: number, out: Bounce): Bounce {
  const k = Math.min(1, Math.max(0, w));
  out.sy = a.sy + (b.sy - a.sy) * k;
  out.lift = a.lift + (b.lift - a.lift) * k;
  out.sx = 1 / Math.sqrt(out.sy);
  return out;
}

/** Which hand props are shown during an animation. */
export interface PropSet {
  tray: boolean;
  cup: boolean;
  rag: boolean;
}

export function propsFor(anim: AnimName): PropSet {
  return {
    tray: anim === 'carry_tray' || anim === 'serve',
    cup: anim === 'drink' || anim === 'handoff',
    rag: anim === 'clean',
  };
}

/** Seconds between blinks and how long the lid stays shut. */
export const BLINK_PERIOD = 4;
export const BLINK_CLOSE = 0.13;
/** Vertical eye scale at the bottom of a blink (never fully zero). */
export const EYE_MIN_OPEN = 0.1;

/**
 * Eye-open scale in [EYE_MIN_OPEN, 1] at `t` seconds, shifted by `phase` so
 * neighbouring characters do not blink together. A pure function of time: one
 * quick close-open every BLINK_PERIOD, open the rest of the time.
 */
export function blinkFor(t: number, phase: number): number {
  if (!Number.isFinite(t)) return 1;
  const u = (((t + phase) % BLINK_PERIOD) + BLINK_PERIOD) % BLINK_PERIOD;
  if (u > BLINK_CLOSE) return 1;
  const k = Math.sin((u / BLINK_CLOSE) * Math.PI);
  return 1 - (1 - EYE_MIN_OPEN) * k;
}
