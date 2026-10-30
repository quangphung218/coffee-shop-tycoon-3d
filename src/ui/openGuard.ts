import { canMake } from '../sim/inventory';
import type { GameState } from '../sim/types';
import { h } from './core/dom';
import { inlineConfirm, openOtherPanel } from './panels/widgets';

export interface OpenWarning {
  id: 'stock' | 'staff';
  text: string;
  panel: string;
  link: string;
}

/** True when the menu has dishes on but the stock cannot make even one serving of any. */
export function stockMakesNoDish(state: GameState): boolean {
  const enabled = state.menu.filter((m) => m.enabled);
  return enabled.length > 0 && !enabled.some((m) => canMake(state, m.id));
}

/** What the "Mở cửa" confirmation asks about (UX-004); empty means open at once. */
export function openWarnings(state: GameState): OpenWarning[] {
  const out: OpenWarning[] = [];
  if (stockMakesNoDish(state)) out.push({ id: 'stock', text: 'Kho trống: không bán được món nào', panel: 'inventory', link: 'Mở Kho' });
  if (state.staff.length === 0) out.push({ id: 'staff', text: 'Chưa có nhân viên: tự nhận order, pha và bưng', panel: 'staff', link: 'Mở Nhân viên' });
  return out;
}

export interface StartDayGuard {
  /** Where the confirmation row goes, inserted before `before` (or appended). */
  host: HTMLElement;
  before?: Node | null;
  /** Extra classes on the row, e.g. to fit the HUD bar. */
  className?: string;
  getState(): GameState | null;
  /** Sends start_day. */
  start(): void;
  /** Focus target after Cancel. */
  back: HTMLElement;
}

/**
 * The one guard every "Mở cửa" button goes through (UX-004): with nothing
 * to warn about it sends start_day at once; else it shows one confirmation
 * row listing each warning with a link to fix it. It only asks: "Vẫn mở cửa"
 * still opens the shop.
 */
export function guardStartDay(g: StartDayGuard): void {
  if (g.host.querySelector(':scope > .confirm')) return;
  const s = g.getState();
  const warnings = s ? openWarnings(s) : [];
  if (warnings.length === 0) {
    g.start();
    return;
  }
  const ask = inlineConfirm(
    warnings.map((w) => w.text).join('. '),
    'Vẫn mở cửa',
    'btn-accent',
    () => g.start(),
    () => g.back.focus(),
  );
  if (g.className) ask.classList.add(...g.className.split(' '));
  ask.querySelector('p')!.replaceWith(...warnings.map((w) => h('p', { attrs: { 'data-warn': w.id }, text: w.text })));
  const ok = ask.querySelector('[data-action="confirm"]')!;
  for (const w of warnings) {
    const link = h('button', { class: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-goto': w.panel }, text: w.link });
    link.addEventListener('click', () => {
      ask.remove();
      openOtherPanel(w.panel);
    });
    ok.before(link);
  }
  g.host.insertBefore(ask, g.before ?? null);
}
