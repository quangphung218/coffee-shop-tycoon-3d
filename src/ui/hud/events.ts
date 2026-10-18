import { getIngredient } from '../../sim/data/ingredients';
import { levelDef } from '../../sim/data/levels';
import { getMenuItem } from '../../sim/data/menu';
import { ACHIEVEMENTS } from '../../sim/data/retention';
import { getUpgrade } from '../../sim/data/upgrades';
import { stockOutlook } from '../../sim/inventory';
import { weekIndex } from '../../sim/progression';
import { VIP_TICKETS } from '../../sim/specialOrders';
import type { GameEvent, GameState, SpendKind, Unlocks } from '../../sim/types';
import { formatMoney } from '../core/format';
import { INGREDIENT_ICONS, LEVEL_ICON, MENU_ICONS } from '../core/iconMap';
import type { IconId } from '../core/icons';
import type { ToastInput } from '../core/toast';

/** Verb and icon of a spend toast; the icons are the dock tabs of each kind. */
const SPEND_TOASTS: Readonly<Record<SpendKind, { title: string; icon: IconId }>> = {
  restock: { title: 'Đã nhập', icon: 'i-inventory' },
  upgrade: { title: 'Đã nâng cấp', icon: 'i-upgrades' },
  campaign: { title: 'Đã chạy', icon: 'i-marketing' },
};

/** "2 món, 1 nâng cấp, 1 dụng cụ" — the non-empty unlock counts of a level-up. */
function unlockSummary(u: Unlocks): string {
  const parts: string[] = [];
  if (u.menu.length) parts.push(`${u.menu.length} món`);
  if (u.upgrades.length) parts.push(`${u.upgrades.length} nâng cấp`);
  if (u.tools.length) parts.push(`${u.tools.length} dụng cụ`);
  return parts.join(', ');
}

/** "Cappuccino, Máy xay hạt" — names of what a calendar day opens: menu items, then upgrades and tools. */
export function unlockNames(u: Unlocks): string {
  return [...u.menu.map((id) => getMenuItem(id).name), ...[...u.upgrades, ...u.tools].map((id) => getUpgrade(id).name)].join(', ');
}

/** Toast for a sim event, or null for events that only make a sound or move actors. */
export function toastForEvent(event: GameEvent, state: GameState): ToastInput | null {
  switch (event.type) {
    case 'notify':
      return { level: event.level, title: event.text };
    case 'angry':
      return { level: 'error', icon: 'i-face-angry', title: 'Khách bỏ đi', text: 'Chờ quá lâu hoặc món đã hết. Đánh giá sẽ giảm.', key: 'angry' };
    case 'level_up': {
      const unlocks = unlockSummary(event.unlocks);
      return {
        level: 'success',
        icon: LEVEL_ICON,
        title: `Lên Cấp ${event.level} · ${levelDef(event.level).name}`,
        text: unlocks ? `Mở khóa ${unlocks}.` : 'Quán của bạn ngày càng lớn mạnh!',
        key: 'level_up',
      };
    }
    case 'week_unlocks': {
      const names = unlockNames(event.unlocks);
      return {
        level: 'success',
        icon: 'i-sparkle',
        title: `Ngày ${event.day}: mở khóa mới`,
        text: names ? `${names}.` : 'Có thứ mới trong quán hôm nay.',
        key: 'week_unlocks',
      };
    }
    case 'week_ended': {
      const index = weekIndex(state);
      return {
        level: 'success',
        icon: 'i-trophy',
        title: `Hết tuần ${index} · ${event.result.score}/100 điểm`,
        text: `${event.result.cups}/3 cúp. Xem tổng kết tuần rồi sang tuần ${index + 1}.`,
        key: 'week_ended',
      };
    }
    case 'low_stock': {
      const def = getIngredient(event.ingredientId);
      // Same level as the Kho badge and the dock count.
      const { qty, level } = stockOutlook(state)[event.ingredientId];
      return {
        level: 'warning',
        icon: INGREDIENT_ICONS[event.ingredientId],
        title: level === 'out' ? `Hết ${def.name}` : `Sắp hết ${def.name}`,
        text: `Còn ${qty} ${def.unit}. Nhập thêm trước khi món bị khóa.`,
        key: `low:${event.ingredientId}`,
      };
    }
    case 'spend': {
      const { title, icon } = SPEND_TOASTS[event.kind];
      return {
        level: 'success',
        icon,
        title,
        key: `spend:${event.kind}`,
        merge: { verb: title, label: event.label, amount: event.amount, moneyLeft: event.moneyLeft },
      };
    }
    case 'gift_claimed':
      return {
        level: 'success',
        icon: 'i-sparkle',
        title: `Quà ngày ${event.streak}`,
        text: `+${formatMoney(event.money)} · +${event.tickets} Tem`,
        key: 'gift',
      };
    case 'achievement_unlocked': {
      const def = ACHIEVEMENTS[event.id];
      const tickets = def.tiers[event.tier - 1]?.tickets ?? 0;
      return {
        level: 'success',
        icon: 'i-trophy',
        title: `Thành tựu: ${def.name} mốc ${event.tier}`,
        text: tickets > 0 ? `+${tickets} Tem` : undefined,
        key: `achievement:${event.id}:${event.tier}`,
      };
    }
    case 'special_order': {
      const name = getMenuItem(event.itemId).name;
      if (event.status === 'failed') {
        return { level: 'info', icon: MENU_ICONS[event.itemId], title: `Hụt đơn đặc biệt: ${name}`, text: 'Hết giờ trước khi giao đủ.', key: 'special_order' };
      }
      const order = state.specialOrder ?? state.lastReport?.specialOrder;
      return {
        level: 'success',
        icon: MENU_ICONS[event.itemId],
        title: `Xong đơn đặc biệt: ${name}`,
        text: order?.itemId === event.itemId ? `+${formatMoney(order.rewardMoney)} · +${order.rewardTickets} Tem` : undefined,
        key: 'special_order',
      };
    }
    case 'vip_arrived':
      return { level: 'info', icon: 'i-star', title: 'Khách VIP vừa tới!', text: `Phục vụ để nhận +${VIP_TICKETS} Tem.`, key: 'vip' };
    case 'staff_promoted': {
      const member = state.staff.find((m) => m.id === event.staffId);
      return {
        level: 'success',
        icon: LEVEL_ICON,
        title: `${member?.name ?? 'Nhân viên'} lên cấp ${event.level}`,
        key: `promoted:${event.staffId}`,
      };
    }
    // Tickets are already on the gift, achievement, order and VIP toasts of the same frame.
    case 'tickets_earned':
    default:
      return null;
  }
}
