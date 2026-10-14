import { getIngredient } from '../../sim/data/ingredients';
import { stockOutlook } from '../../sim/inventory';
import type { GameEvent, GameState } from '../../sim/types';
import { INGREDIENT_ICONS } from '../core/iconMap';
import type { ToastInput } from '../core/toast';

/** Toast for a sim event, or null for events that only make a sound or move actors. */
export function toastForEvent(event: GameEvent, state: GameState): ToastInput | null {
  switch (event.type) {
    case 'notify':
      return { level: event.level, title: event.text };
    case 'angry':
      return { level: 'error', icon: 'i-face-angry', title: 'Khách bỏ đi', text: 'Chờ quá lâu hoặc món đã hết. Đánh giá sẽ giảm.', key: 'angry' };
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
