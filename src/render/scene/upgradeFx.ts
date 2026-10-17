import { AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, type Object3D, Points, PointsMaterial, SRGBColorSpace, type Scene, type Texture } from 'three';
import type { Quality } from '../../save/settings';
import { UPGRADES } from '../../sim/data/upgrades';
import type { GameState, UpgradeId } from '../../sim/types';
import { Pool } from '../actors/pool';
import type { ShopView } from './shop';

/**
 * Sparkle and bounce on the piece the player just upgraded. Watches
 * state.upgrades: a level going up fires a burst of star sparkles over the
 * piece and, for a single mesh (machines, counter), a short bounce. All
 * bursts share one Points object and a pool of at most MAX_BURSTS, so firing
 * and the per-frame update never allocate.
 */

/** Sparkles per burst (low quality uses SPARKLES_LOW). */
export const SPARKLES = 32;
export const SPARKLES_LOW = 12;
/** Bursts running at once; another fire reuses the oldest. */
export const MAX_BURSTS = 3;
/** Seconds a burst sparkles. */
export const SPARKLE_SECONDS = 0.9;
/** Seconds of the bounce. */
export const BOUNCE_SECONDS = 0.45;

const SPARKLE_SIZE = 0.28;
/** Longest delay before a sparkle lights, so they twinkle in turn. */
const SPARKLE_STAGGER = 0.3;
const SPARKLE_RADIUS = 0.75;
const SPARKLE_RISE = 0.45;
/** Honey gold, from PALETTE.gold's hue but lighter so the additive glow reads. */
const SPARKLE_R = 1;
const SPARKLE_G = 0.86;
const SPARKLE_B = 0.5;

const UPGRADE_IDS: readonly UpgradeId[] = UPGRADES.map((u) => u.id);

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Scale of a bouncing piece `age` seconds after the purchase: 1 → 1.15 →
 * 0.96 → 1 over BOUNCE_SECONDS, an overshoot-and-settle like easeOutBack.
 */
export function bounceScale(age: number): number {
  const u = age / BOUNCE_SECONDS;
  if (u <= 0 || u >= 1) return 1;
  if (u < 0.35) return 1 + 0.15 * (1 - (1 - u / 0.35) ** 2);
  if (u < 0.7) return 1.15 - 0.19 * ease((u - 0.35) / 0.35);
  return 0.96 + 0.04 * ease((u - 0.7) / 0.3);
}

/** Four-point star with a soft glow, white so the vertex colour tints it; null without a DOM (tests). */
export function sparkleTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 20);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? 31 : 5;
    const x = 32 + Math.cos(a) * r;
    const y = 32 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** One burst: owns SPARKLES slots of the shared buffer from `slot`. */
class Burst {
  start = 0;
  x = 0;
  y = 0;
  z = 0;
  count = 0;
  target: Object3D | null = null;
  pivotY = 0;
  baseY = 0;
  /** Per sparkle: direction x, z, rise, delay. */
  readonly seeds = new Float32Array(SPARKLES * 4);

  constructor(readonly slot: number) {}
}

export interface UpgradeFxOptions {
  quality?: Quality;
  /** True while effects must stay still; defaults to the reduce-motion class on <html>. */
  reducedMotion?: () => boolean;
}

function htmlReduceMotion(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion');
}

export class UpgradeFx {
  readonly points: Points;
  private readonly geometry = new BufferGeometry();
  private readonly material: PointsMaterial;
  private readonly positions = new Float32Array(SPARKLES * MAX_BURSTS * 3);
  private readonly colors = new Float32Array(SPARKLES * MAX_BURSTS * 3);
  private readonly pool: Pool<Burst>;
  /** Live bursts, oldest first. */
  private readonly live: Burst[] = [];
  private readonly levels = new Map<UpgradeId, number>();
  private watched: GameState | null = null;
  private perBurst: number;
  private readonly reducedMotion: () => boolean;

