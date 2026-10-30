import type { NotifyLevel } from '../../sim/types';
import { h } from './dom';
import { formatMoney } from './format';
import { icon, type IconId } from './icons';

/** design/tokens.json duration.toast-visible. */
export const TOAST_VISIBLE_MS = 4000;
export const MAX_TOASTS = 3;

const ICONS: Record<NotifyLevel, IconId> = { info: 'i-info', success: 'i-ok', warning: 'i-warning', error: 'i-error' };

export interface ToastInput {
  level: NotifyLevel;
  title: string;
  text?: string;
  /** Replaces the level's icon (e.g. the angry face, an ingredient). */
  icon?: IconId;
  /** Toasts with the same key merge into one with a "×n" counter, or by `merge` when given. */
  key?: string;
  /** Spend toast: a live toast with the same key adds the amount and the label instead of "×n". Overrides title and text. */
  merge?: MergeSpend;
  /** A live toast with the same key takes this title and text in place, without "×n". */
  replace?: boolean;
  /** One button in the toast ("Chuyển 2x"): runs `run`, then closes the toast. */
  action?: ToastAction;
}

export interface ToastAction {
  label: string;
  run(): void;
}

export interface MergeSpend {
  /** "Đã nhập" — the title is the verb and the names. */
  verb: string;
  label: string;
  amount: number;
  moneyLeft: number;
}

/** Names shown in a merged title before "và N mặt hàng khác". */
export const MERGE_NAMES = 3;

interface Merged {
  verb: string;
  labels: string[];
  amount: number;
  moneyLeft: number;
}

interface Live {
  el: HTMLElement;
  title: HTMLElement;
  text: HTMLElement | null;
  key: string;
  base: string;
  count: number;
  merged: Merged | null;
  timer: ReturnType<typeof setTimeout> | null;
  hold: boolean;
  level: NotifyLevel;
}

/** "Đã nhập Cam, Bột bánh" and "−819.375đ · Còn 19.062.724đ". */
function mergedLines(m: Merged): { title: string; text: string } {
  const shown = m.labels.slice(0, MERGE_NAMES).join(', ');
  const rest = m.labels.length - MERGE_NAMES;
  return {
    title: `${m.verb} ${shown}${rest > 0 ? ` và ${rest} mặt hàng khác` : ''}`,
    text: `${formatMoney(-m.amount)} · Còn ${formatMoney(m.moneyLeft)}`,
  };
}

/**
 * Toast stack in the bottom-left corner, above the dock; toasts never take
 * focus, so they cannot move it off what the player is doing. Info and success hide after 4 s
 * (the countdown stops while hovered or focused); warning and error stay
 * until closed. At most 3 are shown (1 while the Daily Report is open); the
 * oldest goes first.
 */
export class Toasts {
  readonly el: HTMLElement;
  private readonly live: Live[] = [];
  private max = MAX_TOASTS;

  constructor() {
    this.el = h('div', { class: 'toasts', attrs: { 'aria-live': 'polite' } });
  }

  get count(): number {
    return this.live.length;
  }

  /** Most toasts shown at once (1 to MAX_TOASTS); lowering it closes the oldest. */
  get limit(): number {
    return this.max;
  }

  set limit(n: number) {
    this.max = Math.max(1, Math.min(MAX_TOASTS, n));
    while (this.live.length > this.max) this.close(this.live[0]!);
  }

  show(input: ToastInput): void {
    const key = input.key ?? `${input.level}:${input.title}:${input.text ?? ''}`;
    const same = this.live.find((t) => t.key === key);
    if (same) {
      if (same.merged && input.merge) {
        const m = same.merged;
        m.amount += input.merge.amount;
        m.moneyLeft = input.merge.moneyLeft;
        if (!m.labels.includes(input.merge.label)) m.labels.push(input.merge.label);
        const lines = mergedLines(m);
        same.title.textContent = lines.title;
        if (same.text) same.text.textContent = lines.text;
      } else if (input.replace) {
        same.base = input.title;
        same.count = 1;
        same.title.textContent = input.title;
        if (input.text && !same.text) {
          same.text = h('p', { class: 'toast-text' });
          same.title.after(same.text);
        }
        if (same.text) {
          same.text.textContent = input.text ?? '';
          same.text.hidden = !input.text;
        }
      } else {
        same.count += 1;
        same.title.textContent = `${same.base} ×${same.count}`;
      }
      this.arm(same);
      return;
    }
    while (this.live.length >= this.max) this.close(this.live[0]!);

    const merged: Merged | null = input.merge
      ? { verb: input.merge.verb, labels: [input.merge.label], amount: input.merge.amount, moneyLeft: input.merge.moneyLeft }
      : null;
    const lines = merged ? mergedLines(merged) : { title: input.title, text: input.text };
    const title = h('p', { class: 'toast-title', text: lines.title });
    const text = lines.text ? h('p', { class: 'toast-text', text: lines.text }) : null;
    const close = h('button', { class: 'icon-btn', attrs: { type: 'button', 'aria-label': 'Đóng thông báo' } }, icon('i-close', { size: 16 }), 'Đóng');
    const action = input.action
      ? h('button', { class: 'btn btn-secondary toast-action', attrs: { type: 'button', 'data-action': 'toast-action' }, text: input.action.label })
      : null;
    const body = h('div', { class: 'toast-body' }, title, text, action);
    const el = h(
      'div',
      { class: `toast toast-${input.level}`, attrs: { role: input.level === 'error' ? 'alert' : 'status' } },
      h('span', { class: 'toast-icon' }, icon(input.icon ?? ICONS[input.level])),
      body,
      close,
    );
    const toast: Live = { el, title, text, key, base: lines.title, count: 1, merged, timer: null, hold: false, level: input.level };
    close.addEventListener('click', () => this.close(toast));
    action?.addEventListener('click', () => {
      input.action!.run();
      this.close(toast);
    });
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
