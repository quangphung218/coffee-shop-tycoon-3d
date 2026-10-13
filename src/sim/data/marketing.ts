import type { MarketingDef, MarketingId } from '../types';

export const MARKETING: readonly MarketingDef[] = [
  {
    id: 'flyers',
    name: 'Phát tờ rơi',
    icon: '📄',
    description: 'Phát tờ rơi quanh khu phố trong một ngày.',
    cost: 150000,
    days: 1,
    customerMult: 1.2,
  },
  {
    id: 'happy_hour',
    name: 'Giờ vàng giảm giá',
    icon: '⏰',
    description: 'Khuyến mãi giờ vàng kéo khách trong hai ngày.',
    cost: 300000,
    days: 2,
    customerMult: 1.3,
  },
  {
    id: 'social_media',
    name: 'Quảng cáo mạng xã hội',
    icon: '📱',
    description: 'Chạy quảng cáo online trong ba ngày.',
    cost: 600000,
    days: 3,
    customerMult: 1.4,
  },
  {
    id: 'influencer',
    name: 'Mời KOL review',
    icon: '🌟',
    description: 'Người nổi tiếng giới thiệu quán, khách đông suốt ba ngày.',
    cost: 1500000,
    days: 3,
    customerMult: 1.8,
  },
];

const BY_ID = new Map<MarketingId, MarketingDef>(MARKETING.map((m) => [m.id, m]));

export function getCampaign(id: MarketingId): MarketingDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown campaign: ${id}`);
  return def;
}
