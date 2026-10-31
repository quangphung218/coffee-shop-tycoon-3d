import { describeChallenge, nextChallengeStyle } from '../../sim/challenges';
import { getIngredient } from '../../sim/data/ingredients';
import { levelDef } from '../../sim/data/levels';
import { getMenuItem } from '../../sim/data/menu';
import { styleById } from '../../sim/data/styles';
import { regularById } from '../../sim/data/regulars';
import { ACHIEVEMENTS } from '../../sim/data/retention';
import { UNIFORMS } from '../../sim/data/uniforms';
import { getUpgrade } from '../../sim/data/upgrades';
import { stockOutlook } from '../../sim/inventory';
import { weekDay, weekIndex } from '../../sim/progression';
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

/** Second toast of a level-up that opens a uniform ("Mở khoá đồng phục Áo latte, mũ nồi"), or null. */
export function uniformUnlockToast(event: GameEvent): ToastInput | null {
  if (event.type !== 'level_up') return null;
  const opened = UNIFORMS.filter((u) => u.unlockLevel === event.level);
  if (opened.length === 0) return null;
  return {
    level: 'success',
    icon: 'i-sparkle',
    title: `Mở khoá đồng phục ${opened.map((u) => u.name).join(', ')}`,
    text: 'Chọn trong bảng Nhân viên.',
    key: 'uniform_unlocked',
  };
}

/** Real-time gap between two regular toasts; arrivals inside it get none (the Việc card lists them). */
export const REGULAR_TOAST_GAP_MS = 20_000;

let lastRegularToastAt: number | null = null;

/** Regular milestones toasted on `day`, and their Tem, for the merged toast. */
let milestonesToday = { day: 0, count: 0, tickets: 0 };

/** Forgets the last regular toast and the day's milestones, so the next arrival toasts again; called by the shell's `startGame` (Ván mới, Chơi lại, loading a save) and by tests. */
export function resetRegularToasts(): void {
  lastRegularToastAt = null;
  milestonesToday = { day: 0, count: 0, tickets: 0 };
}

/** "3 khách quen lên mốc · +4 Tem": the merged toast from the day's second milestone on. */
export function mergedMilestoneTitle(count: number, tickets: number): string {
  return `${count} khách quen lên mốc · +${tickets} Tem`;
}

/**
 * The day's first milestone names the regular; from the second one the same
 * toast reads mergedMilestoneTitle with the day's count and Tem, in place.
 */
function milestoneToast(event: Extract<GameEvent, { type: 'regular_milestone' }>, state: GameState): ToastInput | null {
  const name = regularById(event.regularId)?.name;
  if (!name) return null;
  if (milestonesToday.day !== state.day) milestonesToday = { day: state.day, count: 0, tickets: 0 };
  milestonesToday.count += 1;
  milestonesToday.tickets += event.tickets;
  if (milestonesToday.count > 1) {
    return { level: 'success', icon: 'i-face-happy', title: mergedMilestoneTitle(milestonesToday.count, milestonesToday.tickets), text: 'Xem trong Sổ khách quen.', key: 'regular_milestone', replace: true };
  }
  return {
    level: 'success',
    icon: 'i-face-happy',
    title: `${name}: mốc ${event.milestone} trong Sổ khách quen`,
    text: `Ghé ${event.visits} lần · +${event.tickets} Tem`,
    key: 'regular_milestone',
  };
}

/** Name of the shop style a challenge opens: the one it unlocked, or else the next one a completed challenge would. */
export function challengeStyleName(state: Pick<GameState, 'styles'>, unlock?: { id: string }): string | null {
  const id = unlock?.id ?? nextChallengeStyle(state);
  return id ? (styleById(id)?.name ?? null) : null;
}

/** Morning of a week with a side challenge: "Tuần 5 có thử thách: …", what to do and the style it opens; null otherwise. */
export function weekChallengeToast(state: GameState): ToastInput | null {
  const challenge = state.week?.challenge;
  if (!challenge || challenge.status !== 'active' || weekDay(state) !== 1) return null;
  const { name, description } = describeChallenge(challenge);
  const style = challengeStyleName(state);
  return {
    level: 'info',
    icon: 'i-sparkle',
    title: `Tuần ${weekIndex(state)} có thử thách: ${name}`,
    text: `${description} Thưởng +${challenge.reward.tickets} Tem${style ? `, mở kiểu ${style}` : ''}.`,
    key: 'challenge',
  };
}

/** "Khách quen mới: Cô Lan" or "Cô Lan ghé quán (lần 3)", at most one per REGULAR_TOAST_GAP_MS of real time. */
function regularToast(event: Extract<GameEvent, { type: 'regular_arrived' }>, now: number): ToastInput | null {
  const name = regularById(event.regularId)?.name;
  if (!name) return null;
  if (lastRegularToastAt !== null && now >= lastRegularToastAt && now - lastRegularToastAt < REGULAR_TOAST_GAP_MS) return null;
  lastRegularToastAt = now;
  return {
    level: 'info',
    icon: 'i-face-happy',
    title: event.visits <= 1 ? `Khách quen mới: ${name}` : `${name} ghé quán (lần ${event.visits})`,
    key: 'regular',
  };
}

/** Text of endOfDay's notify (src/sim/clock.ts). */
const DAY_END_NOTIFY = /^Kết thúc ngày \d+$/;

/**
 * Toast for a sim event, or null for events that only make a sound or move
 * actors. `now` is real time in ms, used only to space out regular toasts.
 */
export function toastForEvent(event: GameEvent, state: GameState, now = performance.now()): ToastInput | null {
  switch (event.type) {
    case 'regular_arrived':
      return regularToast(event, now);
    case 'regular_milestone':
      return milestoneToast(event, state);
    case 'notify':
      // endOfDay's "Kết thúc ngày N" lands with the Daily Report, whose heading says "Hết ngày N" already;
      // as a toast it only sat over the report's week strip on a phone (UX-102).
      if (state.phase === 'report' && DAY_END_NOTIFY.test(event.text)) return null;
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
    case 'challenge_completed': {
      // The style is already open by now, so only the event's own unlock names it.
      const style = event.challenge.reward.unlock ? challengeStyleName(state, event.challenge.reward.unlock) : null;
      return {
        level: 'success',
        icon: 'i-trophy',
        title: `Xong thử thách: ${describeChallenge(event.challenge).name}`,
        text: `+${event.challenge.reward.tickets} Tem${style ? ` · Mở kiểu ${style}` : ''}`,
        key: 'challenge',
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
    // Tickets are already on the gift, achievement, order, VIP, challenge and regular milestone toasts of the same frame.
    case 'tickets_earned':
    default:
      return null;
  }
}
