import { getIngredient } from '../../sim/data/ingredients';
import { levelDef } from '../../sim/data/levels';
import { stockOutlook } from '../../sim/inventory';
import type { GameEvent, GameState, Unlocks } from '../../sim/types';
import { INGREDIENT_ICONS, LEVEL_ICON } from '../core/iconMap';
import type { ToastInput } from '../core/toast';

/** "2 món, 1 nâng cấp, 1 dụng cụ" — the non-empty unlock counts of a level-up. */
function unlockSummary(u: Unlocks): string {
  const parts: string[] = [];
  if (u.menu.length) parts.push(`${u.menu.length} món`);
  if (u.upgrades.length) parts.push(`${u.upgrades.length} nâng cấp`);
  if (u.tools.length) parts.push(`${u.tools.length} dụng cụ`);
  return parts.join(', ');
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
    default:
      return null;
  }
}
