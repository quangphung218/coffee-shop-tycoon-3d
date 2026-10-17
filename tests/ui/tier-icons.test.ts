// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUpgrade } from '../../src/sim/data/upgrades';
import { createNewGame } from '../../src/sim/state';
import type { GameState, UpgradeId } from '../../src/sim/types';
import type { PanelContext } from '../../src/ui/hud/panels';

// P25: tiers 2 and 3 of the upgrade icons live in a second atlas that only
// Nâng cấp loads. Until it is in (or when it fails) rows show the base icon;
// once it lands they switch in place to the icon of their tier.

const FS_MODULE = 'node:fs';
const { readFileSync } = (await import(/* @vite-ignore */ FS_MODULE)) as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const TIERS_JSON = readFileSync('public/icons3d/tiers.json', 'utf8');

type Icons = typeof import('../../src/ui/core/icons');
type Upgrades = typeof import('../../src/ui/panels/upgrades');

/** A fetch the test answers by hand. */
interface Request {
  url: string;
  answer(status?: number): void;
}

let requests: Request[] = [];
/** Modules under test, fresh per test so the tiers cache starts empty. */
let icons: Icons;
let panel: Upgrades;
const html = document.documentElement;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r));
};

const tierRequests = (): Request[] => requests.filter((r) => r.url.includes('tiers'));

/** Answers every tiers request still open (the fetches start a microtask after loadTierAtlas). */
async function deliverTiers(status = 200): Promise<void> {
  await settle();
  for (const r of tierRequests()) r.answer(status);
  await settle();
}

