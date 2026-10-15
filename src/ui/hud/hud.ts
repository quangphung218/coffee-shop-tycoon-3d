import { MAX_SHOP_LEVEL, levelDef, xpToReach } from '../../sim/data/levels';
import type { Command, GameState, Phase } from '../../sim/types';
import { h, setChildren, Watcher } from '../core/dom';
import { formatClock, formatMoney, formatRating } from '../core/format';
import { LEVEL_ICON, PHASE_ICONS } from '../core/iconMap';
import { icon, type IconId, type IconSize } from '../core/icons';
import { listPanels, onPanelsChanged, type PanelHandle } from './panels';

export interface HudActions {
  dispatch(cmd: Command): boolean;
  getState(): GameState | null;
  onPause(): void;
  onSettings(): void;
  onResetCamera(): void;
}

export interface Hud {
  /** The HUD layer: status bar on top and the panel dock at the bottom. */
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

const SPEED_ICONS: Record<(typeof HUD_SPEEDS)[number], IconId> = { 1: 'i-speed-1', 2: 'i-speed-2', 4: 'i-speed-4' };

/** Count-up length when money rises, if --duration-count cannot be read. */
const COUNT_FALLBACK_MS = 400;

const PHASE_STEPS: readonly { phase: Phase; label: string }[] = [
  { phase: 'preparation', label: 'Chuẩn bị' },
  { phase: 'opening', label: 'Mở cửa' },
  { phase: 'peak', label: 'Cao điểm' },
  { phase: 'closing', label: 'Đóng cửa' },
];

const PHASE_ORDER: Record<Phase, number> = { preparation: 0, opening: 1, peak: 2, closing: 3, report: 4 };

export function phaseLabel(phase: Phase): string {
  return phase === 'report' ? 'Tổng kết' : (PHASE_STEPS.find((s) => s.phase === phase)?.label ?? phase);
}

interface Note {
  icon: IconId;
  text: string;
}

function noteFor(state: GameState): Note | null {
  switch (state.phase) {
    case 'preparation':
      return { icon: 'i-clock', text: 'Đồng hồ dừng ở 07:00 cho tới khi bấm "Mở cửa".' };
    case 'closing':
      return { icon: 'i-error', text: `Không nhận khách mới. Còn ${state.customers.length} khách trong quán; ngày kết thúc khi khách cuối rời đi.` };
    case 'report': {
      const r = state.lastReport;
      if (!r) return { icon: 'i-chart', text: `Hết ngày ${state.day}.` };
      const result = r.profit >= 0 ? `Lãi +${formatMoney(r.profit)}` : `Lỗ ${formatMoney(r.profit)}`;
      return { icon: r.profit >= 0 ? 'i-trend-up' : 'i-trend-down', text: `Hết ngày ${r.day}: ${result} · phục vụ ${r.customersServed}/${r.customersArrived} khách.` };
    }
    default:
      return null;
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** --duration-count in ms; 0 under reduced motion (tokens.css also zeroes it there). */
function countDuration(el: Element): number {
  if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') return 0;
  const raw = getComputedStyle(el).getPropertyValue('--duration-count').trim();
  if (!raw) return COUNT_FALLBACK_MS;
  const ms = raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
  return Number.isFinite(ms) ? ms : COUNT_FALLBACK_MS;
}

/**
 * HUD after design/t237-cartoon (HUD cao điểm) and design/p17-states: cream
 * pills over the scene. Left: day, time, the four phases. Right: money, rating,
 * the phase action ("Mở cửa" / "Sang ngày mới") or the speed group, pause,
 * camera, settings. The panel buttons sit in a dock at the bottom centre.
 */
export function createHud(actions: HudActions): Hud {
  const w = new Watcher<GameState>();

  const day = h('b');
  const clock = h('b');
  w.text(day, (s) => String(s.day)).text(clock, (s) => formatClock(s.minute));

  // Shop level chip with an XP bar, next to the day (design/p20 §5). The bar is
  // a progressbar reporting XP earned toward the next level; it flashes on a
  // level-up (muted when motion is reduced).
  const levelName = h('b', { class: 'level-name' });
  const xpFill = h('span', { class: 'xp-fill' });
  const xpBar = h(
    'div',
    { class: 'xp', attrs: { role: 'progressbar', 'aria-label': 'Kinh nghiệm cấp quán', 'aria-valuemin': '0' } },
    xpFill,
  );
  const levelChip = h(
    'div',
    { class: 'hud-stat hud-level', attrs: { 'data-stat': 'level' } },
    icon(LEVEL_ICON),
    h('div', { class: 'level-body' }, levelName, xpBar),
  );
  let levelTimer: ReturnType<typeof setTimeout> | null = null;
  let shownLevel: number | null = null;
  function flashLevel(): void {
    if (prefersReducedMotion()) return;
    levelChip.classList.remove('is-level-up');
    void levelChip.offsetWidth; // restart the animation
    levelChip.classList.add('is-level-up');
    if (levelTimer) clearTimeout(levelTimer);
    levelTimer = setTimeout(() => levelChip.classList.remove('is-level-up'), 1200);
  }
  w.watch(
    (s) => `${s.shopLevel}|${s.xp}`,
    (_, s) => {
      const level = s.shopLevel;
      const def = levelDef(level);
      levelName.textContent = `Cấp ${level} · ${def.name}`;
      const atMax = level >= MAX_SHOP_LEVEL;
      const base = xpToReach(level);
      const span = atMax ? 1 : xpToReach(level + 1) - base;
      const into = Math.max(0, Math.min(span, s.xp - base));
      const frac = atMax ? 1 : span > 0 ? into / span : 1;
      xpFill.style.width = `${Math.round(frac * 100)}%`;
      xpBar.setAttribute('aria-valuemax', String(atMax ? 1 : span));
      xpBar.setAttribute('aria-valuenow', String(atMax ? 1 : into));
      xpBar.setAttribute('aria-valuetext', atMax ? 'Cấp tối đa' : `${into}/${span} KN tới Cấp ${level + 1}`);
      if (shownLevel !== null && level > shownLevel) flashLevel();
      shownLevel = level;
    },
  );

  const phaseItems = PHASE_STEPS.map((step, i) => {
    const mark = h('span', { class: 'ph-icon' });
    const count = h('span', { class: 'phase-count', text: `${i + 1}/${PHASE_STEPS.length}` });
    const li = h('li', { attrs: { 'data-phase': step.phase } }, mark, h('span', { class: 'ph-label', text: step.label }), count);
    return { step, li, mark };
  });
  w.watch(
    (s) => s.phase,
    (phase) => {
      const current = PHASE_ORDER[phase];
      for (const { step, li, mark } of phaseItems) {
        const order = PHASE_ORDER[step.phase];
        const active = step.phase === phase;
        if (active) li.setAttribute('aria-current', 'step');
        else li.removeAttribute('aria-current');
        li.classList.toggle('is-peak', step.phase === 'peak');
        li.classList.toggle('is-done', order < current);
        const size: IconSize = active ? 24 : 16;
        setChildren(mark, icon(order < current ? 'i-check' : PHASE_ICONS[step.phase], { size }));
      }
    },
  );

  // Money counts up when it rises; drops and the first value are shown at once.
  const money = h('b', { attrs: { 'data-stat': 'money' } });
  let shownMoney: number | null = null;
  let countFrame = 0;
  function showMoney(value: number): void {
    if (countFrame) cancelAnimationFrame(countFrame);
    countFrame = 0;
    const from = shownMoney;
    shownMoney = value;
    const duration = from === null || value <= from ? 0 : countDuration(money);
    if (duration <= 0 || from === null) {
      money.textContent = formatMoney(value);
      return;
    }
    let start: number | null = null;
    const tick = (now: number): void => {
      start ??= now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      money.textContent = formatMoney(Math.round(from + (value - from) * eased));
      countFrame = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    countFrame = requestAnimationFrame(tick);
  }
  w.watch((s) => s.money, showMoney);

  const ratingValue = h('b', { attrs: { role: 'img' } });
  w.watch(
    (s) => formatRating(s.rating),
    (r) => {
      ratingValue.textContent = r;
      ratingValue.setAttribute('aria-label', `${r} trên 5 sao`);
    },
  );

  const speedButtons = HUD_SPEEDS.map((speed) =>
    h(
      'button',
      {
        attrs: { type: 'button', 'aria-pressed': 'false', 'aria-label': `Tốc độ ${speed}x`, 'data-speed': speed },
        on: { click: () => actions.dispatch({ type: 'set_speed', speed }) },
      },
      icon(SPEED_ICONS[speed]),
      h('span', { text: `${speed}x` }),
    ),
  );
  const speedGroup = h('div', { class: 'seg speed', attrs: { role: 'group', 'aria-label': 'Tốc độ game' } }, ...speedButtons);
  w.watch(
    (s) => s.speed,
    (speed) => speedButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(HUD_SPEEDS[i] === speed))),
  );
  const pauseBtn = h(
    'button',
    { class: 'hud-btn', attrs: { type: 'button', 'aria-label': 'Tạm dừng (Space)', 'data-action': 'pause' }, on: { click: () => actions.onPause() } },
    icon('i-pause'),
    h('span', { class: 'lbl-long', text: 'Dừng' }),
  );
  const openBtn = h(
    'button',
    { class: 'hud-btn hud-btn-cta is-mint', attrs: { type: 'button', 'data-action': 'open' }, on: { click: () => actions.dispatch({ type: 'start_day' }) } },
    icon('i-open'),
    'Mở cửa',
  );
  const nextDayBtn = h(
    'button',
    { class: 'hud-btn hud-btn-cta is-honey', attrs: { type: 'button', 'data-action': 'next-day' }, on: { click: () => actions.dispatch({ type: 'next_day' }) } },
    icon('i-next-day'),
    'Sang ngày mới',
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

  // After a reset the button shows a tick and "Đã đặt lại" for a moment, and a
  // polite live region says it in words; both go back afterwards.
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  const resetLive = h('span', { class: 'sr-only', attrs: { 'aria-live': 'polite', 'data-live': 'camera' } });
  const resetBtn = h('button', {
    class: 'hud-btn',
    attrs: { type: 'button', 'aria-label': 'Đặt lại camera (Home)' },
    on: {
      click: () => {
        actions.onResetCamera();
        setChildren(resetBtn, icon('i-check'), h('span', { text: 'Đã đặt lại', attrs: { 'aria-hidden': 'true' } }));
        resetLive.textContent = 'Đã đặt lại camera.';
        if (resetTimer) clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          setChildren(resetBtn, icon('i-camera'));
          resetLive.textContent = '';
        }, 1500);
      },
    },
  });
  setChildren(resetBtn, icon('i-camera'));
  const settingsBtn = h(
    'button',
    { class: 'hud-btn', attrs: { type: 'button', 'aria-label': 'Cài đặt' }, on: { click: () => actions.onSettings() } },
    icon('i-settings'),
  );

  const note = h('p', { class: 'hud-note', attrs: { 'aria-live': 'polite' } });
  w.watch(
    (s) => {
      const n = noteFor(s);
      return n ? `${n.icon}|${n.text}` : '';
    },
    (_, s) => {
      const n = noteFor(s);
      if (n) setChildren(note, icon(n.icon), h('span', { text: n.text }));
      else note.replaceChildren();
      note.hidden = !n;
    },
  );

  // Panels registered by other modules, as dock buttons.
  const dock = h('nav', { class: 'dock', attrs: { 'aria-label': 'Bảng quản lý' } });
  const panelIcon = h('span', { class: 'panel-head-icon' });
  const panelTitle = h('h2');
  const panelBody = h('div', { class: 'panel-body' });
  const panelEl = h(
    'aside',
    { class: 'panel', hidden: true, attrs: { 'aria-label': 'Bảng quản lý' } },
    h(
      'div',
      { class: 'panel-head' },
      panelIcon,
      panelTitle,
      h('button', { class: 'icon-btn', attrs: { type: 'button', 'aria-label': 'Đóng bảng (Esc)' }, on: { click: () => closePanel() } }, icon('i-close'), 'Đóng'),
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

  function dockButton(id: string): HTMLElement | null {
    return [...dock.querySelectorAll<HTMLElement>('[data-panel]')].find((b) => b.dataset.panel === id) ?? null;
  }

  // Badge counts per dock button; rebuilt with the dock, run every frame.
  let dockWatch = new Watcher<GameState>();
  function renderDock(): void {
    dockWatch = new Watcher<GameState>();
    const items: HTMLElement[] = [];
    let prevGroup: string | undefined;
    for (const p of listPanels()) {
      // A thin divider marks where the group changes (Vận hành | Phát triển).
      if (items.length && p.group && prevGroup && p.group !== prevGroup) {
        items.push(h('span', { class: 'dock-sep', attrs: { role: 'separator', 'aria-orientation': 'vertical', 'aria-hidden': 'true' } }));
      }
      if (p.group) prevGroup = p.group;
      const btn = h(
        'button',
        {
          class: 'dock-btn',
          attrs: { type: 'button', 'aria-pressed': String(p.id === openId), 'aria-controls': 'ui-panel', 'data-panel': p.id },
          on: { click: (e) => (openId === p.id ? closePanel() : openPanel(p.id, e.currentTarget as HTMLElement)) },
        },
        icon(p.icon, { size: 32 }),
        h('span', { text: p.label }),
      );
      const count = p.badge;
      if (count) {
        // The number is drawn for the eye; the name says it in words.
        const spoken = h('span', { class: 'sr-only' });
        const badge = h('span', { class: 'dock-badge', hidden: true, attrs: { 'aria-hidden': 'true' } });
        btn.append(spoken, badge);
        dockWatch.watch(count, (n) => {
          badge.textContent = n > 0 ? String(n) : '';
          badge.hidden = n <= 0;
          spoken.textContent = n > 0 ? `, ${n} mục cần chú ý` : '';
        });
      }
      items.push(btn);
    }
    setChildren(dock, ...items);
    const state = actions.getState();
    if (state) dockWatch.run(state);
  }
  // Buttons stay in place while panels open and close, so focus can return to them.
  function syncPressed(): void {
    for (const b of dock.querySelectorAll<HTMLElement>('[data-panel]')) b.setAttribute('aria-pressed', String(b.dataset.panel === openId));
  }
  panelEl.id = 'ui-panel';

  function closePanel(): void {
    if (openId === null) return;
    const closed = openId;
    handle?.dispose?.();
    handle = null;
    openId = null;
    panelBody.replaceChildren();
    panelEl.hidden = true;
    syncPressed();
    // The dock may have been rebuilt while the panel was open; fall back to its current button.
    const back = opener?.isConnected ? opener : opener?.dataset.panel ? dockButton(closed) : null;
    back?.focus();
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
    setChildren(panelIcon, icon(def.icon, { size: 32 }));
    panelTitle.textContent = def.label;
    measureEdges();
    panelEl.hidden = false;
    handle = def.render(panelBody, { dispatch: actions.dispatch, getState: actions.getState, close: closePanel }) ?? null;
    syncPressed();
    panelEl.scrollTop = 0;
    panelBody.scrollTop = 0;
    // The head stays in view: focusing the first control must not scroll it away.
    panelBody.querySelector<HTMLElement>('button, input, select, [tabindex]')?.focus({ preventScroll: true });
  }

  const offPanels = onPanelsChanged(() => {
    if (openId !== null && !listPanels().some((p) => p.id === openId)) closePanel();
    renderDock();
  });
  renderDock();

  const pill = (...children: (Node | string)[]): HTMLElement => h('div', { class: 'hud-stat' }, ...children);
  const bar = h(
    'header',
    { class: 'hud', attrs: { 'aria-label': 'Thanh trạng thái' } },
    h(
      'div',
      { class: 'hud-left' },
      pill(h('small', { text: 'Ngày' }), day),
      levelChip,
      pill(icon('i-clock'), h('small', { text: 'Giờ' }), clock),
      h('ol', { class: 'phases', attrs: { 'aria-label': 'Pha trong ngày' } }, ...phaseItems.map((p) => p.li)),
    ),
    h(
      'div',
      { class: 'hud-right' },
      pill(icon('i-coin'), h('small', { text: 'Tiền' }), money),
      pill(icon('i-star'), ratingValue),
      openBtn,
      nextDayBtn,
      speedGroup,
      pauseBtn,
      resetBtn,
      settingsBtn,
    ),
    note,
    resetLive,
  );
  const el = h('div', { class: 'hud-layer', hidden: true }, bar, dock);

  // The panel sits between the HUD and the dock (ui.css): --hud-h is the HUD's
  // bottom edge from the top of #ui, --dock-h the dock's top edge from its
  // bottom. Re-measured whenever either one changes size (wrapping, the note).
  function measureEdges(): void {
    const host = el.parentElement;
    if (!host || el.hidden) return;
    const box = host.getBoundingClientRect();
    const hudH = Math.max(0, Math.ceil(bar.getBoundingClientRect().bottom - box.top));
    const dockH = Math.max(0, Math.ceil(box.bottom - dock.getBoundingClientRect().top));
    host.style.setProperty('--hud-h', `${hudH}px`);
    host.style.setProperty('--dock-h', `${dockH}px`);
  }
  const edges = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measureEdges()) : null;
  edges?.observe(bar);
  edges?.observe(dock);

  return {
    el,
    panelEl,
    update(state) {
      w.run(state);
      dockWatch.run(state);
      handle?.update?.(state);
    },
    openPanel: (id) => openPanel(id),
    closePanel,
    get openPanelId() {
      return openId;
    },
    dispose() {
      offPanels();
      edges?.disconnect();
      closePanel();
      if (resetTimer) clearTimeout(resetTimer);
      if (levelTimer) clearTimeout(levelTimer);
      if (countFrame) cancelAnimationFrame(countFrame);
    },
  };
}
