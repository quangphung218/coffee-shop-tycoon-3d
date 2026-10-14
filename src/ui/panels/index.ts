import { h } from '../core/dom';
import { registerPanel, type PanelDef, type PanelRender } from '../hud/panels';
import { renderInventoryPanel } from './inventory';
import { renderMarketingPanel } from './marketing';
import { renderMenuPanel } from './menu';
import { renderStaffPanel } from './staff';
import { renderTasksPanel } from './tasks';
import { renderUpgradesPanel } from './upgrades';
import './panels.css';

/** The six preparation panels, in dock order (design/t237-cartoon HUD). */
export const PREP_PANELS: readonly PanelDef[] = [
  { id: 'tasks', label: 'Việc', icon: 'i-tasks', render: renderTasksPanel },
  { id: 'menu', label: 'Menu', icon: 'i-menu', render: renderMenuPanel },
  { id: 'inventory', label: 'Kho', icon: 'i-inventory', render: renderInventoryPanel },
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
  const offs = PREP_PANELS.map((p) => registerPanel(p.id, p.label, p.icon, guarded(p.render)));
  return () => offs.forEach((off) => off());
}
