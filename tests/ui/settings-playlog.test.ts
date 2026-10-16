// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAYLOG_FIELDS, readPlayLog } from '../../src/save/playlog';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage, type StorageLike } from '../../src/save/storage';
import { WEEK_LENGTH } from '../../src/sim/data/week';
import { createNewGame } from '../../src/sim/state';
import { scoreWeek } from '../../src/sim/week';
import { formatClock } from '../../src/ui/core/format';
import { createSettings } from '../../src/ui/screens/settings';
import { createShell, type Shell } from '../../src/ui/screens/shell';

let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function boot(storage: StorageLike): Shell {
  const root = document.createElement('div');
  document.body.append(root);
  shell = createShell({ root, storage, settings: { ...DEFAULT_SETTINGS }, seed: () => 7 });
  return shell;
}

/** New game, then "Mở cửa" with its events handled like the main loop does. */
function playToOpening(storage: StorageLike): Shell {
  const s = boot(storage);
  s.startGame(createNewGame('Quán Số Liệu', 'normal', 7));
  expect(s.dispatch({ type: 'start_day' })).toBe(true);
  s.handleEvents(s.state!.events);
  s.state!.events = [];
  return s;
}

function openSettings(storage: StorageLike) {
  const screen = createSettings(storage, { ...DEFAULT_SETTINGS }, { onChange: vi.fn(), onBack: vi.fn() });
  document.body.append(screen.el);
  screen.el.hidden = false;
  screen.onShow?.();
  return screen;
}

function button(root: ParentNode, text: string): HTMLButtonElement {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`no button "${text}"`);
  return b;
}

describe('play log from the shell', () => {
  it('logs run_start on a new game and the phase change after start_day', () => {
    const storage = createMemoryStorage();
    playToOpening(storage);
    const log = readPlayLog(storage);
    expect(log.map((e) => e.kind)).toEqual(['run_start', 'phase']);
    expect(log[0]).toMatchObject({ day: 1, phase: 'preparation' });
    expect(log[1]).toMatchObject({ day: 1, phase: 'opening' });
    expect(new Set(log.map((e) => e.run)).size).toBe(1);
  });

  it('logs hidden/visible, quit to menu, and a fresh run id for the next game', () => {
    const storage = createMemoryStorage();
    const s = playToOpening(storage);
    window.dispatchEvent(new Event('pagehide'));
    s.showMenu();
    s.startGame(createNewGame('Quán Số Liệu', 'normal', 8));
    const log = readPlayLog(storage);
    expect(log.map((e) => e.kind)).toEqual(['run_start', 'phase', 'hidden', 'quit_to_menu', 'run_start']);
    expect(log[4]!.run).not.toBe(log[0]!.run);
  });

  it('logs day_end, week_end and replay at the end of week day 7', () => {
    const storage = createMemoryStorage();
    const s = boot(storage);
    const game = createNewGame('Quán Số Liệu', 'normal', 7);
    game.day = WEEK_LENGTH;
    game.phase = 'report';
    game.week!.result = scoreWeek(game)!;
    s.startGame(game);
    s.handleEvents([
      { type: 'dayEnded', day: WEEK_LENGTH },
      { type: 'week_ended', result: game.week!.result },
    ]);
    s.report.el.querySelector<HTMLButtonElement>('.rpt-foot .btn-primary')!.click();
    document.querySelector<HTMLButtonElement>('[data-screen="weekEnd"] [data-action="replay"]')!.click();

    const log = readPlayLog(storage);
    expect(log.map((e) => e.kind)).toEqual(['run_start', 'day_end', 'week_end', 'replay', 'run_start']);
    expect(log[3]).toMatchObject({ day: WEEK_LENGTH, phase: 'report' });
    expect(log[4]).toMatchObject({ day: 1 });
    expect(log[4]!.run).not.toBe(log[3]!.run);
  });

  it('keeps every entry to the PLAYLOG_FIELDS whitelist', () => {
    const storage = createMemoryStorage();
    playToOpening(storage);
    const raw = JSON.parse(storage.getItem('cst3d:playlog')!) as { entries: Record<string, unknown>[] };
    expect(raw.entries.length).toBeGreaterThan(0);
    for (const e of raw.entries) {
      expect(Object.keys(e).sort()).toEqual([...PLAYLOG_FIELDS].sort());
    }
  });
});

