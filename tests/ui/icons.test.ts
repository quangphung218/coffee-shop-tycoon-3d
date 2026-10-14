// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import DESIGN from '../../design/t237-cartoon/icons/index.html?raw';
import { INGREDIENTS } from '../../src/sim/data/ingredients';
import { MARKETING } from '../../src/sim/data/marketing';
import { MENU } from '../../src/sim/data/menu';
import { UPGRADES } from '../../src/sim/data/upgrades';
import {
  AVATAR_LOOKS,
  avatarIcon,
  avatarLook,
  INGREDIENT_ICONS,
  MARKETING_ICONS,
  MENU_ICONS,
  PHASE_ICONS,
  REVIEW_REASON_ICONS,
  ROLE_ICONS,
  UPGRADE_ICONS,
} from '../../src/ui/core/iconMap';
import { ICON_IDS, ICON_SPRITE, ICON_SPRITE_ID, ICON_SYMBOLS, icon, iconSvgMarkup, isIconId, mountIconSprite } from '../../src/ui/core/icons';

/** id → body of every <symbol> in a markup string. */
function symbolsOf(markup: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of markup.matchAll(/<symbol id="([^"]+)" viewBox="0 0 24 24">(.*?)<\/symbol>/g)) out.set(m[1]!, m[2]!);
  return out;
}

const SPRITE_SYMBOLS = symbolsOf(ICON_SPRITE);

const MAPS = { MENU_ICONS, INGREDIENT_ICONS, MARKETING_ICONS, UPGRADE_ICONS, PHASE_ICONS, ROLE_ICONS, REVIEW_REASON_ICONS };

afterEach(() => {
  document.body.replaceChildren();
});

describe('icon sprite', () => {
  it('holds the 105 design symbols, drawn exactly as in the design file', () => {
    const design = symbolsOf(DESIGN);
    expect(design.size).toBe(105);
    expect(ICON_IDS).toHaveLength(105);
    expect([...SPRITE_SYMBOLS.keys()].sort()).toEqual([...design.keys()].sort());
    for (const [id, body] of design) expect(ICON_SYMBOLS[id as keyof typeof ICON_SYMBOLS], id).toBe(body);
  });

  it('prefixes fill classes so they cannot clash with app styles', () => {
    expect(ICON_SPRITE).not.toMatch(/class="(?!ic-)/);
    expect(ICON_SPRITE).toContain('.ic-fh{fill:var(--icon-fill-honey,#ffc145)}');
    expect(ICON_SPRITE).toContain('.ic{width:var(--size-icon-md,24px)');
  });

  it('mounts once into body, hidden from assistive tech', () => {
    mountIconSprite(document);
    mountIconSprite(document);
    const sprites = document.querySelectorAll(`#${ICON_SPRITE_ID}`);
    expect(sprites).toHaveLength(1);
    expect(sprites[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.firstElementChild).toBe(sprites[0]);
    expect(document.querySelectorAll('symbol')).toHaveLength(105);
  });
});

describe('icon()', () => {
  it('is decorative and points at its symbol', () => {
    const el = icon('i-latte');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.getAttribute('focusable')).toBe('false');
    expect(el.getAttribute('class')).toBe('ic');
    expect(el.querySelector('use')!.getAttribute('href')).toBe('#i-latte');
  });

  it('maps sizes to the size classes and keeps extra classes', () => {
    expect(icon('i-coin', { size: 16 }).getAttribute('class')).toBe('ic ic-sm');
    expect(icon('i-coin', { size: 32 }).getAttribute('class')).toBe('ic ic-lg');
    expect(icon('i-coin', { size: 48, class: 'hud-ic' }).getAttribute('class')).toBe('ic ic-xl hud-ic');
  });
});

describe('iconSvgMarkup()', () => {
  it('is a standalone SVG with fills resolved to hex', () => {
    for (const id of ICON_IDS) {
      const svg = iconSvgMarkup(id, { size: 48 });
      expect(svg, id).toContain(`<symbol id="${id}"`);
      expect(svg, id).toContain(`<use href="#${id}"`);
      expect(svg, id).not.toContain('var(');
      expect(svg, id).not.toContain('class=');
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      expect(doc.querySelector('parsererror'), id).toBeNull();
      expect(doc.documentElement.getAttribute('width')).toBe('48');
    }
    expect(iconSvgMarkup('i-dot')).toContain('fill="#ffc145"');
    expect(iconSvgMarkup('i-reviews')).toContain('fill="#3a2216" stroke="none"');
  });

  it('paints the avatar with the given skin and hair', () => {
    const svg = iconSvgMarkup('i-avatar', { skin: '#8d5a3b', hair: '#f2cf63' });
    expect(svg).toContain('fill="#8d5a3b"');
    expect(svg).toContain('fill="#f2cf63"');
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

  it('only uses icons that have a symbol in the sprite', () => {
    for (const [name, map] of Object.entries(MAPS)) {
      for (const [key, id] of Object.entries(map)) expect(SPRITE_SYMBOLS.has(id), `${name}.${key} → ${id}`).toBe(true);
    }
  });

  it('picks the same avatar for the same staff id and spreads ids over all 8 looks', () => {
    expect(avatarLook(3)).toBe(avatarLook(3));
    expect(avatarLook(11)).toBe(avatarLook(3));
    expect(avatarLook(-1)).toBe(AVATAR_LOOKS[7]);
    expect(new Set(Array.from({ length: 8 }, (_, i) => avatarLook(i))).size).toBe(8);
    const el = avatarIcon(1, { size: 32 });
    expect(el.querySelector('use')!.getAttribute('href')).toBe('#i-avatar');
    expect(el.style.getPropertyValue('--av-skin')).toBe(AVATAR_LOOKS[1]!.skinVar);
    expect(el.style.getPropertyValue('--av-hair')).toBe(AVATAR_LOOKS[1]!.hairVar);
  });
});
