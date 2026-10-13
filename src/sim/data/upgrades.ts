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
    name: 'Máy pha tốt hơn',
    icon: '⚙️',
    description: 'Đồ uống ngon hơn, khách chấm điểm cao hơn.',
    category: 'equipment',
    maxLevel: 3,
    baseCost: 1500000,
    costGrowth: 1.8,
    effectPerLevel: { ratingBonus: 0.2 },
  },
  {
    id: 'fast_machine',
    name: 'Máy pha nhanh hơn',
    icon: '⚡',
    description: 'Rút ngắn thời gian pha chế.',
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
];

const BY_ID = new Map<UpgradeId, UpgradeDef>(UPGRADES.map((u) => [u.id, u]));

export function getUpgrade(id: UpgradeId): UpgradeDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown upgrade: ${id}`);
  return def;
}

/** Price of buying the next level when `currentLevel` levels are owned; null at max level. */
export function upgradeCost(def: UpgradeDef, currentLevel: number, priceMult = 1): number | null {
  if (currentLevel >= def.maxLevel) return null;
  return Math.round((def.baseCost * Math.pow(def.costGrowth, currentLevel) * priceMult) / 1000) * 1000;
}

/** Sum of effects over all owned upgrade levels. */
export function totalUpgradeEffect(levels: Partial<Record<UpgradeId, number>>): Required<UpgradeEffect> {
  const total: Required<UpgradeEffect> = { capacity: 0, ratingBonus: 0, appeal: 0, brewSpeed: 0 };
  for (const def of UPGRADES) {
    const level = levels[def.id] ?? 0;
    if (level <= 0) continue;
    const e = def.effectPerLevel;
    total.capacity += (e.capacity ?? 0) * level;
    total.ratingBonus += (e.ratingBonus ?? 0) * level;
    total.appeal += (e.appeal ?? 0) * level;
    total.brewSpeed += (e.brewSpeed ?? 0) * level;
  }
  return total;
}
