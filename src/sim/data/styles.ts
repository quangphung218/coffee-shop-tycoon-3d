import type { StyleSlot } from '../types';

/**
 * A look for one part of the shop (wall, floor, sign, awning). Styles change
 * colours only: money and Tem are paid once, and stars, customers and the
 * economy stay the same. Prices are flat (not scaled by the difficulty).
 */
export interface StyleDef {
  /** Unique over all slots; also the `ChallengeUnlock.id` of a gated style. */
  id: string;
  slot: StyleSlot;
  /** Vietnamese name shown in the picker. */
  name: string;
  /** Main colour of the part. */
  color: number;
  /** Trim, pattern or text colour. */
  accent: number;
  /** Money price; 0 for the default. */
  price: number;
  /** Tem price on top of the money; 0 for none. */
  tickets: number;
  /** Set when a weekly challenge reward ({kind:'decor', id}) must unlock it before it can be bought. */
  challenge?: true;
}

export const STYLE_SLOTS: readonly StyleSlot[] = ['wall', 'floor', 'sign', 'awning'];

/** Per slot, cheapest first; the first entry of each slot is the free default (matching the scene palette). */
export const STYLES: readonly StyleDef[] = [
  { id: 'wall_cream', slot: 'wall', name: 'Tường kem', color: 0xf6e3c6, accent: 0xa0704c, price: 0, tickets: 0 },
  { id: 'wall_mint', slot: 'wall', name: 'Tường bạc hà', color: 0xd9f6ea, accent: 0x2fb898, price: 3_000_000, tickets: 5 },
  { id: 'wall_brick', slot: 'wall', name: 'Tường gạch đỏ', color: 0xc8693f, accent: 0xf6e3c6, price: 15_000_000, tickets: 15 },
  { id: 'wall_wood', slot: 'wall', name: 'Ốp gỗ ấm', color: 0xc98b5a, accent: 0x5c3a26, price: 60_000_000, tickets: 30, challenge: true },
  { id: 'wall_mural', slot: 'wall', name: 'Tranh tường cà phê', color: 0xfff1d6, accent: 0x6b4226, price: 300_000_000, tickets: 80, challenge: true },

  { id: 'floor_oak', slot: 'floor', name: 'Sàn gỗ sồi', color: 0xe9cfa8, accent: 0xc98b5a, price: 0, tickets: 0 },
  { id: 'floor_tile', slot: 'floor', name: 'Gạch bông', color: 0xf7f3ea, accent: 0x2fb898, price: 2_500_000, tickets: 5 },
  { id: 'floor_terrazzo', slot: 'floor', name: 'Đá mài terrazzo', color: 0xdcd3c4, accent: 0xe07a5f, price: 12_000_000, tickets: 12 },
  { id: 'floor_herringbone', slot: 'floor', name: 'Gỗ xương cá', color: 0xa0704c, accent: 0x5c3a26, price: 50_000_000, tickets: 25 },
  { id: 'floor_checker', slot: 'floor', name: 'Sàn caro đen trắng', color: 0xfff9f0, accent: 0x2e3a35, price: 120_000_000, tickets: 45, challenge: true },
  { id: 'floor_marble', slot: 'floor', name: 'Đá cẩm thạch', color: 0xf2efe9, accent: 0x9aa3ab, price: 350_000_000, tickets: 90 },

  { id: 'sign_wood', slot: 'sign', name: 'Bảng gỗ', color: 0xa0704c, accent: 0xfff9f0, price: 0, tickets: 0 },
  { id: 'sign_chalk', slot: 'sign', name: 'Bảng phấn', color: 0x2e3a35, accent: 0xfff9f0, price: 2_000_000, tickets: 5 },
  { id: 'sign_neon', slot: 'sign', name: 'Biển neon', color: 0x2e3a35, accent: 0xff6fb5, price: 20_000_000, tickets: 18, challenge: true },
  { id: 'sign_brass', slot: 'sign', name: 'Biển đồng', color: 0x5c3a26, accent: 0xf2c14e, price: 250_000_000, tickets: 70 },

  { id: 'awning_coral', slot: 'awning', name: 'Mái hiên san hô', color: 0xe07a5f, accent: 0xfff9f0, price: 0, tickets: 0 },
  { id: 'awning_mint', slot: 'awning', name: 'Mái hiên bạc hà', color: 0x2fb898, accent: 0xfff9f0, price: 3_000_000, tickets: 5 },
  { id: 'awning_navy', slot: 'awning', name: 'Mái hiên sọc xanh', color: 0x3b4a6b, accent: 0xfff9f0, price: 18_000_000, tickets: 15 },
  { id: 'awning_gold', slot: 'awning', name: 'Mái hiên vàng nắng', color: 0xf2c14e, accent: 0x6b4226, price: 80_000_000, tickets: 35, challenge: true },
  { id: 'awning_royal', slot: 'awning', name: 'Mái hiên nhung đỏ', color: 0x9b2335, accent: 0xf2c14e, price: 400_000_000, tickets: 100 },
];

export function styleById(id: string): StyleDef | undefined {
  return STYLES.find((s) => s.id === id);
}

/** Styles of a slot, cheapest first. */
export function stylesOf(slot: StyleSlot): StyleDef[] {
  return STYLES.filter((s) => s.slot === slot);
}

/** The free style a slot starts with. */
export function defaultStyle(slot: StyleSlot): StyleDef {
  return stylesOf(slot)[0]!;
}
