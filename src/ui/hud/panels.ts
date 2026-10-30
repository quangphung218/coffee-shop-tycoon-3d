import type { Command, GameState, StyleSlot } from '../../sim/types';
import type { IconId } from '../core/icons';

/** What a panel gets from the HUD. */
export interface PanelContext {
  dispatch(cmd: Command): boolean;
  /** Current game, or null on the main menu. */
  getState(): GameState | null;
  close(): void;
  /** Shows style `id` on `slot` of the 3D shop without buying it; null shows the chosen style again. No-op without a scene. */
  previewStyle?(slot: StyleSlot, id: string | null): void;
  /** Brings the 3D camera back to its home view of the shop. No-op without a scene. */
  resetCamera?(): void;
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
  /** Plain button text, e.g. "Kho". */
  label: string;
  /** Dock icon drawn above the label. */
  icon: IconId;
  render: PanelRender;
  /** Items that need attention, shown as a dock badge; 0 hides it. Reads the state only. */
  badge?(state: GameState): number;
  /** Dock group ('ops'/'dev'); a divider is drawn where it changes. */
  group?: string;
}

const panels: PanelDef[] = [];
const listeners = new Set<() => void>();

/**
 * Adds a dock button that opens a side panel (Kho, Menu, Nhân viên…).
 * Registering an id again replaces the earlier panel. Returns an unregister function.
 */
export function registerPanel(id: string, label: string, icon: IconId, render: PanelRender, badge?: PanelDef['badge'], group?: string): () => void {
  const def: PanelDef = { id, label, icon, render, badge, group };
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
