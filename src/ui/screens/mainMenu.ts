import { listSlots, type SaveSlot, type SlotInfo } from '../../save/save';
import type { StorageLike } from '../../save/storage';
import { h, isAriaDisabled, setAriaDisabled, uid } from '../core/dom';
import { screenLayer, type Screen } from '../core/screens';

export interface MainMenuActions {
  onContinue(slot: SaveSlot): void;
  onNewGame(): void;
  onLoad(): void;
  onSettings(): void;
}

/** Most recently saved slot that loads cleanly, or null. */
export function latestSave(slots: readonly SlotInfo[]): SlotInfo | null {
  let best: SlotInfo | null = null;
  for (const s of slots) {
    if (s.empty || s.error) continue;
    if (!best || (s.savedAt ?? 0) > (best.savedAt ?? 0)) best = s;
  }
  return best;
}

/**
 * Main Menu: Tiếp tục (only with a save), Ván mới, Tải game, Cài đặt.
 * "Tải game" stays visible but aria-disabled with a reason when no slot holds
 * anything. ↑ ↓ move between the buttons.
 */
export function createMainMenu(storage: StorageLike, actions: MainMenuActions): Screen {
  const reasonId = uid('r-noload');
  let continueSlot: SaveSlot | null = null;

  const continueDetail = h('span', { class: 'btn-sm-text' });
  const continueBtn = h(
    'button',
    { class: 'btn btn-primary btn-lg btn-block', attrs: { type: 'button' }, on: { click: () => continueSlot && actions.onContinue(continueSlot) } },
    '▶️ Tiếp tục',
    continueDetail,
  );
  const newBtn = h('button', { class: 'btn btn-lg btn-block', attrs: { type: 'button' }, on: { click: () => actions.onNewGame() } }, '✨ Ván mới');
  const loadBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-lg btn-block',
      attrs: { type: 'button', 'data-action': 'load' },
      on: { click: () => !isAriaDisabled(loadBtn) && actions.onLoad() },
    },
    '📂 Tải game',
  );
  const loadReason = h('p', { class: 'reason', id: reasonId, text: '🔒 Chưa có bản lưu nào. Chơi hết ngày 1 để game tự lưu.' });
  const settingsBtn = h(
    'button',
    { class: 'btn btn-secondary btn-lg btn-block', attrs: { type: 'button' }, on: { click: () => actions.onSettings() } },
    '⚙️ Cài đặt',
  );

  const list = h('div', { class: 'menu-list' }, continueBtn, newBtn, h('div', {}, loadBtn, loadReason), settingsBtn);
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const buttons = [...list.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.hidden);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
    e.preventDefault();
    next?.focus();
  });

  const card = h(
    'nav',
    { class: 'card w-menu', attrs: { 'aria-label': 'Menu chính' } },
    h(
      'div',
      { class: 'logo' },
      h('div', { class: 'logo-mark', attrs: { 'aria-hidden': 'true' }, text: '☕' }),
      h('div', {}, h('h1', { class: 'logo-title', text: 'Coffee Shop Tycoon 3D' }), h('p', { class: 'card-sub', text: 'Mở quán cà phê từ con số 0' })),
    ),
    list,
    h('div', { class: 'menu-foot' }, h('span', { text: 'Lưu trên trình duyệt này' }), h('span', { text: '↑ ↓ di chuyển · Enter chọn' })),
  );
  const el = screenLayer(card, { variant: 'menu', label: 'Menu chính' });

  function refresh(): void {
    const slots = listSlots(storage);
    const latest = latestSave(slots);
    continueSlot = latest?.slot ?? null;
    continueBtn.hidden = !latest;
    continueDetail.textContent = latest ? `${latest.shopName} · Ngày ${latest.day}` : '';
    // "Ván mới" is the main action until there is something to continue.
    newBtn.className = `btn ${latest ? 'btn-secondary' : 'btn-primary'} btn-lg btn-block`;
    const hasAny = slots.some((s) => !s.empty);
    setAriaDisabled(loadBtn, !hasAny);
    if (hasAny) loadBtn.removeAttribute('aria-describedby');
    else loadBtn.setAttribute('aria-describedby', reasonId);
    loadReason.hidden = hasAny;
  }

  return {
    el,
    onShow: refresh,
    initialFocus: () => (continueBtn.hidden ? newBtn : continueBtn),
  };
}
