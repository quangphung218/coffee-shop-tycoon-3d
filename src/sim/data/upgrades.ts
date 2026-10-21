import type { UpgradeDef, UpgradeEffect, UpgradeId } from '../types';

export const UPGRADES: readonly UpgradeDef[] = [
  {
    id: 'tables',
    name: 'Thêm bàn ghế',
    icon: '🪑',
    description: 'Thêm một bàn 2 chỗ ngồi.',
    category: 'space',
    maxLevel: 6,
    baseCost: 400000,
    costGrowth: 1.35,
    effectPerLevel: { capacity: 2 },
  },
  {
    id: 'better_machine',
    name: 'Máy espresso cao cấp',
    icon: '⚙️',
    description: 'Đồ uống ngon hơn: mỗi cấp +0,2 sao vào điểm ngày và +20% cơ hội khách chấm thêm 1 sao (tối đa 50%).',
    category: 'equipment',
    maxLevel: 3,
    baseCost: 1500000,
    costGrowth: 1.8,
    effectPerLevel: { ratingBonus: 0.2 },
  },
  {
    id: 'fast_machine',
    name: 'Máy espresso 2 group',
    icon: '⚡',
    description: 'Pha mọi món nhanh hơn 20% mỗi cấp.',
    category: 'equipment',
    maxLevel: 3,
    baseCost: 1200000,
    costGrowth: 1.7,
    effectPerLevel: { brewSpeed: 0.2 },
  },
  {
    id: 'big_counter',
    name: 'Quầy lớn hơn',
    icon: '🧾',
    description: 'Quầy rộng hơn, pha nhanh hơn và trông chuyên nghiệp hơn.',
    category: 'equipment',
    maxLevel: 2,
    baseCost: 1000000,
    costGrowth: 1.8,
    effectPerLevel: { brewSpeed: 0.1, appeal: 0.05 },
  },
  {
    id: 'outdoor_seating',
    name: 'Khu ngồi ngoài trời',
    icon: '⛱️',
    description: 'Thêm chỗ ngồi trên vỉa hè, thu hút người qua đường.',
    category: 'space',
    maxLevel: 2,
    baseCost: 2000000,
    costGrowth: 1.6,
    effectPerLevel: { capacity: 4, appeal: 0.1 },
  },
  {
    id: 'expand_area',
    name: 'Mở rộng diện tích',
    icon: '🏗️',
    description: 'Mở rộng mặt bằng, thêm nhiều chỗ ngồi.',
    category: 'space',
    maxLevel: 2,
    baseCost: 5000000,
    costGrowth: 2,
    effectPerLevel: { capacity: 6, appeal: 0.1 },
  },
  {
    id: 'plants',
    name: 'Cây xanh',
    icon: '🪴',
    description: 'Không gian xanh dễ chịu hơn.',
    category: 'decor',
    maxLevel: 3,
    baseCost: 300000,
    costGrowth: 1.5,
    effectPerLevel: { appeal: 0.04, ratingBonus: 0.05 },
  },
  {
    id: 'paintings',
    name: 'Tranh treo tường',
    icon: '🖼️',
    description: 'Trang trí tường cho quán có cá tính.',
    category: 'decor',
    maxLevel: 3,
    baseCost: 400000,
    costGrowth: 1.5,
    effectPerLevel: { appeal: 0.05, ratingBonus: 0.05 },
  },
  {
    id: 'lights',
    name: 'Đèn trang trí',
    icon: '💡',
    description: 'Ánh đèn ấm, quán đẹp hơn về chiều tối.',
    category: 'decor',
    maxLevel: 2,
    baseCost: 500000,
    costGrowth: 1.6,
    effectPerLevel: { appeal: 0.06, ratingBonus: 0.05 },
  },
  {
    id: 'window_bar',
    name: 'Quầy bar cửa sổ',
    icon: '🪟',
    description: 'Quầy gỗ cạnh cửa sổ kèm ghế cao: đẹp hơn và thêm chỗ ngồi.',
    category: 'decor',
    maxLevel: 2,
    baseCost: 700000,
    costGrowth: 1.5,
    effectPerLevel: { capacity: 2, appeal: 0.03, ratingBonus: 0.03 },
  },
  {
    id: 'grinder',
    name: 'Máy xay hạt',
    icon: '🫘',
    description: 'Cà phê xay tươi thơm hơn: pha cà phê nhanh hơn 15%, thêm 0,05 sao và 6% khách mỗi cấp.',
    category: 'equipment',
    maxLevel: 3,
    baseCost: 600000,
    costGrowth: 1.6,
    effectPerLevel: { coffeeBrewSpeed: 0.15, ratingBonus: 0.05, appeal: 0.06 },
  },
  {
    id: 'pastry_case',
    name: 'Tủ bánh',
    icon: '🥐',
    description: 'Bánh bày ra quầy: khách gọi và mua kèm món ăn nhiều hơn 30%, làm món ăn nhanh hơn 20% mỗi cấp.',
    category: 'equipment',
    maxLevel: 2,
    baseCost: 1100000,
    costGrowth: 1.6,
    effectPerLevel: { foodAppeal: 0.3, foodBrewSpeed: 0.2 },
  },
  {
    id: 'blender',
    name: 'Máy xay sinh tố',
    icon: '🧃',
    description: 'Đồ uống đá xay hút khách trẻ: pha đồ lạnh nhanh hơn 25% và thêm 6% khách mỗi cấp.',
    category: 'equipment',
    maxLevel: 2,
    baseCost: 1300000,
    costGrowth: 1.6,
    effectPerLevel: { coldBrewSpeed: 0.25, appeal: 0.06 },
  },
  {
    id: 'ice_maker',
    name: 'Máy làm đá',
    icon: '🧊',
    description: 'Tự làm đá: giảm 45% giá đá mỗi cấp (tối đa 90%), cả khi mua lẫn khi pha chế.',
    category: 'equipment',
    maxLevel: 2,
    baseCost: 60000,
    costGrowth: 1.6,
    effectPerLevel: { iceCostReduction: 0.45 },
  },
  {
    id: 'dishwasher',
    name: 'Máy rửa ly',
    icon: '🍽️',
    description: 'Ly sạch bóng, quán gọn gàng: dọn bàn nhanh hơn 20% và thêm 6% khách mỗi cấp.',
    category: 'equipment',
    maxLevel: 2,
    baseCost: 400000,
    costGrowth: 1.6,
    effectPerLevel: { cleanSpeed: 0.2, appeal: 0.06 },
  },
  {
    id: 'cold_brew_tower',
    name: 'Tháp cold brew',
    icon: '🧊',
    description: 'Tháp nhỏ giọt ủ cà phê lạnh, mở món Cold brew: pha đồ lạnh nhanh hơn 15% và thêm 5% khách mỗi cấp.',
    category: 'equipment',
    maxLevel: 2,
    baseCost: 1800000,
    costGrowth: 1.6,
    effectPerLevel: { coldBrewSpeed: 0.15, appeal: 0.05 },
  },
  {
    id: 'oven',
    name: 'Lò nướng',
    icon: '🔥',
    description: 'Lò nướng bánh tại quán, mở món Bánh quy sô-cô-la: làm món ăn nhanh hơn 20% và khách gọi món ăn nhiều hơn 20% mỗi cấp.',
    category: 'equipment',
    maxLevel: 2,
    baseCost: 2000000,
    costGrowth: 1.6,
    effectPerLevel: { foodBrewSpeed: 0.2, foodAppeal: 0.2 },
  },
  {
    id: 'neon_sign',
    name: 'Biển neon',
    icon: '🌟',
    description: 'Biển đèn neon trên tường, quán nổi bật hơn về đêm.',
    category: 'decor',
    maxLevel: 2,
    baseCost: 600000,
    costGrowth: 1.5,
    effectPerLevel: { appeal: 0.05, ratingBonus: 0.04 },
  },
  {
    id: 'bookshelf',
    name: 'Kệ sách',
    icon: '📚',
    description: 'Kệ sách sát tường cho khách ngồi lâu đọc sách.',
    category: 'decor',
    maxLevel: 2,
    baseCost: 800000,
    costGrowth: 1.5,
    effectPerLevel: { appeal: 0.04, ratingBonus: 0.06 },
  },
  {
    id: 'record_player',
    name: 'Máy hát đĩa',
    icon: '🎶',
    description: 'Máy hát đĩa than trên quầy sau, nhạc chill cả ngày.',
    category: 'decor',
    maxLevel: 1,
    baseCost: 1500000,
    costGrowth: 1.5,
    effectPerLevel: { appeal: 0.06, ratingBonus: 0.06 },
    ticketCost: [3],
  },
  {
    id: 'sofa_corner',
    name: 'Góc sofa',
    icon: '🛋️',
    description: 'Góc sofa êm trong khu mở rộng (cần Mở rộng diện tích).',
    category: 'decor',
    maxLevel: 1,
    baseCost: 2500000,
    costGrowth: 1.5,
    effectPerLevel: { appeal: 0.08, ratingBonus: 0.05 },
    ticketCost: [5],
  },
];

