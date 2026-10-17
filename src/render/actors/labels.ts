import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial, type Texture } from 'three';
import type { Command, Customer, GameState } from '../../sim/types';
import { MENU_ICONS } from '../../ui/core/iconMap';
import { drawIcon, loadIconAtlas, type IconId } from '../../ui/core/icons';

/**
 * Floating tags above customers: a sticker bubble with the ordered item, a
 * face and a patience bar while they wait, an angry face when they storm
 * out. Sprites always face the camera and ignore depth so tags stay readable
 * behind walls and tables.
 */

export const ANGRY_ICON: IconId = 'i-face-angry';
/** Patience bar colours from design/tokens.json (color.patience.*). */
export const PATIENCE_COLORS = { high: 0x2fb898, mid: 0xf2a516, low: 0xf2675b, track: 0x5c3a26 } as const;
const BAR_WIDTH = 0.6;
const BAR_HEIGHT = 0.08;
const ICON_SIZE = 0.38;
const FACE_SIZE = 0.2;
const FACE_GAP = 0.04;
const ICON_PX = 128;
/** Bubble pop-in (scale overshoot), design/t237-cartoon motion notes. */
export const POP_SECONDS = 0.36;
/** Cream and ink from design/t237-cartoon/tokens.css. */
const CREAM = '#fffaf2';
const INK = '#3a2216';

export function patienceColor(ratio: number): number {
  if (ratio > 0.5) return PATIENCE_COLORS.high;
  if (ratio > 0.25) return PATIENCE_COLORS.mid;
  return PATIENCE_COLORS.low;
}

/** Face next to the patience bar, so the mood does not rely on colour alone. */
export function faceFor(ratio: number): IconId {
  if (ratio >= 0.6) return 'i-face-happy';
  if (ratio >= 0.3) return 'i-face-ok';
  return 'i-face-worried';
}

/** Scale of a bubble `t` seconds after it appeared: ease-out-back, or straight to 1 when motion is reduced. */
export function popScale(t: number, reduced: boolean): number {
  if (reduced || !(t < POP_SECONDS)) return 1;
  const k = Math.max(0, t) / POP_SECONDS - 1;
  const c1 = 1.70158;
  return 1 + (c1 + 1) * k * k * k + c1 * k * k;
}

/** What a customer's tag shows. */
export interface LabelContent {
  icon: IconId | null;
  /** 0..1, or null to hide the bar. */
  patience: number | null;
  /** The order is ready to carry over: the icon pulses. */
  ready: boolean;
  /** Mood face beside the bar; absent or null hides it. */
  face?: IconId | null;
}

/** Every bubble a tag can show: each menu item, and the angry face. */
export const LABEL_BUBBLES: readonly IconId[] = [...new Set<IconId>([...Object.values(MENU_ICONS), ANGRY_ICON])];
/** Every icon drawn on its own: the mood faces beside the bar, and the coin of the cash popups. */
export const LABEL_FACES: readonly IconId[] = ['i-face-happy', 'i-face-ok', 'i-face-worried', 'i-coin'];

