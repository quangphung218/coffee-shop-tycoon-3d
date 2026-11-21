// @vitest-environment jsdom
// UX-406: the dock and its badges never sit above an open modal (Settings,
// Tạm dừng, report): the dock is its own stacking context, hidden by CSS and
// inert from game.ts while one is open; check-layout.mjs checks it in Chrome.
import { afterEach, describe, expect, it } from 'vitest';
import { dockAboveModal } from '../../scripts/lib/probes.mjs';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { createNewGame } from '../../src/sim/state';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { playDay } from '../integration/helpers';

// The project has no Node types: read files through a dynamically named node:fs import (as css-order.test.ts).
const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as { readFileSync(path: string, encoding: 'utf8'): string };
const read = (p: string): string => readFileSync(p, 'utf8');

describe('UX-406 dock vs open Settings dialog', () => {
  let shell: Shell | null = null;
  afterEach(() => {
    shell?.dispose();
    shell = null;
    document.body.innerHTML = '';
  });

  function mount(): { root: HTMLElement; s: Shell; dock: HTMLElement } {
    const root = document.createElement('div');
    document.body.appendChild(root);
    shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 7 });
    shell.startGame(createNewGame('Test', 'normal', 7));
    shell.update();
    return { root, s: shell, dock: root.querySelector<HTMLElement>('.dock')! };
  }

  const settingsButton = (root: HTMLElement): HTMLElement =>
    [...root.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes('Cài đặt') && !b.closest('[hidden]'))!;

  it('the dock is inert while Settings (opened from Tạm dừng) is open, and usable again after', () => {
    const { root, s, dock } = mount();
    expect(dock.hasAttribute('inert')).toBe(false);
    s.openPause();
    expect(dock.hasAttribute('inert')).toBe(true);
    settingsButton(root).click();
    expect(s.screen).toBe('settings');
    expect(root.querySelector('.ui-screen[aria-modal="true"]:not([hidden])')?.getAttribute('aria-label')).toBe('Cài đặt');
    expect(dock.hasAttribute('inert')).toBe(true);
    // Esc: Settings back to Tạm dừng, then Tạm dừng resumes play.
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(s.screen).toBe('pause');
    expect(dock.hasAttribute('inert')).toBe(true);
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    s.update();
    expect(s.screen).toBe(null);
    expect(dock.hasAttribute('inert')).toBe(false);
  });

  it('the dock is inert under the Daily Report too', () => {
    const { s, dock } = mount();
    s.handleEvents(playDay(s.state!));
    s.update();
    expect(s.report.visible).toBe(true);
    expect(dock.hasAttribute('inert')).toBe(true);
  });

  it('CSS: the dock is its own stacking context and any open modal screen hides it', () => {
    const css = read('src/ui/styles/ui.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.dock\s*\{\s*isolation:\s*isolate;\s*\}/);
    expect(css).toMatch(/#ui:has\(> \.ui-screen\[aria-modal='true'\]:not\(\[hidden\]\)\) \.dock\s*\{\s*visibility:\s*hidden;\s*\}/);
  });

  it('check-layout.mjs gains the check "no dock element above an open modal"', () => {
    const src = read('scripts/check-layout.mjs');
    expect(src).toContain("import { dockAboveModal } from './lib/probes.mjs';");
    expect(src).toMatch(/async function checkDockVsModal\(/);
    expect(src).toContain('page.evaluate(dockAboveModal)');
    expect(src).toMatch(/part\('consent'\) \? DOCK_MODAL_VIEWPORTS/);
  });

  describe('dockAboveModal probe', () => {
    const box = (left: number, top: number, w: number, h: number): DOMRect =>
      ({ left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top, toJSON() {} }) as DOMRect;

    function page(): { modal: HTMLElement; dock: HTMLElement; badge: HTMLElement } {
      document.body.innerHTML =
        '<div id="ui"><nav class="dock"><button class="dock-btn"><span class="dock-badge">2</span></button></nav>' +
        '<div class="ui-screen" role="dialog" aria-modal="true" aria-label="Cài đặt"><p>x</p></div></div>';
      const modal = document.querySelector<HTMLElement>('[aria-modal]')!;
      const dock = document.querySelector<HTMLElement>('.dock')!;
      const badge = document.querySelector<HTMLElement>('.dock-badge')!;
      dock.getBoundingClientRect = () => box(10, 700, 300, 80);
      dock.querySelector<HTMLElement>('.dock-btn')!.getBoundingClientRect = () => box(20, 710, 60, 60);
      badge.getBoundingClientRect = () => box(60, 712, 16, 16);
      return { modal, dock, badge };
    }

    it('fails when a badge is hit above the modal and the dock is reachable', () => {
      const { badge } = page();
      document.elementFromPoint = (x: number, y: number) => (x >= 60 && x <= 76 && y >= 712 && y <= 728 ? badge : document.querySelector('[aria-modal] p'));
      const r = dockAboveModal();
      expect(r.modal).toBe('Cài đặt');
      expect(r.fails).toContain('dock is neither inert nor hidden under the modal');
      expect(r.fails.some((f) => f.startsWith('dock-badge at'))).toBe(true);
    });

    it('passes when the modal is on top and the dock is inert', () => {
      const { modal, dock } = page();
      dock.setAttribute('inert', '');
      document.elementFromPoint = () => modal;
      const r = dockAboveModal();
      expect(r.fails).toEqual([]);
      expect(r.checked).toBe(3);
    });

    it('fails with no open modal', () => {
      const { modal } = page();
      modal.hidden = true;
      expect(dockAboveModal().fails).toEqual(['no open modal']);
    });
  });
});
