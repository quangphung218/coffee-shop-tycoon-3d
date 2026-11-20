// E-30: High price / High wage run out after 7 days (E-28, E-29). Outside their
// panels the player sees it as: the sim's expiry notify turned into a toast with
// a button that sets High again, a dock badge on Menu / Nhân viên on the last
// day and the day it ran out, a Việc line the day it ran out, and a week-end
// line when it runs out on the first day of next week. Read-only on the state.
import { canChangePolicy, HIGH_PRICE_DAYS, HIGH_WAGE_DAYS, highPriceDaysLeft, highPriceJustEnded, highWageDaysLeft, highWageJustEnded } from '../sim/policies';
import type { Command, GameEvent, GameState } from '../sim/types';
import type { ToastInput } from './core/toast';
import { HIGH_PRICE_ENDED_TEXT, HIGH_PRICE_RESET_TEXT } from './panels/menu';
import { HIGH_WAGE_ENDED_TEXT, HIGH_WAGE_RESET_TEXT } from './panels/staff';

export type HighPolicy = 'price' | 'wage';

/** Text of the sim's expiry notify (src/sim/policies.ts expireHighPrice / expireHighWage). */
const EXPIRY_NOTIFY: Readonly<Record<HighPolicy, RegExp>> = {
  price: /^Giá cao đã hết sau \d+ ngày/,
  wage: /^Lương cao đã hết sau \d+ ngày/,
};

/** Toast title: the chooser's words ("Cao", "Chuẩn"). */
export const HIGH_PRICE_TOAST_TITLE = `Giá Cao đã hết sau ${HIGH_PRICE_DAYS} ngày, quán về giá Chuẩn`;
export const HIGH_WAGE_TOAST_TITLE = `Lương Cao đã hết sau ${HIGH_WAGE_DAYS} ngày, quán về lương Chuẩn`;

/** data-action of the toast's button (the panels' notice buttons are price-high-again / wage-high-again). */
export const HIGH_PRICE_TOAST_ACTION = 'toast-price-high-again';
export const HIGH_WAGE_TOAST_ACTION = 'toast-wage-high-again';

/** Việc lines the day High ran out. */
export const HIGH_PRICE_TASK_TITLE = 'Giá Cao vừa hết';
export const HIGH_WAGE_TASK_TITLE = 'Lương Cao vừa hết';

/** Which High policy this event says ran out today, or null. */
export function highExpiryOf(event: GameEvent, state: GameState): HighPolicy | null {
  if (event.type !== 'notify') return null;
  if (EXPIRY_NOTIFY.price.test(event.text) && highPriceJustEnded(state)) return 'price';
  if (EXPIRY_NOTIFY.wage.test(event.text) && highWageJustEnded(state)) return 'wage';
  return null;
}

/**
 * The toast in place of the sim's expiry notify (one toast, as before), with a
 * button that sets High again. It stays a little longer than an info toast.
 */
export function highExpiryToast(policy: HighPolicy, send: (cmd: Command) => unknown): ToastInput {
  const price = policy === 'price';
  return {
    level: 'info',
    icon: price ? 'i-coin' : 'i-people',
    title: price ? HIGH_PRICE_TOAST_TITLE : HIGH_WAGE_TOAST_TITLE,
    text: price ? HIGH_PRICE_ENDED_TEXT : HIGH_WAGE_ENDED_TEXT,
    key: `high-ended:${policy}`,
    visibleMs: 8000,
    action: {
      label: price ? HIGH_PRICE_RESET_TEXT : HIGH_WAGE_RESET_TEXT,
      name: price ? HIGH_PRICE_TOAST_ACTION : HIGH_WAGE_TOAST_ACTION,
      run: () => send({ type: 'set_policy', policy, level: 'high' }),
    },
  };
}

/** High ran out today and can be set again now (preparation). */
export function highEndedNow(state: GameState, policy: HighPolicy): boolean {
  if (!canChangePolicy(state)) return false;
  return policy === 'price' ? highPriceJustEnded(state) : highWageJustEnded(state);
}

/** Dock badge count (0 or 1) for Menu / Nhân viên: while preparing, on High's last day and the day it ran out. */
export function highPolicyBadge(state: GameState, policy: HighPolicy): number {
  if (!canChangePolicy(state)) return 0;
  const left = policy === 'price' ? highPriceDaysLeft(state) : highWageDaysLeft(state);
  return left === 1 || highEndedNow(state, policy) ? 1 : 0;
}

export const menuBadge = (state: GameState): number => highPolicyBadge(state, 'price');
export const staffBadge = (state: GameState): number => highPolicyBadge(state, 'wage');

/** "Giá Cao hết vào ngày đầu tuần N." for each High with one day left (the week's last day); empty otherwise. */
export function highEndsNextWeekLines(state: GameState, nextWeek: number): { policy: HighPolicy; text: string }[] {
  const lines: { policy: HighPolicy; text: string }[] = [];
  if (highPriceDaysLeft(state) === 1) lines.push({ policy: 'price', text: `Giá Cao hết vào ngày đầu tuần ${nextWeek}.` });
  if (highWageDaysLeft(state) === 1) lines.push({ policy: 'wage', text: `Lương Cao hết vào ngày đầu tuần ${nextWeek}.` });
  return lines;
}
