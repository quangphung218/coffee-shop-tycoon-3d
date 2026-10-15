import {
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  NeutralToneMapping,
  PCFSoftShadowMap,
  Scene,
  WebGLRenderer,
} from 'three';
import type { Quality } from '../../save/settings';
import { ShopEnvironment, buildRoomEnvironment } from './environment';

/** Sky colour behind the shop (bright, a little warmer than the design placeholder). */
export const SKY_COLOR = 0xbfe6f5;

/** Intensities of the scene's lights at one graphics quality. */
export interface SceneLighting {
  /** HemisphereLight: soft sky/ground fill. */
  hemi: number;
  /** DirectionalLight: the sun, the only light that shades faces apart. */
  sun: number;
  /** scene.environmentIntensity of the RoomEnvironment map (0 where the quality skips it). */
  env: number;
}

/**
 * Diffuse fill RoomEnvironment adds per unit of environmentIntensity, in
 * HemisphereLight intensity units. Estimated from its emissive panels and the
 * point-lit white room seen from an up-facing surface (about 6x a hemisphere
 * of the same intensity), which is why env 0.5 on top of the old fill washed
 * the walls, floor and grass out.
 */
export const ENV_AS_HEMI = 6;

/** P19 (96030ca): hemisphere 1.6 + sun 1.8, no environment map. The reference for brightness and contrast. */
export const P19_LIGHTING: Readonly<SceneLighting> = { hemi: 1.6, sun: 1.8, env: 0 };

/** Total light (hemi + sun + env as hemi) no quality may exceed: P19's, so colours stay as saturated. */
export const LIGHT_BUDGET = P19_LIGHTING.hemi + P19_LIGHTING.sun;

/**
 * Lights per quality. Low has no environment map, so it keeps the P19 rig.
 * Medium and high spend a small slice of the fill on the environment map
 * (soft bounce and highlights) and take the same amount off the hemisphere,
 * so the total fill, and the sun-to-fill contrast, match P19.
 */
export const LIGHTING: Readonly<Record<Quality, Readonly<SceneLighting>>> = {
  low: P19_LIGHTING,
  medium: { hemi: 1, sun: 1.8, env: 0.1 },
  high: { hemi: 1, sun: 1.8, env: 0.1 },
};

export function lightingFor(quality: Quality): Readonly<SceneLighting> {
  return LIGHTING[quality] ?? LIGHTING.medium;
}

/** Fill light of a rig in hemisphere units: the hemisphere plus what the environment map adds. */
export function fillOf(l: SceneLighting): number {
  return l.hemi + l.env * ENV_AS_HEMI;
}

/** Total light of a rig in hemisphere units (fill + sun), compared against LIGHT_BUDGET. */
export function totalLightOf(l: SceneLighting): number {
  return fillOf(l) + l.sun;
}

/** Device pixel ratio cap per graphics quality. */
export const PIXEL_RATIO_CAP: Readonly<Record<Quality, number>> = { low: 1, medium: 1.5, high: 2 };

export function pixelRatioFor(quality: Quality, devicePixelRatio: number): number {
  return Math.min(devicePixelRatio > 0 ? devicePixelRatio : 1, PIXEL_RATIO_CAP[quality]);
}

/** Shadows cost a second render pass, so only high quality draws them. */
export function shadowsFor(quality: Quality): boolean {
  return quality === 'high';
}

export interface SceneRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly sun: DirectionalLight;
  readonly quality: Quality;
  setQuality(quality: Quality): void;
  /** Called with the canvas size in CSS px whenever it changes (and once right away). */
  onResize(fn: (width: number, height: number) => void): void;
  dispose(): void;
}

/** WebGL renderer, sky, lights and resize handling for the #scene canvas. */
export function createRenderer(canvas: HTMLCanvasElement, initialQuality: Quality): SceneRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.background = new Color(SKY_COLOR);

  // Warm key and fill, tinted toward a late-morning gold; intensities come
  // from LIGHTING per quality (applyQuality).
  const hemi = new HemisphereLight(0xfff2e3, 0xcfe6b0, P19_LIGHTING.hemi);
  scene.add(hemi);
  const sun = new DirectionalLight(0xfff1dc, P19_LIGHTING.sun);
  sun.position.set(8, 16, 10);
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 4;
  const shadowCam = sun.shadow.camera;
  shadowCam.left = -18;
  shadowCam.right = 18;
  shadowCam.top = 18;
  shadowCam.bottom = -18;
  shadowCam.near = 1;
  shadowCam.far = 50;
  scene.add(sun);
  scene.add(sun.target);

  // Built once on the first quality that needs it, then reused (never per frame
  // or per quality change, so shaders do not recompile as the setting changes).
  const environment = new ShopEnvironment(() => buildRoomEnvironment(renderer));

  let quality = initialQuality;
  let width = 0;
  let height = 0;
  let resizeListener: ((w: number, h: number) => void) | null = null;

  function applyQuality(): void {
    renderer.setPixelRatio(pixelRatioFor(quality, window.devicePixelRatio));
    scene.environment = environment.forQuality(quality);
    const lights = lightingFor(quality);
    hemi.intensity = lights.hemi;
    sun.intensity = lights.sun;
    scene.environmentIntensity = scene.environment ? lights.env : 0;
    const shadows = shadowsFor(quality);
    if (renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows;
      sun.castShadow = shadows;
      // Materials compile shadow support in; recompile them once.
      scene.traverse((obj) => {
        if (obj instanceof Mesh) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) m.needsUpdate = true;
        }
      });
    }
    if (width > 0) renderer.setSize(width, height, false);
  }

  function resize(): void {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    resizeListener?.(w, h);
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  window.addEventListener('resize', resize);
  applyQuality();
  resize();

  return {
    renderer,
    scene,
    sun,
    get quality() {
      return quality;
    },
    setQuality(q: Quality): void {
      if (q === quality) return;
      quality = q;
      applyQuality();
    },
    onResize(fn): void {
      resizeListener = fn;
      if (width > 0) fn(width, height);
    },
    dispose(): void {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      environment.dispose();
      renderer.dispose();
    },
  };
}
