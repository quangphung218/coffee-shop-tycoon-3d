// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import ATLAS from '../../public/icons3d/atlas.json';
import DESIGN from '../../design/t237-cartoon/icons/index.html?raw';
import { INGREDIENTS } from '../../src/sim/data/ingredients';
import { MARKETING } from '../../src/sim/data/marketing';
import { MENU } from '../../src/sim/data/menu';
import { UPGRADES } from '../../src/sim/data/upgrades';
import {
  AVATAR_LOOKS,
  avatarIcon,
  avatarIndex,
  avatarLook,
  INGREDIENT_ICONS,
  MARKETING_ICONS,
  MENU_ICONS,
  PHASE_ICONS,
  REVIEW_REASON_ICONS,
  ROLE_ICONS,
  UPGRADE_ICONS,
} from '../../src/ui/core/iconMap';
import { AVATAR_CELLS as AVATAR_CELL_COUNT, drawIcon, ICON_ATLAS_URLS, ICON_IDS, icon, iconCell, isIconId } from '../../src/ui/core/icons';
import { ICON_SYMBOLS, iconSvgMarkup } from '../../src/ui/core/iconSvg';

/** id → body of every <symbol> in a markup string. */
function symbolsOf(markup: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of markup.matchAll(/<symbol id="([^"]+)" viewBox="0 0 24 24">(.*?)<\/symbol>/g)) out.set(m[1]!, m[2]!);
  return out;
}

const MAPS = { MENU_ICONS, INGREDIENT_ICONS, MARKETING_ICONS, UPGRADE_ICONS, PHASE_ICONS, ROLE_ICONS, REVIEW_REASON_ICONS };
const AVATAR_CELLS = AVATAR_LOOKS.map((_, i) => `i-avatar-${i}` as const);

afterEach(() => {
  document.body.replaceChildren();
});

describe('icon atlas', () => {
  it('has a 48 px and a 24 px cell for every icon and every avatar look, in atlas order', () => {
    expect(ICON_IDS).toHaveLength(105);
    expect(Object.keys(ATLAS.icons)).toEqual([...ICON_IDS, ...AVATAR_CELLS]);
    expect(Object.keys(ATLAS.smallIcons)).toEqual([...ICON_IDS, ...AVATAR_CELLS]);
    expect(AVATAR_CELL_COUNT).toBe(AVATAR_LOOKS.length);
    const table = ATLAS.icons as Record<string, unknown>;
    const small = ATLAS.smallIcons as Record<string, unknown>;
    for (const id of [...ICON_IDS, ...AVATAR_CELLS]) {
      expect(iconCell(id), id).toEqual(table[id]);
      expect(iconCell(id, 48), id).toEqual(table[id]);
      expect(iconCell(id, 32), id).toEqual(table[id]);
      expect(iconCell(id, 24), id).toEqual(small[id]);
      expect(iconCell(id, 16), id).toEqual(small[id]);
    }
    expect(iconCell(`i-avatar-${AVATAR_LOOKS.length}`)).toBeUndefined();
    expect(iconCell('i-avatar-99')).toBeUndefined();
    expect(iconCell('i-avatar-99', 16)).toBeUndefined();
  });

  it('loads its images relative to the page, so base ./ holds', () => {
    for (const url of Object.values(ICON_ATLAS_URLS)) {
      expect(url).toMatch(/^icons3d\/atlas@[12]x\.webp$/);
    }
  });
});

describe('icon()', () => {
  it('is a decorative box with the size class and the cell id', () => {
    const el = icon('i-latte');
    expect(el.tagName).toBe('SPAN');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('focusable')).toBe('false');
    expect(el.getAttribute('class')).toBe('ic');
    expect(el.dataset.icon).toBe('i-latte');
    expect(el.childElementCount).toBe(0);
    expect(el.textContent).toBe('');
  });

  it('maps sizes to the size classes and keeps extra classes', () => {
    expect(icon('i-coin', { size: 16 }).getAttribute('class')).toBe('ic ic-sm');
    expect(icon('i-coin', { size: 32 }).getAttribute('class')).toBe('ic ic-lg');
    expect(icon('i-coin', { size: 48, class: 'hud-ic' }).getAttribute('class')).toBe('ic ic-xl hud-ic');
  });

  it('places every cell with % background values that fit any box size, the small cell at 16 and 24 px', () => {
    for (const id of ICON_IDS) {
      for (const px of [16, 24, 32, 48] as const) {
        const el = icon(id, { size: px });
        const c = (px <= 24 ? ATLAS.smallIcons : ATLAS.icons)[id];
        expect(c.w, `${id} ${px}`).toBe(px <= 24 ? 24 : 48);
        const size = el.style.getPropertyValue('--ic-size').split(' ').map((v) => parseFloat(v));
        expect(size[0]! * c.w, `${id} ${px}`).toBeCloseTo(ATLAS.width * 100, 1);
        expect(size[1]! * c.h, `${id} ${px}`).toBeCloseTo(ATLAS.height * 100, 1);
        const [x, y] = el.style.getPropertyValue('--ic-pos').split(' ').map((v) => parseFloat(v));
        // % position p puts the cell's left edge at p × (atlas − cell) px of the scaled atlas.
        expect((x! / 100) * (ATLAS.width - c.w), `${id} ${px}`).toBeCloseTo(c.x, 3);
        expect((y! / 100) * (ATLAS.height - c.h), `${id} ${px}`).toBeCloseTo(c.y, 3);
      }
    }
  });

  it('gives the icon-only buttons (camera, settings, close, pause, speeds) the small cell at the default size', () => {
    const ids = ['i-camera', 'i-settings', 'i-close', 'i-pause', 'i-speed-1', 'i-speed-2', 'i-speed-4', 'i-check'] as const;
    for (const id of ids) {
      for (const el of [icon(id), icon(id, { size: 16 })]) {
        expect(el.getAttribute('aria-hidden'), id).toBe('true');
        const width = parseFloat(el.style.getPropertyValue('--ic-size'));
        expect(width, id).toBeCloseTo((ATLAS.width / ATLAS.smallIcons[id].w) * 100, 3);
      }
      expect(parseFloat(icon(id, { size: 32 }).style.getPropertyValue('--ic-size')), id).toBeCloseTo((ATLAS.width / 48) * 100, 3);
    }
  });

  it('keeps an icon with no cell yet as an empty box of the same size', () => {
    const el = icon('i-avatar-99', { size: 32 });
    expect(el.getAttribute('class')).toBe('ic ic-lg');
    expect(el.style.getPropertyValue('--ic-pos')).toBe('');
  });
});

