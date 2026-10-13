import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial, type Texture } from 'three';
import { getMenuItem } from '../../sim/data/menu';
import type { Command, Customer, GameState } from '../../sim/types';

/**
 * Floating tags above customers: the ordered item's icon and a patience bar
 * while they wait, a 💢 when they storm out. Sprites always face the camera
 * and ignore depth so tags stay readable behind walls and tables.
 */

export const ANGRY_ICON = '💢';
/** Patience bar colours from design/tokens.json (color.patience.*). */
export const PATIENCE_COLORS = { high: 0x2fb898, mid: 0xf2a516, low: 0xf2675b, track: 0x5c3a26 } as const;
const BAR_WIDTH = 0.6;
const BAR_HEIGHT = 0.08;
const ICON_SIZE = 0.38;
const ICON_PX = 64;

export function patienceColor(ratio: number): number {
  if (ratio > 0.5) return PATIENCE_COLORS.high;
  if (ratio > 0.25) return PATIENCE_COLORS.mid;
  return PATIENCE_COLORS.low;
}

/** What a customer's tag shows. */
export interface LabelContent {
  icon: string | null;
  /** 0..1, or null to hide the bar. */
  patience: number | null;
  /** The order is ready to carry over: the icon pulses. */
  ready: boolean;
}

export function labelFor(state: GameState, c: Customer): LabelContent {
  if (c.state === 'angry_leave') return { icon: ANGRY_ICON, patience: null, ready: false };
  if (c.state !== 'queueing' && c.state !== 'ordering' && c.state !== 'waiting') return { icon: null, patience: null, ready: false };
  const ratio = c.maxPatience > 0 ? Math.max(0, Math.min(1, c.patience / c.maxPatience)) : 0;
  const ready = c.state === 'waiting' && state.orders.some((o) => o.customerId === c.id && o.status === 'ready');
  return { icon: c.order ? getMenuItem(c.order).icon : null, patience: c.state === 'ordering' ? null : ratio, ready };
}

/**
 * Command for a click on a customer: take the order of someone waiting in
 * line, carry over a drink that is ready. Null when the click has nothing to
 * do or the player already queued that job.
 */
export function commandForCustomer(state: GameState, customerId: number): Command | null {
  const c = state.customers.find((x) => x.id === customerId);
  if (!c) return null;
  const queued = (kind: string, id: number): boolean => state.playerTasks.some((t) => t.kind === kind && t.targetId === id);
  if (c.state === 'queueing') return queued('take_order', c.id) ? null : { type: 'take_order', customerId: c.id };
  if (c.state === 'waiting') {
    const order = state.orders.find((o) => o.customerId === c.id && o.status === 'ready');
    if (order && !queued('serve', order.id)) return { type: 'deliver', orderId: order.id };
  }
  return null;
}

/** Emoji textures and bar materials shared by every tag. */
export class LabelAssets {
  private readonly icons = new Map<string, SpriteMaterial>();
  private readonly textures: Texture[] = [];
  readonly track = barMaterial(PATIENCE_COLORS.track);
  readonly fills: Record<number, SpriteMaterial> = {
    [PATIENCE_COLORS.high]: barMaterial(PATIENCE_COLORS.high),
    [PATIENCE_COLORS.mid]: barMaterial(PATIENCE_COLORS.mid),
    [PATIENCE_COLORS.low]: barMaterial(PATIENCE_COLORS.low),
  };

  /** Material drawing `emoji`; without a DOM (tests) it is a plain white quad. */
  icon(emoji: string): SpriteMaterial {
    let mat = this.icons.get(emoji);
    if (!mat) {
      const map = emojiTexture(emoji);
      if (map) this.textures.push(map);
      mat = new SpriteMaterial({ map, depthTest: false, transparent: true });
      this.icons.set(emoji, mat);
    }
    return mat;
  }

  dispose(): void {
    for (const m of this.icons.values()) m.dispose();
    for (const t of this.textures) t.dispose();
    this.track.dispose();
    for (const m of Object.values(this.fills)) m.dispose();
    this.icons.clear();
  }
}

function barMaterial(color: number): SpriteMaterial {
  return new SpriteMaterial({ color, depthTest: false, transparent: true });
}

function emojiTexture(emoji: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = ICON_PX;
  canvas.height = ICON_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Light bubble behind the emoji so it reads on any floor colour.
  ctx.fillStyle = 'rgba(255, 249, 240, 0.92)';
  ctx.beginPath();
  ctx.arc(ICON_PX / 2, ICON_PX / 2, ICON_PX / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${Math.round(ICON_PX * 0.62)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, ICON_PX / 2, ICON_PX / 2 + 3);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** One customer's tag; lives on the character's label anchor and is reused with it. */
export class Label {
  readonly group = new Group();
  private readonly iconSprite: Sprite;
  private readonly track: Sprite;
  private readonly fill: Sprite;
  private iconKey: string | null = null;

  constructor(private readonly assets: LabelAssets) {
    this.iconSprite = new Sprite(assets.icon(ANGRY_ICON));
    this.iconSprite.scale.set(ICON_SIZE, ICON_SIZE, 1);
    this.iconSprite.position.y = 0.2;
    this.iconSprite.renderOrder = 12;
    this.track = new Sprite(assets.track);
    this.track.scale.set(BAR_WIDTH, BAR_HEIGHT, 1);
    this.track.renderOrder = 10;
    this.fill = new Sprite(assets.fills[PATIENCE_COLORS.high]);
    this.fill.renderOrder = 11;
    this.group.add(this.iconSprite, this.track, this.fill);
    // Tags are drawn, never picked (sprite raycasts need a camera on the ray).
    for (const s of [this.iconSprite, this.track, this.fill]) s.raycast = () => {};
    this.set({ icon: null, patience: null, ready: false }, 0);
  }

  /** Updates the tag; `time` (seconds) drives the 💢 bob and the ready pulse. */
  set(content: LabelContent, time: number): void {
    const { icon, patience, ready } = content;
    this.iconSprite.visible = icon !== null;
    if (icon !== null && icon !== this.iconKey) {
      this.iconSprite.material = this.assets.icon(icon);
      this.iconKey = icon;
    }
    if (icon !== null) {
      const angry = icon === ANGRY_ICON;
      const pulse = ready ? 1 + 0.18 * Math.abs(Math.sin(time * 5)) : 1;
      this.iconSprite.scale.set(ICON_SIZE * pulse, ICON_SIZE * pulse, 1);
      this.iconSprite.position.y = angry ? 0.12 + Math.abs(Math.sin(time * 6)) * 0.12 : 0.2;
    }
    const showBar = patience !== null;
    this.track.visible = showBar;
    this.fill.visible = showBar && patience > 0.01;
    if (showBar && patience > 0.01) {
      this.fill.material = this.assets.fills[patienceColor(patience)]!;
      this.fill.scale.set(BAR_WIDTH * patience, BAR_HEIGHT * 0.7, 1);
      // Anchor the fill's left edge to the track's left edge in screen space.
      this.fill.center.set(1 / (2 * patience), 0.5);
    }
    this.group.visible = this.iconSprite.visible || showBar;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  get iconShown(): string | null {
    return this.iconSprite.visible ? this.iconKey : null;
  }
}
