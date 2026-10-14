import { MARKETING } from '../../sim/data/marketing';
import type { GameState } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { MARKETING_ICONS } from '../core/iconMap';
import { icon } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { keepFocus, reasonLine, sender, setIconText, setReason, shortOfMoney } from './widgets';

/**
 * Marketing: each campaign with price, effect (+% khách) and length. Running
 * campaigns show the days left; the run button is dimmed with a reason
 * outside preparation or when money is short.
 */
export function renderMarketingPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  const send = sender(ctx, (s) => w.run(s));

  const rows = MARKETING.map((def) => {
    const run = h('button', { class: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-action': 'run' }, text: 'Chạy hôm nay' });
    const why = reasonLine();
    const side = h('span', { class: 'item-side' });
    run.addEventListener('click', () => {
      // A started campaign hides its button, so focus moves on to the next row.
      if (!isAriaDisabled(run)) keepFocus(li, body, () => send({ type: 'start_campaign', campaignId: def.id }));
    });
    const days = def.days === 1 ? 'hôm nay' : `${def.days} ngày`;
    w.watch(
      (s) => {
        const active = s.campaigns.find((c) => c.id === def.id && c.daysLeft > 0);
        return `${active?.daysLeft ?? 0}|${s.phase === 'preparation' ? 1 : 0}|${s.money >= def.cost ? 1 : 0}|${s.money}`;
      },
      (_, s) => {
        const active = s.campaigns.find((c) => c.id === def.id && c.daysLeft > 0);
        if (active) {
          side.className = 'badge badge-ok';
          setIconText(side, 'i-ok', 'Đang chạy');
        } else {
          side.className = 'item-side';
          side.textContent = formatMoney(def.cost);
        }
        run.hidden = !!active;
        let reason: string | null = null;
        if (active) reason = `Còn ${active.daysLeft} ngày.`;
        else if (s.phase !== 'preparation') reason = 'Chỉ chạy được khi chuẩn bị mở cửa buổi sáng.';
        else if (s.money < def.cost) reason = shortOfMoney(def.cost, s.money, formatMoney);
        setAriaDisabled(run, !active && reason !== null);
        why.classList.toggle('reason-danger', !active);
        setReason(why, run, reason, active ? 'i-clock' : 'i-lock');
      },
    );
    const li = h(
      'li',
      { class: 'item', attrs: { 'data-campaign': def.id } },
      h('span', { class: 'item-icon' }, icon(MARKETING_ICONS[def.id], { size: 32 })),
      h('div', {}, h('p', { class: 'item-title', text: def.name }), h('p', { class: 'item-meta', text: `+${Math.round((def.customerMult - 1) * 100)}% khách · ${days}` }), h('p', { class: 'item-meta', text: def.description })),
      side,
      h('div', { class: 'item-actions' }, run, why),
    );
    return li;
  });

  body.append(h('div', { class: 'prep' }, h('p', { class: 'intro', text: 'Trả tiền một lần lúc chuẩn bị; khách tăng ngay từ hôm nay. Nhiều chiến dịch cùng chạy thì cộng dồn.' }), h('ul', { class: 'stack' }, ...rows)));
  const state = ctx.getState();
  if (state) w.run(state);
  return { update: (s) => w.run(s) };
}
