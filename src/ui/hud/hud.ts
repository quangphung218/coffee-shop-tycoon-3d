import type { Command, GameState, Phase } from '../../sim/types';
import { h, setChildren, Watcher } from '../core/dom';
import { formatClock, formatMoney, formatRating } from '../core/format';
import { listPanels, onPanelsChanged, type PanelHandle } from './panels';

export interface HudActions {
  dispatch(cmd: Command): boolean;
  getState(): GameState | null;
  onPause(): void;
  onSettings(): void;
  onResetCamera(): void;
}

export interface Hud {
  /** The status bar. */
  readonly el: HTMLElement;
  /** Side panel host. */
  readonly panelEl: HTMLElement;
  /** Updates the bar and the open panel; touches the DOM only where values changed. */
  update(state: GameState): void;
  openPanel(id: string): void;
  closePanel(): void;
  readonly openPanelId: string | null;
  dispose(): void;
}

export const HUD_SPEEDS = [1, 2, 4] as const;

const PHASE_STEPS: readonly { phase: Phase; label: string; icon: string }[] = [
  { phase: 'preparation', label: 'Chuẩn bị', icon: '🧺' },
  { phase: 'opening', label: 'Mở cửa', icon: '🚪' },
  { phase: 'peak', label: 'Cao điểm', icon: '🔥' },
  { phase: 'closing', label: 'Đóng cửa', icon: '🌙' },
];

const PHASE_ORDER: Record<Phase, number> = { preparation: 0, opening: 1, peak: 2, closing: 3, report: 4 };

export function phaseLabel(phase: Phase): string {
  return phase === 'report' ? 'Tổng kết' : (PHASE_STEPS.find((s) => s.phase === phase)?.label ?? phase);
}

function noteFor(state: GameState): string {
  switch (state.phase) {
    case 'preparation':
      return '🕖 Đồng hồ dừng ở 07:00 cho tới khi bấm "Mở cửa".';
    case 'closing':
      return `🚫 Không nhận khách mới. Còn ${state.customers.length} khách trong quán; ngày kết thúc khi khách cuối rời đi.`;
    case 'report': {
      const r = state.lastReport;
      if (!r) return `📋 Hết ngày ${state.day}.`;
      const result = r.profit >= 0 ? `▲ Lãi +${formatMoney(r.profit)}` : `▼ Lỗ ${formatMoney(r.profit)}`;
      return `📋 Hết ngày ${r.day}: ${result} · phục vụ ${r.customersServed}/${r.customersArrived} khách.`;
    }
    default:
      return '';
  }
}

/**
 * Top status bar after design/hud.html: day and time, the four phases (peak
 * highlighted), money and rating, then the pace controls. In preparation the
 * speed buttons give way to "Mở cửa"; in the report phase to "Sang ngày mới".
 */
