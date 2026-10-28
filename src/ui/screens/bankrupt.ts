import { listSlots, loadGame, type SaveSlot } from '../../save/save';
import type { StorageLike } from '../../save/storage';
import { DIFFICULTIES } from '../../sim/data/difficulty';
import type { GameState } from '../../sim/types';
import { h, setAriaDisabled, setChildren, uid, isAriaDisabled } from '../core/dom';
import { formatMoney, formatSavedAt } from '../core/format';
import { icon, type IconId } from '../core/icons';
import { screenLayer, type Screen } from '../core/screens';
import { slotLabel } from './loadGame';

export interface BankruptActions {
  /** The bankrupt game; read each time the screen opens. */
  getState(): GameState | null;
  /** Newest save that loads and is not bankrupt itself, or null. */
  latestSave(): { slot: SaveSlot; day: number; savedAt?: number } | null;
  /** "Chơi lại từ đầu": a new game with the same shop name and difficulty. */
  onRestart(): void;
  /** "Tải bản lưu gần nhất": the slot latestSave() returned. */
  onLoadLatest(slot: SaveSlot): void;
}

/** What the bankruptcy screen shows about the finished run. */
export interface BankruptSummary {
  /** Days the shop stayed open, the bankrupt day included. */
  days: number;
  /** Revenue over the whole run. */
  revenue: number;
  /** Cups earned over all scored weeks. */
  trophies: number;
}

export function bankruptSummary(state: GameState): BankruptSummary {
  // The history keeps only recent days; the lifetime counter has the whole run (today included).
  const revenue = state.retention?.lifetime.revenue ?? state.history.reduce((s, d) => s + d.revenue, 0) + state.today.revenue;
  const trophies = (state.week?.archive ?? []).reduce((s, w) => s + w.cups, 0);
  return { days: state.day, revenue, trophies };
}

/**
 * Newest slot that loads cleanly and is not itself bankrupt, so "Tải bản lưu
 * gần nhất" never lands back on this screen.
 */
export function latestPlayableSave(storage: StorageLike): { slot: SaveSlot; day: number; savedAt?: number } | null {
  const slots = listSlots(storage)
    .filter((s) => !s.empty && !s.error)
    .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  for (const s of slots) {
    const r = loadGame(s.slot, storage);
    if (r.ok && !r.value.bankrupt) return { slot: s.slot, day: r.value.day, savedAt: s.savedAt };
  }
  return null;
}

function stat(iconId: IconId, label: string, value: string, block: string): HTMLElement {
  return h(
    'div',
    { class: 'bk-stat', attrs: { 'data-block': block } },
    icon(iconId, { size: 32 }),
    h('span', { class: 'rpt-muted', text: label }),
    h('b', { text: value }),
  );
}

/**
 * Game over after BANKRUPT_DAYS days in a row past the debt limit: days
 * survived, revenue and cups of the run, then "Chơi lại từ đầu" or "Tải bản
 * lưu gần nhất" (aria-disabled with the reason when no save can be loaded).
 * Esc does nothing: the run cannot go on.
 */
export function createBankrupt(actions: BankruptActions): Screen {
  const titleId = uid('bankrupt-t');
  const title = h('h3', { id: titleId, text: 'Quán đã phá sản' });
  const sub = h('p', { class: 'rpt-sub' });
  const body = h('div', { class: 'rpt-body' });
  const loadNote = h('p', { class: 'rpt-muted', attrs: { 'data-load-note': '' } });
  let latest: ReturnType<BankruptActions['latestSave']> = null;
  const restart = h(
    'button',
    { class: 'btn btn-primary btn-lg', attrs: { type: 'button', 'data-action': 'restart' }, on: { click: () => actions.onRestart() } },
    icon('i-retry'),
    'Chơi lại từ đầu',
  );
  const load = h(
    'button',
    {
      class: 'btn btn-secondary',
      attrs: { type: 'button', 'data-action': 'load-latest' },
      on: {
        click: () => {
          if (latest && !isAriaDisabled(load)) actions.onLoadLatest(latest.slot);
        },
      },
    },
    icon('i-load'),
    'Tải bản lưu gần nhất',
  );
  const dialog = h(
    'div',
    { class: 'rpt-dialog' },
    h('div', { class: 'rpt-head' }, h('span', { class: 'rpt-head-icon' }, icon('i-error', { size: 32 })), h('div', { class: 'rpt-head-text' }, title, sub)),
    body,
    h('div', { class: 'rpt-foot' }, loadNote, h('div', { class: 'rpt-foot-actions' }, load, restart)),
  );

  const el = screenLayer(dialog, { variant: 'scrim', modal: true, label: 'Quán đã phá sản' });
  el.classList.add('rpt-layer');
  el.setAttribute('data-screen', 'bankrupt');
  el.setAttribute('aria-labelledby', titleId);
  el.removeAttribute('aria-label');
  return {
    el,
    onShow: () => {
      const state = actions.getState();
      sub.textContent = state ? `${state.shopName} · ${DIFFICULTIES[state.difficulty].name} · nợ quá hạn mức nhiều ngày liền` : '';
      if (!state) setChildren(body);
      else {
        const s = bankruptSummary(state);
        setChildren(
          body,
          h(
            'div',
            { class: 'bk-stats' },
            stat('i-clock', 'Số ngày trụ được', `${s.days} ngày`, 'days'),
            stat('i-coin', 'Tổng doanh thu', formatMoney(s.revenue), 'revenue'),
            stat('i-trophy', 'Cúp đã giành', String(s.trophies), 'trophies'),
          ),
        );
      }
      latest = actions.latestSave();
      setAriaDisabled(load, !latest);
      loadNote.textContent = latest
        ? `${slotLabel(latest.slot)} · Ngày ${latest.day}${latest.savedAt ? ` · ${formatSavedAt(latest.savedAt)}` : ''}`
        : 'Chưa có bản lưu nào để tải.';
    },
    initialFocus: () => restart,
    onEscape: () => true,
  };
}