export function labelFor(state: GameState, c: Customer): LabelContent {
  if (c.state === 'angry_leave') return { icon: ANGRY_ICON, patience: null, ready: false, face: null };
  if (c.state !== 'queueing' && c.state !== 'ordering' && c.state !== 'waiting') return { icon: null, patience: null, ready: false, face: null };
  const ratio = c.maxPatience > 0 ? Math.max(0, Math.min(1, c.patience / c.maxPatience)) : 0;
  const ready = c.state === 'waiting' && state.orders.some((o) => o.customerId === c.id && o.status === 'ready');
  const patience = c.state === 'ordering' ? null : ratio;
  return { icon: c.order ? MENU_ICONS[c.order] : null, patience, ready, face: patience === null ? null : faceFor(ratio) };
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

/** Icon textures (cached per icon id) and bar materials shared by every tag. */
export class LabelAssets {
  private readonly bubbles = new Map<IconId, SpriteMaterial>();
  private readonly faces = new Map<IconId, SpriteMaterial>();
  private readonly textures: Texture[] = [];
  private motionQuery: MediaQueryList | null | undefined;
  private disposed = false;
  readonly track = barMaterial(PATIENCE_COLORS.track);
  readonly fills: Record<number, SpriteMaterial> = {
    [PATIENCE_COLORS.high]: barMaterial(PATIENCE_COLORS.high),
    [PATIENCE_COLORS.mid]: barMaterial(PATIENCE_COLORS.mid),
    [PATIENCE_COLORS.low]: barMaterial(PATIENCE_COLORS.low),
  };

  /** Sticker bubble around `id`; without a DOM (tests) it is a plain white quad. */
  icon(id: IconId): SpriteMaterial {
    return this.material(this.bubbles, id, true);
  }

  /** `id` on its own, for the face beside the bar. */
  face(id: IconId): SpriteMaterial {
    return this.material(this.faces, id, false);
  }

  /**
   * Makes the material of every icon a tag can show (LABEL_BUBBLES,
   * LABEL_FACES), so the first customers do not draw canvases mid-frame.
   * Resolves with every icon texture once the atlas is drawn into them, or
   * failed to load, ready for renderer.initTexture. Empty without a DOM.
   */
  async prebuild(): Promise<Texture[]> {
    for (const id of LABEL_BUBBLES) this.icon(id);
    for (const id of LABEL_FACES) this.face(id);
    // Each texture drew itself in a .then() on the same atlas promise, added before this one.
    if (this.textures.length > 0 && typeof createImageBitmap !== 'undefined') await loadIconAtlas().catch(() => {});
    return [...this.textures];
  }

  /** Reduced motion forced on by the "Luôn giảm" setting, whatever the OS says. */
  forceReducedMotion = false;

  /** The player asked for less motion: the setting, or prefers-reduced-motion when not forced. */
  get reducedMotion(): boolean {
    if (this.forceReducedMotion) return true;
    if (this.motionQuery === undefined) {
      this.motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    }
    return this.motionQuery?.matches ?? false;
  }

  private material(cache: Map<IconId, SpriteMaterial>, id: IconId, bubble: boolean): SpriteMaterial {
    let mat = cache.get(id);
    if (!mat) {
      const map = this.texture(id, bubble);
      if (map) this.textures.push(map);
      mat = new SpriteMaterial({ map, depthTest: false, transparent: true });
      cache.set(id, mat);
    }
    return mat;
  }

  /** Draws the empty bubble now and the icon once the shared icon atlas has loaded. */
  private texture(id: IconId, bubble: boolean): CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (bubble) drawBubble(ctx);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    if (typeof createImageBitmap === 'undefined') return tex;
    loadIconAtlas().then(
      (atlas) => {
        if (this.disposed) return;
        const size = bubble ? ICON_PX * 0.5 : ICON_PX * 0.84;
        const top = bubble ? ICON_PX * 0.16 : (ICON_PX - size) / 2;
        if (drawIcon(ctx, atlas, id, (ICON_PX - size) / 2, top, size)) tex.needsUpdate = true;
      },
      // No atlas: the bubble stays empty rather than breaking the frame loop.
      () => {},
    );
    return tex;
  }

  dispose(): void {
    this.disposed = true;
    for (const m of this.bubbles.values()) m.dispose();
    for (const m of this.faces.values()) m.dispose();
    for (const t of this.textures) t.dispose();
    this.track.dispose();
    for (const m of Object.values(this.fills)) m.dispose();
    this.bubbles.clear();
    this.faces.clear();
  }
}

function barMaterial(color: number): SpriteMaterial {
  return new SpriteMaterial({ color, depthTest: false, transparent: true });
}

