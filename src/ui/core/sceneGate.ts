import { h } from './dom';
import { icon, type IconId } from './icons';
import {
  componentProgress,
  componentsStatus,
  weightedProgress,
  type LoadComponent,
  type LoadComponentId,
  type LoadComponentStatus,
} from './loadProgress';
import { currentTipIndex, LOADING_TIPS } from './tips';

export type SceneStatus = 'loading' | 'ready' | 'error';

export interface SceneLoadState {
  status: SceneStatus;
  /** 0–1; with components, their weighted average (src/ui/core/loadProgress.ts). */
  progress: number;
  /** Still loading after a long wait: say the network is slow. */
  slow: boolean;
  /** What went wrong, shown when status is 'error'. */
  message?: string;
  /**
   * What is being loaded, one row each on the status line. When not empty,
   * status and progress follow from it: ready only once every one is done,
   * error as soon as one failed.
   */
  components: LoadComponent[];
}

const READY: SceneLoadState = { status: 'ready', progress: 1, slow: false, components: [] };

/** Status icon of a component row (no emoji). */
const STATUS_ICON: Record<LoadComponentStatus, IconId> = {
  waiting: 'i-dot-empty',
  loading: 'i-busy',
  done: 'i-check',
  error: 'i-error',
};

const STATUS_TEXT: Record<LoadComponentStatus, string> = {
  waiting: 'đang chờ',
  loading: 'đang tải',
  done: 'xong',
  error: 'lỗi',
};

export const SCENE_LOADING_TEXT = 'Đang chuẩn bị quán 3D…';
export const SCENE_SLOW_TEXT = 'Mạng đang chậm, game vẫn đang tải…';
export const SCENE_ERROR_TEXT = 'Không tải được quán 3D. Kiểm tra mạng rồi bấm Thử lại.';

/** Whole percent shown for `progress`; 100 only once ready, so a finished download never reads as done. */
export function progressPercent(state: SceneLoadInit): number {
  if (state.status === 'ready') return 100;
  return Math.min(99, Math.max(0, Math.floor(state.progress * 100)));
}

/** A whole state, or one without components (no list: status and progress are set directly). */
export type SceneLoadInit = Omit<SceneLoadState, 'components'> & { components?: LoadComponent[] };

/**
 * Whether the 3D scene is ready to play in. Buttons that enter the shop
 * (bind) stay aria-disabled with "Đang chuẩn bị N%" until it is, and status
 * lines (statusLine) show the progress, one row per component, the
 * slow-network note and "Thử lại" on what failed. Starts ready, so a shell
 * without a loader (tests) is not gated.
 */
export class SceneGate {
  private s: SceneLoadState;
  private readonly buttons = new Set<HTMLButtonElement>();
  private readonly views = new Set<(s: SceneLoadState) => void>();
  /** Called by "Thử lại": with the failed component's id, or none from the line without components. */
  onRetry: ((id?: LoadComponentId) => void) | null = null;

  constructor(initial: SceneLoadInit = READY) {
    this.s = derive({ ...initial, components: copyComponents(initial.components ?? []) });
  }

  get state(): SceneLoadState {
    return { ...this.s, components: copyComponents(this.s.components) };
  }

  get ready(): boolean {
    return this.s.status === 'ready';
  }

  set(next: Partial<SceneLoadState>): void {
    const s = derive({ ...this.s, ...next, components: copyComponents(next.components ?? this.s.components) });
    if (s.status !== 'error') delete s.message;
    this.s = s;
    for (const btn of this.buttons) {
      // Screens rebuild some buttons (load slots); drop the ones no longer on the page.
      if (btn.isConnected) applyButton(btn, s);
      else this.buttons.delete(btn);
    }
    for (const view of this.views) view(s);
  }

  /** Updates one component; status and overall progress follow. */
  setComponent(id: LoadComponentId, next: Partial<Pick<LoadComponent, 'status' | 'progress'>>): void {
    this.set({ components: this.s.components.map((c) => (c.id === id ? { ...c, ...next } : c)) });
  }

