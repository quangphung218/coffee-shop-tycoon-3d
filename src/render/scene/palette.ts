/**
 * Colours of the shop scene (shop.ts, facade.ts, ambient.ts). Every flat
 * colour a scene part uses comes from here, so the scene keeps one palette.
 */
export const PALETTE = {
  ground: 0xb9de9a,
  floor: 0xe9cfa8,
  patio: 0xdcd3c4,
  wall: 0xf6e3c6,
  wood: 0xa0704c,
  woodDark: 0x5c3a26,
  woodLight: 0xc98b5a,
  cream: 0xfff9f0,
  mint: 0x2fb898,
  coral: 0xe07a5f,
  gold: 0xf2c14e,
  plant: 0x3fa66b,
  plantDark: 0x2f8a56,
  pot: 0xc8693f,
  cup: 0xf7f3ea,
  coffee: 0x6b4226,
  steel: 0x9aa3ab,
  steelDark: 0x4a4f55,
  bulb: 0xffe7a3,
  glass: 0xbfe0e8,
  stone: 0xcfc4b3,
  chalkboard: 0x2e3a35,
} as const;

/** A palette colour as a CSS string, for canvas drawing (e.g. '#fff9f0'). */
export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}
