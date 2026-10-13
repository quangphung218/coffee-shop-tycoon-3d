import { getUpgrade } from '../../sim/data/upgrades';
import { nextUpgradeCost, upgradeLevel } from '../../sim/upgrades';
import type { GameState, UpgradeEffect, UpgradeId } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { inlineConfirm, reasonLine, sender, setReason, shortOfMoney } from './widgets';

/** Groups from the spec, in display order. */
export const UPGRADE_GROUPS: readonly { title: string; ids: readonly UpgradeId[] }[] = [
  { title: '🪑 Bàn ghế', ids: ['tables'] },
  { title: '☕ Máy pha', ids: ['better_machine', 'fast_machine'] },
  { title: '🧾 Quầy', ids: ['big_counter'] },
  { title: '⛱️ Ngoài trời', ids: ['outdoor_seating'] },
  { title: '🏗️ Mở rộng', ids: ['expand_area'] },
  { title: '🪴 Trang trí', ids: ['plants', 'paintings', 'lights'] },
];

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const dec = (v: number): string => String(Math.round(v * 100) / 100).replace('.', ',');

/** "+2 chỗ ngồi · +0,05 ★ · +4% khách · pha nhanh hơn 20%" per level. */
export function effectText(e: UpgradeEffect): string {
  const parts: string[] = [];
  if (e.capacity) parts.push(`+${e.capacity} chỗ ngồi`);
  if (e.ratingBonus) parts.push(`+${dec(e.ratingBonus)} ★ mỗi đơn`);
  if (e.appeal) parts.push(`+${pct(e.appeal)} khách`);
  if (e.brewSpeed) parts.push(`pha nhanh hơn ${pct(e.brewSpeed)}`);
  return parts.join(' · ');
}

/**
 * Nâng cấp by group: price of the next level, current level and the effect
 * per level. "Mua" asks for an in-place confirm, then sends buy_upgrade.
 */
export function renderUpgradesPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  const send = sender(ctx, (s) => w.run(s));

  function row(id: UpgradeId): HTMLElement {
    const def = getUpgrade(id);
    const side = h('span');
    const level = h('p', { class: 'item-meta' });
    const buy = h('button', { class: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-action': 'buy' }, text: 'Mua' });
    const why = reasonLine();
    const actions = h('div', { class: 'item-actions' }, buy, why);
    const li = h(
      'li',
      { class: 'item', attrs: { 'data-upgrade': id } },
      h('span', { class: 'item-icon', attrs: { 'aria-hidden': 'true' }, text: def.icon }),
      h('div', {}, h('p', { class: 'item-title', text: def.name }), level, h('p', { class: 'item-meta', text: `Mỗi cấp: ${effectText(def.effectPerLevel)}` })),
      side,
      actions,
    );
    buy.addEventListener('click', () => {
      const s = ctx.getState();
      const cost = s ? nextUpgradeCost(s, id) : null;
      if (!s || cost === null || isAriaDisabled(buy)) return;
      actions.hidden = true;
      li.append(
        inlineConfirm(
          `Mua ${def.name} cấp ${upgradeLevel(s, id) + 1} với ${formatMoney(cost)}? Còn lại ${formatMoney(s.money - cost)}.`,
          'Mua',
          'btn-primary',
          () => {
            actions.hidden = false;
            send({ type: 'buy_upgrade', upgradeId: id });
          },
          () => {
            actions.hidden = false;
            buy.focus();
          },
        ),
      );
    });
    w.watch(
      (s) => `${upgradeLevel(s, id)}|${nextUpgradeCost(s, id)}|${s.money}`,
      (_, s) => {
        const lv = upgradeLevel(s, id);
        const cost = nextUpgradeCost(s, id);
        level.textContent = `Cấp ${lv}/${def.maxLevel} · ${def.description}`;
        if (cost === null) {
          side.className = 'badge badge-ok';
          side.textContent = '✅ Tối đa';
          actions.hidden = true;
          return;
        }
        side.className = 'item-side';
        side.textContent = formatMoney(cost);
        if (!li.querySelector('.confirm')) actions.hidden = false;
        const short = s.money < cost ? shortOfMoney(cost, s.money, formatMoney) : null;
        setAriaDisabled(buy, short !== null);
        setReason(why, buy, short);
      },
    );
    return li;
  }

  body.append(
    h(
      'div',
      { class: 'prep' },
      ...UPGRADE_GROUPS.map((g) => h('section', { class: 'stack', attrs: { 'aria-label': g.title } }, h('h3', { class: 'section-title', text: g.title }), h('ul', { class: 'stack' }, ...g.ids.map(row)))),
    ),
  );
  const state = ctx.getState();
  if (state) w.run(state);
  return { update: (s) => w.run(s) };
}