describe('Settings · Số liệu chơi', () => {
  it('says there is no data yet on an empty log', () => {
    const screen = openSettings(createMemoryStorage());
    expect(screen.el.querySelector('.playlog-title')?.textContent).toBe('Số liệu chơi');
    expect(screen.el.querySelector('.playlog-summary')?.textContent).toBe('Chưa có dữ liệu');
    expect(screen.el.textContent).toContain('Chỉ lưu trên máy này, không có thông tin cá nhân');
  });

  it('sums up where the player last stopped: day, phase and game time', () => {
    const storage = createMemoryStorage();
    const s = playToOpening(storage);
    const minute = s.state!.minute;
    const screen = openSettings(storage);
    const summary = screen.el.querySelector('.playlog-summary')!.textContent!;
    expect(summary).toMatch(new RegExp(`^Lần dừng gần nhất: Ngày 1 · Mở cửa · ${formatClock(minute)} \\(giờ game\\) · \\d{2}:\\d{2}, \\d{2}/\\d{2}/\\d{4}$`));
  });

  it('shows valid JSON with day, phase, minute and at inside "Xem JSON"', () => {
    const storage = createMemoryStorage();
    playToOpening(storage);
    const screen = openSettings(storage);
    const details = [...screen.el.querySelectorAll('details')].find((d) => d.querySelector('summary')?.textContent?.includes('Xem JSON'));
    expect(details).toBeDefined();
    const data = JSON.parse(details!.querySelector('pre')!.textContent!) as { entries: Record<string, unknown>[] };
    expect(data.entries.length).toBe(2);
    for (const e of data.entries) {
      expect(typeof e.day).toBe('number');
      expect(typeof e.phase).toBe('string');
      expect(typeof e.minute).toBe('number');
      expect(typeof e.at).toBe('number');
    }
  });

  it('refreshes on every onShow', () => {
    const storage = createMemoryStorage();
    const screen = openSettings(storage);
    expect(screen.el.querySelector('.playlog-summary')?.textContent).toBe('Chưa có dữ liệu');
    playToOpening(storage);
    screen.onShow?.();
    expect(screen.el.querySelector('.playlog-summary')?.textContent).toContain('Ngày 1');
  });

  it('clears the log only on a second click', () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    playToOpening(storage);
    const screen = openSettings(storage);
    const clear = button(screen.el, 'Xoá');

    clear.click();
    expect(clear.textContent).toContain('Bấm lần nữa để xoá');
    expect(readPlayLog(storage).length).toBe(2);

    clear.click();
    expect(readPlayLog(storage)).toEqual([]);
    expect(screen.el.querySelector('.playlog-summary')?.textContent).toBe('Chưa có dữ liệu');
    expect(clear.textContent).not.toContain('lần nữa');
  });

  it('disarms "Xoá" after the confirm window passes', () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    playToOpening(storage);
    const screen = openSettings(storage);
    const clear = button(screen.el, 'Xoá');
    clear.click();
    vi.advanceTimersByTime(3000);
    expect(clear.textContent).not.toContain('lần nữa');
    clear.click();
    expect(readPlayLog(storage).length).toBe(2);
  });

  it('downloads playlog-YYYYMMDD.json when blob URLs exist, and is a no-op otherwise', () => {
    const storage = createMemoryStorage();
    playToOpening(storage);
    const screen = openSettings(storage);
    const exportBtn = button(screen.el, 'Xuất JSON');

    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    const { createObjectURL, revokeObjectURL } = URL;
    try {
      // No blob URLs (like jsdom): nothing happens, nothing throws.
      (URL as { createObjectURL?: unknown }).createObjectURL = undefined;
      expect(() => exportBtn.click()).not.toThrow();
      expect(clicks).toEqual([]);

      // Blob URLs that refuse the Blob: also skipped.
      URL.createObjectURL = vi.fn(() => {
        throw new TypeError('bad blob');
      });
      expect(() => exportBtn.click()).not.toThrow();
      expect(clicks).toEqual([]);

      URL.createObjectURL = vi.fn(() => 'blob:playlog');
      URL.revokeObjectURL = vi.fn();
      exportBtn.click();
      expect(URL.createObjectURL).toHaveBeenCalledOnce();
      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/^playlog-\d{8}\.json$/);
    } finally {
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
    }
  });
});
