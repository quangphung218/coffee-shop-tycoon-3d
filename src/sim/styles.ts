import { STYLE_SLOTS, defaultStyle, styleById, type StyleDef } from './data/styles';
import { ensureRetention } from './retention';
import type { GameState, ShopStyles, StyleSlot } from './types';

/**
 * Shop styles (E-17): a look per slot bought once with money and Tem. Nothing
 * here touches the rating, customers, day stats or week score; buying only
 * takes the money and Tem, and is refused rather than going into debt.
 */

/** The save's style state, created empty (all defaults) for an older save. */
export function ensureStyles(state: GameState): ShopStyles {
  state.styles ??= { chosen: {}, owned: [], unlocked: [] };
  return state.styles;
}

/** The style a slot wears; saves without one, or with an id this build does not know, wear the default. */
export function styleOf(state: Pick<GameState, 'styles'>, slot: StyleSlot): StyleDef {
  const style = styleById(state.styles?.chosen[slot] ?? '');
  return style && style.slot === slot ? style : defaultStyle(slot);
}

/** The style worn on every slot. */
export function chosenStyles(state: Pick<GameState, 'styles'>): Record<StyleSlot, StyleDef> {
  return Object.fromEntries(STYLE_SLOTS.map((slot) => [slot, styleOf(state, slot)])) as Record<StyleSlot, StyleDef>;
}

/** True for a default or a bought style. */
export function ownsStyle(state: Pick<GameState, 'styles'>, id: string): boolean {
  const style = styleById(id);
  if (!style) return false;
  return style.price === 0 && style.tickets === 0 ? true : (state.styles?.owned.includes(id) ?? false);
}

/** False only for a challenge-gated style no completed challenge unlocked yet. */
export function isStyleUnlocked(state: Pick<GameState, 'styles'>, id: string): boolean {
  const style = styleById(id);
  if (!style) return false;
  return !style.challenge || (state.styles?.unlocked.includes(id) ?? false);
}

/** Why the style cannot be bought now, or null when it can. */
export function styleBlockedReason(state: GameState, id: string): string | null {
  const style = styleById(id);
  if (!style) return 'Không có kiểu này';
  if (ownsStyle(state, id)) return `Đã có ${style.name}`;
  if (!isStyleUnlocked(state, id)) return `${style.name} mở khi hoàn thành thử thách tuần`;
  if (state.money < style.price) return `Không đủ tiền mua ${style.name}`;
  const tickets = state.retention?.tickets ?? 0;
  if (tickets < style.tickets) return `Thiếu ${style.tickets - tickets} Tem`;
  return null;
}

/** True when buyStyle would succeed now. */
export function canAffordStyle(state: GameState, id: string): boolean {
  return styleBlockedReason(state, id) === null;
}

function refuse(state: GameState, text: string): false {
  state.events.push({ type: 'notify', level: 'error', text });
  return false;
}

/** Wears a style already owned on its slot; refused for unknown or unowned styles. */
export function selectStyle(state: GameState, id: string): boolean {
  const style = styleById(id);
  if (!style) return refuse(state, 'Không có kiểu này');
  if (!ownsStyle(state, id)) return refuse(state, `Chưa mua ${style.name}`);
  if (styleOf(state, style.slot).id === id) return true;
  ensureStyles(state).chosen[style.slot] = id;
  state.events.push({ type: 'style_changed', slot: style.slot, styleId: id });
  return true;
}

/** Pays a style's money and Tem once, owns it and wears it. Not counted in the day's stats. */
export function buyStyle(state: GameState, id: string): boolean {
  const reason = styleBlockedReason(state, id);
  if (reason) return refuse(state, reason);
  const style = styleById(id)!;
  if (style.tickets > 0) ensureRetention(state).tickets -= style.tickets;
  state.money -= style.price;
  ensureStyles(state).owned.push(id);
  state.events.push({ type: 'style_bought', styleId: id, slot: style.slot, money: style.price, tickets: style.tickets });
  return selectStyle(state, id);
}

/** Unlocks a challenge-gated style (from a completed challenge's reward); unknown or already open ids do nothing. */
export function unlockStyle(state: GameState, id: string): void {
  const style = styleById(id);
  if (!style?.challenge || isStyleUnlocked(state, id)) return;
  ensureStyles(state).unlocked.push(id);
  state.events.push({ type: 'style_unlocked', styleId: id, slot: style.slot });
}
