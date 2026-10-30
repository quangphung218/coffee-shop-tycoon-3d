// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { commandForCustomer } from '../../src/render/actors/labels';
import { commandForHit } from '../../src/render/scene/picking';
import { saveGame } from '../../src/save/save';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { step } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { SERVE_HINT_KEY, SERVE_HINT_TEXT, serveHintTarget, type ServeHintTarget } from '../../src/ui/hud/serveHints';
import type { PanelContext } from '../../src/ui/hud/panels';
import { renderTasksPanel } from '../../src/ui/panels/tasks';
import { ANGRY_HINT } from '../../src/ui/screens/game';
import { createShell, type Shell } from '../../src/ui/screens/shell';

/** Game minutes per real second at 1x (src/main.ts). */
const MINUTES_PER_SECOND = 2;
/** One 60 fps frame at 1x, in game minutes. */
const FRAME = MINUTES_PER_SECOND / 60;

let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
});

function boot(storage: StorageLike, located: ServeHintTarget[] = []): { root: HTMLElement; shell: Shell } {
  shell?.dispose();
  document.body.replaceChildren();
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({
    root,
    storage,
    seed: () => 7,
    locateHint: (t) => {
      located.push(t);
      return { x: 100, y: 200 };
    },
  });
  return { root, shell };
}

function hintEl(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>('.serve-hint')!;
}

/** Shown hint text, or null. */
function shownHint(root: HTMLElement): string | null {
  const el = hintEl(root);
  return el.hidden ? null : el.textContent;
}

/** One frame as main.ts runs it: step, UI refresh, events. */
function frame(s: Shell): void {
  step(s.state!, FRAME);
  s.update();
  s.handleEvents(s.state!.events);
  s.state!.events = [];
}

/** Runs frames until `done` holds; fails after `maxMinutes` game minutes. */
function until(s: Shell, done: () => boolean, maxMinutes = 120): void {
  const end = s.state!.minute + maxMinutes;
  while (!done()) {
    expect(s.state!.minute).toBeLessThan(end);
    frame(s);
  }
}

/** HUD "Mở cửa", then "Vẫn mở cửa" on the no-staff question. */
function openShop(root: HTMLElement, s: Shell): void {
  s.hud.el.querySelector<HTMLButtonElement>('header.hud [data-action="open"]')!.click();
  const confirm = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Vẫn mở cửa');
  expect(confirm).toBeDefined();
  confirm!.click();
  expect(s.state!.phase).not.toBe('preparation');
  s.handleEvents(s.state!.events);
  s.state!.events = [];
}

