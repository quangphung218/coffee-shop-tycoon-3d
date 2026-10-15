import { PMREMGenerator, type Texture, type WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Quality } from '../../save/settings';

/**
 * Image-based lighting for the shop. RoomEnvironment (three, MIT) is a tiny
 * procedural room; PMREMGenerator prefilters it into an env map that
 * `scene.environment` feeds to the MeshStandardMaterial surfaces as soft
 * ambient fill and faint reflections. It is 0 bytes to download and is built
 * once, then reused across quality changes. Low quality skips it to save a
 * texture sample per pixel.
 */

/** Whether a quality lights the scene from the environment map. */
export function environmentEnabled(quality: Quality): boolean {
  return quality !== 'low';
}

/** Prefilters RoomEnvironment into a PMREM env map; the generator and room are freed after. */
export function buildRoomEnvironment(renderer: WebGLRenderer): Texture {
  const generator = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const texture = generator.fromScene(room, 0.04).texture;
  room.dispose();
  generator.dispose();
  return texture;
}

/** Builds the env map lazily on first need and reuses it for the life of the renderer. */
export class ShopEnvironment {
  private texture: Texture | null = null;

  constructor(private readonly build: () => Texture) {}

  /** The env map to use at `quality` (built on first need), or null when the quality skips it. */
  forQuality(quality: Quality): Texture | null {
    if (!environmentEnabled(quality)) return null;
    this.texture ??= this.build();
    return this.texture;
  }

  dispose(): void {
    this.texture?.dispose();
    this.texture = null;
  }
}
