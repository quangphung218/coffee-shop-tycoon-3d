import { DIFFICULTIES } from '../../sim/data/difficulty';
import { upgradeUnlockLevel } from '../../sim/data/levels';
import { getUpgrade, upgradeCost, UPGRADES } from '../../sim/data/upgrades';
import { isUnlocked, weekDay } from '../../sim/progression';
import { DECOR_REFUND_SHARE, isRemovableDecor, nextUpgradeCost, upgradeLevel } from '../../sim/upgrades';
import type { GameState, UpgradeDef, UpgradeEffect, UpgradeId } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { UPGRADE_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { unlockHint } from './menu';
import { inlineConfirm, keepFocus, reasonLine, sender, setIconText, setReason, shortOfMoney, withIcon } from './widgets';

/** Heading per upgrade `category` (design/p20 §4): equipment / space / decor. */
const GROUP_ORDER: readonly { title: string; icon: IconId; category: UpgradeDef['category'] }[] = [
  { title: 'Dụng cụ', icon: UPGRADE_ICONS.better_machine, category: 'equipment' },
  { title: 'Không gian', icon: UPGRADE_ICONS.tables, category: 'space' },
  { title: 'Trang trí', icon: UPGRADE_ICONS.plants, category: 'decor' },
];

/** The three category groups, each listing its upgrades by unlock level then data order. */
export const UPGRADE_GROUPS: readonly { title: string; icon: IconId; ids: readonly UpgradeId[] }[] = GROUP_ORDER.map((g) => ({
  title: g.title,
  icon: g.icon,
  ids: UPGRADES.filter((u) => u.category === g.category)
    .map((u, i) => ({ id: u.id, level: upgradeUnlockLevel(u.id), i }))
    .sort((a, b) => a.level - b.level || a.i - b.i)
    .map((u) => u.id),
}));

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const dec = (v: number): string => String(Math.round(v * 100) / 100).replace('.', ',');

/** "+2 chỗ ngồi · +0,05 sao mỗi đơn · +4% khách · pha nhanh hơn 20%" per level. */
export function effectText(e: UpgradeEffect): string {
  const parts: string[] = [];
  if (e.capacity) parts.push(`+${e.capacity} chỗ ngồi`);
  if (e.ratingBonus) parts.push(`+${dec(e.ratingBonus)} sao mỗi đơn`);
  if (e.appeal) parts.push(`+${pct(e.appeal)} khách`);
  if (e.brewSpeed) parts.push(`pha nhanh hơn ${pct(e.brewSpeed)}`);
  if (e.coffeeBrewSpeed) parts.push(`pha cà phê nhanh hơn ${pct(e.coffeeBrewSpeed)}`);
  if (e.coldBrewSpeed) parts.push(`pha đồ lạnh nhanh hơn ${pct(e.coldBrewSpeed)}`);
  if (e.foodBrewSpeed) parts.push(`làm món ăn nhanh hơn ${pct(e.foodBrewSpeed)}`);
  if (e.foodAppeal) parts.push(`+${pct(e.foodAppeal)} gọi món ăn`);
  if (e.cleanSpeed) parts.push(`dọn bàn nhanh hơn ${pct(e.cleanSpeed)}`);
  if (e.iceCostReduction) parts.push(`−${pct(e.iceCostReduction)} giá đá`);
  return parts.join(' · ');
}

/** How long "Gỡ" stays armed waiting for a second click, ms (as "Về mặc định" in Cài đặt). */
export const REMOVE_CONFIRM_MS = 3000;

/** Money back for taking down the top level of a decor item (same rule as the sim's removeDecor). */
export function decorRefund(state: GameState, id: UpgradeId): number {
  const level = upgradeLevel(state, id);
  if (level <= 0) return 0;
  const paid = upgradeCost(getUpgrade(id), level - 1, DIFFICULTIES[state.difficulty].priceMult) ?? 0;
  return Math.round(paid * DECOR_REFUND_SHARE);
}

/**
 * Nâng cấp by group: price of the next level, current level and the effect
 * per level. "Mua" asks for an in-place confirm, then sends buy_upgrade.
 * Owned decor without seats has "Gỡ (+X)": the first click arms it for
 * REMOVE_CONFIRM_MS, a second click sends remove_decor.
 */
export function renderUpgradesPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  const send = sender(ctx, (s) => w.run(s));

  /** In-place two-click "Gỡ" for one decor card. */
  function removeControl(id: UpgradeId, li: HTMLElement): HTMLElement {
    const btn = h('button', { class: 'btn btn-secondary btn-sm', attrs: { type: 'button', 'data-action': 'remove' } });
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refund = 0;
    const paint = (): void => {
      btn.textContent = armed ? 'Bấm lần nữa để gỡ' : `Gỡ (+${formatMoney(refund)})`;
    };
    const disarm = (): void => {
      armed = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      paint();
    };
    btn.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        paint();
        timer = setTimeout(disarm, REMOVE_CONFIRM_MS);
        return;
      }
      disarm();
      keepFocus(li, body, () => send({ type: 'remove_decor', upgradeId: id }));
    });
    const row = h('div', { class: 'item-actions', attrs: { 'data-remove': id } }, btn);
    w.watch(
      (s) => `${upgradeLevel(s, id)}|${decorRefund(s, id)}`,
      (_, s) => {
        refund = decorRefund(s, id);
        row.hidden = upgradeLevel(s, id) <= 0;
        disarm();
      },
    );
    return row;
  }

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
    if (isRemovableDecor(id)) li.append(removeControl(id, li));
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
      (s) => `${s.shopLevel}|${weekDay(s)}|${upgradeLevel(s, id)}|${nextUpgradeCost(s, id)}|${s.money}`,
      (_, s) => {
        const lv = upgradeLevel(s, id);
        const cost = nextUpgradeCost(s, id);
        level.textContent = `Cấp ${lv}/${def.maxLevel} · ${def.description}`;
        // Not open yet: a flat "Mở ngày N" / "Mở ở cấp N" label, Mua disabled with the reason.
        const locked = lv === 0 && !isUnlocked(s, 'upgrade', id);
        li.classList.toggle('is-locked', locked);
        if (locked) {
          const opens = unlockHint(s, 'upgrade', id);
          side.className = 'badge badge-neutral';
          setIconText(side, 'i-lock', opens.badge);
          if (!li.querySelector('.confirm')) actions.hidden = false;
          setAriaDisabled(buy, true);
          setReason(why, buy, opens.reason);
          return;
        }
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
