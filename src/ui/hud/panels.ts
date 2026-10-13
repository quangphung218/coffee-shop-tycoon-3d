import type { Command, GameState } from '../../sim/types';

/** What a panel gets from the HUD. */
export interface PanelContext {
  dispatch(cmd: Command): boolean;
  /** Current game, or null on the main menu. */
  getState(): GameState | null;
  close(): void;
}

/** Optional hooks a panel returns from its render function. */
export interface PanelHandle {
  /** Called every frame while the panel is open; change the DOM only when values change (see Watcher). */
  update?(state: GameState): void;
  /** Called when the panel closes, before its body is emptied. */
  dispose?(): void;
}

/** Fills `body` when the panel opens. Called again on every open. */
export type PanelRender = (body: HTMLElement, ctx: PanelContext) => PanelHandle | void;

export interface PanelDef {
  id: string;
  /** Button text, icon first, e.g. "📦 Kho". */
  label: string;
  render: PanelRender;
}

const panels: PanelDef[] = [];
const listeners = new Set<() => void>();

/**
 * Adds a button to the HUD that opens a side panel (Kho, Menu, Nhân viên…).
 * Registering an id again replaces the earlier panel. Returns an unregister function.
 */
export function registerPanel(id: string, label: string, render: PanelRender): () => void {
  const def: PanelDef = { id, label, render };
  const i = panels.findIndex((p) => p.id === id);
  if (i >= 0) panels[i] = def;
  else panels.push(def);
  for (const fn of listeners) fn();
  return () => {
    const at = panels.indexOf(def);
    if (at < 0) return;
    panels.splice(at, 1);
    for (const fn of listeners) fn();
  };
}

export function listPanels(): readonly PanelDef[] {
  return panels;
}

/** Subscribes to registry changes; returns an unsubscribe function. */
export function onPanelsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