  constructor(
    scene: Scene,
    private readonly shop: ShopView,
    options: UpgradeFxOptions = {},
  ) {
    this.perBurst = options.quality === 'low' ? SPARKLES_LOW : SPARKLES;
    this.reducedMotion = options.reducedMotion ?? htmlReduceMotion;
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    this.material = new PointsMaterial({
      size: SPARKLE_SIZE,
      map: sparkleTexture(),
      vertexColors: true,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.name = 'upgrade-fx';
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    this.points.visible = false;
    this.points.raycast = () => {};
    let slot = 0;
    this.pool = new Pool<Burst>(
      () => new Burst(slot++),
      (b) => this.finish(b),
    );
    scene.add(this.points);
  }

  setQuality(quality: Quality): void {
    this.perBurst = quality === 'low' ? SPARKLES_LOW : SPARKLES;
  }

  /**
   * Fires for every upgrade whose level went up since the last call, then
   * moves the live bursts. The first call (and the first after a different
   * state object, e.g. a loaded save) only records the levels. `time` is in
   * seconds. Call after ShopView.update so the anchors match the new layout.
   */
  update(state: GameState, time: number): void {
    const fresh = state !== this.watched;
    this.watched = state;
    const calm = this.reducedMotion();
    for (let i = 0; i < UPGRADE_IDS.length; i++) {
      const id = UPGRADE_IDS[i]!;
      const level = state.upgrades[id] ?? 0;
      const prev = this.levels.get(id);
      if (prev === level) continue;
      this.levels.set(id, level);
      if (!fresh && prev !== undefined && level > prev && !calm) this.fire(id, time);
    }
    this.step(time);
  }

  /** Live bursts and pool sizes (tests). */
  stats(): { live: number; free: number; created: number } {
    return { live: this.pool.liveCount, free: this.pool.freeCount, created: this.pool.created };
  }

  dispose(): void {
    for (const b of this.live) this.restore(b);
    this.live.length = 0;
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }

  private fire(id: UpgradeId, time: number): void {
    const anchor = this.shop.upgradeAnchor(id);
    if (!anchor) return;
    if (this.live.length >= MAX_BURSTS) {
      const oldest = this.live.shift()!;
      this.pool.release(oldest);
    }
    const b = this.pool.acquire();
    b.start = time;
    b.x = anchor.x;
    b.y = anchor.y;
    b.z = anchor.z;
    b.count = this.perBurst;
    b.target = anchor.object;
    b.pivotY = anchor.pivotY;
    b.baseY = anchor.object ? anchor.object.position.y : 0;
    // A piece still bouncing from an earlier burst: take over its rest height.
    for (const other of this.live) {
      if (other.target !== b.target || !b.target) continue;
      b.baseY = other.baseY;
      other.target = null;
    }
    const s = b.seeds;
    for (let i = 0; i < b.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.35 + Math.random() * 0.65;
      s[i * 4] = Math.cos(a) * r;
      s[i * 4 + 1] = Math.sin(a) * r;
      s[i * 4 + 2] = Math.random();
      s[i * 4 + 3] = Math.random() * SPARKLE_STAGGER;
    }
    this.live.push(b);
    this.points.visible = true;
  }

  private step(time: number): void {
    if (this.live.length === 0) return;
    const live = this.live;
    let kept = 0;
    // Compacts in place, keeping the oldest-first order (no splice: it allocates).
    for (let i = 0; i < live.length; i++) {
      const b = live[i]!;
      const age = time - b.start;
      if (age >= SPARKLE_SECONDS || age < 0) {
        this.pool.release(b);
        continue;
      }
      this.pose(b, age);
      live[kept++] = b;
    }
    live.length = kept;
    this.points.visible = kept > 0;
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.color!.needsUpdate = true;
  }

  private pose(b: Burst, age: number): void {
    const s = b.seeds;
    const life = SPARKLE_SECONDS - SPARKLE_STAGGER;
    for (let i = 0; i < SPARKLES; i++) {
      const p = (b.slot * SPARKLES + i) * 3;
      let glow = 0;
      if (i < b.count) {
        const u = Math.min(1, Math.max(0, (age - s[i * 4 + 3]!) / life));
        const out = 1 - (1 - u) ** 2;
        this.positions[p] = b.x + s[i * 4]! * SPARKLE_RADIUS * out;
        this.positions[p + 1] = b.y + (0.2 + s[i * 4 + 2]!) * SPARKLE_RISE * out;
        this.positions[p + 2] = b.z + s[i * 4 + 1]! * SPARKLE_RADIUS * out;
        glow = Math.sin(Math.PI * u);
      }
      // Additive blending: black adds nothing, so a dark colour is an invisible sparkle.
      this.colors[p] = SPARKLE_R * glow;
      this.colors[p + 1] = SPARKLE_G * glow;
      this.colors[p + 2] = SPARKLE_B * glow;
    }
    const t = b.target;
    if (t) {
      const k = bounceScale(age);
      t.scale.setScalar(k);
      // Scale about the piece's base, not the mesh origin on the floor.
      t.position.y = b.baseY - b.pivotY * (k - 1);
    }
  }

  /** Puts a bounced piece back to its rest scale and height. */
  private restore(b: Burst): void {
    const t = b.target;
    if (!t) return;
    t.scale.setScalar(1);
    t.position.y = b.baseY;
    b.target = null;
  }

  /** Back to the pool: rest pose for its piece, dark sparkles. */
  private finish(b: Burst): void {
    this.restore(b);
    const from = b.slot * SPARKLES * 3;
    this.colors.fill(0, from, from + SPARKLES * 3);
  }
}
