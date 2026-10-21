import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial, type Texture } from 'three';
import type { Quality } from '../../save/settings';
import { MENU } from '../../sim/data/menu';
import type { GameState, MenuItemId, StaffTask, Vec2 } from '../../sim/types';
import { formatMoney } from '../../ui/core/format';
import { popScale } from './labels';
import { Pool } from './pool';
import { HEAD_TOP_Y } from './rig';

/**
 * Small scene effects from the design/t237-cartoon motion notes: steam over
 * hot drinks being brewed or carried, and a coin with "+X đ" popping up when
 * money comes in. Everything is built once and reused, never per frame.
 */

/** Menu items served hot (MenuItemDef.temperature), the ones that steam. */
export const HOT_ITEMS: ReadonlySet<MenuItemId> = new Set(MENU.filter((m) => m.temperature === 'hot').map((m) => m.id));

/** Puffs a steam plume shows at each quality; low quality keeps the steam off anyway. */
export const STEAM_PUFFS_BY_QUALITY: Readonly<Record<Quality, number>> = { low: 0, medium: 3, high: 5 };
/** Puffs built into every plume, the most any quality shows. */
export const STEAM_PUFFS = 5;
let steamPuffs = STEAM_PUFFS_BY_QUALITY.medium;

/**
 * Sets how many puffs every Steam shows from its next update. Shared so the
 * machine steam in AmbientView follows the quality without its own setter;
 * createActors and Actors.setQuality call it.
 */
export function setSteamQuality(quality: Quality): void {
  steamPuffs = STEAM_PUFFS_BY_QUALITY[quality] ?? STEAM_PUFFS_BY_QUALITY.medium;
}

/** Puffs a plume shows at the current quality. */
export function steamPuffCount(): number {
  return steamPuffs;
}

/** Seconds for one puff to rise and fade. */
export const STEAM_SECONDS = 1.6;
const STEAM_RISE = 0.6;
const STEAM_SIZE = 0.14;
const STEAM_OPACITY = 0.8;
const STEAM_SWAY = 0.05;

/** Lifetime of a coin popup: the arc, then the burst into small coins. */
export const COIN_SECONDS = 1.05;
/** Lifetime of the "+X đ" chip, and of the coin when calm (the pre-arc popup). */
export const CHIP_SECONDS = 0.9;
/** Height of the arc's top above the start, and the share of the life it is reached at. */
export const COIN_JUMP = 0.42;
export const COIN_APEX = 0.55;
/** Share of the life where the coin bursts into small coins. */
export const COIN_BURST = 0.72;
/** Turns about the y axis over the life (whole, so it ends face-on). */
const COIN_SPINS = 2;
/** Narrowest the spinning coin gets, so it never vanishes edge-on. */
const COIN_EDGE = 0.2;
/** Lean (radians) of the coin toward the top of the screen at the arc's top. */
export const COIN_TILT = 0.35;
/** Small coins a burst throws at each quality; low quality and reduced motion throw none. */
export const DEBRIS_BY_QUALITY: Readonly<Record<Quality, number>> = { low: 0, medium: 4, high: 6 };
const DEBRIS_MAX = 6;
const DEBRIS_SIZE = 0.1;
const DEBRIS_SPREAD = 0.34;
const DEBRIS_LIFT = 0.22;
/**
 * Most coins alive at once. Cash comes in about once a second at 4x, and a
 * coin lives about a second, so this is plenty; past it the oldest is reused.
 */
export const COIN_POOL = 8;
const COIN_SIZE = 0.3;
const COIN_RISE = 0.7;
const COIN_ABOVE = HEAD_TOP_Y + 0.35;
const CHIP_W = 0.62;
const CHIP_H = 0.16;
const CHIP_PX_W = 256;
const CHIP_PX_H = 64;
/** Share of the chip's life spent fully visible before fading. */
const COIN_HOLD = 0.5;

