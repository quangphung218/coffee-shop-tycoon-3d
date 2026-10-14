import { listSlots, type SaveSlot, type SlotInfo } from '../../save/save';
import type { StorageLike } from '../../save/storage';
import { VERSION_LABEL } from '../../version';
import { h, isAriaDisabled, setAriaDisabled, uid } from '../core/dom';
import { icon } from '../core/icons';
import { screenLayer, type Screen } from '../core/screens';

/** Cup mascot from design/t237-cartoon (#mascot); the #boot screen in index.html draws the same cup. */
const MASCOT_SVG =
  '<svg class="logo-mark" viewBox="0 0 96 96" aria-hidden="true" focusable="false">' +
  '<path class="m-ln m-steam" d="M34 24c-5-5 5-8 0-14M48 22c-5-5 5-8 0-14M62 24c-5-5 5-8 0-14"/>' +
  '<ellipse class="m-saucer m-o" cx="46" cy="84" rx="38" ry="8"/>' +
  '<path class="m-ln" d="M72 44h6a10 10 0 0 1 0 20h-8"/>' +
  '<path class="m-cup m-o" d="M18 36h56v20a28 28 0 0 1-56 0z"/>' +
  '<ellipse class="m-coffee m-o" cx="46" cy="36" rx="28" ry="7"/>' +
  '<circle class="m-ink" cx="36" cy="55" r="4"/><circle class="m-ink" cx="56" cy="55" r="4"/>' +
  '<circle class="m-cheek" cx="28" cy="63" r="4.5"/><circle class="m-cheek" cx="64" cy="63" r="4.5"/>' +
  '<path class="m-ln" d="M40 63q6 7 12 0"/>' +
  '</svg>';

/** Decorative cup mascot for the logo. */
export function mascot(): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = MASCOT_SVG;
  return t.content.firstElementChild as SVGSVGElement;
}

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
    icon('i-speed-1'),
    'Tiếp tục',
    continueDetail,
  );
  const newBtn = h('button', { class: 'btn btn-lg btn-block', attrs: { type: 'button' }, on: { click: () => actions.onNewGame() } }, icon('i-sparkle'), 'Ván mới');
  const loadBtn = h(
    'button',
    {
      class: 'btn btn-secondary btn-lg btn-block',
      attrs: { type: 'button', 'data-action': 'load' },
      on: { click: () => !isAriaDisabled(loadBtn) && actions.onLoad() },
    },
    icon('i-load'),
    'Tải game',
  );
  const loadReason = h('p', { class: 'reason', id: reasonId }, icon('i-lock', { size: 16 }), 'Chưa có bản lưu nào. Chơi hết ngày 1 để game tự lưu.');
  const settingsBtn = h(
    'button',
    { class: 'btn btn-secondary btn-lg btn-block', attrs: { type: 'button' }, on: { click: () => actions.onSettings() } },
    icon('i-settings'),
    'Cài đặt',
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
      mascot(),
      h('div', {}, h('h1', { class: 'logo-title', text: 'Coffee Shop Tycoon 3D' }), h('p', { class: 'card-sub', text: 'Mở quán cà phê từ con số 0' })),
    ),
    list,
    h(
      'div',
      { class: 'menu-foot' },
      h('span', { text: 'Lưu trên trình duyệt này' }),
      h('span', {}, h('kbd', { text: '↑' }), ' ', h('kbd', { text: '↓' }), ' di chuyển · ', h('kbd', { text: 'Enter' }), ' chọn'),
      h('span', { class: 'app-version', text: VERSION_LABEL }),
    ),
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
