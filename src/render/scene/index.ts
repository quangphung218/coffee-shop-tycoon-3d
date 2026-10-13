import type { CameraKeys, Quality } from '../../save/settings';
import type { Command, GameState } from '../../sim/types';
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
  setQuality(quality: Quality): void;
  setCameraKeys(mode: CameraKeys): void;
  setEdgePan(enabled: boolean): void;
  resetCamera(): void;
  /** Registers a handler for Commands from clicks in the scene; returns an unsubscribe function. */
  onCommand(handler: (cmd: Command) => void): () => void;
  dispose(): void;
}

/** Longest frame step fed to camera damping, so a background tab does not jump. */
const MAX_FRAME_DT = 0.1;

/** Builds the three.js world on the #scene canvas. The caller owns the frame loop and dispatching. */
export function createWorld(canvas: HTMLCanvasElement, options: WorldOptions = {}): World {
  const view = createRenderer(canvas, options.quality ?? 'medium');
  const shop = new ShopView(view.scene);
  const handlers = new Set<(cmd: Command) => void>();
  let lastState: GameState | null = null;
  let lastTime = -1;
  let firstLayout = true;

  const camera = new CameraController(canvas, {
    cameraKeys: options.cameraKeys,
    edgePan: options.edgePan,
    onClick: (x, y) => {
      if (!lastState || handlers.size === 0) return;
      const cmd = picker.pick(lastState, x, y, canvas.clientWidth, canvas.clientHeight);
      if (cmd) for (const handler of handlers) handler(cmd);
    },
  });
  const picker = new Picker(camera.camera, shop);
  view.onResize((w, h) => camera.setAspect(w / h));

  return {
    update(state: GameState): void {
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
      view.renderer.render(view.scene, camera.camera);
    },
    setQuality: (q) => view.setQuality(q),
    setCameraKeys: (mode) => camera.setCameraKeys(mode),
    setEdgePan: (enabled) => {
      camera.edgePan = enabled;
    },
    resetCamera: () => camera.reset(),
    onCommand(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    dispose(): void {
      handlers.clear();
      camera.dispose();
      shop.dispose();
      view.dispose();
    },
  };
}

export type { SceneHit } from './shop';
export { commandForHit } from './picking';