describe('drawIcon()', () => {
  it('copies the cell from the atlas, scaled to the image it was given', () => {
    const calls: number[][] = [];
    const ctx = { drawImage: (_img: unknown, ...args: number[]) => calls.push(args) } as unknown as CanvasRenderingContext2D;
    const atlas = { naturalWidth: ATLAS.width * 2 } as HTMLImageElement;
    const c = iconCell('i-latte')!;
    expect(drawIcon(ctx, atlas, 'i-latte', 10, 20, 64)).toBe(true);
    expect(calls).toEqual([[c.x * 2, c.y * 2, c.w * 2, c.h * 2, 10, 20, 64, 64]]);
    expect(drawIcon(ctx, atlas, 'i-avatar-99', 0, 0, 64)).toBe(false);
    expect(calls).toHaveLength(1);
  });
});

describe('flat SVG reference (icon studio only)', () => {
  it('holds the 105 design symbols, drawn exactly as in the design file', () => {
    const design = symbolsOf(DESIGN);
    expect(design.size).toBe(105);
    expect(Object.keys(ICON_SYMBOLS)).toEqual([...ICON_IDS]);
    for (const [id, body] of design) expect(ICON_SYMBOLS[id as keyof typeof ICON_SYMBOLS], id).toBe(body);
  });

  it('is a standalone SVG with fills resolved to hex', () => {
    for (const id of ICON_IDS) {
      const svg = iconSvgMarkup(id, { size: 48 });
      expect(svg, id).toContain(`<symbol id="${id}"`);
      expect(svg, id).not.toContain('var(');
      expect(svg, id).not.toContain('class=');
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(doc.querySelector('parsererror'), id).toBeNull();
    }
    expect(iconSvgMarkup('i-dot')).toContain('fill="#ffc145"');
    expect(iconSvgMarkup('i-avatar', { skin: '#8d5a3b', hair: '#f2cf63' })).toContain('fill="#8d5a3b"');
  });
});

describe('icon map', () => {
  it('covers every menu item, ingredient, campaign and upgrade in the sim data', () => {
    for (const m of MENU) expect(isIconId(MENU_ICONS[m.id]), m.id).toBe(true);
    for (const i of INGREDIENTS) expect(isIconId(INGREDIENT_ICONS[i.id]), i.id).toBe(true);
    for (const c of MARKETING) expect(isIconId(MARKETING_ICONS[c.id]), c.id).toBe(true);
    for (const u of UPGRADES) expect(isIconId(UPGRADE_ICONS[u.id]), u.id).toBe(true);
  });

  it('gives each menu item its own icon', () => {
    expect(new Set(MENU.map((m) => MENU_ICONS[m.id])).size).toBe(MENU.length);
  });

  it('only uses icons that have a cell in the atlas', () => {
    for (const [name, map] of Object.entries(MAPS)) {
      for (const [key, id] of Object.entries(map)) expect(iconCell(id), `${name}.${key} → ${id}`).toBeDefined();
    }
  });

  it('picks the same avatar cell for the same staff id and spreads ids over all 8 looks', () => {
    expect(avatarLook(3)).toBe(avatarLook(3));
    expect(avatarLook(11)).toBe(avatarLook(3));
    expect(avatarLook(-1)).toBe(AVATAR_LOOKS[7]);
    expect(avatarIndex(-1)).toBe(7);
    expect(new Set(Array.from({ length: 8 }, (_, i) => avatarLook(i))).size).toBe(8);
    const el = avatarIcon(9, { size: 32 });
    expect(el.dataset.icon).toBe('i-avatar-1');
    expect(el.getAttribute('class')).toBe('ic ic-lg');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.getPropertyValue('--ic-pos')).not.toBe('');
  });
});
