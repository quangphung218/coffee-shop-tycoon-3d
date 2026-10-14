import { getUpgrade } from '../../sim/data/upgrades';
import { nextUpgradeCost, upgradeLevel } from '../../sim/upgrades';
import type { GameState, UpgradeEffect, UpgradeId } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { UPGRADE_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { inlineConfirm, keepFocus, reasonLine, sender, setIconText, setReason, shortOfMoney, withIcon } from './widgets';

/** Groups from the spec, in display order; each heading borrows the icon of its first upgrade. */
export const UPGRADE_GROUPS: readonly { title: string; icon: IconId; ids: readonly UpgradeId[] }[] = [
  { title: 'Bàn ghế', icon: UPGRADE_ICONS.tables, ids: ['tables'] },
  { title: 'Máy pha', icon: UPGRADE_ICONS.better_machine, ids: ['better_machine', 'fast_machine'] },
  { title: 'Quầy', icon: UPGRADE_ICONS.big_counter, ids: ['big_counter'] },
  { title: 'Ngoài trời', icon: UPGRADE_ICONS.outdoor_seating, ids: ['outdoor_seating'] },
  { title: 'Mở rộng', icon: UPGRADE_ICONS.expand_area, ids: ['expand_area'] },
  { title: 'Trang trí', icon: UPGRADE_ICONS.plants, ids: ['plants', 'paintings', 'lights', 'window_bar'] },
];

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const dec = (v: number): string => String(Math.round(v * 100) / 100).replace('.', ',');

/** "+2 chỗ ngồi · +0,05 sao mỗi đơn · +4% khách · pha nhanh hơn 20%" per level. */
export function effectText(e: UpgradeEffect): string {
  const parts: string[] = [];
  if (e.capacity) parts.push(`+${e.capacity} chỗ ngồi`);
  if (e.ratingBonus) parts.push(`+${dec(e.ratingBonus)} sao mỗi đơn`);
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
      h('span', { class: 'item-icon' }, icon(UPGRADE_ICONS[id], { size: 32 })),
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
            keepFocus(li, body, () => send({ type: 'buy_upgrade', upgradeId: id }));
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
          setIconText(side, 'i-ok', 'Tối đa');
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
      ...UPGRADE_GROUPS.map((g) =>
        h('section', { class: 'stack', attrs: { 'aria-label': g.title } }, h('h3', { class: 'section-title' }, ...withIcon(g.icon, g.title, 24)), h('ul', { class: 'stack' }, ...g.ids.map(row))),
      ),
    ),
  );
  const state = ctx.getState();
  if (state) w.run(state);
  return { update: (s) => w.run(s) };
}
