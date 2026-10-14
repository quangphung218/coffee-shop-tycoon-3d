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
  leaf: c.leaf['400'].$value.hex,
  skin: c.skin['1'].$value.hex,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** Camera: orthographic, 30° down, turned 35° to the right of the model's front (+Z). */
export const CAMERA = { elevationDeg: 30, azimuthDeg: 35 } as const;
/** Empty band on every side of the frame, as a share of the frame. */
export const MARGIN = 0.08;
/** Ink outline width, as a share of the frame (about 1.7 px at 48 px). */
export const OUTLINE = 0.035;

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

export interface Stage {
  scene: Scene;
  camera: OrthographicCamera;
  /** Replaces the current model, adds outline and shadow, and frames it. */
  show(model: Object3D): void;
}

export function createStage(): Stage {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const el = (CAMERA.elevationDeg * Math.PI) / 180;
  const az = (CAMERA.azimuthDeg * Math.PI) / 180;
  const toCamera = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  camera.position.copy(toCamera).multiplyScalar(20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  // Lights are placed in the camera's frame so "top-left" means top-left on screen.
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const at = (r: number, u: number, f: number) => right.clone().multiplyScalar(r).addScaledVector(up, u).addScaledVector(toCamera, f);
  scene.add(new HemisphereLight(0xfff6e8, 0xd9c2a5, 1.5));
  const key = new DirectionalLight(0xffe2b8, 2.1);
  key.position.copy(at(-1, 1.4, 1));
  const fill = new DirectionalLight(0xcfe6ff, 0.6);
  fill.position.copy(at(1.2, -0.3, 0.8));
  const rim = new DirectionalLight(0xfff0d0, 1.1);
  rim.position.copy(at(0.4, 0.8, -1.2));
  scene.add(key, fill, rim);

  const outline = outlineMaterial();
  const shadow = new Mesh(
    new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
  );
  shadow.renderOrder = -1;
  let current: Group | null = null;

  function show(model: Object3D): void {
    if (current) scene.remove(current);
    current = new Group();
    current.add(model);
    current.updateMatrixWorld(true);

    const meshes: Mesh[] = [];
    model.traverse((o) => {
      if (o instanceof Mesh) meshes.push(o);
    });
    for (const m of meshes) {
      if (m.userData.outline === false) continue;
      const hull = new Mesh(hullGeometry(m.geometry), outline);
      m.add(hull);
    }

    // Contact shadow: an ellipse under the footprint, on the lowest point.
    const box = new Box3().setFromObject(model);
    const size = box.getSize(new Vector3());
    shadow.scale.set(size.x * 1.25 + 0.2, 1, size.z * 1.25 + 0.2);
    shadow.position.set((box.min.x + box.max.x) / 2, box.min.y + 0.005, (box.min.z + box.max.z) / 2);
    current.add(shadow);
    current.updateMatrixWorld(true);
    scene.add(current);

    frame(meshes, shadow);
  }

  /** Square ortho frustum around everything on screen, with MARGIN on each side and room for the outline. */
  function frame(meshes: Mesh[], ground: Mesh): void {
    const view = camera.matrixWorldInverse;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const v = new Vector3();
    const add = (p: Vector3) => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    };
    for (const m of meshes) {
      const pos = m.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) add(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(view));
    }
    // The shadow's visible part is roughly the inner 70% of the plane.
    for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]] as const) {
      add(v.set(x, 0, z).applyMatrix4(ground.matrixWorld).applyMatrix4(view));
    }
    const extent = Math.max(maxX - minX, maxY - minY);
    const half = extent / (1 - 2 * MARGIN - 2 * OUTLINE) / 2;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    camera.left = cx - half;
    camera.right = cx + half;
    camera.top = cy + half;
    camera.bottom = cy - half;
    camera.updateProjectionMatrix();
    outline.uniforms.thickness!.value = half * 2 * OUTLINE;
  }

  return { scene, camera, show };
}
