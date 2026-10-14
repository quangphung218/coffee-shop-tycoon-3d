// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import pkg from '../../package.json';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { createMemoryStorage } from '../../src/save/storage';
import { createMainMenu } from '../../src/ui/screens/mainMenu';
import { createSettings } from '../../src/ui/screens/settings';
import { APP_VERSION, VERSION_LABEL } from '../../src/version';

describe('app version', () => {
  it('comes from package.json at build time', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(VERSION_LABEL).toBe(`v${pkg.version}`);
  });

  it('shows on the Main Menu and in Settings', () => {
    const menu = createMainMenu(createMemoryStorage(), { onContinue: vi.fn(), onNewGame: vi.fn(), onLoad: vi.fn(), onSettings: vi.fn() });
    expect(menu.el.querySelector('.menu-foot .app-version')?.textContent).toBe(`v${pkg.version}`);

    const settings = createSettings(createMemoryStorage(), { ...DEFAULT_SETTINGS }, { onChange: vi.fn(), onBack: vi.fn() });
    expect(settings.el.querySelector('.app-version')?.textContent).toBe(`Phiên bản v${pkg.version}`);
  });
});
