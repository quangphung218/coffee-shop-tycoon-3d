import { BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, IcosahedronGeometry } from 'three';
import { COUNTER_DEPTH, COUNTER_TOP_DEPTH, COUNTER_TOP_EXTRA, MACHINE_SIZE } from '../../sim/nav/footprints';
import type { LayoutMachine, MachineKind } from '../../sim/upgrades';
import { PALETTE, box, cyl, merge, part } from './parts';

/**
 * Machines on the back counter and the front counter, one merged geometry
 * (one Mesh) each, with a look per upgrade tier (upgradeTier, 1..3; 0 draws
 * as 1). Tier 1 is the original model. Tier 2 adds a working detail and a
 * steel plinth. Tier 3 turns the plinth gold and adds a gold star badge.
 * Each tier stays within 1.6 times the triangles of tier 1.
 */

/** Body and accent colours of the espresso machine per better_machine level. */
const MACHINE_TIERS: readonly (readonly [number, number])[] = [
  [PALETTE.steel, PALETTE.steelDark],
  [0xe05a4f, 0xf2f2f2],
  [PALETTE.mint, PALETTE.gold],
  [PALETTE.gold, 0x3b2418],
];

export const COUNTER_HEIGHT = 1;
export const BACK_COUNTER_HEIGHT = 0.9;
/** Back-counter top the machines stand on. */
const MACHINE_Y = BACK_COUNTER_HEIGHT;

/** Tier 0 (not bought) draws as tier 1; levels past the top tier as tier 3. */
function lookTier(tier: number): 1 | 2 | 3 {
  return Math.max(1, Math.min(3, Math.floor(tier))) as 1 | 2 | 3;
}

/** Five-point star facing +z with a raised centre: 10 triangles. */
function starGeometry(r: number): BufferGeometry {
  const inner = r * 0.45;
  const h = r * 0.35;
  const rim: (readonly [number, number])[] = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : inner;
    rim.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const pos: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < 10; i++) {
    const [ax, ay] = rim[i]!;
    const [bx, by] = rim[(i + 1) % 10]!;
    pos.push(0, 0, h, ax, ay, 0, bx, by, 0);
    uv.push(0.5, 0.5, ax / (2 * r) + 0.5, ay / (2 * r) + 0.5, bx / (2 * r) + 0.5, by / (2 * r) + 0.5);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  geo.computeVertexNormals();
  return geo;
}

/** Gold star badge on a front face (+z) at tier 3. */
function star(r: number, x: number, y: number, z: number): BufferGeometry {
  return part(starGeometry(r), PALETTE.gold, x, y, z);
}

/** Plinth under a machine from tier 2: steel, gold at tier 3. */
function plinth(kind: MachineKind, tier: number): BufferGeometry {
  const size = MACHINE_SIZE[kind];
  return part(box(size.width - 0.02, 0.04, size.depth - 0.02), tier >= 3 ? PALETTE.gold : PALETTE.steel, 0, MACHINE_Y + 0.02, 0);
}

/** Open tube: no caps where a lid or a base hides them. */
function tube(rTop: number, rBottom: number, h: number, segments: number): CylinderGeometry {
  return new CylinderGeometry(rTop, rBottom, h, segments, 1, true);
}

/** Tier 2 adds a pressure gauge; quality (better_machine level) sets the colours and the cups on top. */
function espressoGeometry(quality: number, tier: number): BufferGeometry {
  const [body, accent] = MACHINE_TIERS[Math.min(quality, MACHINE_TIERS.length - 1)]!;
  const y = MACHINE_Y;
  const parts: BufferGeometry[] = [
    part(box(0.9, 0.6, 0.55), body, 0, y + 0.3, 0),
    part(box(MACHINE_SIZE.espresso.width, 0.08, MACHINE_SIZE.espresso.depth), accent, 0, y + 0.64, 0),
    part(box(0.8, 0.05, 0.25), accent, 0, y + 0.03, 0.3),
    // Group heads with a portafilter and twin spouts below the left one.
    part(cyl(0.06, 0.06, 0.12, 6), accent, -0.2, y + 0.38, 0.32),
    part(cyl(0.06, 0.06, 0.12, 6), accent, 0.2, y + 0.38, 0.32),
    part(cyl(0.065, 0.065, 0.05, 8), PALETTE.steelDark, -0.2, y + 0.27, 0.34),
    part(box(0.035, 0.035, 0.16), PALETTE.woodDark, -0.2, y + 0.27, 0.48),
    part(cyl(0.012, 0.012, 0.07, 6), PALETTE.steelDark, -0.23, y + 0.2, 0.34),
    part(cyl(0.012, 0.012, 0.07, 6), PALETTE.steelDark, -0.17, y + 0.2, 0.34),
    part(cyl(0.05, 0.045, 0.1, 8), PALETTE.cup, -0.2, y + 0.11, 0.32),
  ];
  if (quality >= 1) parts.push(part(new IcosahedronGeometry(0.08, 0), accent, 0.33, y + 0.5, 0.29));
  if (quality >= 2) parts.push(part(new ConeGeometry(0.16, 0.32, 8), accent, -0.25, y + 0.84, -0.05, 0, Math.PI));
  if (quality >= 3) parts.push(part(new ConeGeometry(0.16, 0.32, 8), accent, 0.25, y + 0.84, -0.05, 0, Math.PI));
  if (tier >= 2) {
    parts.push(plinth('espresso', tier));
    parts.push(part(cyl(0.07, 0.07, 0.03, 8), PALETTE.cup, 0, y + 0.5, 0.285, 0, Math.PI / 2));
    parts.push(part(box(0.012, 0.05, 0.012), PALETTE.coral, 0.012, y + 0.51, 0.305, 0, 0, -0.6));
  }
  if (tier >= 3) parts.push(star(0.06, 0.33, y + 0.2, 0.276));
  return merge(parts);
}

