import { listSlotSummaries, type SaveSlot, type SlotInfo } from '../../save/slots';
import type { StorageLike } from '../../save/storage';
import { VERSION_LABEL } from '../../version';
import { h, isAriaDisabled, setAriaDisabled, uid } from '../core/dom';
import { icon } from '../core/icons';
import { SceneGate } from '../core/sceneGate';
import { screenLayer, type Screen } from '../core/screens';
import { localDateKey } from '../core/today';

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

/** Days in the daily gift cycle (GIFT_REWARDS in src/sim/data/retention.ts, not imported to keep the sim out of the main chunk). */
const GIFT_DAYS = 7;

/** Days since 1970-01-01 of a 'YYYY-MM-DD' key; NaN when it is not one. */
function dayNumber(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : NaN;
}

/**
 * Streak day of the daily gift the slot can claim on `today` ('YYYY-MM-DD'),
 * or null when it was claimed today or the clock went back (as giftPreview in
 * src/sim/retention.ts): the next day of the streak after yesterday's gift, else 1.
 */
export function pendingGiftDay(slot: SlotInfo, today: string): number | null {
  const now = dayNumber(today);
  if (Number.isNaN(now)) return null;
  const last = slot.giftLastDate ? dayNumber(slot.giftLastDate) : NaN;
  if (Number.isNaN(last)) return 1;
  if (now <= last) return null;
  return now === last + 1 ? ((slot.giftStreak ?? 0) % GIFT_DAYS) + 1 : 1;
}

/**
 * Main Menu: Tiếp tục (only with a save, with "Quà ngày N đang chờ" under it
 * while that save's daily gift is unclaimed today), Ván mới, Tải game, Cài đặt.
 * "Tải game" stays visible but aria-disabled with a reason when no slot holds
 * anything. ↑ ↓ move between the buttons.
 */
export function createMainMenu(storage: StorageLike, actions: MainMenuActions, scene: SceneGate = new SceneGate()): Screen {
  const reasonId = uid('r-noload');
  let continueSlot: SaveSlot | null = null;

  const continueDetail = h('span', { class: 'btn-sm-text' });
  const continueBtn = h(
    'button',
    {
      class: 'btn btn-primary btn-lg btn-block',
      attrs: { type: 'button' },
      on: { click: () => continueSlot && !isAriaDisabled(continueBtn) && actions.onContinue(continueSlot) },
    },
    icon('i-speed-1'),
    'Tiếp tục',
    continueDetail,
  );
  // Continuing drops straight into the shop, so it waits for the 3D scene.
  scene.bind(continueBtn);
  const giftId = uid('r-gift');
  const giftLine = h('p', { class: 'card-sub', id: giftId, attrs: { 'data-menu-line': 'gift' } });
  const continueRow = h('div', {}, continueBtn, giftLine);
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

  const list = h('div', { class: 'menu-list' }, continueRow, newBtn, h('div', {}, loadBtn, loadReason), settingsBtn);
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
    scene.statusLine(),
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
    const slots = listSlotSummaries(storage);
    const latest = latestSave(slots);
    continueSlot = latest?.slot ?? null;
    continueBtn.hidden = !latest;
    continueRow.hidden = !latest;
    continueDetail.textContent = latest ? `${latest.shopName} · Ngày ${latest.day}` : '';
    const gift = latest ? pendingGiftDay(latest, localDateKey()) : null;
    giftLine.textContent = gift === null ? '' : `Quà ngày ${gift} đang chờ`;
    giftLine.hidden = gift === null;
    if (gift === null) continueBtn.removeAttribute('aria-describedby');
    else continueBtn.setAttribute('aria-describedby', giftId);
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
