import { stockOutlook } from '../../sim/inventory';
import type { GameState } from '../../sim/types';
import { h } from '../core/dom';
import { registerPanel, type PanelDef, type PanelRender } from '../hud/panels';
import { renderInventoryPanel } from './inventory';
import { renderMarketingPanel } from './marketing';
import { renderMenuPanel } from './menu';
import { renderStaffPanel } from './staff';
import { dayTasks, renderTasksPanel } from './tasks';
import { renderUpgradesPanel } from './upgrades';
import './panels.css';

/** Ingredients the Kho panel marks "Sắp hết" or "Hết". */
export function lowStockCount(state: GameState): number {
  return Object.values(stockOutlook(state)).filter((o) => o.level !== 'ok').length;
}

/**
 * Unfinished items on the Việc checklist. Daily missions are not counted: they
 * are scored on their own at day end and need no action to open the shop.
 */
export function openTaskCount(state: GameState): number {
  return dayTasks(state).filter((t) => !t.done).length;
}

/**
 * The six preparation panels, in dock order (design/t237-cartoon HUD). The
 * dock splits them into "Vận hành" (ops) and "Phát triển" (dev) with a divider
 * where the group changes (design/p20 §5).
 */
export const PREP_PANELS: readonly PanelDef[] = [
  { id: 'tasks', label: 'Việc', icon: 'i-tasks', render: renderTasksPanel, badge: openTaskCount, group: 'ops' },
  { id: 'menu', label: 'Menu', icon: 'i-menu', render: renderMenuPanel, group: 'ops' },
  { id: 'inventory', label: 'Kho', icon: 'i-inventory', render: renderInventoryPanel, badge: lowStockCount, group: 'ops' },
  { id: 'staff', label: 'Nhân viên', icon: 'i-people', render: renderStaffPanel, group: 'ops' },
  { id: 'marketing', label: 'Marketing', icon: 'i-marketing', render: renderMarketingPanel, group: 'dev' },
  { id: 'upgrades', label: 'Nâng cấp', icon: 'i-upgrades', render: renderUpgradesPanel, group: 'dev' },
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
  const offs = PREP_PANELS.map((p) => registerPanel(p.id, p.label, p.icon, guarded(p.render), p.badge, p.group));
  return () => offs.forEach((off) => off());
}
