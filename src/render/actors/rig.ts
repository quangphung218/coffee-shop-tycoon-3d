import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DEFAULT_UNIFORM, uniformById, type HatKind } from '../../sim/data/uniforms';
import type { PersonaId, StaffRole, UniformId } from '../../sim/types';
import { propsFor, type AnimName, type Bounce, type Mood, type Pose } from './animations';

/**
 * Low-poly people built from boxes in nested Groups:
 * root → bounce → hips → (legs, torso → (arms, head)). Every character shares the same
 * geometries and one cached Lambert material per colour, so a character costs
 * a handful of draw calls and no new GPU buffers. The chunky parts are lightly
 * bevelled (RoundedBoxGeometry) so edges catch the light; the brows and mouth of
 * each mood are merged into one geometry, so a whole face is a single draw call.
 */

/** Who the character is: a customer, a staff role, or the player (who wears a cap). */
export type CharacterRole = 'customer' | 'player' | Exclude<StaffRole, 'none'> | 'none';

export interface CharacterOptions {
  role: CharacterRole;
  /** Visual variant (shirt, hair, skin); any integer. */
  look: number;
  /** Customer personality; adds a persona accessory (briefcase, backpack, beanie, scarf, tote). Absent = none. */
  persona?: PersonaId;
  /** Team uniform for staff and the player (shirt, sleeves, hat). Absent = 'classic'; customers ignore it. */
  uniform?: UniformId;
}

/** Standing hip height; the legs are this long. */
export const HIPS_Y = 0.55;
/** Height of the top of the head, for placing labels. */
export const HEAD_TOP_Y = 1.32;

const SHIRTS: readonly number[] = [0xe07a5f, 0x3d9be9, 0xf2c14e, 0x8e6bd8, 0x2fb898, 0xf28cb1, 0x5bc0de, 0xff9f43];
const PANTS: readonly number[] = [0x3b4a6b, 0x5c3a26, 0x2a211c, 0x6b5e55];
const SKINS: readonly number[] = [0xf5d0b0, 0xe8b48f, 0xc98b5a, 0x8d5a3b];
const HAIRS: readonly number[] = [0x2a211c, 0x5c3a26, 0xc77700, 0x8c7f75];
/** Apron colour per staff role; the player wears the brand coffee apron and a cap. */
export const APRON_COLORS: Readonly<Record<Exclude<CharacterRole, 'customer'>, number>> = {
  player: 0x5c3a26,
  barista: 0x0f6b57,
  server: 0x3d6fd8,
  cleaner: 0xf2a516,
  marketer: 0xd8457a,
  none: 0x8c7f75,
};
/** The player's red cap, kept with the 'classic' uniform (which gives the staff no hat). */
export const CAP_COLOR = 0xe05a4f;
/** A gentle flush while storming out; softer than a full red so it reads cartoon, not alarming. */
const ANGRY_SKIN = 0xe3917c;
const TRAY_COLOR = 0x9aa3ab;
const CUP_COLOR = 0xf7f3ea;
const COFFEE_COLOR = 0x6b4226;
const RAG_COLOR = 0x5bc0de;
const SHOE_COLOR = 0x2a211c;
const FACE_INK = 0x2a211c;

/** The five expressions a face can take. */
export const MOODS: readonly Mood[] = ['neutral', 'happy', 'impatient', 'angry', 'sad'];

/** A persona accessory: which merged geometry, its colour, and where it sits on the torso or the head. */
interface Accessory {
  geo: string;
  color: number;
  pos: readonly [number, number, number];
  /** Rides on the head (turns and nods with it) instead of the torso. */
  onHead?: boolean;
}
export const ACCESSORIES: Readonly<Record<PersonaId, Accessory>> = {
  office: { geo: 'acc_briefcase', color: 0x5c3a26, pos: [0.3, -0.08, 0.1] },
  student: { geo: 'acc_backpack', color: 0x3d9be9, pos: [0, 0.2, -0.17] },
  regular: { geo: 'acc_beanie', color: 0x6a4c93, pos: [0, 0, 0], onHead: true },
  connoisseur: { geo: 'acc_scarf', color: 0xd8457a, pos: [0, 0.42, 0] },
  family: { geo: 'acc_tote', color: 0xf2a516, pos: [-0.31, -0.12, 0.04] },
};
/** Accessory geometry shown (hidden) for a customer without one, so every rig shares it. */
const DEFAULT_ACCESSORY = 'acc_scarf';

