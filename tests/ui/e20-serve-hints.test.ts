// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { commandForCustomer } from '../../src/render/actors/labels';
import { commandForHit } from '../../src/render/scene/picking';
import { saveGame } from '../../src/save/save';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { step } from '../../src/sim';
import { createNewGame } from '../../src/sim/state';
import { SERVE_HINT_KEY, SERVE_HINT_TEXT, type ServeHintTarget } from '../../src/ui/hud/serveHints';
import { ANGRY_HINT } from '../../src/ui/screens/game';
import { createShell, type Shell } from '../../src/ui/screens/shell';

const FRAME = 2 / 60;

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

function shownHint(root: HTMLElement): string | null {
  const el = root.querySelector<HTMLElement>('.serve-hint')!;
  return el.hidden ? null : el.textContent;
}

function frame(s: Shell): void {
  step(s.state!, FRAME);
  s.update();
  s.handleEvents(s.state!.events);
  s.state!.events = [];
}

function until(s: Shell, done: () => boolean, maxMinutes = 120): void {
  const end = s.state!.minute + maxMinutes;
  while (!done()) {
    expect(s.state!.minute).toBeLessThan(end);
    frame(s);
  }
}

function openShop(root: HTMLElement, s: Shell): void {
  s.hud.el.querySelector<HTMLButtonElement>('header.hud [data-action="open"]')!.click();
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Vẫn mở cửa')!.click();
  expect(s.state!.phase).not.toBe('preparation');
  s.handleEvents(s.state!.events);
  s.state!.events = [];
}

function loadSlot1(root: HTMLElement): void {
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Tiếp tục'))!.click();
}

