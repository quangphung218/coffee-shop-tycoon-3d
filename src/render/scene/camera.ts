import { OrthographicCamera, Vector3 } from 'three';
import type { CameraKeys } from '../../save/settings';

/**
 * Isometric orbit camera around the shop. The pure helpers at the top hold all
 * the maths (angles, zoom clamp, pan direction, drag vs click) so they can be
 * tested without a browser; CameraController wires them to DOM input.
 */

/** True isometric tilt: atan(1/√2) ≈ 35.26°. */
export const DEFAULT_PITCH = Math.atan(1 / Math.SQRT2);
/** Camera sits at the front-right corner, looking at the open front and right walls. */
export const DEFAULT_YAW = Math.PI / 4;
export const MIN_PITCH = 0.35;
export const MAX_PITCH = 1.3;
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 2.5;
export const DEFAULT_ZOOM = 1;
/** Pointer travel in CSS px below which a press counts as a click. */
export const CLICK_THRESHOLD_PX = 5;
/** Distance from the canvas edge in CSS px that triggers edge-pan. */
export const EDGE_PAN_MARGIN_PX = 24;
/** World units visible vertically at zoom 1. */
const VIEW_HEIGHT = 22;
const ORBIT_DISTANCE = 40;
/** World units per second at zoom 1. */
const PAN_SPEED = 12;
/** Radians per second while a rotate key is held. */
const KEY_ROTATE_SPEED = 1.8;
/** Radians per CSS px of drag. */
const DRAG_ROTATE_SPEED = 0.008;
/** Exponential damping rate (1/s); higher snaps faster. */
const DAMPING = 10;
/** Extra room around the shop that the orbit centre may pan into. */
const BOUNDS_MARGIN = 6;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clampZoom(zoom: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return clamp(zoom, min, max);
}

/** Zoom after one wheel event; scrolling down (positive deltaY) zooms out. */
export function zoomFromWheel(zoom: number, deltaY: number, min = MIN_ZOOM, max = MAX_ZOOM): number {
  return clampZoom(zoom * Math.exp(-deltaY * 0.0015), min, max);
}

export function clampPitch(pitch: number): number {
  return clamp(pitch, MIN_PITCH, MAX_PITCH);
}

/** Frame-rate independent exponential approach of `current` toward `target`. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

export interface PanVec {
  x: number;
  z: number;
}

/**
 * World-space ground direction for screen-relative pan input. `right` and
 * `forward` are in [-1, 1]; forward moves the view away from the camera. The
 * result is written into `out` (no allocation) and has length ≤ 1.
 */
export function panVector(yaw: number, right: number, forward: number, out: PanVec): PanVec {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  let x = c * right - s * forward;
  let z = -s * right - c * forward;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  out.x = x;
  out.z = z;
  return out;
}

/** Camera position offset from the orbit centre for a yaw/pitch at distance 1. */
export function orbitOffset(yaw: number, pitch: number, out: Vector3): Vector3 {
  const cp = Math.cos(pitch);
  return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
}

export interface EdgeInput {
  right: number;
  forward: number;
}

/** Edge-pan input from the pointer position inside a w×h canvas. */
export function edgePanInput(x: number, y: number, w: number, h: number, margin: number, out: EdgeInput): EdgeInput {
  out.right = x < margin ? -1 : x > w - margin ? 1 : 0;
  out.forward = y < margin ? 1 : y > h - margin ? -1 : 0;
  return out;
}

export type CameraAction = 'rotateLeft' | 'rotateRight' | 'panForward' | 'panBack' | 'panLeft' | 'panRight';

/**
 * Key binding for a KeyboardEvent.code. 'qe-wasd': Q/E rotate, WASD or arrows
 * pan. 'qa-arrows': Q/A rotate (E still works), only the arrows pan.
 */
export function keyAction(code: string, mode: CameraKeys): CameraAction | null {
  switch (code) {
    case 'KeyQ':
      return 'rotateLeft';
    case 'KeyE':
      return 'rotateRight';
    case 'ArrowUp':
      return 'panForward';
    case 'ArrowDown':
      return 'panBack';
    case 'ArrowLeft':
      return 'panLeft';
    case 'ArrowRight':
      return 'panRight';
    case 'KeyA':
      return mode === 'qa-arrows' ? 'rotateRight' : 'panLeft';
    case 'KeyW':
      return mode === 'qa-arrows' ? null : 'panForward';
    case 'KeyS':
      return mode === 'qa-arrows' ? null : 'panBack';
    case 'KeyD':
      return mode === 'qa-arrows' ? null : 'panRight';
    default:
      return null;
  }
}