/** Tier 2 adds a steam wand. */
function fastGeometry(quality: number, tier: number): BufferGeometry {
  const [body, accent] = MACHINE_TIERS[Math.min(quality, MACHINE_TIERS.length - 1)]!;
  const y = MACHINE_Y;
  const parts: BufferGeometry[] = [
    part(box(0.6, 0.9, 0.5), PALETTE.steel, 0, y + 0.45, 0),
    part(box(MACHINE_SIZE.fast.width, 0.06, MACHINE_SIZE.fast.depth), accent, 0, y + 0.93, 0),
    part(box(0.3, 0.12, 0.12), accent, 0, y + 0.5, 0.3),
    part(new ConeGeometry(0.18, 0.3, 8), body, 0, y + 1.11, 0, 0, Math.PI),
    part(cyl(0.05, 0.045, 0.1, 8), PALETTE.cup, 0, y + 0.06, 0.3),
  ];
  if (tier >= 2) {
    parts.push(plinth('fast', tier));
    parts.push(part(cyl(0.015, 0.015, 0.24, 4), PALETTE.steelDark, 0.22, y + 0.38, 0.29, 0, 0, 0.25));
  }
  if (tier >= 3) parts.push(star(0.05, -0.18, y + 0.72, 0.251));
  return merge(parts);
}

/** Bean grinder: squat body, a tapered bean hopper on top and a dosing chute. Tier 2 has a bigger hopper. */
function grinderGeometry(tier: number): BufferGeometry {
  const y = MACHINE_Y;
  const parts: BufferGeometry[] = [
    part(box(0.3, 0.1, 0.42), PALETTE.steelDark, 0, y + 0.05, 0),
    part(box(0.26, 0.4, 0.34), PALETTE.steel, 0, y + 0.3, 0),
    part(box(0.12, 0.1, 0.1), PALETTE.steelDark, 0, y + 0.18, 0.2),
    part(cyl(0.05, 0.06, 0.1, 6), PALETTE.cup, 0, y + 0.07, 0.24),
    part(box(0.04, 0.12, 0.04), PALETTE.gold, 0.11, y + 0.3, 0.17),
  ];
  if (tier >= 2) {
    parts.push(plinth('grinder', tier));
    parts.push(part(cyl(0.18, 0.11, 0.3, 10), PALETTE.coffee, 0, y + 0.66, 0));
    parts.push(part(cyl(0.19, 0.19, 0.03, 10), PALETTE.steelDark, 0, y + 0.82, 0));
  } else {
    parts.push(part(cyl(0.14, 0.1, 0.22, 10), PALETTE.coffee, 0, y + 0.62, 0));
    parts.push(part(cyl(0.15, 0.15, 0.03, 10), PALETTE.steelDark, 0, y + 0.74, 0));
  }
  if (tier >= 3) parts.push(star(0.045, -0.07, y + 0.38, 0.171));
  return merge(parts);
}