beforeEach(async () => {
  requests = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (url: string) =>
        new Promise<Response>((resolve) => {
          requests.push({
            url,
            answer: (status = 200) =>
              resolve(
                url.endsWith('.json')
                  ? new Response(TIERS_JSON, { status })
                  : ({ ok: status === 200, status, url, blob: () => Promise.resolve(new Blob(['webp'])) } as unknown as Response),
              ),
          });
        }),
    ),
  );
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:tiers-${++n}` }));
  vi.stubGlobal('createImageBitmap', () => Promise.resolve({ width: 1, height: 1 } as ImageBitmap));
  vi.resetModules();
  icons = await import('../../src/ui/core/icons');
  panel = await import('../../src/ui/panels/upgrades');
});

afterEach(() => {
  vi.unstubAllGlobals();
  html.className = '';
  html.removeAttribute('style');
  document.body.replaceChildren();
});

/** A state with `levels` bought, every upgrade unlocked. */
function game(levels: Partial<Record<UpgradeId, number>>): GameState {
  const state = createNewGame('Quán Thử', 'normal', 42);
  state.shopLevel = 10;
  state.day = 30;
  Object.assign(state.upgrades, levels);
  return state;
}

function open(state: GameState): HTMLElement {
  const body = document.createElement('div');
  document.body.append(body);
  const ctx: PanelContext = { dispatch: () => ({ ok: true, events: [] }) as never, getState: () => state, close: () => {} };
  panel.renderUpgradesPanel(body, ctx);
  return body;
}

const rowIcon = (body: HTMLElement, id: UpgradeId): HTMLElement => body.querySelector<HTMLElement>(`[data-upgrade="${id}"] .item-icon .ic`)!;
const meta = (body: HTMLElement, id: UpgradeId): string => body.querySelector(`[data-upgrade="${id}"] .item-meta`)!.textContent ?? '';

describe('loading', () => {
  it('is not part of the main atlas load', async () => {
    icons.watchIconAtlas(html, window);
    icons.enableHdIcons(html, { devicePixelRatio: 2 });
    await settle();
    expect(requests.length).toBeGreaterThan(0);
    expect(tierRequests()).toHaveLength(0);
  });

  it('fetches tiers.json and the @1x image exactly once when Nâng cấp opens, however often', async () => {
    open(game({}));
    open(game({}));
    await deliverTiers();
    open(game({}));
    await settle();
    expect(tierRequests().map((r) => r.url).sort()).toEqual([icons.TIER_ATLAS_URLS.json, icons.TIER_ATLAS_URLS[1]]);
    expect(html.style.getPropertyValue(icons.TIER_ATLAS_VAR)).toBe('url("blob:tiers-1")');
  });

  it('takes the @2x image on an HD screen', async () => {
    html.classList.add(icons.ICONS_HD_CLASS);
    open(game({}));
    await settle();
    expect(tierRequests().map((r) => r.url)).toContain(icons.TIER_ATLAS_URLS[2]);
    expect(tierRequests().map((r) => r.url)).not.toContain(icons.TIER_ATLAS_URLS[1]);
  });
});

describe('row icons', () => {
  // better_machine: maxLevel 3, so one level per tier.
  const MACHINE = { better_machine: 2 } as const;

  it('show the base icon while loading, then switch in place to the tier icon', async () => {
    const body = open(game(MACHINE));
    const before = rowIcon(body, 'better_machine');
    expect(before.dataset.icon).toBe('i-machine');
    expect(before.dataset.atlas).toBeUndefined();

    await deliverTiers();
    const after = rowIcon(body, 'better_machine');
    expect(after).toBe(before);
    expect(after.dataset.icon).toBe('i-machine-t2');
    expect(after.dataset.atlas).toBe('tiers');
    expect(after.className).toBe(before.className);
    expect(after.style.getPropertyValue('--ic-size')).toMatch(/%/);
  });

  it('keep the base icon when the load fails, and the next open tries again', async () => {
    const body = open(game(MACHINE));
    await deliverTiers(404);
    expect(rowIcon(body, 'better_machine').dataset.icon).toBe('i-machine');
    expect(html.style.getPropertyValue(icons.TIER_ATLAS_VAR)).toBe('');

    const again = open(game(MACHINE));
    await settle();
    expect(tierRequests()).toHaveLength(4);
    await deliverTiers();
    expect(rowIcon(again, 'better_machine').dataset.icon).toBe('i-machine-t2');
  });

  it('follow the tier of the current level, the base icon for tier 0 and 1', async () => {
    const loaded = icons.loadTierAtlas();
    await deliverTiers();
    expect(await loaded).toBe(true);
    const body = open(game({ tables: 6, better_machine: 1, plants: 3 }));
    expect(rowIcon(body, 'tables').dataset.icon).toBe('i-tables-t3');
    expect(rowIcon(body, 'better_machine').dataset.icon).toBe('i-machine');
    expect(rowIcon(body, 'plants').dataset.icon).toBe('i-plants-t3');
    expect(rowIcon(body, 'fast_machine').dataset.icon).toBe('i-fast-machine');
  });

  it('hold icons drawn during the load only weakly, and leave ones taken out of the DOM', async () => {
    const weak: object[] = [];
    vi.stubGlobal(
      'WeakRef',
      class<T extends object> extends WeakRef<T> {
        constructor(target: T) {
          super(target);
          weak.push(target);
        }
      },
    );
    const body = open(game(MACHINE));
    const closed = open(game(MACHINE));
    const gone = rowIcon(closed, 'better_machine');
    closed.remove();
    expect(weak).toContain(gone);

    await deliverTiers();
    expect(gone.dataset.icon).toBe('i-machine');
    expect(gone.dataset.atlas).toBeUndefined();
    expect(rowIcon(body, 'better_machine').dataset.icon).toBe('i-machine-t2');
  });

  it('drop collected icons from the wait list as new ones are drawn', async () => {
    let collected = false;
    vi.stubGlobal(
      'WeakRef',
      class<T extends object> extends WeakRef<T> {
        override deref(): T | undefined {
          return collected ? undefined : super.deref();
        }
      },
    );
    open(game(MACHINE)).remove();
    collected = true;
    const body = open(game(MACHINE));
    collected = false;
    await deliverTiers();
    expect(rowIcon(body, 'better_machine').dataset.icon).toBe('i-machine-t2');
  });

  it('tierIcon draws the 24 px cell from the small grid', async () => {
    void icons.loadTierAtlas();
    await deliverTiers();
    const small = icons.tierIcon('i-machine', 3, { size: 24 });
    const big = icons.tierIcon('i-machine', 3, { size: 48 });
    expect(small.dataset.icon).toBe('i-machine-t3');
    expect(small.style.getPropertyValue('--ic-pos')).not.toBe(big.style.getPropertyValue('--ic-pos'));
  });
});

describe('tier meta', () => {
  it('shows "Bậc n/3" once bought, with "mua để lên bậc n+1" only when the next level changes it', () => {
    // tables: maxLevel 6, two levels per tier.
    expect(getUpgrade('tables').maxLevel).toBe(6);
    const body = open(game({ tables: 2, better_machine: 3, big_counter: 1 }));
    expect(meta(body, 'tables')).toMatch(/^Giá [\d.]+đ · Cấp 2\/\d+ · Bậc 1\/3 · mua để lên bậc 2 · mỗi cấp \+\d+ chỗ ngồi$/);
    expect(meta(body, 'better_machine')).toMatch(/ · Cấp 3\/\d+ · Bậc 3\/3 · mỗi cấp /);
    // big_counter: maxLevel 2, one level per tier.
    expect(meta(body, 'big_counter')).toMatch(/ · Cấp 1\/\d+ · Bậc 1\/3 · mua để lên bậc 2 · mỗi cấp /);
    expect(meta(body, 'fast_machine')).not.toContain('Bậc');
  });

  it('leaves out the hint when the next level stays in the tier, or at max level', () => {
    expect(panel.tierText('tables', 1, true)).toBe('Bậc 1/3 · ');
    expect(panel.tierText('tables', 2, true)).toBe('Bậc 1/3 · mua để lên bậc 2 · ');
    expect(panel.tierText('tables', 2, false)).toBe('Bậc 1/3 · ');
    expect(panel.tierText('tables', 0, true)).toBe('');
  });

  it('updates the icon and the meta when a level is bought', async () => {
    const loaded = icons.loadTierAtlas();
    await deliverTiers();
    await loaded;
    const state = game({ tables: 2 });
    const body = document.createElement('div');
    document.body.append(body);
    const handle = panel.renderUpgradesPanel(body, { dispatch: () => ({ ok: true, events: [] }) as never, getState: () => state, close: () => {} });
    expect(rowIcon(body, 'tables').dataset.icon).toBe('i-tables');
    state.upgrades.tables = 3;
    handle.update!(state);
    expect(rowIcon(body, 'tables').dataset.icon).toBe('i-tables-t2');
    expect(meta(body, 'tables')).toContain('Cấp 3/');
    expect(meta(body, 'tables')).toContain('Bậc 2/3 · mỗi cấp');
  });
});

describe('ui.css', () => {
  it('draws data-atlas="tiers" icons from --ic-tiers', () => {
    const css = readFileSync('src/ui/styles/ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const m = css.match(/html \.ic\[data-atlas='tiers'\]\s*\{([^}]*)\}/);
    expect(m?.[1]).toContain('background-image: var(--ic-tiers, none)');
  });
});
