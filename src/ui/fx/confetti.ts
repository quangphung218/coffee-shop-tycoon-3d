/**
 * One-shot confetti over a positioned host (the level-up moment of the Daily
 * Report). A 2D canvas laid over the host, never hit-tested or announced;
 * every piece lives in one preallocated buffer, so a frame allocates nothing.
 * Loaded on demand with import('../fx/confetti').
 */

/** Most pieces one burst draws. */
export const CONFETTI_MAX = 90;
/** Lifetime of a burst in ms; the canvas removes itself after it. */
export const CONFETTI_MS = 1400;
/** Device pixel ratio cap: sharper costs fill rate for no visible gain. */
export const CONFETTI_MAX_DPR = 2;

/** Bright token colours (tokens.css); read from the host so a theme change follows, these when unset. */
const COLOR_TOKENS: readonly [string, string][] = [
  ['--color-honey-400', '#ffc145'],
  ['--color-mint-400', '#5fd3a8'],
  ['--color-berry-400', '#ff8a7a'],
  ['--color-sky-400', '#8fd3f4'],
  ['--color-leaf-400', '#8fcf5f'],
  ['--color-tangerine-400', '#ffa04d'],
];

export interface ConfettiOptions {
  /** Pieces, capped at CONFETTI_MAX. Default CONFETTI_MAX. */
  count?: number;
  /** ms, capped at CONFETTI_MS. Default CONFETTI_MS. */
  duration?: number;
}

// Per piece: x, y, vx, vy (css px, px/s), angle, spin (rad, rad/s), w, h, colour index.
const STRIDE = 9;
const GRAVITY = 900;
const DRAG = 0.6;

function tokenColors(host: Element): string[] {
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(host) : null;
  return COLOR_TOKENS.map(([name, fallback]) => style?.getPropertyValue(name).trim() || fallback);
}

/**
 * Throws confetti up from the upper middle of `host` for up to 1.4 s, then
 * removes the canvas. Returns a stop function that removes it at once (safe
 * to call more than once). Does nothing without a 2D context or rAF.
 */
export function burst(host: HTMLElement, opts: ConfettiOptions = {}): () => void {
  const count = Math.max(0, Math.min(CONFETTI_MAX, Math.floor(opts.count ?? CONFETTI_MAX)));
  const duration = Math.max(0, Math.min(CONFETTI_MS, opts.duration ?? CONFETTI_MS));
  if (count === 0 || duration === 0 || typeof requestAnimationFrame !== 'function') return () => {};

  const doc = host.ownerDocument;
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  canvas.className = 'fx-confetti';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1';

  const win = doc.defaultView;
  let width = 1;
  let height = 1;
  let dpr = 1;
  /** Sizes the backing store to the host; pieces keep their css px positions. */
  function measure(): void {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    dpr = Math.min(CONFETTI_MAX_DPR, Math.max(1, win?.devicePixelRatio ?? 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  measure();
  // Follows the host while the burst lives (a rotated phone, a resized window).
  const observer = win && typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => measure()) : null;

  const colors = tokenColors(host);
  const p = new Float32Array(count * STRIDE);
  for (let i = 0; i < count; i++) {
    const o = i * STRIDE;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 420 + Math.random() * 520;
    p[o] = width * (0.35 + Math.random() * 0.3);
    p[o + 1] = height * 0.32;
    p[o + 2] = Math.cos(angle) * speed;
    p[o + 3] = Math.sin(angle) * speed;
    p[o + 4] = Math.random() * Math.PI * 2;
    p[o + 5] = (Math.random() - 0.5) * 14;
    p[o + 6] = 6 + Math.random() * 6;
    p[o + 7] = 4 + Math.random() * 4;
    p[o + 8] = i % colors.length;
  }

  let start = -1;
  let last = 0;
  let raf = 0;
  let done = false;

  function stop(): void {
    if (done) return;
    done = true;
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = 0;
    if (observer) observer.disconnect();
    else win?.removeEventListener('resize', measure);
    canvas.remove();
  }

  function frame(now: number): void {
    raf = 0;
    if (done) return;
    if (start < 0) start = last = now;
    const t = now - start;
    if (t >= duration) {
      stop();
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const keep = 1 - DRAG * dt;
    // Full opacity for the first 60 %, then fade out.
    ctx!.globalAlpha = Math.min(1, (1 - t / duration) / 0.4);
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    for (let o = 0; o < p.length; o += STRIDE) {
      p[o + 2]! *= keep;
      p[o + 3] = p[o + 3]! * keep + GRAVITY * dt;
      p[o]! += p[o + 2]! * dt;
      p[o + 1]! += p[o + 3]! * dt;
      p[o + 4]! += p[o + 5]! * dt;
      const a = p[o + 4]!;
      const cos = Math.cos(a) * dpr;
      const sin = Math.sin(a) * dpr;
      ctx!.setTransform(cos, sin, -sin, cos, p[o]! * dpr, p[o + 1]! * dpr);
      ctx!.fillStyle = colors[p[o + 8]!]!;
      const w = p[o + 6]!;
      const h = p[o + 7]!;
      ctx!.fillRect(-w / 2, -h / 2, w, h);
    }
    raf = requestAnimationFrame(frame);
  }

  host.append(canvas);
  if (observer) observer.observe(host);
  else win?.addEventListener('resize', measure);
  raf = requestAnimationFrame(frame);
  return stop;
}