describe('E-15 day-1 serving hints', () => {
  it('new Normal game, no hires, Vẫn mở cửa: three labels in order, first customer served before 08:00', () => {
    const storage = createMemoryStorage();
    const located: ServeHintTarget[] = [];
    const { root, shell: s } = boot(storage, located);
    s.startGame(createNewGame('Quán Đầu', 'normal', 7));
    expect(s.state!.staff).toHaveLength(0);
    s.update();
    expect(shownHint(root)).toBeNull();
    openShop(root, s);
    // The sim brings the first customer into line about 6 s after opening (src/sim unchanged).
    until(s, () => s.state!.customers.some((c) => c.state === 'queueing'));
    const inLine = s.state!.minute;

    // 1. "Chạm để nhận order" over the first customer in line, within 5 s of real time at 1x.
    until(s, () => shownHint(root) !== null);
    expect((s.state!.minute - inLine) / MINUTES_PER_SECOND).toBeLessThanOrEqual(5);
    expect(shownHint(root)).toBe(SERVE_HINT_TEXT.order);
    const first = s.state!.customers.find((c) => c.state === 'queueing')!;
    expect(located.at(-1)).toEqual({ kind: 'customer', id: first.id });
    expect(hintEl(root).style.left).toBe('100px');
    expect(hintEl(root).getAttribute('aria-hidden')).toBeNull();
    expect(s.dispatch(commandForCustomer(s.state!, first.id)!)).toBe(true);
    s.update();
    expect(shownHint(root)).toBeNull();

    // 2. "Chạm để pha" on the counter once the order is taken.
    until(s, () => shownHint(root) !== null);
    expect(shownHint(root)).toBe(SERVE_HINT_TEXT.brew);
    expect(located.at(-1)).toEqual({ kind: 'machine' });
    expect(s.dispatch(commandForHit(s.state!, { kind: 'machine' })!)).toBe(true);
    s.update();
    expect(shownHint(root)).toBeNull();

    // 3. "Chạm để bưng" over the customer once the drink is ready.
    until(s, () => shownHint(root) !== null);
    expect(shownHint(root)).toBe(SERVE_HINT_TEXT.serve);
    expect(located.at(-1)).toEqual({ kind: 'customer', id: first.id });
    expect(s.dispatch(commandForCustomer(s.state!, first.id)!)).toBe(true);
    s.update();
    expect(shownHint(root)).toBeNull();

    until(s, () => s.state!.today.customersServed > 0);
    expect(s.state!.minute).toBeLessThan(8 * 60);
    expect(storage.getItem(SERVE_HINT_KEY)).toBe('order,brew,serve');
  });

  it('a step is done only after its own tap; it waits for its target', () => {
    const storage = createMemoryStorage();
    const { root, shell: s } = boot(storage);
    s.startGame(createNewGame('Quán Chờ', 'normal', 7));
    openShop(root, s);
    until(s, () => shownHint(root) !== null);
    // Brewing is not possible yet: no order. The label stays on the customer.
    expect(serveHintTarget(s.state!, 'brew')).toBeNull();
    for (let i = 0; i < 30; i++) frame(s);
    expect(shownHint(root)).toBe(SERVE_HINT_TEXT.order);
    expect(storage.getItem(SERVE_HINT_KEY)).toBeNull();
  });

  it('day 2 shows no label', () => {
    const { root, shell: s } = boot(createMemoryStorage());
    const game = createNewGame('Quán Hai', 'normal', 7);
    game.day = 2;
    s.startGame(game);
    openShop(root, s);
    until(s, () => s.state!.customers.some((c) => c.state === 'queueing'));
    for (let i = 0; i < 60; i++) frame(s);
    expect(shownHint(root)).toBeNull();
  });

  it('a loaded day-2 save shows no label', () => {
    const storage = createMemoryStorage();
    const old = createNewGame('Quán Cũ', 'normal', 7);
    old.day = 2;
    saveGame(old, '1', storage);
    const { root, shell: s } = boot(storage);
    [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Tiếp tục'))!.click();
    expect(s.state!.shopName).toBe('Quán Cũ');
    openShop(root, s);
    until(s, () => s.state!.customers.some((c) => c.state === 'queueing'));
    for (let i = 0; i < 60; i++) frame(s);
    expect(shownHint(root)).toBeNull();
  });

  it('a hired barista means no label', () => {
    const { root, shell: s } = boot(createMemoryStorage());
    const game = createNewGame('Quán Thuê', 'normal', 7);
    s.startGame(game);
    expect(s.dispatch({ type: 'hire_staff', candidateId: game.candidates[0]!.id, role: 'barista' })).toBe(true);
    s.hud.el.querySelector<HTMLButtonElement>('header.hud [data-action="open"]')!.click();
    until(s, () => s.state!.customers.some((c) => c.state === 'queueing'));
    for (let i = 0; i < 60; i++) frame(s);
    expect(shownHint(root)).toBeNull();
  });
});

describe('E-15 first Khách bỏ đi toast', () => {
  it('adds the tap-or-hire line to the first one only', () => {
    const { shell: s } = boot(createMemoryStorage());
    // Day 2: on day 1 the later walkouts fold into a counter (E-20).
    const game = createNewGame('Quán Giận', 'normal', 7);
    game.day = 2;
    s.startGame(game);
    const texts = (): string[] => [...s.toasts.el.querySelectorAll('.toast')].map((t) => t.textContent ?? '');
    s.handleEvents([{ type: 'angry', customerId: 1 }]);
    expect(texts().filter((t) => t.includes(ANGRY_HINT))).toHaveLength(1);
    s.toasts.clear();
    s.handleEvents([{ type: 'angry', customerId: 2 }]);
    expect(texts()).toHaveLength(1);
    expect(texts()[0]).toContain('Khách bỏ đi');
    expect(texts()[0]).not.toContain(ANGRY_HINT);
    expect(ANGRY_HINT).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('E-15 day-1 Việc panel order', () => {
  function sections(state: GameState): string[] {
    const root = document.createElement('div');
    document.body.append(root);
    const ctx: PanelContext = { dispatch: () => true, getState: () => state, close: () => {} };
    const panel = renderTasksPanel(root, ctx);
    const order = (): string[] =>
      [...root.querySelector('.prep')!.children]
        .map((el): string | null => (el.matches('.gift') ? 'gift' : el.matches('[aria-label="Việc trong ngày"]') ? 'checklist' : el.textContent?.startsWith('Mục tiêu tuần') ? 'goal' : null))
        .filter((x): x is string => x !== null);
    const first = order();
    state.day = 2;
    panel.update?.(state);
    return [...first, '|', ...order()];
  }

  it('day 1: checklist on top, Quà and Mục tiêu tuần below; day 2: back to Quà first', () => {
    expect(sections(createNewGame('Quán Việc', 'normal', 7))).toEqual(['checklist', 'gift', 'goal', '|', 'gift', 'goal', 'checklist']);
  });
});
