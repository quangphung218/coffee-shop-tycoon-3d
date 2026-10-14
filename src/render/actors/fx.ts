import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial, type Texture } from 'three';
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

export const STEAM_PUFFS = 3;
/** Seconds for one puff to rise and fade. */
export const STEAM_SECONDS = 1.6;
const STEAM_RISE = 0.6;
const STEAM_SIZE = 0.14;
const STEAM_OPACITY = 0.8;
const STEAM_SWAY = 0.05;

/** Lifetime of a coin popup. */
export const COIN_SECONDS = 0.9;
const COIN_SIZE = 0.3;
const COIN_RISE = 0.7;
const COIN_ABOVE = HEAD_TOP_Y + 0.35;
const CHIP_W = 0.62;
const CHIP_H = 0.16;
const CHIP_PX_W = 256;
const CHIP_PX_H = 64;
/** Share of the life spent fully visible before fading. */
const COIN_HOLD = 0.5;

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
    const n = this.puffs.length;
    for (let i = 0; i < n; i++) {
      const s = this.puffs[i]!;
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

  dispose(): void {
    for (const s of this.puffs) (s.material as SpriteMaterial).dispose();
  }
}

/** One coin popup: the coin icon with a "+X đ" chip above it. */
class Coin {
  readonly group = new Group();
  readonly coin: Sprite;
  readonly chip: Sprite;
  start = 0;
  baseY = 0;
  private readonly chipTex: CanvasTexture | null;
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(coinMap: Texture | null) {
    this.coin = new Sprite(new SpriteMaterial({ map: coinMap, depthTest: false, transparent: true }));
    this.coin.renderOrder = 13;
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
    this.chip.renderOrder = 13;
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

  /** Places the popup `age` seconds into its life; calm skips the pop and the rise. */
  pose(age: number, calm: boolean): void {
    const u = Math.min(1, Math.max(0, age / COIN_SECONDS));
    const fade = u < COIN_HOLD ? 1 : 1 - (u - COIN_HOLD) / (1 - COIN_HOLD);
    const scale = calm ? 1 : popScale(age, false);
    // Ease-out rise: quick at first, settling as it fades.
    const rise = calm ? 0 : COIN_RISE * (1 - (1 - u) ** 2);
    this.group.position.y = this.baseY + rise;
    this.coin.scale.set(COIN_SIZE * scale, COIN_SIZE * scale, 1);
    this.chip.scale.set(CHIP_W * scale, CHIP_H * scale, 1);
    this.chip.position.y = COIN_SIZE * 0.5 + CHIP_H * 0.6;
    (this.coin.material as SpriteMaterial).opacity = fade;
    (this.chip.material as SpriteMaterial).opacity = fade;
  }

  dispose(): void {
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
      },
    );
  }

  /** Pops a coin with "+amount" above `pos` at `time` seconds. */
  spawn(amount: number, pos: Vec2, time: number): void {
    const c = this.pool.acquire();
    c.start = time;
    c.baseY = COIN_ABOVE;
    c.group.position.set(pos.x, COIN_ABOVE, pos.z);
    c.group.visible = true;
    c.setText(`+${formatMoney(amount)}`);
    this.live.push(c);
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
      c.pose(age, calm);
    }
  }

  stats(): { live: number; free: number; created: number } {
    return { live: this.pool.liveCount, free: this.pool.freeCount, created: this.pool.created };
  }

  /** Opacity and height of a live coin (tests). */
  peek(i: number): { opacity: number; y: number } | null {
    const c = this.live[i];
    if (!c) return null;
    return { opacity: (c.coin.material as SpriteMaterial).opacity, y: c.group.position.y };
  }

  dispose(): void {
    for (const c of this.pool.all()) c.dispose();
    this.live.length = 0;
    this.group.removeFromParent();
    this.group.clear();
  }
}
