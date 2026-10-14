import { getIngredient } from '../../sim/data/ingredients';
import { getCampaign } from '../../sim/data/marketing';
import { getMenuItem } from '../../sim/data/menu';
import { autoRestockSuggestion, canMake } from '../../sim/inventory';
import type { GameState, SuggestionKind } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, setChildren, Watcher } from '../core/dom';
import { icon } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { linkBtn, reasonLine, sender, setReason, withIcon } from './widgets';

export interface DayTask {
  id: 'menu' | 'restock' | 'staff' | 'marketing';
  title: string;
  done: boolean;
  /** Something is wrong, not just unfinished (locked items, empty stock). */
  warn: boolean;
  detail: string;
  panel: string;
  link: string;
}

/** Today's checklist, read from the state. Unfinished tasks never block opening. */
export function dayTasks(state: GameState): DayTask[] {
  const enabled = state.menu.filter((m) => m.enabled);
  const locked = enabled.filter((m) => !canMake(state, m.id));
  const restock = autoRestockSuggestion(state).items;
  const unassigned = state.staff.filter((m) => m.role === 'none');
  const campaigns = state.campaigns.filter((c) => c.daysLeft > 0);
  const names = (ids: string[]): string => (ids.length > 3 ? `${ids.slice(0, 3).join(', ')}…` : ids.join(', '));

  return [
    {
      id: 'menu',
      title: 'Chọn menu hôm nay',
      done: enabled.length > 0 && locked.length === 0,
      warn: enabled.length === 0 || locked.length > 0,
      detail:
        enabled.length === 0
          ? 'Chưa bật món nào.'
          : locked.length > 0
            ? `${names(locked.map((m) => getMenuItem(m.id).name))} đang bán nhưng thiếu nguyên liệu.`
            : `Xong · ${enabled.length} món đang bán.`,
      panel: 'menu',
      link: 'Mở Menu',
    },
    {
      id: 'restock',
      title: 'Nhập nguyên liệu',
      done: restock.length === 0,
      warn: locked.length > 0,
      detail: restock.length === 0 ? 'Xong · kho đủ cho lượng khách dự kiến.' : `Nên nhập thêm: ${names(restock.map((l) => getIngredient(l.id).name))}.`,
      panel: 'inventory',
      link: 'Mở Kho',
    },
    {
      id: 'staff',
      title: 'Phân vai nhân viên',
      done: state.staff.length > 0 && unassigned.length === 0,
      warn: false,
      detail:
        state.staff.length === 0
          ? 'Chưa có nhân viên; bạn tự làm mọi việc. Tuyển ít nhất một Pha chế.'
          : unassigned.length > 0
            ? `${names(unassigned.map((m) => m.name))} chưa có vai.`
            : state.autoAssign
              ? `Xong · Tự phân vai đang bật cho ${state.staff.length} người.`
              : `Xong · ${state.staff.length} người đã có vai.`,
      panel: 'staff',
      link: 'Mở Nhân viên',
    },
    {
      id: 'marketing',
      title: 'Chạy marketing (tùy chọn)',
      done: campaigns.length > 0,
      warn: false,
      detail:
        campaigns.length > 0
          ? `Đang chạy: ${campaigns.map((c) => `${getCampaign(c.id).name} (còn ${c.daysLeft} ngày)`).join(', ')}.`
          : 'Kéo thêm khách từ hôm nay.',
      panel: 'marketing',
      link: 'Mở Marketing',
    },
  ];
}

const SUGGESTION_PANEL: Record<SuggestionKind, { panel: string; link: string }> = {
  restock: { panel: 'inventory', link: 'Mở Kho' },
  hire_barista: { panel: 'staff', link: 'Mở Nhân viên' },
  hire_server: { panel: 'staff', link: 'Mở Nhân viên' },
  hire_cleaner: { panel: 'staff', link: 'Mở Nhân viên' },
  marketing: { panel: 'marketing', link: 'Mở Marketing' },
  upgrade: { panel: 'upgrades', link: 'Mở Nâng cấp' },
};