/** Smoothie blender: motor base, a glass jar and a lid. Tier 2 has two jars on a wider base. */
function blenderGeometry(tier: number): BufferGeometry {
  const y = MACHINE_Y;
  if (tier < 2) {
    return merge([
      part(box(0.3, 0.26, 0.34), PALETTE.steel, 0, y + 0.13, 0),
      part(box(0.2, 0.06, 0.2), PALETTE.steelDark, 0, y + 0.28, 0),
      part(cyl(0.13, 0.1, 0.34, 8), PALETTE.glass, 0, y + 0.48, 0),
      part(cyl(0.135, 0.135, 0.04, 8), PALETTE.mint, 0, y + 0.67, 0),
      part(box(0.04, 0.1, 0.03), PALETTE.coral, 0.12, y + 0.14, 0.18),
    ]);
  }
  const parts: BufferGeometry[] = [
    plinth('blender', tier),
    part(box(0.36, 0.26, 0.34), PALETTE.steel, 0, y + 0.13, 0),
    part(box(0.36, 0.06, 0.2), PALETTE.steelDark, 0, y + 0.28, 0),
    part(box(0.04, 0.1, 0.03), PALETTE.coral, 0.13, y + 0.14, 0.18),
  ];
  for (const x of [-0.095, 0.095]) {
    parts.push(part(tube(0.085, 0.07, 0.32, 6), PALETTE.glass, x, y + 0.47, 0));
    parts.push(part(cyl(0.09, 0.09, 0.04, 6), PALETTE.mint, x, y + 0.65, 0));
  }
  if (tier >= 3) parts.push(star(0.045, -0.12, y + 0.14, 0.171));
  return merge(parts);
}

/** Pastry display: a wood cabinet with a glazed frame and treats on two shelves; three from tier 2. */
function pastryCaseGeometry(tier: number): BufferGeometry {
  const y = MACHINE_Y;
  const w = 0.56;
  const d = 0.42;
  const shelves = tier >= 2 ? 3 : 2;
  const top = y + 0.52 + (shelves - 2) * 0.18;
  const parts: BufferGeometry[] = [
    part(box(w, 0.14, d), PALETTE.wood, 0, y + 0.07, 0),
    part(box(w, 0.02, d), PALETTE.woodDark, 0, y + 0.15, 0),
    part(box(w, 0.03, d), PALETTE.steelDark, 0, top, 0),
  ];
  for (let s = 1; s < shelves; s++) parts.push(part(box(w - 0.1, 0.02, d - 0.08), PALETTE.cream, 0, y + 0.15 + s * 0.18, 0));
  // Glass-tinted corner posts read as a case without hiding the treats.
  const postH = top - (y + 0.16);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(part(box(0.03, postH, 0.03), PALETTE.glass, (sx * (w - 0.03)) / 2, y + 0.16 + postH / 2, (sz * (d - 0.03)) / 2));
    }
  }
  const treats = [PALETTE.gold, PALETTE.coffee, PALETTE.coral];
  for (let s = 0; s < shelves; s++) {
    for (let i = 0; i < 3; i++) {
      parts.push(part(new IcosahedronGeometry(0.05, 0), treats[(i + 2 * s) % 3]!, -0.16 + i * 0.16, y + 0.2 + s * 0.18, 0));
    }
  }
  if (tier >= 2) parts.push(plinth('pastry_case', tier));
  if (tier >= 3) parts.push(star(0.045, 0.18, y + 0.07, d / 2 + 0.001));
  return merge(parts);
}

/** Ice maker: a white chest with a steel lid, a window hatch and a cold-blue badge. Tier 2 adds a mint light strip. */
function iceMakerGeometry(tier: number): BufferGeometry {
  const y = MACHINE_Y;
  const w = 0.46;
  const d = 0.42;
  const parts: BufferGeometry[] = [
    part(box(w, 0.5, d), PALETTE.cup, 0, y + 0.25, 0),
    part(box(w + 0.02, 0.06, d + 0.02), PALETTE.steel, 0, y + 0.53, 0),
    part(box(0.26, 0.18, 0.02), PALETTE.glass, 0, y + 0.22, d / 2),
    part(box(0.28, 0.03, 0.04), PALETTE.steelDark, 0, y + 0.12, d / 2),
    part(new IcosahedronGeometry(0.05, 0), PALETTE.mint, 0, y + 0.4, d / 2 + 0.01),
  ];
  if (tier >= 2) {
    parts.push(plinth('ice_maker', tier));
    parts.push(part(box(w - 0.06, 0.03, 0.02), PALETTE.mint, 0, y + 0.47, d / 2 + 0.005));
  }
  if (tier >= 3) parts.push(star(0.04, 0.16, y + 0.4, d / 2 + 0.001));
  return merge(parts);
}

/**
 * Dishwasher: a steel box with a front door, a handle bar and a control strip.
 * Tier 2 adds a glass rack on top; at tier 3 the star takes the place of the gold light.
 */
