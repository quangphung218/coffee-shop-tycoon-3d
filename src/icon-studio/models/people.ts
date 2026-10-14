/**
 * Staff avatars: big head, short shoulders, framed tight. One model per
 * AVATAR_LOOKS entry (skin and hair from the look); looks also differ by
 * hair style and shirt, so they stay apart without relying on colour.
 */
import { ConeGeometry, CylinderGeometry, type Group, type Object3D, SphereGeometry, TorusGeometry } from 'three';
import { AVATAR_DEFAULT } from '../../ui/core/icons';
import { AVATAR_LOOKS } from '../../ui/core/iconMap';
import { AVATAR_IDS } from '../atlas';
import { type PaletteKey, paletteKeyOf, part } from '../style';
import { at, group, inkDot } from './shapes';

type HairStyle = 'crop' | 'bob' | 'curly' | 'pony' | 'spiky' | 'side' | 'long' | 'bun';

/** Hair style and shirt per AVATAR_LOOKS index. */
const LOOK_STYLE: readonly (readonly [HairStyle, PaletteKey])[] = [
  ['crop', 'mint'],
  ['bob', 'sky'],
  ['curly', 'coral'],
  ['pony', 'leaf'],
  ['spiky', 'honey'],
  ['side', 'tangerine'],
  ['long', 'latte'],
  ['bun', 'coffee'],
];

const HEAD = { y: 1.0, r: 0.72 } as const;

/** Sphere cap over the head; `tilt` turns it back so the forehead shows. */
function cap(hair: PaletteKey, thetaLength: number, opts: { phiStart?: number; phiLength?: number; r?: number; tilt?: number } = {}): Object3D {
  const g = new SphereGeometry(opts.r ?? HEAD.r + 0.05, 16, 10, opts.phiStart ?? 0, opts.phiLength ?? Math.PI * 2, 0, thetaLength);
  const m = at(part(g, hair), 0, HEAD.y + 0.02);
  m.rotation.x = -(opts.tilt ?? 0.25);
  return m;
}

/** Hair that wraps round the sides and back, open at the face (front is +Z, phi = π/2 in three.js). */
const wrap = (hair: PaletteKey, thetaLength: number) => cap(hair, thetaLength, { phiStart: Math.PI / 2 + 0.95, phiLength: Math.PI * 2 - 1.9, r: HEAD.r + 0.07, tilt: 0 });

function hairParts(style: HairStyle, hair: PaletteKey): Object3D[] {
  const top = cap(hair, Math.PI * 0.42);
  switch (style) {
    case 'crop':
      return [top];
    case 'bob':
      return [top, wrap(hair, Math.PI * 0.62)];
    case 'long':
      return [top, wrap(hair, Math.PI * 0.8), at(part(new CylinderGeometry(0.55, 0.62, 0.7, 12, 1, false, Math.PI * 0.75, Math.PI * 1.5), hair), 0, 0.62, -0.12)];
    case 'curly':
      return [
        top,
        ...Array.from({ length: 9 }, (_, i) => {
          const a = Math.PI * (0.05 + (0.9 * i) / 8);
          return at(part(new SphereGeometry(0.21, 8, 6), hair), -Math.cos(a) * 0.68, HEAD.y + Math.sin(a) * 0.62, -0.05);
        }),
      ];
    case 'pony': {
      const tail = at(part(new SphereGeometry(1, 10, 8).scale(0.24, 0.42, 0.24), hair), 0, HEAD.y + 0.05, -0.85);
      tail.rotation.x = -0.4;
      const tie = at(part(new TorusGeometry(0.12, 0.05, 6, 10), 'coral'), 0, HEAD.y + 0.42, -0.68);
      return [top, tail, tie];
    }
    case 'spiky':
      return [
        top,
        ...[-0.45, -0.15, 0.15, 0.45].map((x, i) => {
          const s = at(part(new ConeGeometry(0.17, 0.42, 6), hair), x, HEAD.y + 0.72 - Math.abs(x) * 0.35, 0.05 - (i % 2) * 0.2);
          s.rotation.z = -x * 0.9;
          return s;
        }),
      ];
    case 'side': {
      const fringe = at(part(new SphereGeometry(1, 12, 8).scale(0.5, 0.2, 0.32), hair), -0.22, HEAD.y + 0.5, 0.42);
      fringe.rotation.z = 0.35;
      return [top, fringe];
    }
    case 'bun':
      return [top, at(part(new SphereGeometry(0.28, 12, 8), hair), 0, HEAD.y + 0.82, -0.12)];
  }
}

function avatarModel(skin: PaletteKey, hair: PaletteKey, style: HairStyle, shirt: PaletteKey): Group {
  const shoulders = at(part(new CylinderGeometry(0.42, 0.62, 0.38, 14), shirt), 0, 0.19);
  const head = at(part(new SphereGeometry(HEAD.r, 16, 12), skin), 0, HEAD.y);
  const g = group(shoulders, head, ...hairParts(style, hair));

  /** Puts `o` on the face surface at (x, y) from the head centre. */
  const onFace = (o: Object3D, x: number, y: number, lift = 0.01) =>
    at(o, x, HEAD.y + y, Math.sqrt(Math.max(HEAD.r ** 2 - x * x - y * y, 0)) + lift);
  for (const x of [-0.24, 0.24]) {
    g.add(onFace(inkDot(0.08), x, -0.02));
    g.add(onFace(part(new SphereGeometry(0.1, 8, 6).scale(1, 0.6, 0.4), 'coral', { outline: false }), x * 1.55, -0.2));
  }
  const smile = part(new TorusGeometry(0.13, 0.03, 4, 10, Math.PI), 'ink', { outline: false });
  smile.rotation.z = Math.PI;
  g.add(onFace(smile, 0, -0.15, 0));
  // Turn the face a little towards the camera so both eyes read at 16 px.
  g.rotation.y = 0.35;
  return g;
}

/** i-avatar: the default look of the SVG sprite (skin-1, hair-2). */
export const avatar = () => avatarModel(paletteKeyOf(AVATAR_DEFAULT.skin), paletteKeyOf(AVATAR_DEFAULT.hair), 'crop', 'mint');

/** One builder per AVATAR_LOOKS entry, keyed by AVATAR_IDS. */
export const AVATAR_MODELS: Readonly<Record<string, () => Object3D>> = Object.fromEntries(
  AVATAR_LOOKS.map((look, i) => {
    const [style, shirt] = LOOK_STYLE[i % LOOK_STYLE.length]!;
    return [AVATAR_IDS[i]!, () => avatarModel(paletteKeyOf(look.skin), paletteKeyOf(look.hair), style, shirt)] as const;
  }),
);
