import { Color, type BufferAttribute, type Material, Mesh, type Object3D, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FACADE_COLORS, facadeColors } from '../../src/render/scene/facade';
import { PALETTE } from '../../src/render/scene/palette';
import { ShopView } from '../../src/render/scene/shop';
import { STYLE_SLOTS, defaultStyle, styleById, stylesOf } from '../../src/sim/data/styles';
import { ensureRetention } from '../../src/sim/retention';
import { createNewGame } from '../../src/sim/state';
import { buyStyle, ensureStyles } from '../../src/sim/styles';
import type { GameState } from '../../src/sim/types';

function game(): GameState {
  const s = createNewGame('Quán Mây', 'normal', 1);
  s.money = 10_000_000_000;
  ensureRetention(s).tickets = 10_000;
  return s;
}

function view(s: GameState, quality: 'low' | 'medium' | 'high' = 'medium'): ShopView {
  const shop = new ShopView(new Scene(), quality);
  shop.update(s, 0, 0, 0);
  return shop;
}

/** What the renderer would draw: meshes, their materials and vertex counts (one draw call per mesh). */
function drawList(root: Object3D): { meshes: number; materials: Set<Material>; vertices: number } {
  const materials = new Set<Material>();
  let meshes = 0;
  let vertices = 0;
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    meshes++;
    vertices += o.geometry.getAttribute('position').count;
    for (const m of [o.material].flat() as Material[]) materials.add(m);
  });
  return { meshes, materials, vertices };
}

/** Every baked vertex colour and material colour in the shop, in traversal order. */
function colors(root: Object3D): number[] {
  const out: number[] = [];
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const attr = o.geometry.getAttribute('color') as BufferAttribute | undefined;
    if (attr) out.push(...(attr.array as Float32Array));
    const m = o.material as { color?: Color };
    if (m.color) out.push(m.color.r, m.color.g, m.color.b);
  });
  return out;
}

function hasColor(root: Object3D, hex: number): boolean {
  const c = new Color(hex);
  c.setRGB(Math.fround(c.r), Math.fround(c.g), Math.fround(c.b));
  let found = false;
  root.traverse((o) => {
    if (found || !(o instanceof Mesh)) return;
    const attr = o.geometry.getAttribute('color') as BufferAttribute | undefined;
    if (!attr) return;
    for (let i = 0; i < attr.count && !found; i++) found = attr.getX(i) === c.r && attr.getY(i) === c.g && attr.getZ(i) === c.b;
  });
  return found;
}

function wear(s: GameState, ids: readonly string[]): void {
  const st = ensureStyles(s);
  for (const id of ids) {
    st.unlocked.push(id);
    expect(buyStyle(s, id)).toBe(true);
  }
}

const FANCY = ['wall_brick', 'floor_checker', 'sign_neon', 'awning_navy'] as const;

describe('shop styles in the scene (E-17)', () => {
  it('default styles keep the palette colours of walls, floor, awning and sign', () => {
    const shop = view(game());
    expect(shop.facade.currentColors).toEqual(DEFAULT_FACADE_COLORS);
    expect(DEFAULT_FACADE_COLORS).toEqual({ awning: PALETTE.coral, awningAlt: PALETTE.cream, signBoard: PALETTE.cream, signInk: PALETTE.woodDark, signDots: PALETTE.coral });
    expect(defaultStyle('wall').color).toBe(PALETTE.wall);
    expect(defaultStyle('floor').color).toBe(PALETTE.floor);
    expect(facadeColors(defaultStyle('sign'), defaultStyle('awning'))).toEqual(DEFAULT_FACADE_COLORS);
    expect(hasColor(shop.root, PALETTE.wall)).toBe(true);
    expect(hasColor(shop.root, PALETTE.floor)).toBe(true);
  });

  it('a chosen style recolours wall, floor, sign and awning; going back restores every colour exactly', () => {
    const s = game();
    const shop = view(s);
    const before = colors(shop.root);
    wear(s, FANCY);
    shop.update(s, 1, 0.016, 0);
    expect(hasColor(shop.root, styleById('wall_brick')!.color)).toBe(true);
    expect(hasColor(shop.root, styleById('floor_checker')!.color)).toBe(true);
    expect(hasColor(shop.root, styleById('awning_navy')!.color)).toBe(true);
    expect(hasColor(shop.root, styleById('sign_neon')!.color)).toBe(true);
    expect(hasColor(shop.root, PALETTE.wall)).toBe(false);
    expect(shop.facade.currentColors.signInk).toBe(styleById('sign_neon')!.accent);
    expect(colors(shop.root)).not.toEqual(before);

    ensureStyles(s).chosen = {};
    shop.update(s, 2, 0.016, 0);
    expect(colors(shop.root)).toEqual(before);
  });

  it('adds no mesh, material or vertex for any style on any quality', () => {
    for (const quality of ['low', 'medium', 'high'] as const) {
      const s = game();
      const shop = view(s, quality);
      const base = drawList(shop.root);
      for (const slot of STYLE_SLOTS) {
        for (const style of stylesOf(slot)) {
          shop.setStylePreview(slot, style.id);
          shop.update(s, 1, 0.016, 0);
          const now = drawList(shop.root);
          expect(now.meshes).toBe(base.meshes);
          expect(now.vertices).toBe(base.vertices);
          expect([...now.materials]).toEqual([...base.materials]);
        }
        shop.setStylePreview(slot, null);
      }
    }
  });

  it('a preview shows a style without buying it and clears back to the chosen one', () => {
    const s = game();
    const shop = view(s);
    const before = colors(shop.root);
    const money = s.money;
    shop.setStylePreview('awning', 'awning_royal');
    shop.update(s, 1, 0.016, 0);
    expect(shop.shownStyles(s).awning.id).toBe('awning_royal');
    expect(shop.facade.currentColors.awning).toBe(styleById('awning_royal')!.color);
    expect(s.money).toBe(money);
    expect(s.styles?.owned ?? []).toEqual([]);

    // Wrong slot or unknown id clears the preview instead of showing it.
    shop.setStylePreview('wall', 'floor_tile');
    shop.setStylePreview('sign', 'nope');
    expect(shop.shownStyles(s).wall.id).toBe('wall_cream');
    expect(shop.shownStyles(s).sign.id).toBe('sign_wood');

    shop.setStylePreview('awning', null);
    shop.update(s, 2, 0.016, 0);
    expect(colors(shop.root)).toEqual(before);
  });

  it('a layout rebuild keeps the worn awning and sign colours', () => {
    const s = game();
    const shop = view(s);
    wear(s, ['awning_mint']);
    shop.update(s, 1, 0.016, 0);
    shop.setQuality('high');
    expect(hasColor(shop.root, styleById('awning_mint')!.color)).toBe(true);
    expect(hasColor(shop.root, PALETTE.coral)).toBe(true); // doormat stripes stay coral
  });
});