function dishwasherGeometry(tier: number): BufferGeometry {
  const y = MACHINE_Y;
  const w = 0.54;
  const d = 0.42;
  const parts: BufferGeometry[] = [
    part(box(w, 0.6, d), PALETTE.steel, 0, y + 0.3, 0),
    part(box(w - 0.06, 0.44, 0.02), PALETTE.steelDark, 0, y + 0.28, d / 2),
    part(box(w - 0.12, 0.04, 0.04), PALETTE.cup, 0, y + 0.5, d / 2),
    part(box(w - 0.06, 0.08, 0.02), PALETTE.mint, 0, y + 0.56, d / 2),
  ];
  if (tier >= 3) parts.push(star(0.035, w / 2 - 0.08, y + 0.56, d / 2 + 0.011));
  else parts.push(part(new IcosahedronGeometry(0.03, 0), PALETTE.gold, w / 2 - 0.08, y + 0.56, d / 2 + 0.01));
  if (tier >= 2) {
    parts.push(plinth('dishwasher', tier));
    parts.push(part(box(0.44, 0.03, 0.3), PALETTE.steel, 0, y + 0.615, 0));
    for (const x of [-0.1, 0.1]) parts.push(part(tube(0.045, 0.04, 0.1, 6), PALETTE.glass, x, y + 0.68, 0));
  }
  return merge(parts);
}

/** Merged geometry of one machine or piece of equipment, sitting on the back counter, in the look of its tier. */
export function machineGeometry(m: LayoutMachine): BufferGeometry {
  const tier = lookTier(m.tier);
  switch (m.kind) {
    case 'espresso':
      return espressoGeometry(m.quality, tier);
    case 'fast':
      return fastGeometry(m.quality, tier);
    case 'grinder':
      return grinderGeometry(tier);
    case 'blender':
      return blenderGeometry(tier);
    case 'pastry_case':
      return pastryCaseGeometry(tier);
    case 'ice_maker':
      return iceMakerGeometry(tier);
    case 'dishwasher':
      return dishwasherGeometry(tier);
  }
}

/**
 * Front counter, `level` big_counter levels wide. Tier 2 adds a wood front
 * panel, a menu board and a steel kick plinth; tier 3 a gold plinth and a star.
 */
export function counterGeometry(width: number, level: number, tierIn = 1): BufferGeometry {
  const tier = lookTier(tierIn);
  const parts = [
    part(box(width, COUNTER_HEIGHT - 0.06, COUNTER_DEPTH), PALETTE.wood, 0, (COUNTER_HEIGHT - 0.06) / 2, 0),
    part(box(width + COUNTER_TOP_EXTRA, 0.06, COUNTER_TOP_DEPTH), PALETTE.woodDark, 0, COUNTER_HEIGHT - 0.03, 0),
    part(box(width - 0.2, 0.12, 0.04), level >= 1 ? PALETTE.gold : PALETTE.cream, 0, 0.55, 0.41),
    // Cash register at the right end.
    part(box(0.45, 0.25, 0.35), 0x3b2418, width / 2 - 0.4, COUNTER_HEIGHT + 0.125, 0),
    part(box(0.35, 0.18, 0.04), PALETTE.mint, width / 2 - 0.4, COUNTER_HEIGHT + 0.35, -0.05, 0, -0.3),
  ];
  // Pastry plates on a wider counter.
  for (let i = 0; i < level; i++) {
    const x = -width / 2 + 0.5 + i * 0.6;
    parts.push(part(cyl(0.2, 0.2, 0.03, 10), PALETTE.cup, x, COUNTER_HEIGHT + 0.015, 0.1));
    parts.push(part(new IcosahedronGeometry(0.1, 0), 0xd99a4e, x, COUNTER_HEIGHT + 0.09, 0.1));
  }
  if (tier >= 2) {
    const front = COUNTER_DEPTH / 2;
    parts.push(part(box(width - 0.3, 0.38, 0.03), PALETTE.woodLight, 0, 0.27, front + 0.015));
    parts.push(part(box(width + 0.02, 0.08, COUNTER_DEPTH + 0.02), tier >= 3 ? PALETTE.gold : PALETTE.steel, 0, 0.04, 0));
    // Menu board standing at the back edge, facing the customers.
    parts.push(part(box(0.42, 0.28, 0.03), PALETTE.chalkboard, -width / 2 + 0.5, COUNTER_HEIGHT + 0.14, -0.32, 0, -0.2));
  }
  // Star on the wood panel; its raised centre stays inside the counter top's overhang.
  if (tier >= 3) parts.push(star(0.08, 0, 0.27, COUNTER_DEPTH / 2 + 0.031));
  return merge(parts);
}
