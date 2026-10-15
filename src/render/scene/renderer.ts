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

/** How strongly the environment map lights the scene where it is on (soft fill, kept subtle). */
export const ENVIRONMENT_INTENSITY = 0.5;

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
  scene.environmentIntensity = ENVIRONMENT_INTENSITY;

  // Warm key and fill: the environment map now carries most of the soft
  // ambient, so the hemisphere and sun are dialled back and tinted toward a
  // late-morning gold.
  const hemi = new HemisphereLight(0xfff2e3, 0xcfe6b0, 1.1);
  scene.add(hemi);
  const sun = new DirectionalLight(0xfff1dc, 1.55);
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