const materials = new Map<number, MeshLambertMaterial>();

/** Shared flat-shaded material for a colour. */
export function materialFor(color: number): MeshLambertMaterial {
  let mat = materials.get(color);
  if (!mat) {
    mat = new MeshLambertMaterial({ color, flatShading: true });
    materials.set(color, mat);
  }
  return mat;
}

let geometries: Record<string, BufferGeometry> | null = null;

/** Builds the merged brows-and-mouth geometry for one mood (local to the head). */
function faceGeometry(mood: Mood): BufferGeometry {
  const Z = 0.142;
  const BROW_Y = 0.205;
  const EYE_X = 0.07;
  const MOUTH_Y = 0.072;
  const parts: BufferGeometry[] = [];
  const brow = (x: number, dy: number, rot: number): void => {
    parts.push(new BoxGeometry(0.075, 0.016, 0.02).rotateZ(rot).translate(x, BROW_Y + dy, Z));
  };
  // A curved mouth from three boxes: dir +1 smiles, -1 frowns, 0 is a flat line.
  const mouth = (dir: number): void => {
    parts.push(new BoxGeometry(0.06, 0.02, 0.02).translate(0, MOUTH_Y - dir * 0.006, Z));
    if (dir === 0) return;
    parts.push(new BoxGeometry(0.035, 0.02, 0.02).rotateZ(-dir * 0.6).translate(0.045, MOUTH_Y + dir * 0.012, Z));
    parts.push(new BoxGeometry(0.035, 0.02, 0.02).rotateZ(dir * 0.6).translate(-0.045, MOUTH_Y + dir * 0.012, Z));
  };
  switch (mood) {
    case 'happy':
      brow(-EYE_X, 0.012, 0);
      brow(EYE_X, 0.012, 0);
      mouth(1);
      break;
    case 'impatient':
      brow(-EYE_X, -0.004, 0.14);
      brow(EYE_X, -0.004, -0.14);
      parts.push(new BoxGeometry(0.07, 0.018, 0.02).rotateZ(0.1).translate(0.006, MOUTH_Y, Z));
      break;
    case 'angry':
      brow(-EYE_X, -0.01, 0.42);
      brow(EYE_X, -0.01, -0.42);
      mouth(-1);
      break;
    case 'sad':
      // Brows raised at the inner ends and drooping outward; a small mouth sagging at both corners.
      brow(-EYE_X, 0.008, 0.3);
      brow(EYE_X, 0.008, -0.3);
      parts.push(new BoxGeometry(0.04, 0.018, 0.02).translate(0, MOUTH_Y + 0.004, Z));
      parts.push(new BoxGeometry(0.035, 0.018, 0.02).rotateZ(-0.8).translate(0.032, MOUTH_Y - 0.008, Z));
      parts.push(new BoxGeometry(0.035, 0.018, 0.02).rotateZ(0.8).translate(-0.032, MOUTH_Y - 0.008, Z));
      break;
    default:
      brow(-EYE_X, 0, 0);
      brow(EYE_X, 0, 0);
      mouth(0);
      break;
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('rig: could not merge face geometry');
  return merged;
}

/** Merges `parts` into one geometry (one draw call) and disposes the parts. */
function merged(parts: BufferGeometry[]): BufferGeometry {
  const geo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error('rig: could not merge accessory geometry');
  return geo;
}

/** Box geometries shared by every character, built once. Each is offset so its Group pivot sits at the joint. */
function sharedGeometry(): Record<string, BufferGeometry> {
  if (geometries) return geometries;
  const box = (w: number, h: number, d: number, y = 0, z = 0): BufferGeometry => new BoxGeometry(w, h, d).translate(0, y, z);
  // Lightly bevelled box for the chunky limbs and body, so edges catch the light.
  const rbox = (w: number, h: number, d: number, y = 0, z = 0, r = 0.025): BufferGeometry =>
    new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)).translate(0, y, z);
  geometries = {
    leg: rbox(0.13, HIPS_Y, 0.15, -HIPS_Y / 2),
    shoe: rbox(0.15, 0.08, 0.22, -HIPS_Y + 0.04, 0.04, 0.03),
    body: rbox(0.36, 0.42, 0.22, 0.21, 0, 0.04),
    apron: box(0.3, 0.38, 0.02, 0.17, 0.12),
    neck: new CylinderGeometry(0.075, 0.09, 0.12, 10).translate(0, 0.42, 0),
    arm: rbox(0.1, 0.36, 0.11, -0.18),
    hand: rbox(0.1, 0.09, 0.1, -0.4, 0, 0.045),
    head: rbox(0.3, 0.28, 0.27, 0.14, 0, 0.045),
    hair: rbox(0.32, 0.1, 0.29, 0.29, 0, 0.04),
    eye: box(0.045, 0.055, 0.03),
    // Hats replace the hair. Each is one merged geometry, swapped in the one hat slot.
    hat_cap: merged([new CylinderGeometry(0.17, 0.17, 0.08, 8).translate(0, 0.33, 0), box(0.24, 0.02, 0.14, 0.3, 0.17)]),
    // Beret: a band round the head under a wide flat crown tipped to one side, with a stalk on top.
    hat_beret: merged([
      box(0.31, 0.05, 0.28, 0.29),
      new BoxGeometry(0.37, 0.06, 0.34).rotateZ(0.12).translate(0.02, 0.33, 0),
      box(0.04, 0.04, 0.04, 0.38),
    ]),
    // Bandana: a cloth cap over the top of the head, knotted at the back with two tails.
    hat_bandana: merged([
      box(0.33, 0.1, 0.3, 0.295),
      box(0.08, 0.06, 0.04, 0.27, -0.16),
      new BoxGeometry(0.04, 0.1, 0.02).rotateZ(0.3).translate(-0.03, 0.2, -0.165),
      new BoxGeometry(0.04, 0.1, 0.02).rotateZ(-0.3).translate(0.03, 0.2, -0.165),
    ]),
    tray: new CylinderGeometry(0.2, 0.2, 0.02, 10),
    cup: new CylinderGeometry(0.05, 0.04, 0.11, 8).translate(0, 0.055, 0),
    coffee: new CylinderGeometry(0.045, 0.045, 0.01, 8).translate(0, 0.11, 0),
    rag: box(0.14, 0.03, 0.12),
    acc_briefcase: box(0.18, 0.14, 0.06),
    acc_backpack: rbox(0.26, 0.3, 0.12, 0, 0, 0.04),
    acc_scarf: box(0.34, 0.07, 0.3),
    // Knit beanie with a pompom, a little larger than the hair so it covers it.
    acc_beanie: merged([box(0.34, 0.13, 0.31, 0.31), box(0.09, 0.07, 0.09, 0.4)]),
    // Shopping tote held at the left hand, strap up to the fist.
    acc_tote: merged([box(0.17, 0.2, 0.08), box(0.03, 0.12, 0.02, 0.15)]),
    hitbox: box(0.6, 1.45, 0.6, 0.72),
  };
  for (const mood of MOODS) geometries[`face_${mood}`] = faceGeometry(mood);
  return geometries;
}