export function createHud(actions: HudActions): Hud {
  const w = new Watcher<GameState>();

  const day = h('b');
  const clock = h('b');
  w.text(day, (s) => String(s.day)).text(clock, (s) => formatClock(s.minute));

  const phaseItems = PHASE_STEPS.map((step, i) => {
    const count = h('span', { class: 'phase-count', text: `${i + 1}/${PHASE_STEPS.length}` });
    const label = h('span');
    const li = h('li', { attrs: { 'data-phase': step.phase } }, label, ' ', count);
    return { step, li, label };
  });
  w.watch(
    (s) => s.phase,
    (phase) => {
      const current = PHASE_ORDER[phase];
      for (const { step, li, label } of phaseItems) {
        const order = PHASE_ORDER[step.phase];
        const active = step.phase === phase;
        if (active) li.setAttribute('aria-current', 'step');
        else li.removeAttribute('aria-current');
        li.classList.toggle('is-peak', step.phase === 'peak');
        label.textContent = active ? `${step.icon} ${step.label}` : order < current ? `✓ ${step.label}` : step.label;
      }
    },
  );

  const money = h('b', { attrs: { 'data-stat': 'money' } });
  w.text(money, (s) => `💰 ${formatMoney(s.money)}`);
  const ratingValue = h('span');
  const rating = h('b', { attrs: { role: 'img' } }, h('span', { class: 'star', attrs: { 'aria-hidden': 'true' }, text: '★' }), ' ', ratingValue);
  w.watch(
    (s) => formatRating(s.rating),
    (r) => {
      ratingValue.textContent = r;
      rating.setAttribute('aria-label', `${r} trên 5 sao`);
    },
  );

  const speedButtons = HUD_SPEEDS.map((speed) =>
    h(
      'button',
      {
        class: 'hud-btn',
        attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': `Tốc độ ${speed}x`, 'data-speed': speed },
        on: { click: () => actions.dispatch({ type: 'set_speed', speed }) },
      },
      `${speed}x`,
    ),
  );
  const speedGroup = h('div', { class: 'speed', attrs: { role: 'group', 'aria-label': 'Tốc độ game' } }, ...speedButtons);
  w.watch(
    (s) => s.speed,
    (speed) => {
      speedButtons.forEach((b, i) => {
        const v = HUD_SPEEDS[i]!;
        b.setAttribute('aria-pressed', String(v === speed));
        b.textContent = v === speed ? `${'▶'.repeat(i + 1)} ${v}x` : `${v}x`;
      });
    },
  );
  const pauseBtn = h(
    'button',
    { class: 'hud-btn', attrs: { type: 'button', 'aria-label': 'Tạm dừng (Space)', 'data-action': 'pause' }, on: { click: () => actions.onPause() } },
    '⏸ ',
    h('span', { text: 'Dừng' }),
  );
  const openBtn = h(
    'button',
    { class: 'hud-btn hud-btn-cta', attrs: { type: 'button', 'data-action': 'open' }, on: { click: () => actions.dispatch({ type: 'start_day' }) } },
    '🔔 Mở cửa',
  );
  const nextDayBtn = h(
    'button',
    { class: 'hud-btn hud-btn-cta', attrs: { type: 'button', 'data-action': 'next-day' }, on: { click: () => actions.dispatch({ type: 'next_day' }) } },
    '☀️ Sang ngày mới',
  );
  w.watch(
    (s) => s.phase,
    (phase) => {
      const open = phase === 'opening' || phase === 'peak' || phase === 'closing';
      speedGroup.hidden = !open;
      openBtn.hidden = phase !== 'preparation';
      nextDayBtn.hidden = phase !== 'report';
    },
  );

  const resetLabel = h('span', { class: 'lbl-long', text: 'Đặt lại' });
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  const resetBtn = h(
    'button',
    {
      class: 'hud-btn',
      attrs: { type: 'button', 'aria-label': 'Đặt lại camera (Home)' },
      on: {
        click: () => {
          actions.onResetCamera();
          resetLabel.textContent = '✓ Đã đặt lại';
          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => (resetLabel.textContent = 'Đặt lại'), 1500);
        },
      },
    },
    '🎥 ',
    resetLabel,
    ' camera',
  );
  const settingsBtn = h(
    'button',
    { class: 'hud-btn', attrs: { type: 'button', 'aria-label': 'Cài đặt' }, on: { click: () => actions.onSettings() } },
    '⚙️ ',
    h('span', { class: 'lbl-long', text: 'Cài đặt' }),
  );

  const note = h('p', { class: 'hud-note', attrs: { 'aria-live': 'polite' } });
  w.text(note, noteFor);

  // Panels registered by other modules.
  const panelButtons = h('div', { class: 'hud-group', attrs: { role: 'group', 'aria-label': 'Bảng quản lý' } });
  const panelTitle = h('h2');
  const panelBody = h('div', { class: 'panel-body' });
  const panelEl = h(
    'aside',
    { class: 'panel', hidden: true, attrs: { 'aria-label': 'Bảng quản lý' } },
    h(
      'div',
      { class: 'panel-head' },
      panelTitle,
      h('button', { class: 'btn btn-secondary', attrs: { type: 'button', 'aria-label': 'Đóng bảng (Esc)' }, on: { click: () => closePanel() } }, '✕ Đóng'),
    ),
    panelBody,
  );
  panelEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
    }
  });
  let openId: string | null = null;
  let handle: PanelHandle | null = null;
  let opener: HTMLElement | null = null;

  function renderPanelButtons(): void {
    setChildren(
      panelButtons,
      ...listPanels().map((p) =>
        h(
          'button',
          {
            class: 'hud-btn',
            attrs: { type: 'button', 'aria-pressed': String(p.id === openId), 'aria-controls': 'ui-panel', 'data-panel': p.id },
            on: { click: (e) => (openId === p.id ? closePanel() : openPanel(p.id, e.currentTarget as HTMLElement)) },
          },
          p.label,
        ),
      ),
    );
  }
  panelEl.id = 'ui-panel';

  function closePanel(): void {
    if (openId === null) return;
    handle?.dispose?.();
    handle = null;
    openId = null;
    panelBody.replaceChildren();
    panelEl.hidden = true;
    renderPanelButtons();
    opener?.focus();
    opener = null;
  }

  function openPanel(id: string, from?: HTMLElement): void {
    const def = listPanels().find((p) => p.id === id);
    if (!def) return;
    if (openId !== null) {
      handle?.dispose?.();
      panelBody.replaceChildren();
    }
    openId = id;
    opener = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    panelTitle.textContent = def.label;
    panelEl.hidden = false;
    handle = def.render(panelBody, { dispatch: actions.dispatch, getState: actions.getState, close: closePanel }) ?? null;
    renderPanelButtons();
    panelBody.querySelector<HTMLElement>('button, input, select, [tabindex]')?.focus();
  }

  const offPanels = onPanelsChanged(() => {
    if (openId !== null && !listPanels().some((p) => p.id === openId)) closePanel();
    renderPanelButtons();
  });
  renderPanelButtons();

  const el = h(
    'header',
    { class: 'hud', hidden: true, attrs: { 'aria-label': 'Thanh trạng thái' } },
    h('div', { class: 'hud-group' }, h('div', { class: 'hud-stat' }, h('small', { text: 'Ngày' }), day), h('div', { class: 'hud-stat' }, h('small', { text: 'Giờ' }), clock)),
    h('ol', { class: 'phases', attrs: { 'aria-label': 'Pha trong ngày' } }, ...phaseItems.map((p) => p.li)),
    h('div', { class: 'hud-spacer' }),
    h('div', { class: 'hud-group' }, h('div', { class: 'hud-stat' }, h('small', { text: 'Tiền' }), money), h('div', { class: 'hud-stat' }, h('small', { text: 'Đánh giá' }), rating)),
    h('div', { class: 'hud-group' }, openBtn, nextDayBtn, speedGroup, pauseBtn, resetBtn, settingsBtn),
    panelButtons,
    note,
  );

  return {
    el,
    panelEl,
    update(state) {
      w.run(state);
      handle?.update?.(state);
    },
    openPanel: (id) => openPanel(id),
    closePanel,
    get openPanelId() {
      return openId;
    },
    dispose() {
      offPanels();
      closePanel();
      if (resetTimer) clearTimeout(resetTimer);
    },
  };
}