/**
 * Task Board: today's checklist with done/not-done state, yesterday's report
 * suggestions, and "Mở cửa" (start_day). Unfinished tasks only remind.
 */
export function renderTasksPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  const send = sender(ctx, (s) => w.run(s));

  const summary = h('span');
  const bar = h('span');
  const list = h('ul', { class: 'stack', attrs: { 'aria-label': 'Việc trong ngày' } });
  const sugTitle = h('h3', { class: 'section-title' }, ...withIcon('i-tip', 'Gợi ý từ báo cáo hôm qua', 24));
  const sugList = h('ul', { class: 'stack' });
  const openBtn = h('button', { class: 'btn btn-accent btn-lg btn-block', attrs: { type: 'button', 'data-action': 'open' } }, icon('i-open'), 'Mở cửa');
  const why = reasonLine(false);
  openBtn.addEventListener('click', () => {
    if (!isAriaDisabled(openBtn)) send({ type: 'start_day' });
  });

  w.watch(
    (s) => `${s.phase}|${JSON.stringify(dayTasks(s))}`,
    (_, s) => {
      const tasks = dayTasks(s);
      const done = tasks.filter((t) => t.done).length;
      summary.textContent = `Đã xong ${done}/${tasks.length} việc`;
      bar.setAttribute('style', `width:${Math.round((done / tasks.length) * 100)}%`);
      setChildren(
        list,
        ...tasks.map((t) =>
          h(
            'li',
            { class: `task${t.done ? ' is-done' : ''}${!t.done && t.warn ? ' is-warn' : ''}`, attrs: { 'data-task': t.id, 'data-done': String(t.done) } },
            h('span', { class: 'task-icon' }, icon(t.done ? 'i-ok' : t.warn ? 'i-warning' : 'i-todo')),
            h(
              'div',
              {},
              h(
                'p',
                { class: 'task-title' },
                h('span', { class: 'sr-only', text: t.done ? 'Đã xong: ' : 'Chưa xong: ' }),
                t.title,
                !t.done && t.warn ? h('span', { class: 'badge badge-warn task-flag' }, icon('i-warning', { size: 16 }), 'Cần chú ý') : null,
              ),
              h('p', { class: 'item-meta', text: t.detail }),
              t.done ? null : linkBtn(t.link, t.panel),
            ),
          ),
        ),
      );
      const open = s.phase === 'preparation';
      const left = tasks.filter((t) => !t.done).length;
      setAriaDisabled(openBtn, !open);
      if (!open) setReason(why, openBtn, 'Quán đã mở cửa hôm nay.');
      else if (left > 0) setReason(why, openBtn, `Còn ${left} việc nên làm. Vẫn mở cửa được.`, 'i-info');
      else setReason(why, openBtn, 'Mọi việc đã xong. Sẵn sàng đón khách!', 'i-ok');
    },
  );
  w.watch(
    (s) => s.lastReport ?? null,
    (report) => {
      const items = report?.suggestions ?? [];
      sugTitle.hidden = items.length === 0;
      setChildren(
        sugList,
        ...items.map((sug) =>
          h('li', { class: 'task' }, h('span', { class: 'task-icon' }, icon('i-tip')), h('div', {},h('p', { class: 'item-meta', text: sug.text }), linkBtn(SUGGESTION_PANEL[sug.kind].link, SUGGESTION_PANEL[sug.kind].panel))),
        ),
      );
    },
  );

  body.append(
    h(
      'div',
      { class: 'prep' },
      h('div', { class: 'stack' }, h('div', { class: 'foot-sum' }, summary), h('div', { class: 'progress', attrs: { 'aria-hidden': 'true' } }, bar)),
      list,
      sugTitle,
      sugList,
      h('div', { class: 'panel-foot' }, openBtn, why),
    ),
  );
  const state = ctx.getState();
  if (state) w.run(state);
  return { update: (s) => w.run(s) };
}