  /** Gates a button that enters the shop. Its click handler should still check isAriaDisabled(). */
  bind(btn: HTMLButtonElement): void {
    this.buttons.add(btn);
    applyButton(btn, this.s);
  }

  /**
   * Progress bar, message, one row per component (status icon, label, %,
   * "Thử lại" when it failed) and a tip for a screen; hidden while ready.
   */
  statusLine(): HTMLElement {
    const msg = h('span', { class: 'scene-load-msg', attrs: { role: 'status' } });
    const pct = h('span', { class: 'scene-load-pct', attrs: { 'aria-hidden': 'true' } });
    const fill = h('span');
    const bar = h('div', { class: 'scene-load-bar', attrs: { role: 'progressbar', 'aria-label': 'Tải quán 3D', 'aria-valuemin': 0, 'aria-valuemax': 100 } }, fill);
    const list = h('ul', { class: 'scene-load-list', attrs: { 'aria-label': 'Thành phần đang tải' } });
    const tip = h('p', { class: 'scene-load-tip' }, icon('i-tip', { size: 16 }), `Mẹo: ${LOADING_TIPS[currentTipIndex()] ?? ''}`);
    // Without components (a bare error) the line keeps one Thử lại of its own.
    const retry = h('button', { class: 'btn btn-secondary', attrs: { type: 'button' }, on: { click: () => this.onRetry?.() } }, icon('i-retry'), 'Thử lại');
    const el = h('div', { class: 'scene-load' }, h('div', { class: 'scene-load-head' }, msg, pct), bar, list, tip, retry);
    const rows = new Map<LoadComponentId, (c: LoadComponent) => void>();
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
      if (s.components.map((c) => c.id).join() !== [...rows.keys()].join()) {
        rows.clear();
        list.replaceChildren(...s.components.map((c) => this.componentRow(c, rows)));
      }
      for (const c of s.components) rows.get(c.id)?.(c);
      list.hidden = s.components.length === 0;
      tip.hidden = failed;
      retry.hidden = !failed || s.components.length > 0;
    };
    render(this.s);
    this.views.add(render);
    return el;
  }

  /** One `<li>` of the list; registers its update in `rows`. */
  private componentRow(c: LoadComponent, rows: Map<LoadComponentId, (c: LoadComponent) => void>): HTMLElement {
    const mark = h('span', { class: 'scene-load-mark' });
    const state = h('span', { class: 'sr-only' });
    const pct = h('span', { class: 'scene-load-item-pct' });
    const retry = h(
      'button',
      { class: 'btn btn-secondary scene-load-retry', attrs: { type: 'button' }, on: { click: () => this.onRetry?.(c.id) } },
      icon('i-retry', { size: 16 }),
      'Thử lại',
    );
    const row = h('li', { class: 'scene-load-item', attrs: { 'data-component': c.id } }, mark, h('span', { class: 'scene-load-label' }, c.label), state, pct, retry);
    let shown: LoadComponentStatus | null = null;
    rows.set(c.id, (next) => {
      if (shown !== next.status) {
        shown = next.status;
        row.dataset.status = next.status;
        mark.replaceChildren(icon(STATUS_ICON[next.status], { size: 16 }));
        state.textContent = `: ${STATUS_TEXT[next.status]}`;
        retry.hidden = next.status !== 'error';
      }
      pct.textContent = next.status === 'error' ? '' : `${componentPercent(next)}%`;
    });
    return row;
  }
}

/** Whole percent of one component; 100 only once it is done. */
export function componentPercent(c: Pick<LoadComponent, 'status' | 'progress'>): number {
  if (c.status === 'done') return 100;
  return Math.min(99, Math.floor(componentProgress(c) * 100));
}

function copyComponents(list: readonly LoadComponent[]): LoadComponent[] {
  return list.map((c) => ({ ...c }));
}

/** Clamps progress; with components, status and progress come from them. */
function derive(s: SceneLoadState): SceneLoadState {
  if (s.components.length > 0) {
    s.status = componentsStatus(s.components);
    s.progress = weightedProgress(s.components);
  }
  s.progress = Math.min(1, Math.max(0, s.progress));
  return s;
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
