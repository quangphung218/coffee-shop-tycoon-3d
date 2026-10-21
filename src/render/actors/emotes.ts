import { BoxGeometry, Group, Mesh, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { popScale } from './labels';
import { materialFor } from './rig';
import { EMOTE_KINDS, EMOTE_SECONDS, type EmoteKind } from './sync';

/**
 * Emotes: small low-poly props over a customer's head, built from boxes
 * merged into one geometry per kind (one draw call each) and shared by every
 * character, in the rig's shared flat materials and without shadows. Each
 * body keeps one hidden mesh per kind, so showing an emote allocates nothing.
 * They pop in, float a little and go; calm (low quality or reduced motion)
 * shows them still, with no pop or float.
 */

const COLORS: Readonly<Record<EmoteKind, number>> = { heart: 0xe0475e, sweat: 0x5bc0de, cloud: 0x9aa3ab };
/** Where each emote sits in the label anchor: the heart over the head, sweat at the temple, the cloud above the angry tag. */
const OFFSETS: Readonly<Record<EmoteKind, readonly [number, number, number]>> = {
  heart: [0, 0.12, 0],
  sweat: [0.2, -0.28, 0.06],
  cloud: [0, 0.5, 0],
};
/** Seconds the end of a heart or cloud takes to shrink away. */
const SHRINK_SECONDS = 0.2;
/** How high a heart floats over its life. */
const HEART_RISE = 0.18;
/** How far a sweat drop slides down each cycle. */
const SWEAT_DROP = 0.07;

let geometries: Record<EmoteKind, BufferGeometry> | null = null;

function merged(parts: BufferGeometry[]): BufferGeometry {
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('emotes: could not merge geometry');
  return geo;
}

/** One merged geometry per emote kind, built once and shared by every character. */
export function emoteGeometry(): Readonly<Record<EmoteKind, BufferGeometry>> {
  if (geometries) return geometries;
  const d = Math.PI / 4;
  geometries = {
    // A diamond with two lobes on top.
    heart: merged([
      new BoxGeometry(0.12, 0.12, 0.07).rotateZ(d).translate(0, -0.02, 0),
      new BoxGeometry(0.09, 0.09, 0.07).rotateZ(d).translate(-0.045, 0.03, 0),
      new BoxGeometry(0.09, 0.09, 0.07).rotateZ(d).translate(0.045, 0.03, 0),
    ]),
    // A drop: a turned cube with a small tip on top.
    sweat: merged([
      new BoxGeometry(0.055, 0.055, 0.055).rotateZ(d),
      new BoxGeometry(0.03, 0.04, 0.03).translate(0, 0.04, 0),
    ]),
    // A flat-bottomed cloud of three puffs.
    cloud: merged([
      new BoxGeometry(0.26, 0.08, 0.12),
      new BoxGeometry(0.11, 0.1, 0.11).translate(-0.06, 0.07, 0),
      new BoxGeometry(0.13, 0.12, 0.12).translate(0.04, 0.08, 0),
    ]),
  };
  return geometries;
}

/** Disposes the shared emote geometry (materials go with the rig's). */
export function disposeEmoteGeometry(): void {
  if (geometries) for (const g of Object.values(geometries)) g.dispose();
  geometries = null;
}

/** Scale, rise and sway of an emote this frame. */
export interface EmotePose {
  scale: number;
  lift: number;
  sway: number;
}

/**
 * Pose of `kind` shown for `t` seconds. Hearts and clouds pop in, float and
 * shrink away at the end of EMOTE_SECONDS; sweat drips on a loop. With
 * `calm` the emote stands still at full size.
 */
export function emotePose(kind: EmoteKind, t: number, calm: boolean, out: EmotePose): EmotePose {
  out.scale = 1;
  out.lift = 0;
  out.sway = 0;
  if (calm) return out;
  const life = EMOTE_SECONDS[kind];
  const at = kind === 'sweat' ? ((t % life) + life) % life : Math.max(0, t);
  out.scale = popScale(at, false) * Math.min(1, Math.max(0, (life - at) / SHRINK_SECONDS));
  if (kind === 'heart') {
    const k = Math.min(1, at / life);
    out.lift = HEART_RISE * k * (2 - k);
    out.sway = Math.sin(at * 5) * 0.3;
  } else if (kind === 'cloud') {
    out.lift = Math.sin(at * 3) * 0.025;
    out.sway = Math.sin(at * 1.7) * 0.15;
  } else {
    out.lift = -SWEAT_DROP * (at / life);
  }
  return out;
}

/** One body's emotes: a hidden mesh per kind under the label anchor. */
export class Emote {
  readonly group = new Group();
  private readonly meshes: Readonly<Record<EmoteKind, Mesh>>;
  private shown: EmoteKind | null = null;
  private readonly pose: EmotePose = { scale: 1, lift: 0, sway: 0 };

  constructor() {
    const g = emoteGeometry();
    const make = (kind: EmoteKind): Mesh => {
      const m = new Mesh(g[kind], materialFor(COLORS[kind]));
      m.castShadow = false;
      m.visible = false;
      this.group.add(m);
      return m;
    };
    this.meshes = { heart: make('heart'), sweat: make('sweat'), cloud: make('cloud') };
  }

  /** The emote on screen, or null. */
  get kindShown(): EmoteKind | null {
    return this.shown;
  }

  /** Mesh drawn for `kind` (tests). */
  meshFor(kind: EmoteKind): Mesh {
    return this.meshes[kind];
  }

  /**
   * Shows `kind` (null hides all) `t` seconds in. `heading` is the body's
   * rotation.y; the heart and the cloud turn back by it so they face the
   * same way as the room's default view whichever way the customer walks.
   */
  update(kind: EmoteKind | null, t: number, calm: boolean, heading = 0): void {
    if (kind !== this.shown) {
      if (this.shown) this.meshes[this.shown].visible = false;
      if (kind) this.meshes[kind].visible = true;
      this.shown = kind;
    }
    if (!kind) return;
    const p = emotePose(kind, t, calm, this.pose);
    const m = this.meshes[kind];
    const [x, y, z] = OFFSETS[kind];
    m.position.set(x, y + p.lift, z);
    m.scale.setScalar(Math.max(1e-3, p.scale));
    m.rotation.y = kind === 'sweat' ? 0 : p.sway - heading;
  }

  /** Hides everything (back to the pool). */
  hide(): void {
    for (const kind of EMOTE_KINDS) this.meshes[kind].visible = false;
    this.shown = null;
  }
}
