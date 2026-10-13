import { getIngredient } from '../../sim/data/ingredients';
import type { GameEvent, GameState } from '../../sim/types';
import type { ToastInput } from '../core/toast';

/** Toast for a sim event, or null for events that only make a sound or move actors. */
export function toastForEvent(event: GameEvent, state: GameState): ToastInput | null {
  switch (event.type) {
    case 'notify':
      return { level: event.level, title: event.text };
    case 'angry':
      return { level: 'error', icon: '😠', title: 'Khách bỏ đi', text: 'Chờ quá lâu hoặc món đã hết. Đánh giá sẽ giảm.', key: 'angry' };
    case 'low_stock': {
      const def = getIngredient(event.ingredientId);
      const qty = state.inventory.find((i) => i.id === event.ingredientId)?.qty ?? 0;
      return {
        level: 'warning',
        icon: def.icon,
        title: qty <= 0 ? `Hết ${def.name}` : `Sắp hết ${def.name}`,
        text: `Còn ${qty} ${def.unit}. Nhập thêm trước khi món bị khóa.`,
        key: `low:${event.ingredientId}`,
      };
    }
    default:
      return null;
  }
}
