/**
 * The shared rules every 3D icon is built and lit with: palette, materials,
 * ink outline, contact shadow, camera and lights. Models only pick colours
 * and shapes; framing and lighting are decided here so the set stays uniform.
 */
import {
  BackSide,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import tokens from '../../design/tokens.json';

const c = tokens.color;

/** Token colours (design/tokens.json, same values as src/ui/styles/tokens.css). */
export const PALETTE = {
  ink: c.neutral['900'].$value.hex,
  honey: c.honey['400'].$value.hex,
  honeyDeep: c.honey['500'].$value.hex,
  honeyLight: c.honey['100'].$value.hex,
  latte: c.coffee['300'].$value.hex,
  coffee: c.coffee['500'].$value.hex,
  coffeeDark: c.coffee['700'].$value.hex,
  cream: c.cream['50'].$value.hex,
  creamDeep: c.cream['200'].$value.hex,
  mint: c.mint['400'].$value.hex,
  /** "Coral" in the brief: the berry ramp. */
  coral: c.berry['400'].$value.hex,
  coralDeep: c.berry['500'].$value.hex,
  sky: c.sky['400'].$value.hex,
  skyLight: c.sky['100'].$value.hex,
  leaf: c.leaf['400'].$value.hex,
  tangerine: c.tangerine['400'].$value.hex,
  skin: c.skin['1'].$value.hex,
  skin2: c.skin['2'].$value.hex,
  skin3: c.skin['3'].$value.hex,
  skin4: c.skin['4'].$value.hex,
  /** hair-1 is ink and hair-2 is coffeeDark. */
  hairCopper: c.hair['3'].$value.hex,
  hairGold: c.hair['4'].$value.hex,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** The palette name of a token hex (e.g. an AVATAR_LOOKS colour); throws when it is not in PALETTE. */
export function paletteKeyOf(hex: string): PaletteKey {
  const key = (Object.keys(PALETTE) as PaletteKey[]).find((k) => PALETTE[k] === hex.toLowerCase());
  if (!key) throw new Error(`Not a palette colour: ${hex}`);
  return key;
}

/**
 * Camera poses, orthographic. `object` (default): 30° down, turned 35° to the
 * right of the model's front (+Z), for things. `glyph`: straight on, 12° down,
 * for symbols. `top`: 58° down, for flat things lying on a table.
 */
export const POSES = {
  object: { elevationDeg: 30, azimuthDeg: 35 },
  glyph: { elevationDeg: 12, azimuthDeg: 0 },
  top: { elevationDeg: 58, azimuthDeg: 25 },
} as const;

export type Pose = keyof typeof POSES;

/** Marks `model` to be shot in `pose`; models without a mark use `object`. */
export function posed<T extends Object3D>(pose: Pose, model: T): T {
  model.userData.pose = pose;
  return model;
}
/** Empty band on every side of the frame, as a share of the frame. */
export const MARGIN = 0.08;
/** Ink outline width, as a share of the frame (about 1.7 px at 48 px). */
export const OUTLINE = 0.035;

/**
 * How a cell is drawn. `regular`: the 48 px cell. `small`: the 24 px cell,
 * read at 16–24 px: thicker ink (about 1.6 px at 24 px), less margin, no
 * contact shadow, and parts narrower than `minPart` of the frame (about
 * 1.4 px at 24 px) left out, since at that size they only blur the outline.
 * `contrast` and `saturate` are CSS filter amounts applied when the render
 * is shrunk to the cell.
 */
export const LOOKS = {
  regular: { margin: MARGIN, outline: OUTLINE, shadow: true, minPart: 0, contrast: 1, saturate: 1 },
  small: { margin: 0.04, outline: 0.065, shadow: false, minPart: 0.06, contrast: 1.2, saturate: 1.15 },
} as const;

export type Look = keyof typeof LOOKS;

const materials = new Map<PaletteKey, MeshLambertMaterial>();

/** Flat-shaded Lambert in a palette colour, like the game scene (src/render/scene/shop.ts). */
export function mat(key: PaletteKey): MeshLambertMaterial {
  let m = materials.get(key);
  if (!m) {
    m = new MeshLambertMaterial({ color: PALETTE[key], flatShading: true });
    materials.set(key, m);
  }
  return m;
}

/** A mesh in a palette colour; `outline: false` leaves it out of the ink hull. */
export function part(geometry: BufferGeometry, color: PaletteKey, opts: { outline?: boolean } = {}): Mesh {
  const mesh = new Mesh(geometry, mat(color));
  mesh.userData.outline = opts.outline ?? true;
  return mesh;
}

/** Back faces pushed out along smooth normals in view space, filled with ink. */
function outlineMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    uniforms: { thickness: { value: 0 }, color: { value: new Color(PALETTE.ink) } },
    vertexShader: /* glsl */ `
      uniform float thickness;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xyz += normalize(normalMatrix * normal) * thickness;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

/** Smooth normals keep the hull closed at hard edges, where flat normals would split it. */
function hullGeometry(geometry: BufferGeometry): BufferGeometry {
  const g = geometry.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
  const merged = mergeVertices(g, 1e-4);
  merged.computeVertexNormals();
  return merged;
}

/** Soft round shadow texture: ink in the middle fading to nothing at the rim. */
function shadowTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(58,34,22,0.55)');
  g.addColorStop(0.55, 'rgba(58,34,22,0.3)');
  g.addColorStop(1, 'rgba(58,34,22,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const emptyBounds = (): Bounds => ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });

export interface Stage {
  scene: Scene;
  camera: OrthographicCamera;
  /** Replaces the current model, adds outline and shadow as `look` says, and frames it. */
  show(model: Object3D, look?: Look): void;
}

export function createStage(): Stage {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  scene.add(new HemisphereLight(0xfff6e8, 0xd9c2a5, 1.5));
  const key = new DirectionalLight(0xffe2b8, 2.1);
  const fill = new DirectionalLight(0xcfe6ff, 0.6);
  const rim = new DirectionalLight(0xfff0d0, 1.1);
  scene.add(key, fill, rim);

  function aim(pose: Pose): void {
    const el = (POSES[pose].elevationDeg * Math.PI) / 180;
    const az = (POSES[pose].azimuthDeg * Math.PI) / 180;
    const toCamera = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    camera.position.copy(toCamera).multiplyScalar(20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    // Lights are placed in the camera's frame so "top-left" means top-left on screen.
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const at = (r: number, u: number, f: number) => right.clone().multiplyScalar(r).addScaledVector(up, u).addScaledVector(toCamera, f);
    key.position.copy(at(-1, 1.4, 1));
    fill.position.copy(at(1.2, -0.3, 0.8));
    rim.position.copy(at(0.4, 0.8, -1.2));
  }

  const outline = outlineMaterial();
  const shadow = new Mesh(
    new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.renderOrder = -1;
  let current: Group | null = null;

  function show(model: Object3D, look: Look = 'regular'): void {
    const rules = LOOKS[look];
    if (current) scene.remove(current);
    aim((model.userData.pose as Pose | undefined) ?? 'object');
    current = new Group();
    current.add(model);
    current.updateMatrixWorld(true);

    const all: Mesh[] = [];
    model.traverse((o) => {
      if (o instanceof Mesh) all.push(o);
    });
    const meshes = dropDetails(all, rules);
    for (const m of meshes) {
      if (m.userData.outline === false) continue;
      const hull = new Mesh(hullGeometry(m.geometry), outline);
      m.add(hull);
    }

    if (rules.shadow) {
      // Contact shadow: an ellipse under the footprint, on the lowest point.
      const box = new Box3().setFromObject(model);
      const size = box.getSize(new Vector3());
      shadow.scale.set(size.x * 1.25 + 0.2, 1, size.z * 1.25 + 0.2);
      shadow.position.set((box.min.x + box.max.x) / 2, box.min.y + 0.005, (box.min.z + box.max.z) / 2);
      current.add(shadow);
    } else shadow.removeFromParent();
    current.updateMatrixWorld(true);
    scene.add(current);

    frame(meshes, rules.shadow ? shadow : null, rules);
  }

  /** Screen-space (view) bounds of `points`, grown into `into`. */
  function grow(into: Bounds, points: Iterable<Vector3>): Bounds {
    for (const p of points) {
      into.minX = Math.min(into.minX, p.x);
      into.maxX = Math.max(into.maxX, p.x);
      into.minY = Math.min(into.minY, p.y);
      into.maxY = Math.max(into.maxY, p.y);
    }
    return into;
  }

  function* meshPoints(m: Mesh): Generator<Vector3> {
    const view = camera.matrixWorldInverse;
    const pos = m.geometry.getAttribute('position');
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++) yield v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(view);
  }

  /**
   * Hides the meshes narrower than `minPart` of the frame (both sides) and
   * returns the rest; keeps everything when that would leave nothing.
   */
  function dropDetails(meshes: Mesh[], rules: (typeof LOOKS)[Look]): Mesh[] {
    if (rules.minPart <= 0) return meshes;
    const boxes = meshes.map((m) => grow(emptyBounds(), meshPoints(m)));
    const whole = boxes.reduce((acc, b) => grow(acc, [new Vector3(b.minX, b.minY), new Vector3(b.maxX, b.maxY)]), emptyBounds());
    const frameSize = Math.max(whole.maxX - whole.minX, whole.maxY - whole.minY) / (1 - 2 * rules.margin - 2 * rules.outline);
    const keep = meshes.filter((_, i) => Math.max(boxes[i]!.maxX - boxes[i]!.minX, boxes[i]!.maxY - boxes[i]!.minY) >= rules.minPart * frameSize);
    if (keep.length === 0) return meshes;
    for (const m of meshes) if (!keep.includes(m)) m.visible = false;
    return keep;
  }

  /** Square ortho frustum around everything on screen, with the look's margin on each side and room for the outline. */
  function frame(meshes: Mesh[], ground: Mesh | null, rules: (typeof LOOKS)[Look]): void {
    const b = emptyBounds();
    for (const m of meshes) grow(b, meshPoints(m));
    if (ground) {
      // The shadow's visible part is roughly the inner 70% of the plane.
      const view = camera.matrixWorldInverse;
      const corners = ([[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]] as const).map(([x, z]) =>
        new Vector3(x, 0, z).applyMatrix4(ground.matrixWorld).applyMatrix4(view),
      );
      grow(b, corners);
    }
    const extent = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    const half = extent / (1 - 2 * rules.margin - 2 * rules.outline) / 2;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    camera.left = cx - half;
    camera.right = cx + half;
    camera.top = cy + half;
    camera.bottom = cy - half;
    camera.updateProjectionMatrix();
    outline.uniforms.thickness!.value = half * 2 * rules.outline;
  }

  return { scene, camera, show };
}
