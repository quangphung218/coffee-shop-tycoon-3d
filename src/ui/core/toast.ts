import type { NotifyLevel } from '../../sim/types';
import { h } from './dom';

/** design/tokens.json duration.toast-visible. */
export const TOAST_VISIBLE_MS = 4000;
export const MAX_TOASTS = 3;

const ICONS: Record<NotifyLevel, string> = { info: '🔔', success: '✅', warning: '⚠️', error: '⛔' };

export interface ToastInput {
  level: NotifyLevel;
  title: string;
  text?: string;
  icon?: string;
  /** Toasts with the same key merge into one with a "×n" counter. */
  key?: string;
}

interface Live {
  el: HTMLElement;
  title: HTMLElement;
  key: string;
  base: string;
  count: number;
  timer: ReturnType<typeof setTimeout> | null;
  hold: boolean;
  level: NotifyLevel;
}

/**
 * Toast stack in the bottom-left corner. Info and success hide after 4 s
 * (the countdown stops while hovered or focused); warning and error stay
 * until closed. At most 3 are shown; the oldest goes first.
 */
export class Toasts {
  readonly el: HTMLElement;
  private readonly live: Live[] = [];

  constructor() {
    this.el = h('div', { class: 'toasts', attrs: { 'aria-live': 'polite' } });
  }

  get count(): number {
    return this.live.length;
  }

  show(input: ToastInput): void {
    const key = input.key ?? `${input.level}:${input.title}:${input.text ?? ''}`;
    const same = this.live.find((t) => t.key === key);
    if (same) {
      same.count += 1;
      same.title.textContent = `${same.base} ×${same.count}`;
      this.arm(same);
      return;
    }
    while (this.live.length >= MAX_TOASTS) this.close(this.live[0]!);

    const title = h('p', { class: 'toast-title', text: input.title });
    const close = h('button', { class: 'icon-btn', attrs: { type: 'button', 'aria-label': 'Đóng thông báo' }, text: '✕ Đóng' });
    const el = h(
      'div',
      { class: `toast toast-${input.level}`, attrs: { role: input.level === 'error' ? 'alert' : 'status' } },
      h('span', { class: 'toast-icon', attrs: { 'aria-hidden': 'true' }, text: input.icon ?? ICONS[input.level] }),
      h('div', { class: 'toast-body' }, title, input.text ? h('p', { class: 'toast-text', text: input.text }) : null),
      close,
    );
    const toast: Live = { el, title, key, base: input.title, count: 1, timer: null, hold: false, level: input.level };
    close.addEventListener('click', () => this.close(toast));
    const hold = (on: boolean) => () => {
      toast.hold = on;
      this.arm(toast);
    };
    el.addEventListener('pointerenter', hold(true));
    el.addEventListener('pointerleave', hold(false));
    el.addEventListener('focusin', hold(true));
    el.addEventListener('focusout', hold(false));
    this.live.push(toast);
    this.el.append(el);
    this.arm(toast);
  }

  clear(): void {
    for (const t of [...this.live]) this.close(t);
  }

  private arm(t: Live): void {
    if (t.timer) clearTimeout(t.timer);
    t.timer = null;
    if (t.hold || t.level === 'warning' || t.level === 'error') return;
    t.timer = setTimeout(() => this.close(t), TOAST_VISIBLE_MS);
  }

  private close(t: Live): void {
    if (t.timer) clearTimeout(t.timer);
    const i = this.live.indexOf(t);
    if (i >= 0) this.live.splice(i, 1);
    t.el.remove();
  }
}