const BY_ID = new Map<UpgradeId, UpgradeDef>(UPGRADES.map((u) => [u.id, u]));

export function getUpgrade(id: UpgradeId): UpgradeDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown upgrade: ${id}`);
  return def;
}

/** Number of looks an upgraded object goes through (tier 1..UPGRADE_TIERS; 0 = not bought). */
export const UPGRADE_TIERS = 3;

/**
 * Look tier of an upgrade at `level`: 0 when not bought, else the levels split
 * into UPGRADE_TIERS even steps of ceil(maxLevel / UPGRADE_TIERS). Levels past
 * maxLevel (shop-level bonus) stay at the top tier.
 */
export function upgradeTier(id: UpgradeId, level: number): 0 | 1 | 2 | 3 {
  if (level <= 0) return 0;
  const step = Math.ceil(getUpgrade(id).maxLevel / UPGRADE_TIERS);
  return Math.min(UPGRADE_TIERS, Math.ceil(level / step)) as 1 | 2 | 3;
}

/** Price of buying the next level when `currentLevel` levels are owned; null at max level. */
export function upgradeCost(def: UpgradeDef, currentLevel: number, priceMult = 1): number | null {
  if (currentLevel >= def.maxLevel) return null;
  return Math.round((def.baseCost * Math.pow(def.costGrowth, currentLevel) * priceMult) / 1000) * 1000;
}

/** Sum of effects over all owned upgrade levels. */
export function totalUpgradeEffect(levels: Partial<Record<UpgradeId, number>>): Required<UpgradeEffect> {
  const total: Required<UpgradeEffect> = {
    capacity: 0,
    ratingBonus: 0,
    appeal: 0,
    brewSpeed: 0,
    coffeeBrewSpeed: 0,
    coldBrewSpeed: 0,
    foodBrewSpeed: 0,
    foodAppeal: 0,
    cleanSpeed: 0,
    iceCostReduction: 0,
  };
  for (const def of UPGRADES) {
    const level = levels[def.id] ?? 0;
    if (level <= 0) continue;
    const e = def.effectPerLevel;
    total.capacity += (e.capacity ?? 0) * level;
    total.ratingBonus += (e.ratingBonus ?? 0) * level;
    total.appeal += (e.appeal ?? 0) * level;
    total.brewSpeed += (e.brewSpeed ?? 0) * level;
    total.coffeeBrewSpeed += (e.coffeeBrewSpeed ?? 0) * level;
    total.coldBrewSpeed += (e.coldBrewSpeed ?? 0) * level;
    total.foodBrewSpeed += (e.foodBrewSpeed ?? 0) * level;
    total.foodAppeal += (e.foodAppeal ?? 0) * level;
    total.cleanSpeed += (e.cleanSpeed ?? 0) * level;
    total.iceCostReduction += (e.iceCostReduction ?? 0) * level;
  }
  return total;
}
