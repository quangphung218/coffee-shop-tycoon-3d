// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import type { GameState, Phase } from '../../src/sim/types';
import { createHud, nextSpeed, phaseHours, type Hud } from '../../src/ui/hud/hud';

// Vitest stubs .css imports to '', so ui.css is read through a dynamically
// named node:fs import (as tests/ui/layout-overflow.test.ts).
const FS_MODULE = 'node:fs';
// jsdom gives import.meta.url no file: scheme, so the path is from the repo root (vitest's cwd).
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
/** Innermost `selector { body }` blocks of ui.css in source order, @media rules included. */
const UI_RULES = [
  ...readFileSync('src/ui/styles/ui.css', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/([^{}]+)\{([^{}]*)\}/g),
]
  .map((m) => ({ selector: m[1]!.trim(), body: m[2]!.trim() }))
  .filter((r) => !r.selector.startsWith('@') && !/^(from|to|\d+%)/.test(r.selector));

function decl(body: string, prop: string): string | undefined {
  return body.match(new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+)`))?.[1]?.trim();
}

/** ui.css rules whose selector matches `el` (selectors jsdom cannot parse are skipped). */
function rulesFor(el: Element): { selector: string; body: string }[] {
  return UI_RULES.filter((r) => {
    try {
      return el.matches(r.selector);
    } catch {
      return false;
    }
  });
}

/** Sizes at or above the 44 px touch target (tokens.css). */
const TARGET_SIZES = ['var(--size-target)', 'var(--size-hud-pill)', 'var(--size-target-lg)'];

function game(): GameState {
  return createNewGame('Quán Thử', 'normal', 42);
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

interface Mounted {
  hud: Hud;
  bar: HTMLElement;
  onSettings: ReturnType<typeof vi.fn>;
  onResetCamera: ReturnType<typeof vi.fn>;
}

let mounted: Hud | null = null;

function mountHud(state: GameState): Mounted {
  const onSettings = vi.fn();
  const onResetCamera = vi.fn();
  const hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings, onResetCamera });
  mounted = hud;
  document.body.append(hud.el, hud.panelEl);
  hud.el.hidden = false;
  hud.update(state);
  return { hud, bar: q(hud.el, 'header.hud'), onSettings, onResetCamera };
}

/** Visible text of an element: sr-only and aria-hidden parts dropped. */
function visibleText(el: Element): string {
  let out = '';
  for (const node of el.childNodes) {
    if (node instanceof Element) {
      if (node.classList.contains('sr-only') || node.getAttribute('aria-hidden') === 'true') continue;
      out += visibleText(node);
    } else out += node.textContent ?? '';
  }
  return out;
}

afterEach(() => {
  mounted?.dispose();
  mounted = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('HUD clusters (P23)', () => {
  it('has exactly three clusters: Hôm nay, Tiến độ, Điều khiển', () => {
    const { bar } = mountHud(game());
    const clusters = [...bar.querySelectorAll<HTMLElement>(':scope > .hud-cluster')];
    expect(clusters).toHaveLength(3);
    expect(clusters.map((c) => c.dataset.cluster)).toEqual(['today', 'progress', 'controls']);
    expect(clusters.map((c) => c.getAttribute('aria-label'))).toEqual(['Hôm nay', 'Tiến độ', 'Điều khiển']);
    for (const c of clusters) expect(c.getAttribute('role')).toBe('group');
    // Nothing else in the bar draws a frame: only the note and the live region sit beside the clusters.
    const others = [...bar.children].filter((c) => !c.classList.contains('hud-cluster'));
    expect(others.map((c) => c.className)).toEqual(['hud-note', 'sr-only']);
  });

  it('puts each value in its cluster', () => {
    const { bar } = mountHud(game());
    const today = q(bar, '[data-cluster="today"]');
    const progress = q(bar, '[data-cluster="progress"]');
    const controls = q(bar, '[data-cluster="controls"]');
    for (const sel of ['[data-stat="day"]', '[data-stat="week"]', '[data-chip="weather"]', '[data-stat="clock"]', 'ol.phases']) {
      expect(today.querySelector(sel), sel).toBeTruthy();
    }
    for (const sel of ['[data-stat="money"]', '[role="img"][aria-label$="trên 5 sao"]', '[data-stat="level"]']) {
      expect(progress.querySelector(sel), sel).toBeTruthy();
    }
    for (const sel of ['[data-action="open"]', '[data-action="next-day"]', '.speed', '[data-action="pause"]', '[data-action="more"]']) {
      expect(controls.querySelector(sel), sel).toBeTruthy();
    }
  });

  it('drops the "Tiền" and "Giờ" captions for icons, keeping the words for a screen reader', () => {
    const { bar } = mountHud(game());
    expect(bar.querySelector('small:not([data-stat])')).toBeNull();
    for (const [stat, word, iconId] of [
      ['money', 'Tiền', 'i-coin'],
      ['clock', 'Giờ', 'i-clock'],
    ] as const) {
      const val = q(bar, `[data-stat="${stat}"]`).parentElement!;
      expect(visibleText(val)).not.toContain(word);
      expect(q(val, '.sr-only').textContent).toBe(`${word} `);
      expect(val.title).toBe(word);
      expect(q(val, '.ic').dataset.icon).toBe(iconId);
    }
  });

  it.each<Phase>(['preparation', 'peak', 'closing', 'report'])('names every button in the %s phase', (phase) => {
    const state = game();
    state.phase = phase;
    const { bar } = mountHud(state);
    for (const b of bar.querySelectorAll<HTMLButtonElement>('button')) {
      const name = b.getAttribute('aria-label') ?? visibleText(b).trim();
      expect(name, b.outerHTML).toBeTruthy();
      // An icon-only button must carry an aria-label.
      if (!visibleText(b).trim()) expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
    }
  });

  it('keeps the aria-labels of the icon controls', () => {
    const { bar } = mountHud(game());
    const labels = [...bar.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'));
    for (const label of ['Tạm dừng (Space)', 'Camera và cài đặt', 'Đặt lại camera (Home)', 'Cài đặt', 'Tốc độ game', 'Tốc độ 1x', 'Tốc độ 2x', 'Tốc độ 4x', 'Pha trong ngày', 'Kinh nghiệm cấp quán']) {
      expect(labels, label).toContain(label);
    }
    expect(q(bar, '[data-action="open"]').title).toContain('07:00');
  });

  it('lists the four phases with their hours from the sim clock, the current one marked', () => {
    const state = game();
    state.phase = 'peak';
    state.minute = 12 * 60;
    const { bar } = mountHud(state);
    const list = q(bar, 'ol.phases');
    expect(list.getAttribute('aria-label')).toBe('Pha trong ngày');
    const items = [...list.querySelectorAll<HTMLElement>('li')];
    expect(items.map((li) => q(li, '.ph-hours').textContent)).toEqual([
      'Đồng hồ dừng ở 07:00 tới khi mở cửa',
      '07:00–11:00, 13:00–17:00, 19:00–20:00',
      '11:00–13:00, 17:00–19:00',
      'Từ 20:00 tới khi khách cuối rời đi',
    ]);
    expect(items.map((li) => visibleText(q(li, '.ph-name')))).toEqual(['Chuẩn bị', 'Mở cửa', 'Cao điểm', 'Đóng cửa']);
    expect(items.filter((li) => li.getAttribute('aria-current') === 'step').map((li) => li.dataset.phase)).toEqual(['peak']);
    // "· bây giờ" marks the current one in words, not colour alone.
    expect(items.map((li) => !q(li, '.ph-now').hidden)).toEqual([false, false, true, false]);
    expect(phaseHours('report')).toBe('');
  });

  it('shows the current phase as one flat pill with its name, and no dots', () => {
    const state = game();
    state.phase = 'peak';
    state.minute = 12 * 60;
    const { bar } = mountHud(state);
    const today = q(bar, '[data-cluster="today"]');
    // The list stays closed until the pill is pressed: no step is drawn as a dot.
    const shownItems = [...today.querySelectorAll('li')].filter((li) => !li.closest('[hidden]'));
    expect(shownItems).toEqual([]);
    const pills = today.querySelectorAll<HTMLElement>('.phase-pill');
    expect(pills).toHaveLength(1);
    expect(pills[0]!.dataset.phase).toBe('peak');
    expect(pills[0]!.textContent).toBe('Cao điểm');
    expect(pills[0]!.getAttribute('aria-label')).toBe('Cao điểm, tới 13:00. Xem các pha trong ngày');
    expect(q(pills[0]!, '.ic').dataset.icon).toBe('i-flame');
    // Still a label: no elevation shadow, no visible border, no hover rule; only the focus ring.
    const pillRule = UI_RULES.find((r) => r.selector === '.phase-pill');
    expect(decl(pillRule!.body, 'box-shadow')).toBe('var(--label-shadow)');
    expect(decl(pillRule!.body, 'border')).toBe('var(--pill-inset) solid transparent');
    expect(decl(pillRule!.body, 'background-clip')).toBe('padding-box');
    expect(decl(UI_RULES.find((r) => r.selector === '.phase-pill:focus-visible')!.body, 'border-color')).toBe('transparent');
    expect(UI_RULES.filter((r) => r.selector.includes('.phase-pill:hover'))).toEqual([]);
    expect(UI_RULES.some((r) => r.selector.split(',').map((s) => s.trim()).includes('.phase-pill:focus-visible'))).toBe(true);
  });

  it.each<[Phase, number, string]>([
    ['peak', 12 * 60 + 50, 'tới 13:00'],
    ['peak', 17 * 60, 'tới 19:00'],
    ['opening', 7 * 60, 'tới 11:00'],
    ['opening', 15 * 60, 'tới 17:00'],
    ['opening', 19 * 60 + 30, 'tới 20:00'],
  ])('says when %s at minute %i ends: "%s"', (phase, minute, next) => {
    const state = game();
    state.phase = phase;
    state.minute = minute;
    const { bar } = mountHud(state);
    const el = q(bar, '[data-stat="phase-next"]');
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe(next);
  });

  it.each<[Phase, string]>([
    ['preparation', 'Chuẩn bị'],
    ['closing', 'Đóng cửa'],
    ['report', 'Tổng kết'],
  ])('shows no next change in %s', (phase, name) => {
    const state = game();
    state.phase = phase;
    state.minute = phase === 'preparation' ? 7 * 60 : 20 * 60 + 30;
    const { bar } = mountHud(state);
    expect(q(bar, '[data-stat="phase-next"]').hidden).toBe(true);
    expect(q(bar, '.phase-pill').textContent).toBe(name);
  });

  it('updates the pill and the next change as the clock moves', () => {
    const state = game();
    state.phase = 'opening';
    state.minute = 10 * 60 + 59;
    const { hud, bar } = mountHud(state);
    expect(q(bar, '[data-stat="phase-next"]').textContent).toBe('tới 11:00');
    state.phase = 'peak';
    state.minute = 11 * 60;
    hud.update(state);
    expect(q(bar, '.phase-pill').textContent).toBe('Cao điểm');
    expect(q(bar, '[data-stat="phase-next"]').textContent).toBe('tới 13:00');
  });

  it('keeps the pill alone from 480 px down', () => {
    const css = readFileSync('src/ui/styles/ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const block = css.slice(css.indexOf('@media (max-width: 480px)'));
    expect(block.slice(0, block.indexOf('}'))).toContain('.ph-next');
  });

  it('shows no note while preparing; the open button says why the clock waits', () => {
    const { bar } = mountHud(game());
    expect(q(bar, '.hud-note').hidden).toBe(true);
  });

  it('names an event in the title and aria-label; below 1440 px only its icon shows', () => {
    const state = game();
    const today = state.week!.plan.find((p) => p.day === 1)!;
    today.event = 'supplier_hike';
    const { bar } = mountHud(state);
    const chip = q(bar, '[data-chip="event"]');
    expect(chip.hidden).toBe(false);
    expect(q(chip, '.ic').dataset.icon).toBeTruthy();
    expect(chip.getAttribute('aria-label')).toMatch(/^Tăng giá nhập: /);
    expect(chip.title).toBe(chip.getAttribute('aria-label'));
    const word = q(chip, '.week-chip-label');
    const hiders = rulesFor(word).filter((r) => decl(r.body, 'display') === 'none');
    expect(hiders.length).toBeGreaterThan(0);
    const css = readFileSync('src/ui/styles/ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const block = css.slice(css.indexOf('@media (max-width: 1439px)'));
    expect(block.slice(0, block.indexOf('}')), 'hidden from 1439 px down').toContain('.week-chip-label');
  });
});

describe('HUD frames on the P24 scale', () => {
  it('gives the clusters one row height and the dock, menu and toast the same frame', () => {
    const rule = (sel: string): string => UI_RULES.find((r) => r.selector.split(',').map((s) => s.trim()).includes(sel))!.body;
    expect(decl(UI_RULES.find((r) => r.selector === '.hud-cluster')!.body, 'height')).toBe('var(--size-hud-row)');
    for (const sel of ['.hud-cluster', '.dock', '.hud-menu', '.toast']) {
      expect(decl(rule(sel), 'border'), sel).toBe('var(--size-frame-outline) solid var(--border-outline)');
      expect(decl(rule(sel), 'box-shadow'), sel).toBe('var(--frame-shadow)');
    }
    expect(decl(rule('.dock-btn'), 'min-height')).toBe('var(--size-control-lg)');
    expect(decl(rule('.dock-btn'), 'font-size')).toBe('var(--font-size-label)');
    expect(decl(rule('.hud-cluster b'), 'font-size')).toBe('var(--font-size-value)');
    expect(decl(rule('.hud-day small'), 'font-size')).toBe('var(--font-size-caption)');
    expect(decl(rule('.xp-num'), 'font-size')).toBe('var(--font-size-caption)');
  });
});

// P23 review: at 390 px the controls were squeezed to 36 px and the speed
// group showed one empty honey dot (a rule hid every span, icons included).
describe('HUD touch targets and speed control', () => {
  it.each<Phase>(['preparation', 'peak', 'report'])('sizes every %s button with a target token, never below 44 px', (phase) => {
    const state = game();
    state.phase = phase;
    const { bar } = mountHud(state);
    const buttons = [...bar.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons.some((b) => b.matches('.phase-pill'))).toBe(true);
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      const name = b.dataset.action ?? b.getAttribute('aria-label');
      const matched = rulesFor(b);
      // The 640 px rules come last, so each size a button ends up with is in this list.
      for (const prop of ['min-width', 'min-height']) {
        const values = matched.map((r) => decl(r.body, prop)).filter((v): v is string => v !== undefined);
        // Menu items are full-width rows with a word; every other control needs both sides.
        if (prop === 'min-height' || !b.matches('[role="menuitem"]')) expect(values.length, `${name} ${prop}`).toBeGreaterThan(0);
        for (const v of values) expect(TARGET_SIZES, `${name} ${prop}: ${v}`).toContain(v);
      }
    }
  });

  it('gives every speed option an icon, a visible "Nx" and an aria-label that no rule hides', () => {
    const state = game();
    state.phase = 'peak';
    const { bar } = mountHud(state);
    const hiders = UI_RULES.filter((r) => decl(r.body, 'display') === 'none');
    const hidden = (el: Element): string | undefined => hiders.find((r) => rulesFor(el).includes(r))?.selector;
    const options = [...bar.querySelectorAll<HTMLButtonElement>('.speed [data-speed]')];
    expect(options.map((b) => b.getAttribute('aria-label'))).toEqual(['Tốc độ 1x', 'Tốc độ 2x', 'Tốc độ 4x']);
    for (const b of [...options, q<HTMLButtonElement>(bar, '[data-action="speed-cycle"]')]) {
      const ic = q(b, '.ic');
      const label = q(b, ':scope > span:not(.ic)');
      expect(b.getAttribute('aria-label'), b.outerHTML).toBeTruthy();
      expect(ic.dataset.icon).toMatch(/^i-speed-/);
      expect(label.textContent).toMatch(/^\dx$/);
      expect(hidden(ic), `${b.outerHTML} icon`).toBeUndefined();
      expect(hidden(label), `${b.outerHTML} label`).toBeUndefined();
    }
  });

  it('hides the group and shows the cycling button from 640 px down, in the same grid cell', () => {
    const rule = (sel: string, prop: string): string[] => UI_RULES.filter((r) => r.selector.split(',').map((s) => s.trim()).includes(sel)).map((r) => decl(r.body, prop) ?? '');
    expect(rule('.hud-controls > .speed', 'display')).toContain('none');
    expect(rule('.hud-controls .speed-cycle', 'display')).toEqual(['none']);
    expect(rule('.hud-controls > .speed-cycle', 'display')).toContain('inline-flex');
    expect(rule('.hud-controls > .speed-cycle', 'grid-area')).toContain('main');
  });

  it('steps the cycling button 1x → 2x → 4x → 1x and names the current speed', () => {
    const state = game();
    state.phase = 'peak';
    const sent: number[] = [];
    const hud = createHud({
      dispatch: (cmd) => {
        if (cmd.type === 'set_speed') {
          sent.push(cmd.speed);
          state.speed = cmd.speed;
        }
        return true;
      },
      getState: () => state,
      onPause() {},
      onSettings() {},
      onResetCamera() {},
    });
    mounted = hud;
    document.body.append(hud.el);
    hud.update(state);
    const cycle = q<HTMLButtonElement>(hud.el, '[data-action="speed-cycle"]');
    expect(cycle.hidden).toBe(false);
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      seen.push(`${visibleText(cycle)}|${q(cycle, '.ic').dataset.icon}|${cycle.getAttribute('aria-label')}`);
      cycle.click();
      hud.update(state);
    }
    expect(sent).toEqual([2, 4, 1]);
    expect(seen).toEqual([
      '1x|i-speed-1|Tốc độ 1x, bấm để chuyển sang 2x',
      '2x|i-speed-2|Tốc độ 2x, bấm để chuyển sang 4x',
      '4x|i-speed-4|Tốc độ 4x, bấm để chuyển sang 1x',
    ]);
    expect(nextSpeed(3)).toBe(1);
  });

  it('marks the selected speed by its honey fill alone, no outline or shadow of its own', () => {
    for (const sel of ['.seg button[aria-pressed=\'true\']', '.hud-controls .hud-btn.speed-cycle']) {
      const rule = UI_RULES.find((r) => r.selector.split(',').map((s) => s.trim()).includes(sel));
      expect(decl(rule!.body, 'background'), sel).toBe('var(--accent-primary)');
      expect(decl(rule!.body, 'border-color'), sel).toBeUndefined();
      expect(decl(rule!.body, 'box-shadow'), sel).toBeUndefined();
    }
  });

  it('hides the cycling button with the group outside the open phases', () => {
    const { bar } = mountHud(game());
    expect(q(bar, '.speed').hidden).toBe(true);
    expect(q(bar, '[data-action="speed-cycle"]').hidden).toBe(true);
  });
});

describe('HUD phase pill', () => {
  function mountPeak(): { bar: HTMLElement; pill: HTMLButtonElement; list: HTMLElement } {
    const state = game();
    state.phase = 'peak';
    state.minute = 12 * 60;
    const { bar } = mountHud(state);
    return { bar, pill: q<HTMLButtonElement>(bar, '.phase-pill'), list: q(bar, 'ol.phases') };
  }
  const key = (el: Element, k: string): boolean => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

  it('is a focusable button that controls the closed phase list', () => {
    const { pill, list } = mountPeak();
    expect(pill.tagName).toBe('BUTTON');
    expect(pill.type).toBe('button');
    pill.focus();
    expect(document.activeElement).toBe(pill);
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    expect(pill.getAttribute('aria-controls')).toBe(list.id);
    expect(list.hidden).toBe(true);
    // A disclosure in place, not a modal.
    expect(document.querySelector('[role="dialog"], [aria-modal]')).toBeNull();
  });

  it('opens the four phases on Enter and closes on Esc without reaching the shell', () => {
    const { pill, list } = mountPeak();
    pill.focus();
    expect(key(pill, 'Enter')).toBe(false); // default prevented: no second toggle from a click
    expect(list.hidden).toBe(false);
    expect(pill.getAttribute('aria-expanded')).toBe('true');
    expect(list.querySelectorAll('li')).toHaveLength(4);

    const shell = vi.fn();
    window.addEventListener('keydown', shell);
    try {
      key(pill, 'Escape');
    } finally {
      window.removeEventListener('keydown', shell);
    }
    expect(shell).not.toHaveBeenCalled();
    expect(list.hidden).toBe(true);
    expect(pill.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(pill);
    // Closed, Esc goes on to the shell as before.
    const after = vi.fn();
    window.addEventListener('keydown', after);
    key(pill, 'Escape');
    window.removeEventListener('keydown', after);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('toggles on a press of the pill and closes on a press outside', () => {
    const { pill, list } = mountPeak();
    pill.click();
    expect(list.hidden).toBe(false);
    // A press inside the list keeps it open.
    q(list, 'li').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(list.hidden).toBe(false);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(list.hidden).toBe(true);
    pill.click();
    expect(list.hidden).toBe(false);
    pill.click();
    expect(list.hidden).toBe(true);
    expect(pill.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when focus leaves it and stops listening once disposed', () => {
    const { bar, pill, list } = mountPeak();
    pill.click();
    pill.focus();
    const other = q<HTMLButtonElement>(bar, '[data-action="pause"]');
    pill.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: other }));
    expect(list.hidden).toBe(true);
    pill.click();
    mounted!.dispose();
    mounted = null;
    expect(list.hidden).toBe(true);
  });

  it('is a 44 px button painted label-high, and stays on screen at 390 px', () => {
    expect(UI_RULES.filter((r) => r.selector.includes('.phase-pill::before'))).toEqual([]);
    const pill = UI_RULES.find((r) => r.selector === '.phase-pill')!.body;
    expect(decl(pill, 'min-height')).toBe('var(--size-target)');
    // The transparent inset leaves a --size-control-sm label inside the 44 px box.
    expect(decl(pill, '--pill-inset')).toBe('calc((var(--size-target) - var(--size-control-sm)) / 2)');
    expect(decl(pill, 'border-inline-width')).toBe('0');
    const list = UI_RULES.find((r) => r.selector === '.phases')!.body;
    expect(decl(list, 'max-width')).toBe('min(20rem, calc(100vw - 2 * var(--space-3)))');
    expect(decl(list, 'box-shadow')).toBe('var(--frame-shadow)');
    const css = readFileSync('src/ui/styles/ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const phone = css.slice(css.indexOf('@media (max-width: 640px)'));
    // From 640 px down the list hangs from the Hôm nay frame's left edge, not the pill.
    expect(phone).toMatch(/\.hud-phase\s*\{\s*position:\s*static;/);
    // The phone label is one icon high; negative margins keep the 44 px box from growing the row.
    const phonePill = [...phone.matchAll(/(?:^|[}\s])\.phase-pill\s*\{([^}]*)\}/g)].map((m) => m[1]!.trim()).find((body) => decl(body, 'margin-block'));
    expect(phonePill).toBeDefined();
    expect(decl(phonePill!, '--pill-inset')).toBe('calc((var(--size-target) - var(--size-icon-sm)) / 2)');
    expect(decl(phonePill!, 'margin-block')).toBe('calc(-1 * var(--pill-inset))');
    expect(decl(phonePill!, 'min-height')).toBeUndefined();
  });
});

describe('HUD camera and settings menu', () => {
  it('opens in place, moves with the arrows and closes on Esc without reaching the shell', () => {
    const { bar } = mountHud(game());
    const btn = q<HTMLButtonElement>(bar, '[data-action="more"]');
    const menu = q(bar, '[role="menu"]');
    expect(btn.getAttribute('aria-haspopup')).toBe('menu');
    expect(btn.getAttribute('aria-controls')).toBe(menu.id);
    expect(menu.hidden).toBe(true);
    expect(menu.closest('[data-cluster]')?.getAttribute('data-cluster')).toBe('controls');
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    btn.click();
    expect(menu.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual(['Đặt lại camera (Home)', 'Cài đặt']);
    expect(document.activeElement).toBe(items[0]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);

    const shell = vi.fn();
    window.addEventListener('keydown', shell);
    try {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } finally {
      window.removeEventListener('keydown', shell);
    }
    expect(shell).not.toHaveBeenCalled();
    expect(menu.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(btn);
  });

  it('opens settings and closes; resets the camera and stays open to show the tick', () => {
    const { bar, onSettings, onResetCamera } = mountHud(game());
    const btn = q<HTMLButtonElement>(bar, '[data-action="more"]');
    const menu = q(bar, '[role="menu"]');
    btn.click();
    q<HTMLButtonElement>(menu, '[aria-label="Đặt lại camera (Home)"]').click();
    expect(onResetCamera).toHaveBeenCalledTimes(1);
    expect(menu.hidden).toBe(false);
    q<HTMLButtonElement>(menu, '[aria-label="Cài đặt"]').click();
    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(menu.hidden).toBe(true);
  });

  it('closes on a click outside', () => {
    const { bar } = mountHud(game());
    const btn = q<HTMLButtonElement>(bar, '[data-action="more"]');
    const menu = q(bar, '[role="menu"]');
    btn.click();
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.hidden).toBe(true);
    // A click on the button itself toggles instead.
    btn.click();
    expect(menu.hidden).toBe(false);
    btn.click();
    expect(menu.hidden).toBe(true);
  });
});
