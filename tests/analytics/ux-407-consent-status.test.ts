// @vitest-environment jsdom
// UX-407: the consent question says what is sent (no cookie, no name); after
// Đồng ý / Không a short status line replaces it and names where to change it
// (Cài đặt > Số liệu ẩn danh), and that Settings row reports a change. No new modal.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { createNewGame } from '../../src/sim/state';
import { createAnalytics, type AnalyticsEnv } from '../../src/ui/analytics';
import { CONSENT_DETAIL, CONSENT_DONE, CONSENT_QUESTION } from '../../src/ui/report';
import { CONSENT_HINT, CONSENT_LABEL, CONSENT_SAVED } from '../../src/ui/screens/settings';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay } from '../integration/helpers';

const EMOJI = /\p{Extended_Pictographic}/u;

function fakeEnv(): AnalyticsEnv {
  return {
    document: { createElement: () => ({ setAttribute() {} }), head: { appendChild() {} } } as unknown as AnalyticsEnv['document'],
    window: { goatcounter: { count: vi.fn() } },
  };
}

describe('UX-407 consent: what is sent, status line, place to change it', () => {
  let shell: Shell | null = null;
  afterEach(() => {
    shell?.dispose();
    shell = null;
    document.body.innerHTML = '';
  });

  function toDayOneReport(): { root: HTMLElement; s: Shell; a: ReturnType<typeof createAnalytics> } {
    const a = createAnalytics(() => fakeEnv());
    const root = document.createElement('div');
    document.body.appendChild(root);
    shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 7, analytics: a });
    shell.startGame(createNewGame('Test', 'normal', 7));
    shell.handleEvents(playDay(shell.state!));
    shell.update();
    return { root, s: shell, a };
  }
  const strip = (root: HTMLElement) => root.querySelector<HTMLElement>('.rpt-layer [data-consent]')!;
  const status = (root: HTMLElement) => root.querySelector<HTMLElement>('.rpt-layer [data-consent-status]')!;
  const dialogs = (root: HTMLElement) => root.querySelectorAll('[role="dialog"]').length;

  it('the question states what is sent: no cookie, no name', () => {
    const { root } = toDayOneReport();
    const el = strip(root);
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain(CONSENT_QUESTION);
    expect(el.textContent).toContain(CONSENT_DETAIL);
    expect(CONSENT_DETAIL).toContain('Không cookie');
    expect(CONSENT_DETAIL).toMatch(/không tên/);
    // Read with the group by screen readers.
    const detail = document.getElementById(el.getAttribute('aria-describedby')!)!;
    expect(detail.textContent).toBe(CONSENT_DETAIL);
    expect(EMOJI.test(el.textContent!)).toBe(false);
    expect(status(root).hidden).toBe(true);
  });

  it.each([
    ['consent-yes', 'yes'],
    ['consent-no', 'no'],
  ] as const)('after %s a short status line shows in place of the question, naming Cài đặt; no new modal', (action, value) => {
    const { root, s, a } = toDayOneReport();
    const before = dialogs(root);
    strip(root).querySelector<HTMLElement>(`[data-action="${action}"]`)!.click();
    expect(a.consent()).toBe(value);
    expect(strip(root).hidden).toBe(true);
    const line = status(root);
    expect(line.hidden).toBe(false);
    expect(line.getAttribute('role')).toBe('status');
    expect(line.closest('.rpt-foot')).not.toBeNull();
    expect(line.textContent).toBe(CONSENT_DONE[value]);
    expect(line.textContent).toContain('Cài đặt > Số liệu ẩn danh');
    expect(line.textContent!.length).toBeLessThanOrEqual(80);
    expect(EMOJI.test(line.textContent!)).toBe(false);
    expect(dialogs(root)).toBe(before);
    // Gone with the report: not on the next day's report.
    s.dispatch({ type: 'next_day' });
    s.update();
    expect(line.hidden).toBe(true);
  });

  it('Settings has the Số liệu ẩn danh row with the same promise, and a change shows a status line', () => {
    const { root, s, a } = toDayOneReport();
    strip(root).querySelector<HTMLElement>('[data-action="consent-yes"]')!.click();
    s.dispatch({ type: 'next_day' });
    s.update();
    s.openPause();
    [...root.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes('Cài đặt') && !b.closest('[hidden]'))!.click();
    expect(s.screen).toBe('settings');
    const sheet = root.querySelector<HTMLElement>('.ui-screen.is-sheet:not([hidden])')!;
    const radios = [...sheet.querySelectorAll<HTMLInputElement>('input[data-setting="analyticsConsent"]')];
    const row = radios[0]!.closest('.set-row')!;
    expect(row.textContent).toContain(CONSENT_LABEL);
    expect(row.textContent).toContain(CONSENT_HINT);
    expect(CONSENT_HINT).toContain('không cookie');
    expect(CONSENT_HINT).toMatch(/không tên/);
    expect(radios[0]!.checked).toBe(true);

    radios[1]!.checked = true;
    radios[1]!.dispatchEvent(new Event('change'));
    expect(a.consent()).toBe('no');
    const line = sheet.querySelector<HTMLElement>('.status-line[role="status"]')!;
    expect(line.textContent).toBe(CONSENT_SAVED.no);
    radios[0]!.checked = true;
    radios[0]!.dispatchEvent(new Event('change'));
    expect(a.consent()).toBe('yes');
    expect(line.textContent).toBe(CONSENT_SAVED.yes);
  });
});