/** Cream speech bubble with a 3 px-equivalent ink outline and a tail pointing down at the customer. */
function drawBubble(ctx: CanvasRenderingContext2D): void {
  const s = ICON_PX;
  const line = s * 0.05;
  const left = line;
  const right = s - line;
  const top = line;
  const bottom = s * 0.8;
  const r = s * 0.22;
  const mid = s / 2;
  const tail = s * 0.11;
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(right - r, top);
  ctx.arcTo(right, top, right, top + r, r);
  ctx.lineTo(right, bottom - r);
  ctx.arcTo(right, bottom, right - r, bottom, r);
  ctx.lineTo(mid + tail, bottom);
  ctx.lineTo(mid, s - line);
  ctx.lineTo(mid - tail, bottom);
  ctx.lineTo(left + r, bottom);
  ctx.arcTo(left, bottom, left, bottom - r, r);
  ctx.lineTo(left, top + r);
  ctx.arcTo(left, top, left + r, top, r);
  ctx.closePath();
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.lineWidth = line;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
}

/** One customer's tag; lives on the character's label anchor and is reused with it. */
export class Label {
  readonly group = new Group();
  private readonly iconSprite: Sprite;
  private readonly faceSprite: Sprite;
  private readonly track: Sprite;
  private readonly fill: Sprite;
  private iconKey: IconId | null = null;
  private faceKey: IconId | null = null;
  /** `time` the current bubble appeared, for the pop-in. */
  private popStart = 0;

  constructor(private readonly assets: LabelAssets) {
    this.iconSprite = new Sprite(assets.icon(ANGRY_ICON));
    this.iconSprite.scale.set(ICON_SIZE, ICON_SIZE, 1);
    this.iconSprite.position.y = 0.2;
    this.iconSprite.renderOrder = 12;
    this.faceSprite = new Sprite(assets.face('i-face-happy'));
    this.faceSprite.scale.set(FACE_SIZE, FACE_SIZE, 1);
    // Right edge just left of the bar, in screen space like the fill.
    this.faceSprite.center.set(1 + (BAR_WIDTH / 2 + FACE_GAP) / FACE_SIZE, 0.5);
    this.faceSprite.renderOrder = 12;
    this.track = new Sprite(assets.track);
    this.track.scale.set(BAR_WIDTH, BAR_HEIGHT, 1);
    this.track.renderOrder = 10;
    this.fill = new Sprite(assets.fills[PATIENCE_COLORS.high]);
    this.fill.renderOrder = 11;
    this.group.add(this.iconSprite, this.faceSprite, this.track, this.fill);
    // Tags are drawn, never picked (sprite raycasts need a camera on the ray).
    for (const s of [this.iconSprite, this.faceSprite, this.track, this.fill]) s.raycast = () => {};
    this.set({ icon: null, patience: null, ready: false }, 0);
  }

  /** Updates the tag; `time` (seconds) drives the pop-in, the angry bob and the ready pulse. */
  set(content: LabelContent, time: number): void {
    const { icon, patience, ready } = content;
    const face = content.face ?? null;
    if (icon !== null && icon !== this.iconKey) {
      this.iconSprite.material = this.assets.icon(icon);
      // Pop when a bubble appears or changes, not on every frame it stays.
      this.popStart = time;
    }
    this.iconKey = icon;
    this.iconSprite.visible = icon !== null;
    if (icon !== null) {
      const angry = icon === ANGRY_ICON;
      const pulse = ready ? 1 + 0.18 * Math.abs(Math.sin(time * 5)) : 1;
      const size = ICON_SIZE * pulse * popScale(time - this.popStart, this.assets.reducedMotion);
      this.iconSprite.scale.set(size, size, 1);
      this.iconSprite.position.y = angry ? 0.12 + Math.abs(Math.sin(time * 6)) * 0.12 : 0.2;
    }
    const showBar = patience !== null;
    this.faceSprite.visible = showBar && face !== null;
    if (face !== null && face !== this.faceKey) {
      this.faceSprite.material = this.assets.face(face);
      this.faceKey = face;
    }
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

  get iconShown(): IconId | null {
    return this.iconSprite.visible ? this.iconKey : null;
  }

  get faceShown(): IconId | null {
    return this.faceSprite.visible ? this.faceKey : null;
  }
}