/** Where the coin is `age` seconds into its life, relative to where it popped. */
export interface CoinPose {
  /** Height above the start. */
  y: number;
  /** Width factor of the coin turning about the y axis (1 = face-on). */
  spin: number;
  /** Screen-space lean of the sprite (radians). */
  tilt: number;
  /** Size factor (pop-in, then shrinking in the burst). */
  size: number;
  opacity: number;
  /** 0 before the burst, then 0..1 through it. */
  burst: number;
}

export function createCoinPose(): CoinPose {
  return { y: 0, spin: 1, tilt: 0, size: 1, opacity: 1, burst: 0 };
}

/** Fade of the chip (and of the calm coin): fully shown for COIN_HOLD of CHIP_SECONDS, then out. */
function chipFade(age: number): number {
  const u = Math.min(1, Math.max(0, age / CHIP_SECONDS));
  return u < COIN_HOLD ? 1 : 1 - (u - COIN_HOLD) / (1 - COIN_HOLD);
}

/**
 * Pure pose of a coin `age` seconds in. The coin hops up an arc, turning
 * about y and leaning, and past COIN_BURST shrinks away as it bursts. Calm
 * (reduced motion, low quality) keeps the old popup: still, fading.
 */
export function coinPose(age: number, calm: boolean, out: CoinPose = createCoinPose()): CoinPose {
  if (calm) {
    out.y = 0;
    out.spin = 1;
    out.tilt = 0;
    out.size = 1;
    out.opacity = chipFade(age);
    out.burst = 0;
    return out;
  }
  const u = Math.min(1, Math.max(0, age / COIN_SECONDS));
  const p = (u * 0.5) / COIN_APEX;
  out.y = COIN_JUMP * 4 * p * (1 - p);
  out.spin = Math.max(COIN_EDGE, Math.abs(Math.cos(u * COIN_SPINS * TAU)));
  out.tilt = COIN_TILT * Math.sin(Math.PI * Math.min(1, u / COIN_BURST));
  const b = u < COIN_BURST ? 0 : (u - COIN_BURST) / (1 - COIN_BURST);
  out.size = popScale(age, false) * (1 - b);
  out.opacity = 1 - b;
  out.burst = b;
  return out;
}

/** Cream and ink from design/t237-cartoon/tokens.css. */
const CREAM = '#fffaf2';
const INK = '#3a2216';
const TAU = Math.PI * 2;

/**
 * True when a worker on `task` holds a hot drink: carrying it (serve), or
 * standing at the machine making it (brew, not while walking there).
 */
export function steamFor(state: GameState, task: StaffTask | null, moving: boolean): boolean {
  if (!task || task.targetId === null) return false;
  if (task.kind !== 'serve' && !(task.kind === 'brew' && !moving)) return false;
  const order = state.orders.find((o) => o.id === task.targetId);
  return order !== undefined && HOT_ITEMS.has(order.itemId);
}

/** Soft cream dot the steam puffs are drawn with; null without a DOM (tests). */
export function puffTexture(): Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,250,242,1)');
  g.addColorStop(1, 'rgba(255,250,242,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function noRaycast(s: Sprite): void {
  s.raycast = () => {};
}

/** A few puffs rising and swaying over a cup; lives on a character's steam anchor. */
export class Steam {
  readonly group = new Group();
  private readonly puffs: Sprite[] = [];

  constructor(map: Texture | null) {
    for (let i = 0; i < STEAM_PUFFS; i++) {
      const s = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0 }));
      noRaycast(s);
      this.puffs.push(s);
      this.group.add(s);
    }
    this.group.visible = false;
  }

  /** Shows the steam when `on`; `time` (seconds) drives the rise. */
  update(on: boolean, time: number): void {
    this.group.visible = on;
    if (!on) return;
    const n = Math.min(this.puffs.length, steamPuffs);
    for (let i = 0; i < this.puffs.length; i++) {
      const s = this.puffs[i]!;
      s.visible = i < n;
      if (!s.visible) continue;
      const u = (time / STEAM_SECONDS + i / n) % 1;
      const t = u < 0 ? u + 1 : u;
      s.position.set(Math.sin(t * TAU + i * 2.1) * STEAM_SWAY, t * STEAM_RISE, 0);
      const size = STEAM_SIZE * (0.6 + 0.6 * t);
      s.scale.set(size, size, 1);
      (s.material as SpriteMaterial).opacity = STEAM_OPACITY * Math.sin(Math.PI * t);
    }
  }

  get active(): boolean {
    return this.group.visible;
  }

  /** Puffs drawn on the last update while on (tests). */
  get shown(): number {
    let n = 0;
    for (const s of this.puffs) if (s.visible) n++;
    return this.group.visible ? n : 0;
  }

  dispose(): void {
    for (const s of this.puffs) (s.material as SpriteMaterial).dispose();
  }
}

