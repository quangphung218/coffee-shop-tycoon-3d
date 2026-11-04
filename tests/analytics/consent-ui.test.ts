// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveGame, slotConsent } from '../../src/save/save';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { createNewGame } from '../../src/sim/state';
import { createAnalytics, type AnalyticsEnv } from '../../src/ui/analytics';
import { CONSENT_NO, CONSENT_QUESTION, CONSENT_YES } from '../../src/ui/report';
import { CONSENT_HINT, CONSENT_LABEL } from '../../src/ui/screens/settings';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay } from '../integration/helpers';

/** Mocked goatcounter: no script is loaded and nothing leaves the test. */
function fakeEnv() {
  const count = vi.fn();
  const env: AnalyticsEnv = {
    document: { createElement: () => ({ setAttribute() {} }), head: { appendChild() {} } } as unknown as AnalyticsEnv['document'],
    window: { goatcounter: { count } },
  };
  const paths = (): string[] => count.mock.calls.map((c) => (c[0] as { path: string }).path);
  return { env, paths };
}

const EMOJI = /\p{Extended_Pictographic}/u;

describe('consent strip and Settings toggle (E-23 T-81)', () => {
  let shell: Shell | null = null;
  afterEach(() => {
    shell?.dispose();
    shell = null;
    document.body.innerHTML = '';
  });

  function mount(storage = createMemoryStorage()) {
    const f = fakeEnv();
    const a = createAnalytics(() => f.env);
    const root = document.createElement('div');
    document.body.appendChild(root);
    shell = createShell({ root, storage, settings: { ...DEFAULT_SETTINGS }, seed: () => 7, analytics: a });
    return { f, a, storage, root, shell };
  }

  /** A new run played to the day-1 report. */
  function toDayOneReport(s: Shell): void {
    s.startGame(createNewGame('Test', 'normal', 7));
    s.handleEvents(playDay(s.state!));
    s.update();
  }

  const strip = (root: HTMLElement) => root.querySelector<HTMLElement>('.rpt-layer [data-consent]')!;

  it('is an inline footer row (no dialog of its own) with the question and two buttons, no emoji', () => {
    const { root, shell: s } = mount();
    toDayOneReport(s);
    expect(s.report.visible).toBe(true);
    const el = strip(root);
    expect(el.hidden).toBe(false);
    expect(el.closest('.rpt-foot')).not.toBeNull();
    expect(el.querySelector('[role="dialog"]')).toBeNull();
    expect(el.getAttribute('role')).toBe('group');
    expect(el.textContent).toContain(CONSENT_QUESTION);
    expect(CONSENT_QUESTION).toBe('Gửi số liệu ẩn danh để cải thiện game?');
    expect(el.querySelector('[data-action="consent-yes"]')!.textContent).toBe('Đồng ý');
    expect(el.querySelector('[data-action="consent-no"]')!.textContent).toBe('Không');
    expect([CONSENT_YES, CONSENT_NO]).toEqual(['Đồng ý', 'Không']);
    expect(EMOJI.test(el.textContent!)).toBe(false);
  });

  it('never blocks play: Ngày tiếp theo works without an answer', () => {
    const { root, a, shell: s } = mount();
    toDayOneReport(s);
    root.querySelector<HTMLElement>('.rpt-layer [data-action="next-day"]')!.click();
    expect(s.state!.day).toBe(2);
    s.update();
    expect(s.report.visible).toBe(false);
    expect(a.consent()).toBe('unasked');
  });

  it('Đồng ý applies yes, counts the session, saves at once and hides the strip for good', () => {
    const { root, a, f, storage, shell: s } = mount();
    toDayOneReport(s);
    expect(slotConsent('auto', storage)).toBe('unasked');
    strip(root).querySelector<HTMLElement>('[data-action="consent-yes"]')!.click();
    expect(a.consent()).toBe('yes');
    expect(f.paths()).toContain('/session-start');
    expect(slotConsent('auto', storage)).toBe('yes');
    expect(strip(root).hidden).toBe(true);
    s.update();
    expect(strip(root).hidden).toBe(true);
    expect(document.activeElement?.getAttribute('data-action')).toBe('next-day');
  });

  it('Không applies no and saves it; nothing is counted', () => {
    const { root, a, f, storage, shell: s } = mount();
    toDayOneReport(s);
    strip(root).querySelector<HTMLElement>('[data-action="consent-no"]')!.click();
    expect(a.consent()).toBe('no');
    expect(slotConsent('auto', storage)).toBe('no');
    expect(f.paths()).toEqual([]);
    expect(strip(root).hidden).toBe(true);
  });

  it('is not shown once a choice is saved, nor on reports after day 1', () => {
    const storage = createMemoryStorage();
    saveGame(createNewGame('Test', 'normal', 1), 'auto', storage, 1, 'no');
    const asked = mount(storage);
    toDayOneReport(asked.shell);
    expect(asked.shell.report.visible).toBe(true);
    expect(strip(asked.root).hidden).toBe(true);
    shell!.dispose();
    document.body.innerHTML = '';

    const fresh = mount();
    toDayOneReport(fresh.shell);
    fresh.shell.dispatch({ type: 'next_day' });
    fresh.shell.handleEvents(playDay(fresh.shell.state!));
    fresh.shell.update();
    expect(fresh.shell.report.visible).toBe(true);
    expect(fresh.shell.state!.lastReport?.day).toBe(2);
    expect(strip(fresh.root).hidden).toBe(true);
  });

  it('Settings has a toggle that shows and changes the choice and saves it into the running game', () => {
    const { root, a, storage, shell: s } = mount();
    toDayOneReport(s);
    strip(root).querySelector<HTMLElement>('[data-action="consent-yes"]')!.click();
    s.openPause();
    [...root.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes('Cài đặt') && !b.closest('[hidden]'))!.click();
    expect(s.screen).toBe('settings');
    const radios = [...root.querySelectorAll<HTMLInputElement>('input[data-setting="analyticsConsent"]')];
    expect(radios.map((r) => r.value)).toEqual(['yes', 'no']);
    const row = radios[0]!.closest('.set-row')!;
    expect(row.textContent).toContain(CONSENT_LABEL);
    expect(row.textContent).toContain(CONSENT_HINT);
    expect(EMOJI.test(row.textContent!)).toBe(false);
    expect(radios[0]!.checked).toBe(true);

    radios[1]!.checked = true;
    radios[1]!.dispatchEvent(new Event('change'));
    expect(a.consent()).toBe('no');
    expect(slotConsent('auto', storage)).toBe('no');
  });

  it('Settings on the main menu applies the choice to the session; neither option is checked while unasked', () => {
    const { root, a } = mount();
    const radios = [...root.querySelectorAll<HTMLInputElement>('input[data-setting="analyticsConsent"]')];
    expect(radios).toHaveLength(2);
    expect(radios.some((r) => r.checked)).toBe(false);
    radios[0]!.checked = true;
    radios[0]!.dispatchEvent(new Event('change'));
    expect(a.consent()).toBe('yes');
  });

  it('a choice made this session is not overridden by a loaded slot and is written at its next save', () => {
    const storage = createMemoryStorage();
    saveGame(createNewGame('Test', 'normal', 1), '1', storage, 1, 'no');
    const { root, a, shell: s } = mount(storage);
    toDayOneReport(s);
    strip(root).querySelector<HTMLElement>('[data-action="consent-yes"]')!.click();
    s.startGame(createNewGame('Test', 'normal', 1), '1');
    expect(a.consent()).toBe('yes');
  });
});
