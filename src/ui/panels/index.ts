import { INGREDIENTS } from '../../sim/data/ingredients';
import { stockOf } from '../../sim/inventory';
import type { GameState } from '../../sim/types';
import { h } from '../core/dom';
import { registerPanel, type PanelDef, type PanelRender } from '../hud/panels';
import { renderInventoryPanel, stockLevel } from './inventory';
import { renderMarketingPanel } from './marketing';
import { renderMenuPanel } from './menu';
import { renderStaffPanel } from './staff';
import { dayTasks, renderTasksPanel } from './tasks';
import { renderUpgradesPanel } from './upgrades';
import './panels.css';

/** Ingredients the Kho panel marks "Sắp hết" or "Hết". */
export function lowStockCount(state: GameState): number {
  return INGREDIENTS.filter((def) => stockLevel(def, stockOf(state, def.id)) !== 'ok').length;
}

/** Unfinished tasks on the Việc checklist. */
export function openTaskCount(state: GameState): number {
  return dayTasks(state).filter((t) => !t.done).length;
}

/** The six preparation panels, in dock order (design/t237-cartoon HUD). */
export const PREP_PANELS: readonly PanelDef[] = [
  { id: 'tasks', label: 'Việc', icon: 'i-tasks', render: renderTasksPanel, badge: openTaskCount },
  { id: 'menu', label: 'Menu', icon: 'i-menu', render: renderMenuPanel },
  { id: 'inventory', label: 'Kho', icon: 'i-inventory', render: renderInventoryPanel, badge: lowStockCount },
  { id: 'staff', label: 'Nhân viên', icon: 'i-people', render: renderStaffPanel },
  { id: 'marketing', label: 'Marketing', icon: 'i-marketing', render: renderMarketingPanel },
  { id: 'upgrades', label: 'Nâng cấp', icon: 'i-upgrades', render: renderUpgradesPanel },
];

/** Panels need a running game; on the main menu they say so instead of failing. */
function guarded(render: PanelRender): PanelRender {
  return (body, ctx) => {
    if (!ctx.getState()) {
      body.append(h('p', { class: 'intro', text: 'Chưa có ván chơi.' }));
      return;
    }
    return render(body, ctx);
  };
}

/** Adds the six panels to the dock. Returns a function that removes them. */
export function registerPrepPanels(): () => void {
  const offs = PREP_PANELS.map((p) => registerPanel(p.id, p.label, p.icon, guarded(p.render), p.badge));
  return () => offs.forEach((off) => off());
}