/**
 * Tells a click from a drag for one pointer press. A press becomes a drag once
 * the pointer has moved more than `threshold` px from where it went down, and
 * stays a drag even if it comes back.
 */
export class DragTracker {
  active = false;
  dragging = false;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  /** Movement since the previous move() call, valid while dragging. */
  dx = 0;
  dy = 0;

  constructor(private readonly threshold = CLICK_THRESHOLD_PX) {}

  down(x: number, y: number): void {
    this.active = true;
    this.dragging = false;
    this.startX = this.lastX = x;
    this.startY = this.lastY = y;
    this.dx = this.dy = 0;
  }

  /** Returns true while the press is a drag. */
  move(x: number, y: number): boolean {
    if (!this.active) return false;
    if (!this.dragging) {
      const mx = x - this.startX;
      const my = y - this.startY;
      if (mx * mx + my * my > this.threshold * this.threshold) this.dragging = true;
    }
    this.dx = x - this.lastX;
    this.dy = y - this.lastY;
    this.lastX = x;
    this.lastY = y;
    return this.dragging;
  }

  /** Ends the press: 'click' when it never turned into a drag. */
  up(x: number, y: number): 'click' | 'drag' | null {
    if (!this.active) return null;
    this.move(x, y);
    this.active = false;
    return this.dragging ? 'drag' : 'click';
  }

  cancel(): void {
    this.active = false;
    this.dragging = false;
  }
}

export interface CameraOptions {
  cameraKeys?: CameraKeys;
  edgePan?: boolean;
  /** Called with canvas-relative CSS px when a left press ends without dragging. */
  onClick?: (x: number, y: number) => void;
}