/** Disposes the shared geometries and materials (when the last world goes away). */
export function disposeSharedRig(): void {
  if (geometries) for (const g of Object.values(geometries)) g.dispose();
  geometries = null;
  for (const m of materials.values()) m.dispose();
  materials.clear();
  HITBOX_MATERIAL.dispose();
}

/** Never drawn; the picker raycasts it so a click near a person counts. */
const HITBOX_MATERIAL = new MeshBasicMaterial({ visible: false });

function mesh(geo: BufferGeometry, color: number): Mesh {
  const m = new Mesh(geo, materialFor(color));
  m.castShadow = true;
  return m;
}

function pick<T>(list: readonly T[], i: number): T {
  return list[((i % list.length) + list.length) % list.length]!;
}

export class Character {
  readonly root = new Group();
  /** Squash-and-stretch pivot at the feet; labels and hitbox sit outside it. */
  readonly bounce = new Group();
  readonly hips = new Group();
  readonly torso = new Group();
  readonly head = new Group();
  readonly armL = new Group();
  readonly armR = new Group();
  readonly legL = new Group();
  readonly legR = new Group();
  /** Invisible box the picker raycasts against. */
  readonly hitbox: Mesh;
  /** Group above the head that labels attach to. */
  readonly labelAnchor = new Group();
  /** Just above the hands in front of the chest, where steam rises from a drink. */
  readonly steamAnchor = new Group();
  role: CharacterRole = 'customer';
  look = 0;
  /** Uniform last dressed in; customers keep the default. */
  uniform: UniformId = DEFAULT_UNIFORM;

