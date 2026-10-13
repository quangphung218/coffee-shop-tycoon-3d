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
  | 'wave';

export const SPEC_ANIMS: readonly AnimName[] = ['idle', 'walk', 'carry_tray', 'serve', 'clean', 'angry_leave'];
export const ALL_ANIMS: readonly AnimName[] = [...SPEC_ANIMS, 'queue', 'drink', 'sit', 'work', 'wave'];

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
};

/** Animations whose loop is driven by distance walked rather than time. */
export const MOVING_ANIMS: ReadonlySet<AnimName> = new Set<AnimName>(['walk', 'carry_tray', 'angry_leave']);
/** Animations played sitting on a chair. */
export const SEATED_ANIMS: ReadonlySet<AnimName> = new Set<AnimName>(['drink', 'sit']);

/** Hips drop from standing (0.55) to the chair seat. */
export const SIT_DROP = -0.05;
const SIT_LEGS = -Math.PI / 2;
const TAU = Math.PI * 2;

function rest(): Pose {
  return { hipsY: 0, lean: 0, twist: 0, headX: 0, headY: 0, armLX: 0, armLZ: 0.06, armRX: 0, armRZ: 0.06, legL: 0, legR: 0 };
}

/** Pose of `anim` at time `t` seconds into the loop (any real t; the result repeats every ANIM_PERIOD). */
export function poseFor(anim: AnimName, t: number): Pose {
  const period = ANIM_PERIOD[anim];
  const phase = Number.isFinite(t) ? (((t % period) + period) % period) / period : 0;
  const a = phase * TAU;
  const s = Math.sin(a);
  const c = Math.cos(a);
  const p = rest();
  switch (anim) {
    case 'idle':
      p.hipsY = Math.sin(a) * 0.008;
      p.headX = Math.sin(a) * 0.04;
      p.headY = Math.sin(a * 2) * 0.12;
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
  }
  return p;
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
    cup: anim === 'drink',
    rag: anim === 'clean',
  };
}
