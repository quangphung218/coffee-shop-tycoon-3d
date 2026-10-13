import { h } from '../core/dom';
import { registerPanel, type PanelRender } from '../hud/panels';
import { renderInventoryPanel } from './inventory';
import { renderMarketingPanel } from './marketing';
import { renderMenuPanel } from './menu';
import { renderStaffPanel } from './staff';
import { renderTasksPanel } from './tasks';
import { renderUpgradesPanel } from './upgrades';
import './panels.css';

/** The six preparation panels, in HUD order (design/prep.html tabs). */
export const PREP_PANELS: readonly { id: string; label: string; render: PanelRender }[] = [
  { id: 'tasks', label: '📋 Việc', render: renderTasksPanel },
  { id: 'menu', label: '🍽️ Menu', render: renderMenuPanel },
  { id: 'inventory', label: '📦 Kho', render: renderInventoryPanel },
  { id: 'staff', label: '👥 Nhân viên', render: renderStaffPanel },
  { id: 'marketing', label: '📣 Marketing', render: renderMarketingPanel },
  { id: 'upgrades', label: '🛠️ Nâng cấp', render: renderUpgradesPanel },
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

/** Adds the six panels to the HUD. Returns a function that removes them. */
export function registerPrepPanels(): () => void {
  const offs = PREP_PANELS.map((p) => registerPanel(p.id, p.label, guarded(p.render)));
  return () => offs.forEach((off) => off());
}