interface Pose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  zoom: number;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Orbit camera with drag-rotate, wheel zoom, key/edge pan and damping. */
export class CameraController {
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  cameraKeys: CameraKeys;
  edgePan: boolean;
  private readonly target: Pose;
  private readonly current: Pose;
  private readonly home = { x: 0, z: 0 };
  private readonly bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
  private readonly held: Record<CameraAction, boolean> = {
    rotateLeft: false,
    rotateRight: false,
    panForward: false,
    panBack: false,
    panLeft: false,
    panRight: false,
  };
  private readonly drag = new DragTracker();
  private readonly pan: PanVec = { x: 0, z: 0 };
  private readonly edge: EdgeInput = { right: 0, forward: 0 };
  private readonly offset = new Vector3();
  private readonly lookAt = new Vector3();
  private pointerX = -1;
  private pointerY = -1;
  private pointerInside = false;
  private aspect = 1;
  private readonly removers: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: CameraOptions = {},
  ) {
    this.cameraKeys = options.cameraKeys ?? 'qe-wasd';
    this.edgePan = options.edgePan ?? true;
    this.target = { x: 0, z: 0, yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, zoom: DEFAULT_ZOOM };
    this.current = { ...this.target };
    this.listen(canvas, 'pointerdown', this.onPointerDown);
    this.listen(canvas, 'pointermove', this.onPointerMove);
    this.listen(canvas, 'pointerup', this.onPointerUp);
    this.listen(canvas, 'pointercancel', this.onPointerCancel);
    this.listen(canvas, 'pointerleave', this.onPointerLeave);
    this.listen(canvas, 'wheel', this.onWheel, { passive: false });
    this.listen(canvas, 'contextmenu', (e) => e.preventDefault());
    this.listen(window, 'keydown', this.onKeyDown);
    this.listen(window, 'keyup', this.onKeyUp);
    this.listen(window, 'blur', this.releaseKeys);
    this.apply();
  }

  /** Orbit centre used by resetCamera(), usually the middle of the shop floor. */
  setHome(x: number, z: number): void {
    this.home.x = x;
    this.home.z = z;
  }

  /** Ground rectangle the orbit centre stays near. */
  setBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    this.bounds.minX = minX - BOUNDS_MARGIN;
    this.bounds.maxX = maxX + BOUNDS_MARGIN;
    this.bounds.minZ = minZ - BOUNDS_MARGIN;
    this.bounds.maxZ = maxZ + BOUNDS_MARGIN;
  }

  /** Returns to the default angle, zoom and centre; smoothly unless `snap`. */
  reset(snap = false): void {
    const t = this.target;
    // Rotate the short way back so the reset does not spin several turns.
    this.current.yaw -= Math.round((this.current.yaw - DEFAULT_YAW) / (Math.PI * 2)) * Math.PI * 2;
    t.yaw = DEFAULT_YAW;
    t.pitch = DEFAULT_PITCH;
    t.zoom = DEFAULT_ZOOM;
    t.x = this.home.x;
    t.z = this.home.z;
    if (snap) {
      Object.assign(this.current, t);
      this.apply();
    }
  }

  setCameraKeys(mode: CameraKeys): void {
    this.cameraKeys = mode;
    this.releaseKeys();
  }

  setAspect(aspect: number): void {
    this.aspect = aspect > 0 ? aspect : 1;
    this.apply();
  }

  /** Current yaw of the rendered camera (radians). */
  get yaw(): number {
    return this.current.yaw;
  }

  /** Advances input and damping by `dt` seconds and updates the three camera. */
  update(dt: number): void {
    const t = this.target;
    const h = this.held;
    const rot = (h.rotateRight ? 1 : 0) - (h.rotateLeft ? 1 : 0);
    if (rot !== 0) t.yaw += rot * KEY_ROTATE_SPEED * dt;

    let right = (h.panRight ? 1 : 0) - (h.panLeft ? 1 : 0);
    let forward = (h.panForward ? 1 : 0) - (h.panBack ? 1 : 0);
    if (this.edgePan && this.pointerInside && !this.drag.active) {
      edgePanInput(this.pointerX, this.pointerY, this.canvas.clientWidth, this.canvas.clientHeight, EDGE_PAN_MARGIN_PX, this.edge);
      right += this.edge.right;
      forward += this.edge.forward;
    }
    if (right !== 0 || forward !== 0) {
      panVector(t.yaw, right, forward, this.pan);
      const step = (PAN_SPEED / t.zoom) * dt;
      t.x = clamp(t.x + this.pan.x * step, this.bounds.minX, this.bounds.maxX);
      t.z = clamp(t.z + this.pan.z * step, this.bounds.minZ, this.bounds.maxZ);
    }

    const c = this.current;
    c.x = damp(c.x, t.x, DAMPING, dt);
    c.z = damp(c.z, t.z, DAMPING, dt);
    c.yaw = damp(c.yaw, t.yaw, DAMPING, dt);
    c.pitch = damp(c.pitch, t.pitch, DAMPING, dt);
    c.zoom = damp(c.zoom, t.zoom, DAMPING, dt);
    this.apply();
  }

  dispose(): void {
    for (const remove of this.removers) remove();
    this.removers.length = 0;
  }

  private apply(): void {
    const c = this.current;
    const cam = this.camera;
    const halfH = VIEW_HEIGHT / 2;
    cam.left = -halfH * this.aspect;
    cam.right = halfH * this.aspect;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.zoom = c.zoom;
    orbitOffset(c.yaw, c.pitch, this.offset).multiplyScalar(ORBIT_DISTANCE);
    this.lookAt.set(c.x, 0, c.z);
    cam.position.copy(this.lookAt).add(this.offset);
    cam.lookAt(this.lookAt);
    cam.updateProjectionMatrix();
  }

  private listen<K extends keyof HTMLElementEventMap>(
    el: HTMLElement | Window,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void {
    el.addEventListener(type, fn as EventListener, opts);
    this.removers.push(() => el.removeEventListener(type, fn as EventListener, opts));
  }

  private trackPointer(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerX = e.clientX - rect.left;
    this.pointerY = e.clientY - rect.top;
    this.pointerInside = true;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.trackPointer(e);
    if (e.button !== 0) return;
    this.drag.down(e.clientX, e.clientY);
    this.canvas.setPointerCapture?.(e.pointerId);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.trackPointer(e);
    if (!this.drag.move(e.clientX, e.clientY)) return;
    this.target.yaw -= this.drag.dx * DRAG_ROTATE_SPEED;
    this.target.pitch = clampPitch(this.target.pitch + this.drag.dy * DRAG_ROTATE_SPEED);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.trackPointer(e);
    if (this.drag.up(e.clientX, e.clientY) === 'click') this.options.onClick?.(this.pointerX, this.pointerY);
    if (this.canvas.hasPointerCapture?.(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  };

  private readonly onPointerCancel = (): void => {
    this.drag.cancel();
  };

  private readonly onPointerLeave = (): void => {
    this.pointerInside = false;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // Line-mode wheels (Firefox) report deltas in lines, not px.
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.target.zoom = zoomFromWheel(this.target.zoom, delta);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    const action = keyAction(e.code, this.cameraKeys);
    if (action) this.held[action] = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    // Release on any key-up, even while typing, so a key never gets stuck.
    const action = keyAction(e.code, this.cameraKeys);
    if (action) this.held[action] = false;
  };

  private readonly releaseKeys = (): void => {
    for (const key of Object.keys(this.held) as CameraAction[]) this.held[key] = false;
  };
}
