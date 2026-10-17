import type { GameEvent, MenuItemId, UpgradeId } from '../../sim/types';

/**
 * Items and upgrades opened this session (level_up, week_unlocks), for the
 * "Mới" dot on the dock and the "Mới" label on their rows. Session only: the
 * save never holds it, a started or loaded game clears it, and closing the
 * Menu or Nâng cấp panel clears that tab's ids (the player has seen them).
 */

/** Panel ids that carry "Mới" marks. */
export type FreshTab = 'menu' | 'upgrades';

export interface FreshStore {
  /** Adds the ids opened by one frame of sim events. */
  handleEvents(events: readonly GameEvent[]): void;
  has(tab: FreshTab, id: MenuItemId | UpgradeId): boolean;
  /** New ids in a panel; 0 for a panel without marks. */
  count(tab: string): number;
  /** The player saw the tab: drop its ids. */
  clearTab(tab: string): void;
  clear(): void;
  /** Called after every change; returns an unsubscribe function. */
  subscribe(fn: () => void): () => void;
}

export function createFreshStore(): FreshStore {
  const ids: Record<FreshTab, Set<string>> = { menu: new Set(), upgrades: new Set() };
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const fn of listeners) fn();
  };
  const tabOf = (tab: string): Set<string> | null => (tab === 'menu' || tab === 'upgrades' ? ids[tab] : null);

  return {
    handleEvents(events) {
      const before = ids.menu.size + ids.upgrades.size;
      for (const e of events) {
        if (e.type !== 'level_up' && e.type !== 'week_unlocks') continue;
        for (const id of e.unlocks.menu) ids.menu.add(id);
        for (const id of e.unlocks.upgrades) ids.upgrades.add(id);
      }
      if (ids.menu.size + ids.upgrades.size !== before) notify();
    },
    has: (tab, id) => ids[tab].has(id),
    count: (tab) => tabOf(tab)?.size ?? 0,
    clearTab(tab) {
      const set = tabOf(tab);
      if (!set || set.size === 0) return;
      set.clear();
      notify();
    },
    clear() {
      if (ids.menu.size === 0 && ids.upgrades.size === 0) return;
      ids.menu.clear();
      ids.upgrades.clear();
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** The session's store, shared by main.ts, the dock and the panels. */
export const fresh: FreshStore = createFreshStore();
