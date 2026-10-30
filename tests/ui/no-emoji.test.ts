// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dispatch } from '../../src/sim';
import { createMemoryStorage } from '../../src/save/storage';
import { iconCell, type IconCellId } from '../../src/ui/core/icons';
import { DEFAULT_SETTINGS } from '../../src/save/settings';
import { registerPrepPanels } from '../../src/ui/panels';
import { registerReviewsPanel } from '../../src/ui/report';
import { createShell, type Shell } from '../../src/ui/screens/shell';
import { runOpenDay } from '../integration/helpers';

const EMOJI = /\p{Extended_Pictographic}/u;

// Vitest stubs .css imports and the project has no Node types, so node:fs comes
// in through a dynamically named import; paths are relative to the repo root
// (under jsdom, `URL` is jsdom's and node:fs rejects it).
const FS_MODULE = 'node:fs';
interface Dirent {
  name: string;
  isDirectory(): boolean;
}
const fs = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
};

/** Every *.ts file under `dir`, recursively. */
function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = `${dir}/${d.name}`;
    if (d.isDirectory()) return tsFiles(path);
    return d.name.endsWith('.ts') ? [path] : [];
  });
}

/** `path:line: text` for each line holding an emoji. */
function emojiLines(path: string): string[] {
  return fs
    .readFileSync(path, 'utf8')
    .split('\n')
    .flatMap((line, i) => (EMOJI.test(line) ? [`${path}:${i + 1}: ${line.trim()}`] : []));
}

function q<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function button(root: ParentNode, text: string): HTMLButtonElement {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`no button "${text}"`);
  return b;
}

/**
 * Fails with the step name and the offending text. Also checks the icons
 * that stand in for emoji: each is an empty, aria-hidden atlas box whose id
 * has a cell, so the text and labels stay exactly the words.
 */
function expectNoEmoji(step: string): void {
  const text = document.body.textContent ?? '';
  expect(text.match(EMOJI)?.[0], `${step}: ${text.slice(0, 200)}`).toBeUndefined();
  expect(document.body.querySelectorAll('svg use'), step).toHaveLength(0);
  for (const el of document.body.querySelectorAll<HTMLElement>('.ic')) {
    const id = el.dataset.icon ?? '';
    expect(iconCell(id as IconCellId), `${step}: ${id}`).toBeDefined();
    expect(el.getAttribute('aria-hidden'), `${step}: ${id}`).toBe('true');
    expect(el.getAttribute('focusable'), `${step}: ${id}`).toBe('false');
    expect(el.childNodes, `${step}: ${id}`).toHaveLength(0);
  }
}

const offs: (() => void)[] = [];
let shell: Shell | null = null;

afterEach(() => {
  shell?.dispose();
  shell = null;
  offs.splice(0).forEach((off) => off());
  document.body.replaceChildren();
});

describe('no emoji in a whole game day', () => {
  it('main menu, new game, all eight dock panels, the open day and the report', () => {
    offs.push(registerPrepPanels(), registerReviewsPanel());
    const root = document.createElement('div');
    document.body.append(root);
    shell = createShell({ root, storage: createMemoryStorage(), settings: { ...DEFAULT_SETTINGS }, seed: () => 7 });
    const s = shell;
    expectNoEmoji('main menu');
    expect(root.querySelectorAll('.ic').length).toBeGreaterThan(0);

    button(root, 'Ván mới').click();
    expectNoEmoji('new game');
    q<HTMLInputElement>(root, 'input[type="text"]').value = 'Quán Không Emoji';
    q<HTMLFormElement>(root, 'form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const state = s.state!;
    expect(state.shopName).toBe('Quán Không Emoji');
    expectNoEmoji('preparation HUD');

    const dock = q(s.hud.el, 'nav.dock');
    const ids = [...dock.querySelectorAll<HTMLButtonElement>('button[data-panel]')].map((b) => b.dataset.panel);
    expect(ids).toEqual(['tasks', 'menu', 'inventory', 'staff', 'marketing', 'upgrades', 'styles', 'reviews']);
    for (const id of ids) {
      q<HTMLButtonElement>(dock, `[data-panel="${id}"]`).click();
      expect(s.hud.openPanelId).toBe(id);
      expect(s.hud.panelEl.hidden).toBe(false);
      expectNoEmoji(`panel ${id}`);
    }
    s.hud.closePanel();

    expect(dispatch(state, { type: 'start_day' })).toBe(true);
    s.update();
    expectNoEmoji('opening');
    runOpenDay(state, {
      onMinute: (st) => {
        s.update();
        s.handleEvents(st.events);
        if (st.minute % 60 === 0) expectNoEmoji(`${st.phase} ${st.minute}`);
      },
    });
    expect(state.phase).toBe('report');
    s.update();
    expect(s.report.visible).toBe(true);
    expectNoEmoji('report summary');
    q<HTMLButtonElement>(s.report.el, '[data-tab="reviews"]').click();
    expectNoEmoji('report reviews');

    q<HTMLButtonElement>(dock, '[data-panel="reviews"]').click();
    expectNoEmoji('reviews panel after a day');
  });
});

describe('no emoji in the UI and render sources', () => {
  it('src/ui, src/render and index.html hold no emoji (src/sim data is exempt)', () => {
    const files = [...tsFiles('src/ui'), ...tsFiles('src/render'), 'index.html'];
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.startsWith('src/sim'))).toBe(false);
    expect(files.flatMap(emojiLines)).toEqual([]);
  });
});