  private readonly body: Mesh;
  private readonly apron: Mesh;
  private readonly neck: Mesh;
  private readonly headMesh: Mesh;
  private readonly hair: Mesh;
  private readonly hat: Mesh;
  private readonly arms: Mesh[];
  private readonly hands: Mesh[];
  private readonly legs: Mesh[];
  private readonly shoes: Mesh[];
  private readonly eyes: Mesh[];
  private readonly face: Mesh;
  private readonly accessory: Mesh;
  private readonly tray: Group;
  private readonly cup: Group;
  private readonly rag: Mesh;
  private skin = SKINS[0]!;
  private angry = false;
  private mood: Mood = 'neutral';

  constructor(opts: CharacterOptions) {
    const g = sharedGeometry();
    this.root.add(this.bounce);
    this.bounce.add(this.hips);
    this.hips.position.y = HIPS_Y;

    this.legs = [mesh(g.leg!, 0), mesh(g.leg!, 0)];
    this.shoes = [mesh(g.shoe!, SHOE_COLOR), mesh(g.shoe!, SHOE_COLOR)];
    this.legL.position.x = -0.09;
    this.legR.position.x = 0.09;
    this.legL.add(this.legs[0]!, this.shoes[0]!);
    this.legR.add(this.legs[1]!, this.shoes[1]!);
    this.hips.add(this.legL, this.legR, this.torso);

    this.body = mesh(g.body!, 0);
    this.apron = mesh(g.apron!, 0);
    this.neck = mesh(g.neck!, this.skin);
    this.torso.add(this.body, this.apron, this.neck);

    this.arms = [mesh(g.arm!, 0), mesh(g.arm!, 0)];
    this.hands = [mesh(g.hand!, 0), mesh(g.hand!, 0)];
    this.armL.position.set(-0.235, 0.38, 0);
    this.armR.position.set(0.235, 0.38, 0);
    this.armL.add(this.arms[0]!, this.hands[0]!);
    this.armR.add(this.arms[1]!, this.hands[1]!);
    this.torso.add(this.armL, this.armR);

    this.head.position.y = 0.43;
    this.headMesh = mesh(g.head!, 0);
    this.hair = mesh(g.hair!, 0);
    this.eyes = [mesh(g.eye!, FACE_INK), mesh(g.eye!, FACE_INK)];
    this.eyes[0]!.position.set(-0.07, 0.16, 0.14);
    this.eyes[1]!.position.set(0.07, 0.16, 0.14);
    this.face = mesh(g.face_neutral!, FACE_INK);
    this.hat = mesh(g.hat_cap!, CAP_COLOR);
    this.head.add(this.headMesh, this.hair, this.eyes[0]!, this.eyes[1]!, this.face, this.hat);
    this.torso.add(this.head);

    this.accessory = mesh(g[DEFAULT_ACCESSORY]!, 0xd8457a);
    // Too small to show a shadow of its own; skipping the shadow pass keeps
    // personas from adding draw calls at high quality.
    this.accessory.castShadow = false;
    this.accessory.visible = false;
    this.torso.add(this.accessory);

    // Tray rides in front of the chest between both hands.
    this.tray = new Group();
    this.tray.position.set(0, 0.33, 0.42);
    const trayCup = new Group();
    trayCup.add(mesh(g.cup!, CUP_COLOR), mesh(g.coffee!, COFFEE_COLOR));
    trayCup.position.set(0.04, 0.01, 0.02);
    this.tray.add(mesh(g.tray!, TRAY_COLOR), trayCup);
    this.torso.add(this.tray);
    this.steamAnchor.position.set(0, 0.46, 0.42);
    this.torso.add(this.steamAnchor);

    this.cup = new Group();
    this.cup.add(mesh(g.cup!, CUP_COLOR), mesh(g.coffee!, COFFEE_COLOR));
    this.cup.position.set(0, -0.46, 0.04);
    this.armR.add(this.cup);

    this.rag = mesh(g.rag!, RAG_COLOR);
    this.rag.position.set(0, -0.46, 0);
    this.armR.add(this.rag);

    this.hitbox = new Mesh(g.hitbox!, HITBOX_MATERIAL);
    this.root.add(this.hitbox);

    this.labelAnchor.position.y = HEAD_TOP_Y + 0.22;
    this.root.add(this.labelAnchor);

    this.setLook(opts);
    this.showProps('idle');
  }

