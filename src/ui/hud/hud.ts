import { CLOSING_MINUTE, PEAK_WINDOWS } from '../../sim/clock';
import { WEATHER_ARRIVALS } from '../../sim/customers';
import { MAX_SHOP_LEVEL, levelDef, xpToReach } from '../../sim/data/levels';
import { DAY_EVENTS } from '../../sim/data/week';
import { weekDay, weekIndex } from '../../sim/progression';
import type { Command, DayEventId, GameState, Phase, Weather } from '../../sim/types';
import { todayPlan } from '../../sim/week';
import { h, setChildren, uid, Watcher, type Child } from '../core/dom';
import { formatClock, formatMoney, formatRating } from '../core/format';
import { DAY_EVENT_ICONS, LEVEL_ICON, PHASE_ICONS, WEATHER_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';
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

/** The speed after `speed` in HUD_SPEEDS, back to 1x after 4x (and from an unknown speed). */
export function nextSpeed(speed: number): number {
  const i = HUD_SPEEDS.findIndex((v) => v === speed);
  return HUD_SPEEDS[(i + 1) % HUD_SPEEDS.length]!;
}

/** Count-up length when money rises, if --duration-count cannot be read. */
const COUNT_FALLBACK_MS = 400;

const PHASE_STEPS: readonly { phase: Phase; label: string }[] = [
  { phase: 'preparation', label: 'Chuẩn bị' },
  { phase: 'opening', label: 'Mở cửa' },
  { phase: 'peak', label: 'Cao điểm' },
  { phase: 'closing', label: 'Đóng cửa' },
];

/**
 * Minute of the next phase change while open and before closing (the end or
 * start of a peak window, or closing time), from the sim clock; null otherwise.
 */
export function nextPhaseMinute(phase: Phase, minute: number): number | null {
  if (phase !== 'opening' && phase !== 'peak') return null;
  const marks = [...PEAK_WINDOWS.flat(), CLOSING_MINUTE].filter((m) => m > minute);
  return marks.length ? Math.min(...marks) : null;
}

export function phaseLabel(phase: Phase): string {
  return phase === 'report' ? 'Tổng kết' : (PHASE_STEPS.find((s) => s.phase === phase)?.label ?? phase);
}

export const WEATHER_LABELS: Readonly<Record<Weather, string>> = { sunny: 'Nắng', rainy: 'Mưa', hot: 'Nóng' };

/** Short event names for the HUD chip and the Task Board; DAY_EVENTS holds the long ones. */
export const DAY_EVENT_LABELS: Readonly<Record<DayEventId, string>> = {
  none: 'Ngày thường',
  grand_opening: 'Khai trương',
  fair: 'Hội chợ',
  supplier_hike: 'Tăng giá nhập',
};

/** A multiplier as a signed percent: 1.4 → "+40%", 0.75 → "-25%". */
function percent(mult: number): string {
  const p = Math.round((mult - 1) * 100);
  return p > 0 ? `+${p}%` : `${p}%`;
}

/** What the weather does to the day: "khách -25%, đồ nóng bán chạy". */
export function weatherEffect(weather: Weather): string {
  const mult = WEATHER_ARRIVALS[weather];
  const arrivals = mult === 1 ? 'khách như thường' : `khách ${percent(mult)}`;
  if (weather === 'rainy') return `${arrivals}, đồ nóng bán chạy`;
  if (weather === 'hot') return `${arrivals}, đồ lạnh bán chạy`;
  return arrivals;
}

/**
 * What a day event does: "lượt ghé tăng tới +40%", "giá nhập và giá vốn +25%";
 * '' for none. A boost raises walk-ins, not served customers (seats and
 * patience cap those), hence "tới".
 */
export function dayEventEffect(event: DayEventId): string {
  const def = DAY_EVENTS[event];
  const parts: string[] = [];
  if (def.arrivalMult > 1) parts.push(`lượt ghé tăng tới ${percent(def.arrivalMult)}`);
  else if (def.arrivalMult < 1) parts.push(`khách ${percent(def.arrivalMult)}`);
  if (def.ingredientPriceMult !== 1) parts.push(`giá nhập và giá vốn ${percent(def.ingredientPriceMult)}`);
  return parts.join(', ');
}

/** "3/7" while the game plays a week day; null for older saves and after the week. */
export function weekDayLabel(state: GameState): string | null {
  const day = weekDay(state);
  if (!state.week || day < 1 || day > state.week.length) return null;
  return `${day}/${state.week.length}`;
}

/** "Tuần 2 · 5/7" under the day number; null for older saves without a week. */
export function weekLineLabel(state: GameState): string | null {
  const day = weekDayLabel(state);
  return day ? `Tuần ${weekIndex(state)} · ${day}` : null;
}

/** The "Mở cửa" button's title: why the clock stands still before it. */
const OPEN_HINT = 'Đồng hồ dừng ở 07:00 cho tới khi bấm "Mở cửa".';

interface Note {
  icon: IconId;
  text: string;
}

function noteFor(state: GameState): Note | null {
  // Preparation has no note: the clock at 07:00 and "Mở cửa" (its title says why) tell it.
  switch (state.phase) {
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
 * HUD in three clusters over the scene (P23), each one cream frame:
 * Hôm nay (day, week line, weather and event, clock, phase pill), Tiến độ
 * (money, rating, level with its XP bar) and Điều khiển (the phase action
 * "Mở cửa" / "Sang ngày mới" or the speed group (one cycling button on a
 * phone), pause, and a menu with the
 * camera reset and settings). Values carry icons; their names are read from
 * sr-only words and titles. The panel buttons sit in a dock at the bottom centre.
 */
export function createHud(actions: HudActions): Hud {
  const w = new Watcher<GameState>();

  // "Ngày 12" over "Tuần 2 · 5/7"; older saves without a week show the day alone.
  const day = h('b', { attrs: { 'data-stat': 'day' } });
  const weekLine = h('small', { attrs: { 'data-stat': 'week' } });
  const clock = h('b', { attrs: { 'data-stat': 'clock' } });
  w.text(day, (s) => `Ngày ${s.day}`).text(clock, (s) => formatClock(s.minute));
  w.watch(
    (s) => weekLineLabel(s) ?? '',
    (line) => {
      weekLine.textContent = line;
      weekLine.hidden = !line;
    },
  );

  // Today's weather (an icon) and event (icon and word, only on a special
  // day), during a week. The title and accessible name say what they do;
  // below 1440 px the event shows its icon only (ui.css), as a word like
  // "Tăng giá nhập" pushed Điều khiển to a second row at 1280 px.
  const weatherChip = h('span', { class: 'week-chip', attrs: { role: 'img', 'data-chip': 'weather' } });
  const eventChip = h('span', { class: 'week-chip', attrs: { role: 'note', 'data-chip': 'event' } });
  const weekChips = h('span', { class: 'hud-week', hidden: true }, weatherChip, eventChip);
  const fillChip = (chip: HTMLElement, id: IconId, label: string, effect: string, word: boolean): void => {
    const desc = effect ? `${label}: ${effect}` : label;
    chip.title = desc;
    chip.setAttribute('aria-label', desc);
    setChildren(chip, icon(id), word ? h('span', { class: 'week-chip-label', text: label }) : null);
  };
  w.watch(
    (s) => {
      const plan = todayPlan(s);
      return plan && weekDayLabel(s) ? `${s.weather}|${plan.event}` : '';
    },
    (key, s) => {
      const plan = todayPlan(s);
      weekChips.hidden = !key || !plan;
      if (!key || !plan) return;
      fillChip(weatherChip, WEATHER_ICONS[s.weather], WEATHER_LABELS[s.weather], weatherEffect(s.weather), false);
      eventChip.hidden = plan.event === 'none';
      if (plan.event !== 'none') fillChip(eventChip, DAY_EVENT_ICONS[plan.event], DAY_EVENT_LABELS[plan.event], dayEventEffect(plan.event), true);
    },
  );

  // Shop level in the Tiến độ cluster (design/p20 §5): "Cấp N", a thin XP
  // bar and its count. The level's name ("Quán nhỏ") lives only in the
  // title and accessible name, so it stays short. The bar is a progressbar
  // reporting XP earned toward the next level; it flashes on a level-up
  // (muted when motion is reduced). Phones keep the number, not "Cấp".
  const levelName = h('b', { class: 'level-name' });
  const xpFill = h('span', { class: 'xp-fill' });
  const xpBar = h(
    'div',
    { class: 'xp', attrs: { role: 'progressbar', 'aria-label': 'Kinh nghiệm cấp quán', 'aria-valuemin': '0' } },
    xpFill,
  );
  // "320/500": XP into this level over the XP the level spans; the bar already says it to a screen reader.
  const xpNum = h('span', { class: 'xp-num', attrs: { 'aria-hidden': 'true', 'data-stat': 'xp' } });
  const levelChip = h(
    'div',
    { class: 'hud-level', attrs: { 'data-stat': 'level', role: 'group' } },
    icon(LEVEL_ICON),
    levelName,
    xpBar,
    xpNum,
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
      setChildren(levelName, h('span', { class: 'level-word', text: 'Cấp ' }), String(level));
      const fullName = `Cấp ${level} · ${def.name}`;
      levelChip.title = fullName;
      levelChip.setAttribute('aria-label', fullName);
      const atMax = level >= MAX_SHOP_LEVEL;
      const base = xpToReach(level);
      const span = atMax ? 1 : xpToReach(level + 1) - base;
      const into = Math.max(0, Math.min(span, s.xp - base));
      const frac = atMax ? 1 : span > 0 ? into / span : 1;
      xpFill.style.width = `${Math.round(frac * 100)}%`;
      xpBar.setAttribute('aria-valuemax', String(atMax ? 1 : span));
      xpBar.setAttribute('aria-valuenow', String(atMax ? 1 : into));
      const xpText = atMax ? 'Cấp tối đa' : `${into}/${span} KN tới Cấp ${level + 1}`;
      xpBar.setAttribute('aria-valuetext', xpText);
      xpBar.title = xpText;
      xpNum.textContent = atMax ? 'Tối đa' : `${into}/${span}`;
      if (shownLevel !== null && level > shownLevel) flashLevel();
      shownLevel = level;
    },
  );

  // The current phase as one flat pill (icon and name) and, while open before
  // closing, "tới 13:00" for the next change. The four phases sit in an
  // sr-only list (current one marked) and in the title.
  const phaseItems = PHASE_STEPS.map((step) => ({ step, li: h('li', { attrs: { 'data-phase': step.phase }, text: step.label }) }));
  const phaseList = h('ol', { class: 'phases sr-only', attrs: { 'aria-label': 'Pha trong ngày' } }, ...phaseItems.map((p) => p.li));
  const phasePill = h('span', { class: 'phase-pill', attrs: { 'aria-hidden': 'true' } });
  const phaseNext = h('small', { class: 'ph-next', attrs: { 'data-stat': 'phase-next' } });
  const phaseBox = h('span', { class: 'hud-phase' }, phaseList, phasePill, phaseNext);
  w.watch(
    (s) => `${s.phase}|${nextPhaseMinute(s.phase, s.minute) ?? ''}`,
    (_, s) => {
      const phase = s.phase;
      for (const { step, li } of phaseItems) {
        if (step.phase === phase) li.setAttribute('aria-current', 'step');
        else li.removeAttribute('aria-current');
      }
      phasePill.dataset.phase = phase;
      setChildren(phasePill, icon(PHASE_ICONS[phase]), h('span', { class: 'ph-label', text: phaseLabel(phase) }));
      const next = nextPhaseMinute(phase, s.minute);
      const nextText = next === null ? '' : `tới ${formatClock(next)}`;
      phaseNext.textContent = nextText;
      phaseNext.hidden = !nextText;
      const now = nextText ? `${phaseLabel(phase)}, ${nextText}` : phaseLabel(phase);
      phaseBox.title = `Pha trong ngày: ${PHASE_STEPS.map((p) => p.label).join(', ')}. Bây giờ: ${now}.`;
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
  // Phones (ui.css, 640 px down) show one button in place of the group: the
  // current speed's icon and "2x"; a press steps 1x → 2x → 4x → 1x.
  let shownSpeed: number = HUD_SPEEDS[0];
  const speedCycle = h('button', {
    class: 'hud-btn speed-cycle',
    attrs: { type: 'button', 'data-action': 'speed-cycle' },
    on: { click: () => actions.dispatch({ type: 'set_speed', speed: nextSpeed(shownSpeed) }) },
  });
  w.watch(
    (s) => s.speed,
    (speed) => {
      shownSpeed = speed;
      speedButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(HUD_SPEEDS[i] === speed)));
      const known = HUD_SPEEDS.find((v) => v === speed) ?? HUD_SPEEDS[0];
      speedCycle.dataset.current = String(speed);
      speedCycle.setAttribute('aria-label', `Tốc độ ${speed}x, bấm để chuyển sang ${nextSpeed(speed)}x`);
      setChildren(speedCycle, icon(SPEED_ICONS[known]), h('span', { text: `${speed}x` }));
    },
  );
  const pauseBtn = h(
    'button',
    { class: 'hud-btn', attrs: { type: 'button', 'aria-label': 'Tạm dừng (Space)', 'data-action': 'pause' }, on: { click: () => actions.onPause() } },
    icon('i-pause'),
    h('span', { class: 'lbl-long', text: 'Dừng' }),
  );
  const openBtn = h(
    'button',
    {
      class: 'hud-btn hud-btn-cta is-mint',
      attrs: { type: 'button', 'data-action': 'open', title: OPEN_HINT },
      on: { click: () => actions.dispatch({ type: 'start_day' }) },
    },
    icon('i-open'),
    'Mở cửa',
  );
  const nextDayBtn = h(
    'button',
    { class: 'hud-btn hud-btn-cta is-honey', attrs: { type: 'button', 'data-action': 'next-day' }, on: { click: () => actions.dispatch({ type: 'next_day' }) } },
    icon('i-next-day'),
    h('span', { text: 'Sang ngày' }),
    h('span', { class: 'lbl-long', text: ' mới' }),
  );
  w.watch(
    (s) => s.phase,
    (phase) => {
      const open = phase === 'opening' || phase === 'peak' || phase === 'closing';
      speedGroup.hidden = !open;
      speedCycle.hidden = !open;
      openBtn.hidden = phase !== 'preparation';
      nextDayBtn.hidden = phase !== 'report';
    },
  );

  // Camera reset and settings share one menu button (APG menu button): the
  // menu drops down in place, ↑ ↓ Home End move, Esc or a click outside
  // closes it and focus goes back to the button.
  const MENU_ID = uid('hud-menu');
  const menuBtn = h(
    'button',
    {
      class: 'hud-btn hud-menu-btn',
      attrs: {
        type: 'button',
        'aria-label': 'Camera và cài đặt',
        'aria-haspopup': 'menu',
        'aria-expanded': 'false',
        'aria-controls': MENU_ID,
        'data-action': 'more',
      },
    },
    icon('i-settings'),
    icon('i-chevron-down', { size: 16 }),
  );
  const menuItem = (label: string, ariaLabel: string, id: IconId, run: () => void): HTMLButtonElement => {
    const item = h('button', {
      class: 'hud-menu-item',
      attrs: { type: 'button', role: 'menuitem', tabindex: '-1', 'aria-label': ariaLabel },
      on: { click: run },
    });
    setChildren(item, icon(id), h('span', { text: label }));
    return item;
  };

  // After a reset the item shows a tick and "Đã đặt lại" for a moment (the
  // menu stays open so it can be seen), and a polite live region says it in
  // words; both go back afterwards.
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  const resetLive = h('span', { class: 'sr-only', attrs: { 'aria-live': 'polite', 'data-live': 'camera' } });
  const resetBtn = menuItem('Đặt lại camera', 'Đặt lại camera (Home)', 'i-camera', () => {
    actions.onResetCamera();
    setChildren(resetBtn, icon('i-check'), h('span', { text: 'Đã đặt lại', attrs: { 'aria-hidden': 'true' } }));
    resetLive.textContent = 'Đã đặt lại camera.';
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      setChildren(resetBtn, icon('i-camera'), h('span', { text: 'Đặt lại camera' }));
      resetLive.textContent = '';
    }, 1500);
  });
  const settingsBtn = menuItem('Cài đặt', 'Cài đặt', 'i-settings', () => {
    closeMenu(false);
    actions.onSettings();
  });
  const menuItems = [resetBtn, settingsBtn];
  const menu = h('div', { class: 'hud-menu', id: MENU_ID, hidden: true, attrs: { role: 'menu', 'aria-label': 'Camera và cài đặt' } }, ...menuItems);
  const menuWrap = h('div', { class: 'hud-menu-wrap' }, menuBtn, menu);

  function onOutside(e: PointerEvent): void {
    if (!(e.target instanceof Node) || !menuWrap.contains(e.target)) closeMenu(false);
  }
  function openMenu(focusIndex = 0): void {
    if (menu.hidden) {
      menu.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', onOutside, true);
    }
    menuItems[(focusIndex + menuItems.length) % menuItems.length]!.focus();
  }
  function closeMenu(refocus = true): void {
    if (menu.hidden) return;
    menu.hidden = true;
    menuBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    if (refocus) menuBtn.focus();
  }
  menuBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  menuBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu(e.key === 'ArrowUp' ? -1 : 0);
    }
  });
  menu.addEventListener('keydown', (e) => {
    const at = menuItems.indexOf(document.activeElement as HTMLButtonElement);
    switch (e.key) {
      case 'ArrowDown':
        openMenu(at + 1);
        break;
      case 'ArrowUp':
        openMenu(at - 1);
        break;
      case 'Home':
        openMenu(0);
        break;
      case 'End':
        openMenu(-1);
        break;
      case 'Escape':
        // Close only the menu; the shell would open the pause screen.
        e.stopPropagation();
        closeMenu();
        break;
      case 'Tab':
        closeMenu(false);
        return;
      default:
        return;
    }
    e.preventDefault();
  });
  menuWrap.addEventListener('focusout', (e) => {
    const next = (e as FocusEvent).relatedTarget;
    if (next instanceof Node && !menuWrap.contains(next)) closeMenu(false);
  });

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
        icon(p.icon),
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

  // An icon and a value; the sr-only word names the value for a screen reader.
  const value = (id: IconId, word: string, b: HTMLElement): HTMLElement =>
    h('span', { class: 'hud-val', attrs: { title: word } }, icon(id), h('span', { class: 'sr-only', text: `${word} ` }), b);
  const cluster = (name: string, label: string, ...children: Child[]): HTMLElement =>
    h('div', { class: `hud-cluster hud-${name}`, attrs: { role: 'group', 'aria-label': label, 'data-cluster': name } }, ...children);
  const bar = h(
    'header',
    { class: 'hud', attrs: { 'aria-label': 'Thanh trạng thái' } },
    cluster(
      'today',
      'Hôm nay',
      h('span', { class: 'hud-day' }, day, weekLine),
      weekChips,
      h(
        'span',
        { class: 'hud-time' },
        value('i-clock', 'Giờ', clock),
        phaseBox,
      ),
    ),
    cluster('progress', 'Tiến độ', value('i-coin', 'Tiền', money), value('i-star', 'Đánh giá', ratingValue), levelChip),
    cluster('controls', 'Điều khiển', openBtn, nextDayBtn, speedGroup, speedCycle, pauseBtn, menuWrap),
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
      closeMenu(false);
      closePanel();
      if (resetTimer) clearTimeout(resetTimer);
      if (levelTimer) clearTimeout(levelTimer);
      if (countFrame) cancelAnimationFrame(countFrame);
    },
  };
}
