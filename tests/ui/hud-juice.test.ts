// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '../../src/sim/state';
import type { GameState } from '../../src/sim/types';
import { createHud, MONEY_BOUNCE_GAP_MS, MONEY_BOUNCE_MS } from '../../src/ui/hud/hud';

let animate: ReturnType<typeof vi.fn>;
let now = 0;

beforeEach(() => {
  now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  animate = vi.fn();
  (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
});

afterEach(() => {
  delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  document.body.replaceChildren();
  document.documentElement.classList.remove('reduce-motion');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(money: number) {
  const state: GameState = createNewGame('Quán Thử', 'normal', 1);
  state.money = money;
  const hud = createHud({ dispatch: () => true, getState: () => state, onPause() {}, onSettings() {}, onResetCamera() {} });
  document.body.append(hud.el);
  hud.update(state);
  const moneyEl = hud.el.querySelector<HTMLElement>('b[data-stat=money]')!;
  return {
    moneyEl,
    set(value: number) {
      state.money = value;
      hud.update(state);
    },
  };
}

/** Calls of animate() made on the money element. */
function bounces(el: HTMLElement): unknown[][] {
  return animate.mock.calls.filter((_, i) => animate.mock.contexts[i] === el);
}

describe('HUD money bounce', () => {
  it('does not bounce on the first value', () => {
    const { moneyEl } = mount(500_000);
    expect(bounces(moneyEl)).toHaveLength(0);
  });

  it('bounces once (scale only, 220 ms) when money rises', () => {
    const { moneyEl, set } = mount(500_000);
    set(525_000);
    const calls = bounces(moneyEl);
    expect(calls).toHaveLength(1);
    const [frames, opts] = calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(frames.map((f) => f.transform)).toEqual(['scale(1)', 'scale(1.12)', 'scale(1)']);
    expect(frames.every((f) => Object.keys(f).join() === 'transform')).toBe(true);
    expect(opts.duration).toBe(MONEY_BOUNCE_MS);
  });

  it('merges two rises within 300 ms into one bounce, and bounces again after', () => {
    const { moneyEl, set } = mount(500_000);
    set(510_000);
    now += MONEY_BOUNCE_GAP_MS - 1;
    set(520_000);
    expect(bounces(moneyEl)).toHaveLength(1);
    now += 1;
    set(530_000);
    expect(bounces(moneyEl)).toHaveLength(2);
  });

  it('does not bounce when money drops or stays', () => {
    const { moneyEl, set } = mount(500_000);
    set(480_000);
    set(480_000);
    expect(bounces(moneyEl)).toHaveLength(0);
  });

  it('does not bounce under html.reduce-motion', () => {
    document.documentElement.classList.add('reduce-motion');
    const { moneyEl, set } = mount(500_000);
    set(525_000);
    expect(bounces(moneyEl)).toHaveLength(0);
  });

  it('does not bounce under prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduced-motion'), addEventListener() {}, removeEventListener() {} }));
    const { moneyEl, set } = mount(500_000);
    set(525_000);
    expect(bounces(moneyEl)).toHaveLength(0);
  });

  it('keeps the money text and adds no CSS for the bounce', () => {
    const { moneyEl, set } = mount(500_000);
    set(525_000);
    expect(moneyEl.textContent).not.toBe('');
    expect(readFileSync('src/ui/styles/ui.css', 'utf8')).not.toMatch(/money-bounce/);
  });
});