/** One coin popup: the coin icon with a "+X đ" chip above it, and the small coins it bursts into. */
class Coin {
  readonly group = new Group();
  readonly coin: Sprite;
  readonly chip: Sprite;
  /** Small coins of the burst, built with the coin and sharing one material. */
  readonly debris: Sprite[] = [];
  start = 0;
  baseY = 0;
  private readonly debrisMat: SpriteMaterial;
  private readonly chipTex: CanvasTexture | null;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly pos = createCoinPose();

  constructor(coinMap: Texture | null) {
    this.coin = new Sprite(new SpriteMaterial({ map: coinMap, depthTest: false, transparent: true }));
    this.coin.renderOrder = 13;
    this.debrisMat = new SpriteMaterial({ map: coinMap, depthTest: false, transparent: true });
    for (let i = 0; i < DEBRIS_MAX; i++) {
      const d = new Sprite(this.debrisMat);
      d.renderOrder = 13;
      d.visible = false;
      d.scale.set(DEBRIS_SIZE, DEBRIS_SIZE, 1);
      noRaycast(d);
      this.debris.push(d);
      this.group.add(d);
    }
    let ctx: CanvasRenderingContext2D | null = null;
    let tex: CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = CHIP_PX_W;
      canvas.height = CHIP_PX_H;
      ctx = canvas.getContext('2d');
      if (ctx) {
        tex = new CanvasTexture(canvas);
        tex.colorSpace = SRGBColorSpace;
      }
    }
    this.ctx = ctx;
    this.chipTex = tex;
    this.chip = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    // Over the coin, which now hops up past it.
    this.chip.renderOrder = 14;
    noRaycast(this.coin);
    noRaycast(this.chip);
    this.group.add(this.coin, this.chip);
  }

  /** Redraws the chip text into the coin's own canvas (no new GPU texture). */
  setText(text: string): void {
    const ctx = this.ctx;
    if (!ctx || !this.chipTex) return;
    const w = CHIP_PX_W;
    const h = CHIP_PX_H;
    const line = 5;
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.roundRect(line, line, w - line * 2, h - line * 2, (h - line * 2) / 2);
    ctx.fillStyle = CREAM;
    ctx.fill();
    ctx.lineWidth = line;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `700 ${Math.round(h * 0.56)}px Nunito, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2, w - line * 6);
    this.chipTex.needsUpdate = true;
  }

  /**
   * Places the popup `age` seconds into its life with `debris` small coins
   * in the burst; calm skips the pop, the rise, the arc and the burst.
   */
  pose(age: number, calm: boolean, debris: number): void {
    // The chip keeps the plain popup: pop in, ease-out rise, fade.
    const u = Math.min(1, Math.max(0, age / CHIP_SECONDS));
    const scale = calm ? 1 : popScale(age, false);
    const rise = calm ? 0 : COIN_RISE * (1 - (1 - u) ** 2);
    const fade = chipFade(age);
    this.group.position.y = this.baseY;
    this.chip.scale.set(CHIP_W * scale, CHIP_H * scale, 1);
    this.chip.position.y = rise + COIN_SIZE * 0.5 + CHIP_H * 0.6;
    (this.chip.material as SpriteMaterial).opacity = fade;

    const p = coinPose(age, calm, this.pos);
    const mat = this.coin.material as SpriteMaterial;
    this.coin.position.y = p.y;
    this.coin.scale.set(COIN_SIZE * p.size * p.spin, COIN_SIZE * p.size, 1);
    mat.rotation = p.tilt;
    mat.opacity = p.opacity;

    const n = calm || p.burst <= 0 ? 0 : Math.min(DEBRIS_MAX, debris);
    for (let i = 0; i < DEBRIS_MAX; i++) {
      const d = this.debris[i]!;
      d.visible = i < n;
      if (!d.visible) continue;
      // Spread out round the coin, thrown up a little and falling back.
      const a = (i / n) * TAU + 0.4;
      const b = p.burst;
      const r = DEBRIS_SPREAD * (1 - (1 - b) ** 2);
      const ring = Math.sin(a) * r * 0.5;
      d.position.set(Math.cos(a) * r, p.y + DEBRIS_LIFT * 4 * b * (1 - b) + ring, ring);
    }
    this.debrisMat.opacity = 1 - p.burst;
  }

  /** Small coins drawn this frame. */
  get debrisShown(): number {
    let n = 0;
    for (const d of this.debris) if (d.visible) n++;
    return n;
  }

  hideDebris(): void {
    for (const d of this.debris) d.visible = false;
  }

  dispose(): void {
    this.debrisMat.dispose();
    (this.coin.material as SpriteMaterial).dispose();
    (this.chip.material as SpriteMaterial).dispose();
    this.chipTex?.dispose();
  }
}

/** Coin popups for money coming in, pooled so a busy lunch hour does not allocate. */
export class CoinFx {
  readonly group = new Group();
  private readonly pool: Pool<Coin>;
  private readonly live: Coin[] = [];
  private debris = DEBRIS_BY_QUALITY.medium;

  constructor(coinMap: Texture | null) {
    this.group.name = 'coins';
    this.pool = new Pool<Coin>(
      () => {
        const c = new Coin(coinMap);
        this.group.add(c.group);
        return c;
      },
      (c) => {
        c.group.visible = false;
        c.hideDebris();
      },
    );
  }

  /** Small coins per burst follow the quality (none at low). */
  setQuality(quality: Quality): void {
    this.debris = DEBRIS_BY_QUALITY[quality] ?? DEBRIS_BY_QUALITY.medium;
  }

  /** Pops a coin with "+amount" above `pos` at `time` seconds; past COIN_POOL live coins the oldest is reused. */
  spawn(amount: number, pos: Vec2, time: number): void {
    let c: Coin;
    if (this.live.length < COIN_POOL) {
      c = this.pool.acquire();
      this.live.push(c);
    } else {
      c = this.live[0]!;
      for (let i = 1; i < this.live.length; i++) if (this.live[i]!.start < c.start) c = this.live[i]!;
    }
    c.start = time;
    c.baseY = COIN_ABOVE;
    c.group.position.set(pos.x, COIN_ABOVE, pos.z);
    c.group.visible = true;
    c.setText(`+${formatMoney(amount)}`);
  }

  /** Moves the live coins and returns the finished ones to the pool. */
  update(time: number, calm: boolean): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const c = this.live[i]!;
      const age = time - c.start;
      if (age >= COIN_SECONDS || age < 0) {
        this.live[i] = this.live[this.live.length - 1]!;
        this.live.pop();
        this.pool.release(c);
        continue;
      }
      c.pose(age, calm, this.debris);
    }
  }

  stats(): { live: number; free: number; created: number } {
    return { live: this.pool.liveCount, free: this.pool.freeCount, created: this.pool.created };
  }

  /** Coin opacity and height, chip opacity and height, and small coins shown, of a live coin (tests). */
  peek(i: number): { opacity: number; y: number; chipOpacity: number; chipY: number; debris: number } | null {
    const c = this.live[i];
    if (!c) return null;
    return {
      opacity: (c.coin.material as SpriteMaterial).opacity,
      y: c.group.position.y + c.coin.position.y,
      chipOpacity: (c.chip.material as SpriteMaterial).opacity,
      chipY: c.group.position.y + c.chip.position.y,
      debris: c.debrisShown,
    };
  }

  dispose(): void {
    for (const c of this.pool.all()) c.dispose();
    this.live.length = 0;
    this.group.removeFromParent();
    this.group.clear();
  }
}
