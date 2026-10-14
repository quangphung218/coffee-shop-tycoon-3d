import { Raycaster, Vector2 } from 'three';
import type { CameraKeys, Quality } from '../../save/settings';
import type { Command, GameState } from '../../sim/types';
import { createActors } from '../actors';
import { createStreet } from '../street';
import { AmbientView } from './ambient';
import { CameraController } from './camera';
import { Picker } from './picking';
import { createRenderer } from './renderer';
import { ShopView } from './shop';

export interface WorldOptions {
  quality?: Quality;
  cameraKeys?: CameraKeys;
  edgePan?: boolean;
}

export interface World {
  /**
   * Draws one frame of `state`. `alpha` is the fraction of the next sim tick
   * already elapsed (state.tickAccumulator), for interpolating movement.
   * Never modifies the state.
   */
  update(state: GameState, alpha: number): void;
  /**
   * Lays out `state` and compiles its shaders without drawing, so the first
   * update() does not stall the page. Resolves once the GPU has finished.
   */
  prepare(state: GameState): Promise<void>;
  setQuality(quality: Quality): void;
  setCameraKeys(mode: CameraKeys): void;
  setEdgePan(enabled: boolean): void;
  resetCamera(): void;
  /** Turns the camera around the shop by `dYaw` radians, e.g. the slow spin behind the main menu. */
  rotateCamera(dYaw: number): void;
  /** Registers a handler for Commands from clicks in the scene; returns an unsubscribe function. */
  onCommand(handler: (cmd: Command) => void): () => void;
  dispose(): void;
}

/** Longest frame step fed to camera damping, so a background tab does not jump. */
const MAX_FRAME_DT = 0.1;

/** Builds the three.js world on the #scene canvas. The caller owns the frame loop and dispatching. */
export function createWorld(canvas: HTMLCanvasElement, options: WorldOptions = {}): World {
  const view = createRenderer(canvas, options.quality ?? 'medium');
  const shop = new ShopView(view.scene, options.quality ?? 'medium');
  const actors = createActors(view.scene, { quality: options.quality ?? 'medium' });
  const street = createStreet(view.scene, { quality: options.quality ?? 'medium', sun: view.sun });
  const ambient = new AmbientView(view.scene, shop, { quality: options.quality ?? 'medium' });
  const ray = new Raycaster();
  const handlers = new Set<(cmd: Command) => void>();
  let lastState: GameState | null = null;
  let lastTime = -1;
  let firstLayout = true;

  const camera = new CameraController(canvas, {
    cameraKeys: options.cameraKeys,
    edgePan: options.edgePan,
    onClick: (x, y) => {
      if (!lastState || handlers.size === 0) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w <= 0 || h <= 0) return;
      // People stand in front of the furniture, so they get the click first.
      ray.setFromCamera(new Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), camera.camera);
      const cmd = actors.pick(ray) ?? picker.pick(lastState, x, y, w, h);
      if (cmd) for (const handler of handlers) handler(cmd);
    },
  });
  const picker = new Picker(camera.camera, shop);
  view.onResize((w, h) => camera.setAspect(w / h));

  function sync(state: GameState, alpha: number): void {
    lastState = state;
    const now = performance.now() / 1000;
    const dt = lastTime < 0 ? 0 : Math.min(now - lastTime, MAX_FRAME_DT);
    lastTime = now;
    camera.update(dt);
    if (shop.update(state, now, dt, camera.yaw)) {
      const e = shop.extent;
      camera.setBounds(e.minX, e.maxX, e.minZ, e.maxZ);
      camera.setHome(shop.center.x, shop.center.z);
      if (firstLayout) camera.reset(true);
      firstLayout = false;
    }
    ambient.update(state, alpha, dt);
    actors.update(state, alpha);
    street.update(state, alpha, dt);
  }

  return {
    update(state: GameState, alpha: number): void {
      sync(state, alpha);
      view.renderer.render(view.scene, camera.camera);
    },
    async prepare(state: GameState): Promise<void> {
      sync(state, state.tickAccumulator);
      await view.renderer.compileAsync(view.scene, camera.camera);
    },
    setQuality: (q) => {
      view.setQuality(q);
      shop.setQuality(q);
      ambient.setQuality(q);
      street.setQuality(q);
      actors.setQuality(q);
    },
    setCameraKeys: (mode) => camera.setCameraKeys(mode),
    setEdgePan: (enabled) => {
      camera.edgePan = enabled;
    },
    resetCamera: () => camera.reset(),
    rotateCamera: (dYaw) => camera.rotate(dYaw),
    onCommand(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    dispose(): void {
      handlers.clear();
      camera.dispose();
      street.dispose();
      actors.dispose();
      ambient.dispose();
      shop.dispose();
      view.dispose();
    },
  };
}

export type { SceneHit } from './shop';
export { commandForHit } from './picking';
