import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, type BufferGeometry } from 'three';
import type { StaffRole } from '../../sim/types';
import { propsFor, type AnimName, type Pose } from './animations';

/**
 * Low-poly people built from boxes in nested Groups:
 * root → hips → (legs, torso → (arms, head)). Every character shares the same
 * geometries and one cached Lambert material per colour, so a character costs
 * a handful of draw calls and no new GPU buffers.
 */

/** Who the character is: a customer, a staff role, or the player (who wears a cap). */
export type CharacterRole = 'customer' | 'player' | Exclude<StaffRole, 'none'> | 'none';

export interface CharacterOptions {
  role: CharacterRole;
  /** Visual variant (shirt, hair, skin); any integer. */
  look: number;
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
const STAFF_SHIRT = 0xfff9f0;
const CAP_COLOR = 0xe05a4f;
const ANGRY_SKIN = 0xe8604c;
const TRAY_COLOR = 0x9aa3ab;
const CUP_COLOR = 0xf7f3ea;
const COFFEE_COLOR = 0x6b4226;
const RAG_COLOR = 0x5bc0de;

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

/** Box geometries shared by every character, built once. Each is offset so its Group pivot sits at the joint. */
function sharedGeometry(): Record<string, BufferGeometry> {
  if (geometries) return geometries;
  const box = (w: number, h: number, d: number, y = 0, z = 0): BufferGeometry => new BoxGeometry(w, h, d).translate(0, y, z);
  geometries = {
    leg: box(0.13, HIPS_Y, 0.15, -HIPS_Y / 2),
    body: box(0.36, 0.42, 0.22, 0.21),
    apron: box(0.3, 0.38, 0.02, 0.17, 0.12),
    arm: box(0.1, 0.36, 0.11, -0.18),
    hand: box(0.1, 0.08, 0.1, -0.4),
    head: box(0.3, 0.28, 0.27, 0.14),
    hair: box(0.32, 0.09, 0.29, 0.29),
    eye: box(0.04, 0.05, 0.02, 0.16, 0.14),
    cap: new CylinderGeometry(0.17, 0.17, 0.08, 8).translate(0, 0.33, 0),
    brim: box(0.24, 0.02, 0.14, 0.3, 0.17),
    tray: new CylinderGeometry(0.2, 0.2, 0.02, 10),
    cup: new CylinderGeometry(0.05, 0.04, 0.11, 8).translate(0, 0.055, 0),
    coffee: new CylinderGeometry(0.045, 0.045, 0.01, 8).translate(0, 0.11, 0),
    rag: box(0.14, 0.03, 0.12),
    hitbox: box(0.6, 1.45, 0.6, 0.72),
  };
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
  role: CharacterRole = 'customer';
  look = 0;

  private readonly body: Mesh;
  private readonly apron: Mesh;
  private readonly headMesh: Mesh;
  private readonly hair: Mesh;
  private readonly cap: Group;
  private readonly arms: Mesh[];
  private readonly hands: Mesh[];
  private readonly legs: Mesh[];
  private readonly tray: Group;
  private readonly cup: Group;
  private readonly rag: Mesh;
  private skin = SKINS[0]!;
  private angry = false;

  constructor(opts: CharacterOptions) {
    const g = sharedGeometry();
    this.root.add(this.hips);
    this.hips.position.y = HIPS_Y;

    this.legs = [mesh(g.leg!, 0), mesh(g.leg!, 0)];
    this.legL.position.x = -0.09;
    this.legR.position.x = 0.09;
    this.legL.add(this.legs[0]!);
    this.legR.add(this.legs[1]!);
    this.hips.add(this.legL, this.legR, this.torso);

    this.body = mesh(g.body!, 0);
    this.apron = mesh(g.apron!, 0);
    this.torso.add(this.body, this.apron);

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
    const eyeL = mesh(g.eye!, 0x2a211c);
    const eyeR = mesh(g.eye!, 0x2a211c);
    eyeL.position.x = -0.07;
    eyeR.position.x = 0.07;
    this.cap = new Group();
    this.cap.add(mesh(g.cap!, CAP_COLOR), mesh(g.brim!, CAP_COLOR));
    this.head.add(this.headMesh, this.hair, eyeL, eyeR, this.cap);
    this.torso.add(this.head);

    // Tray rides in front of the chest between both hands.
    this.tray = new Group();
    this.tray.position.set(0, 0.33, 0.42);
    const trayCup = new Group();
    trayCup.add(mesh(g.cup!, CUP_COLOR), mesh(g.coffee!, COFFEE_COLOR));
    trayCup.position.set(0.04, 0.01, 0.02);
    this.tray.add(mesh(g.tray!, TRAY_COLOR), trayCup);
    this.torso.add(this.tray);

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

  /** Dresses the character for a role and look; reuses the shared materials. */
  setLook(opts: CharacterOptions): void {
    this.role = opts.role;
    this.look = opts.look;
    const look = opts.look;
    const customer = opts.role === 'customer';
    this.skin = pick(SKINS, look * 3 + 1);
    const shirt = customer ? pick(SHIRTS, look) : STAFF_SHIRT;
    const pants = pick(PANTS, look + (customer ? 0 : 1));
    this.body.material = materialFor(shirt);
    for (const arm of this.arms) arm.material = materialFor(shirt);
    for (const leg of this.legs) leg.material = materialFor(pants);
    for (const hand of this.hands) hand.material = materialFor(this.skin);
    this.hair.material = materialFor(pick(HAIRS, look * 5 + 2));
    this.apron.visible = !customer;
    if (!customer) this.apron.material = materialFor(APRON_COLORS[opts.role as Exclude<CharacterRole, 'customer'>]);
    this.cap.visible = opts.role === 'player';
    this.hair.visible = opts.role !== 'player';
    this.angry = false;
    this.headMesh.material = materialFor(this.skin);
  }

  /** Red face while storming out. */
  setAngry(angry: boolean): void {
    if (angry === this.angry) return;
    this.angry = angry;
    this.headMesh.material = materialFor(angry ? ANGRY_SKIN : this.skin);
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

  /** Detaches from the scene; shared geometry and materials stay alive. */
  dispose(): void {
    this.root.removeFromParent();
  }
}

/** Builds a character from the shared geometry and materials. */
export function createCharacter(opts: CharacterOptions): Character {
  return new Character(opts);
}
