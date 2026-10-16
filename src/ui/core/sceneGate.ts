import { h } from './dom';
import { icon } from './icons';
import { currentTipIndex, LOADING_TIPS } from './tips';

export type SceneStatus = 'loading' | 'ready' | 'error';

export interface SceneLoadState {
  status: SceneStatus;
  /** 0–1, from the files really downloaded and the build steps done (src/ui/core/loadProgress.ts). */
  progress: number;
  /** Still loading after a long wait: say the network is slow. */
  slow: boolean;
  /** What went wrong, shown when status is 'error'. */
  message?: string;
}

const READY: SceneLoadState = { status: 'ready', progress: 1, slow: false };

export const SCENE_LOADING_TEXT = 'Đang chuẩn bị quán 3D…';
export const SCENE_SLOW_TEXT = 'Mạng đang chậm, game vẫn đang tải…';
export const SCENE_ERROR_TEXT = 'Không tải được quán 3D. Kiểm tra mạng rồi bấm Thử lại.';

/** Whole percent shown for `progress`; 100 only once ready, so a finished download never reads as done. */
export function progressPercent(state: SceneLoadState): number {
  if (state.status === 'ready') return 100;
  return Math.min(99, Math.max(0, Math.floor(state.progress * 100)));
}

/**
 * Whether the 3D scene is ready to play in. Buttons that enter the shop
 * (bind) stay aria-disabled with "Đang chuẩn bị N%" until it is, and status
 * lines (statusLine) show the progress, the slow-network note or the error
 * with "Thử lại". Starts ready, so a shell without a loader (tests) is not gated.
 */
export class SceneGate {
  private s: SceneLoadState;
  private readonly buttons = new Set<HTMLButtonElement>();
  private readonly views = new Set<(s: SceneLoadState) => void>();
  /** Called by "Thử lại" on a status line. */
  onRetry: (() => void) | null = null;

  constructor(initial: SceneLoadState = READY) {
    this.s = { ...initial };
  }

  get state(): SceneLoadState {
    return { ...this.s };
  }

  get ready(): boolean {
    return this.s.status === 'ready';
  }

  set(next: Partial<SceneLoadState>): void {
    const s: SceneLoadState = { ...this.s, ...next };
    s.progress = Math.min(1, Math.max(0, s.progress));
    if (s.status !== 'error') delete s.message;
    this.s = s;
    for (const btn of this.buttons) {
      // Screens rebuild some buttons (load slots); drop the ones no longer on the page.
      if (btn.isConnected) applyButton(btn, s);
      else this.buttons.delete(btn);
    }
    for (const view of this.views) view(s);
  }

  /** Gates a button that enters the shop. Its click handler should still check isAriaDisabled(). */
  bind(btn: HTMLButtonElement): void {
    this.buttons.add(btn);
    applyButton(btn, this.s);
  }

  /** Progress bar, message, tip and "Thử lại" for a screen; hidden while ready. */
  statusLine(): HTMLElement {
    const msg = h('span', { class: 'scene-load-msg', attrs: { role: 'status' } });
    const pct = h('span', { class: 'scene-load-pct', attrs: { 'aria-hidden': 'true' } });
    const fill = h('span');
    const bar = h('div', { class: 'scene-load-bar', attrs: { role: 'progressbar', 'aria-label': 'Tải quán 3D', 'aria-valuemin': 0, 'aria-valuemax': 100 } }, fill);
    const tip = h('p', { class: 'scene-load-tip' }, icon('i-tip', { size: 16 }), `Mẹo: ${LOADING_TIPS[currentTipIndex()] ?? ''}`);
    const retry = h('button', { class: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => this.onRetry?.() } }, icon('i-retry'), 'Thử lại');
    const el = h('div', { class: 'scene-load' }, h('div', { class: 'scene-load-head' }, msg, pct), bar, tip, retry);
    const render = (s: SceneLoadState): void => {
      el.hidden = s.status === 'ready';
      const failed = s.status === 'error';
      el.classList.toggle('is-failed', failed);
      el.classList.toggle('is-slow', s.slow && !failed);
      const text = failed ? (s.message ?? SCENE_ERROR_TEXT) : s.slow ? SCENE_SLOW_TEXT : SCENE_LOADING_TEXT;
      if (msg.textContent !== text) msg.textContent = text;
      const p = progressPercent(s);
      pct.textContent = failed ? '' : `${p}%`;
      bar.hidden = failed;
      bar.setAttribute('aria-valuenow', String(p));
      fill.style.transform = `scaleX(${p / 100})`;
      tip.hidden = failed;
      retry.hidden = !failed;
    };
    render(this.s);
    this.views.add(render);
    return el;
  }
}

function applyButton(btn: HTMLButtonElement, s: SceneLoadState): void {
  const waiting = s.status !== 'ready';
  let note = btn.querySelector<HTMLElement>(':scope > .btn-prep');
  btn.classList.toggle('is-preparing', waiting);
  btn.classList.toggle('is-failed', s.status === 'error');
  if (!waiting) {
    note?.remove();
    btn.removeAttribute('aria-disabled');
    btn.style.removeProperty('--prep');
    return;
  }
  btn.setAttribute('aria-disabled', 'true');
  btn.style.setProperty('--prep', String(progressPercent(s) / 100));
  if (!note) {
    note = h('span', { class: 'btn-prep' });
    btn.append(note);
  }
  const text = s.status === 'error' ? 'Chưa tải được' : `Đang chuẩn bị ${progressPercent(s)}%`;
  if (note.textContent !== text) note.textContent = text;
}