  /** Dresses the character for a role, look and (staff and player) uniform; reuses the shared materials. */
  setLook(opts: CharacterOptions): void {
    const g = sharedGeometry();
    this.role = opts.role;
    this.look = opts.look;
    const look = opts.look;
    const customer = opts.role === 'customer';
    const uniform = (opts.uniform && uniformById(opts.uniform)) || uniformById(DEFAULT_UNIFORM)!;
    this.uniform = customer ? DEFAULT_UNIFORM : uniform.id;
    this.skin = pick(SKINS, look * 3 + 1);
    const shirt = customer ? pick(SHIRTS, look) : uniform.shirt;
    const pants = pick(PANTS, look + (customer ? 0 : 1));
    this.body.material = materialFor(shirt);
    for (const arm of this.arms) arm.material = materialFor(shirt);
    for (const leg of this.legs) leg.material = materialFor(pants);
    for (const hand of this.hands) hand.material = materialFor(this.skin);
    this.neck.material = materialFor(this.skin);
    this.hair.material = materialFor(pick(HAIRS, look * 5 + 2));
    this.apron.visible = !customer;
    if (!customer) this.apron.material = materialFor(APRON_COLORS[opts.role as Exclude<CharacterRole, 'customer'>]);
    // The player keeps the red cap with 'classic'; any other uniform puts its own hat on everyone.
    let hat: HatKind = customer ? 'none' : uniform.hat;
    let hatColor = uniform.hatColor;
    if (opts.role === 'player' && hat === 'none') {
      hat = 'cap';
      hatColor = CAP_COLOR;
    }
    this.hat.visible = hat !== 'none';
    if (hat !== 'none') {
      this.hat.geometry = g[`hat_${hat}`]!;
      this.hat.material = materialFor(hatColor);
    }
    this.hair.visible = hat === 'none';
    // Reset the face to neutral; a pooled body may have left angry or smiling.
    this.angry = false;
    this.mood = 'neutral';
    this.face.geometry = g.face_neutral!;
    this.headMesh.material = materialFor(this.skin);
    for (const eye of this.eyes) eye.scale.y = 1;

    const acc = customer && opts.persona ? ACCESSORIES[opts.persona] : undefined;
    if (acc) {
      this.accessory.geometry = g[acc.geo]!;
      this.accessory.material = materialFor(acc.color);
      this.accessory.position.set(acc.pos[0], acc.pos[1], acc.pos[2]);
      const parent = acc.onHead ? this.head : this.torso;
      if (this.accessory.parent !== parent) parent.add(this.accessory);
    }
    this.accessory.visible = acc !== undefined;
    // A beanie covers the hair, so the hair mesh is not drawn under it.
    if (acc?.onHead) this.hair.visible = false;
  }

  /** Red face while storming out. */
  setAngry(angry: boolean): void {
    this.setMood(angry ? 'angry' : 'neutral');
  }

  /** Swaps the brows and mouth to the mood, and flushes the face red when angry. */
  setMood(mood: Mood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    this.face.geometry = sharedGeometry()[`face_${mood}`]!;
    const angry = mood === 'angry';
    if (angry !== this.angry) {
      this.angry = angry;
      this.headMesh.material = materialFor(angry ? ANGRY_SKIN : this.skin);
    }
  }

  /** Scales the eyes shut for a blink; `open` is 1 fully open, near 0 shut. */
  setBlink(open: number): void {
    for (const eye of this.eyes) eye.scale.y = open;
  }

  get isAngry(): boolean {
    return this.angry;
  }

  showProps(anim: AnimName): void {
    const props = propsFor(anim);
    this.tray.visible = props.tray;
    this.cup.visible = props.cup;
    this.rag.visible = props.rag;
  }

  /** Copies joint angles onto the rig. */
  applyPose(pose: Pose): void {
    this.hips.position.y = HIPS_Y + pose.hipsY;
    this.torso.rotation.set(pose.lean, pose.twist, 0);
    this.head.rotation.set(pose.headX, pose.headY, 0);
    this.armL.rotation.set(pose.armLX, 0, -pose.armLZ);
    this.armR.rotation.set(pose.armRX, 0, pose.armRZ);
    this.legL.rotation.x = pose.legL;
    this.legR.rotation.x = pose.legR;
  }

  /** Scales the body around the feet and lifts it off the floor. */
  applyBounce(b: Bounce): void {
    this.bounce.scale.set(b.sx, b.sy, b.sx);
    this.bounce.position.y = b.lift;
  }

  /** Detaches from the scene; shared geometry and materials stay alive. */
  dispose(): void {
    this.root.removeFromParent();
  }
}

/** Builds a character from the shared geometry and materials. */
export function createCharacter(opts: CharacterOptions): Character {
  return new Character(opts);
}