describe('E-20 collect-payment and clean labels', () => {
  it('"Chạm để thu tiền" only over a table with cash, then "Chạm để dọn" over a dirty one', () => {
    const storage = createMemoryStorage();
    storage.setItem(SERVE_HINT_KEY, 'order,brew,serve');
    const located: ServeHintTarget[] = [];
    const { root, shell: s } = boot(storage, located);
    s.startGame(createNewGame('Quán Tiền', 'normal', 7));
    openShop(root, s);
    const [a, b] = s.state!.tables;
    expect(a && b).toBeTruthy();

    // No table has money: no collect label, even with dirty cups around.
    b!.trash = 1;
    s.update();
    expect(shownHint(root)).toBeNull();

    a!.cash = 30000;
    s.update();
    expect(shownHint(root)).toBe('Chạm để thu tiền');
    expect(SERVE_HINT_TEXT.collect).toBe('Chạm để thu tiền');
    expect(located.at(-1)).toEqual({ kind: 'table', id: a!.id });
    expect(s.dispatch(commandForHit(s.state!, { kind: 'table', tableId: a!.id })!)).toBe(true);
    s.update();
    expect(shownHint(root)).not.toBe('Chạm để thu tiền');

    // Collect done: the dirty table gets "Chạm để dọn".
    expect(shownHint(root)).toBe('Chạm để dọn');
    expect(located.at(-1)).toEqual({ kind: 'table', id: b!.id });
    expect(s.dispatch(commandForHit(s.state!, { kind: 'table', tableId: b!.id })!)).toBe(true);
    s.update();
    expect(shownHint(root)).toBeNull();
    expect(storage.getItem(SERVE_HINT_KEY)).toBe('order,brew,serve,collect,clean');

    // All done: money on a table later shows nothing.
    b!.cash = 10000;
    s.update();
    expect(shownHint(root)).toBeNull();
    expect(root.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('full day-1 run reaches the collect label after serving the first customer', () => {
    const storage = createMemoryStorage();
    const { root, shell: s } = boot(storage);
    s.startGame(createNewGame('Quán Đủ', 'normal', 7));
    openShop(root, s);
    until(s, () => shownHint(root) === SERVE_HINT_TEXT.order);
    const first = s.state!.customers.find((c) => c.state === 'queueing')!;
    s.dispatch(commandForCustomer(s.state!, first.id)!);
    until(s, () => shownHint(root) === SERVE_HINT_TEXT.brew);
    s.dispatch(commandForHit(s.state!, { kind: 'machine' })!);
    until(s, () => shownHint(root) === SERVE_HINT_TEXT.serve);
    s.dispatch(commandForCustomer(s.state!, first.id)!);
    until(s, () => shownHint(root) === SERVE_HINT_TEXT.collect, 180);
    expect(s.state!.tables.some((t) => t.cash > 0)).toBe(true);
  });
});

describe('E-20 labels survive a reload', () => {
  it('a day-1 save loaded again shows the next step not done yet', () => {
    const storage = createMemoryStorage();
    saveGame(createNewGame('Quán Tải', 'normal', 7), '1', storage);
    const { root, shell: s } = boot(storage);
    loadSlot1(root);
    expect(s.state!.shopName).toBe('Quán Tải');
    openShop(root, s);
    until(s, () => shownHint(root) !== null);
    expect(shownHint(root)).toBe(SERVE_HINT_TEXT.order);
  });

  it('steps done before the reload stay done', () => {
    const storage = createMemoryStorage();
    storage.setItem(SERVE_HINT_KEY, 'order,brew,serve');
    const game = createNewGame('Quán Nhớ', 'normal', 7);
    game.phase = 'opening';
    game.tables[0]!.cash = 20000;
    saveGame(game, '1', storage);
    const { root, shell: s } = boot(storage);
    loadSlot1(root);
    expect(s.state!.phase).toBe('opening');
    s.update();
    expect(shownHint(root)).toBe(SERVE_HINT_TEXT.collect);
  });
});

describe('E-20 day-1 walkout toast fold', () => {
  function angryToasts(s: Shell): string[] {
    return [...s.toasts.el.querySelectorAll('.toast')].map((t) => t.textContent ?? '').filter((t) => t.includes('Khách bỏ đi'));
  }

  it('day 1: one toast, then a small counter instead of more toasts', () => {
    const { root, shell: s } = boot(createMemoryStorage());
    s.startGame(createNewGame('Quán Vắng', 'normal', 7));
    const counter = root.querySelector<HTMLElement>('.walkout-count')!;
    const dialogs = root.querySelectorAll('[role="dialog"], dialog').length;
    s.handleEvents([{ type: 'angry', customerId: 1 }]);
    s.update();
    expect(angryToasts(s)).toHaveLength(1);
    expect(angryToasts(s)[0]).toContain(ANGRY_HINT);
    expect(counter.hidden).toBe(true);

    s.toasts.clear();
    s.handleEvents([{ type: 'angry', customerId: 2 }]);
    s.handleEvents([{ type: 'angry', customerId: 3 }]);
    s.update();
    expect(angryToasts(s)).toHaveLength(0);
    expect(counter.hidden).toBe(false);
    expect(counter.textContent).toBe('Khách bỏ đi: 3');
    expect(counter.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
    // No modal opened for it.
    expect(root.querySelectorAll('[role="dialog"], dialog')).toHaveLength(dialogs);

    // Day 2: the counter goes, walkouts are toasts again.
    s.state!.day = 2;
    s.handleEvents([{ type: 'angry', customerId: 4 }]);
    s.update();
    expect(counter.hidden).toBe(true);
    expect(angryToasts(s)).toHaveLength(1);
  });

  it('a new run resets the counter', () => {
    const { root, shell: s } = boot(createMemoryStorage());
    s.startGame(createNewGame('Quán Một', 'normal', 7));
    s.handleEvents([{ type: 'angry', customerId: 1 }]);
    s.handleEvents([{ type: 'angry', customerId: 2 }]);
    s.update();
    const counter = root.querySelector<HTMLElement>('.walkout-count')!;
    expect(counter.hidden).toBe(false);
    s.startGame(createNewGame('Quán Hai', 'normal', 7));
    s.update();
    expect(counter.hidden).toBe(true);
    s.handleEvents([{ type: 'angry', customerId: 1 }]);
    expect(angryToasts(s)).toHaveLength(1);
  });
});
