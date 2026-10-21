import { LEVELS, MAX_SHOP_LEVEL, maxLevelBonus, upgradeUnlockLevel } from '../../sim/data/levels';
import { getUpgrade, UPGRADES, upgradeTier } from '../../sim/data/upgrades';
import { isUnlocked, weekDay } from '../../sim/progression';
import {
  DECOR_REFUND_SHARE,
  isRemovableDecor,
  maxUpgradeLevel,
  nextUpgradeCost,
  nextUpgradeTicketCost,
  upgradeBlockedReason,
  upgradeLevel,
  upgradeLevelPrice,
} from '../../sim/upgrades';
import type { GameState, UpgradeDef, UpgradeEffect, UpgradeId } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { fresh } from '../core/fresh';
import { UPGRADE_ICONS } from '../core/iconMap';
import { type IconId, loadTierAtlas, tierIcon } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { freshBadge, setFresh, unlockHint } from './menu';
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

/**
 * "Bậc 1/3 · mua để lên bậc 2 · " for the upgrade meta line once bought; the
 * hint only when the next level (`canBuy`) changes the look. Empty at level 0.
 * The number after "/" is the highest tier the upgrade reaches at MAX_SHOP_LEVEL.
 */
export function tierText(id: UpgradeId, level: number, canBuy: boolean): string {
  const tier = upgradeTier(id, level);
  if (tier === 0) return '';
  const next = canBuy ? upgradeTier(id, level + 1) : tier;
  const top = upgradeTier(id, getUpgrade(id).maxLevel + maxLevelBonus(MAX_SHOP_LEVEL, id));
  return `Bậc ${tier}/${top} · ${next > tier ? `mua để lên bậc ${next} · ` : ''}`;
}

/** Next shop level (7..10) that raises the upgrade's cap, or null when none is left. */
export function nextBonusShopLevel(state: GameState, id: UpgradeId): number | null {
  const now = maxLevelBonus(state.shopLevel, id);
  return LEVELS.find((def) => def.level > state.shopLevel && maxLevelBonus(def.level, id) > now)?.level ?? null;
}

/** "50.000đ" or "50.000đ + 5 Tem" for the next level's price. */
function priceText(cost: number, tickets: number): string {
  return tickets > 0 ? `${formatMoney(cost)} + ${tickets} Tem` : formatMoney(cost);
}

/** How long "Gỡ" stays armed waiting for a second click, ms (as "Về mặc định" in Cài đặt). */
export const REMOVE_CONFIRM_MS = 3000;

/** Money back for taking down the top level of a decor item (same rule as the sim's removeDecor). */
export function decorRefund(state: GameState, id: UpgradeId): number {
  const level = upgradeLevel(state, id);
  if (level <= 0) return 0;
  return Math.round(upgradeLevelPrice(state, id, level) * DECOR_REFUND_SHARE);
}

/**
 * Nâng cấp by group, one row per upgrade (icon of the current tier | name +
 * price of the next level (money, plus Tem when it has a ticketCost), current
 * level and the effect per level, then "Bậc n/3" once bought | "Mở ngày N" /
 * "Mở ở cấp quán N" / "Tối đa" | Mua). Mua is aria-disabled with the reason
 * (an upgrade it needs, money, then Tem) when it cannot be bought. "Mua" asks for an in-place confirm, then sends buy_upgrade.
 * Owned decor without seats has "Gỡ (+X)": the first click arms it for
 * REMOVE_CONFIRM_MS, a second click sends remove_decor.
 */
export function renderUpgradesPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  // Before the rows, so the icons they draw switch to their tier look when it lands.
  void loadTierAtlas();
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
    const row = h('span', { attrs: { 'data-remove': id } }, btn);
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
    const badge = h('span', { class: 'badge', hidden: true });
    const newBadge = freshBadge();
    const meta = h('p', { class: 'item-meta' });
    const iconBox = h('span', { class: 'item-icon' });
    const buy = h('button', { class: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-action': 'buy' }, text: 'Mua' });
    const why = reasonLine();
    const more = h('div', { class: 'item-actions' }, why);
    const li = h(
      'li',
      { class: 'item item-row', attrs: { 'data-upgrade': id } },
      iconBox,
      h('div', { class: 'item-text' }, h('p', { class: 'item-title', text: def.name }), meta),
      h('span', { class: 'item-status' }, badge, newBadge),
      buy,
      more,
    );
    if (isRemovableDecor(id)) more.append(removeControl(id, li));
    // While the in-place confirm is open it replaces Mua and its reason.
    const confirming = (): boolean => !!li.querySelector('.confirm');
    const showBuy = (shown: boolean): void => {
      buy.hidden = !shown;
      why.hidden = !shown || !why.textContent;
    };
    buy.addEventListener('click', () => {
      const s = ctx.getState();
      const cost = s ? nextUpgradeCost(s, id) : null;
      if (!s || cost === null || isAriaDisabled(buy)) return;
      showBuy(false);
      li.append(
        inlineConfirm(
          `Mua ${def.name} cấp ${upgradeLevel(s, id) + 1} với ${priceText(cost, nextUpgradeTicketCost(s, id) ?? 0)}? Còn lại ${formatMoney(s.money - cost)}.`,
          'Mua',
          'btn-primary',
          () => {
            showBuy(true);
            keepFocus(li, body, () => send({ type: 'buy_upgrade', upgradeId: id }));
          },
          () => {
            showBuy(true);
            buy.focus();
          },
        ),
      );
    });
    w.watch(
      (s) => `${s.shopLevel}|${weekDay(s)}|${upgradeLevel(s, id)}|${nextUpgradeCost(s, id)}|${s.money}|${s.retention?.tickets ?? 0}|${upgradeBlockedReason(s, id) ?? ''}`,
      (_, s) => {
        const lv = upgradeLevel(s, id);
        const cost = nextUpgradeCost(s, id);
        const max = maxUpgradeLevel(s, id);
        const tickets = nextUpgradeTicketCost(s, id) ?? 0;
        meta.textContent = `${cost === null ? '' : `Giá ${priceText(cost, tickets)} · `}Cấp ${lv}/${max} · ${tierText(id, lv, cost !== null)}mỗi cấp ${effectText(def.effectPerLevel)}`;
        // Not open yet: a flat "Mở ngày N" / "Mở ở cấp N" label, Mua disabled with the reason.
        const locked = lv === 0 && !isUnlocked(s, 'upgrade', id);
        li.classList.toggle('is-locked', locked);
        badge.hidden = !locked && cost !== null;
        if (locked) {
          const opens = unlockHint(s, 'upgrade', id);
          badge.className = 'badge badge-neutral';
          setIconText(badge, 'i-lock', opens.badge);
          setAriaDisabled(buy, true);
          setReason(why, buy, opens.reason);
        } else if (cost === null) {
          // At the cap: a later shop level (7..10) may still raise it.
          const bonusAt = nextBonusShopLevel(s, id);
          badge.className = `badge ${bonusAt === null ? 'badge-ok' : 'badge-neutral'}`;
          setIconText(badge, bonusAt === null ? 'i-ok' : 'i-lock', bonusAt === null ? 'Tối đa' : `Mở ở cấp quán ${bonusAt}`);
          setReason(why, buy, null);
        } else {
          const have = s.retention?.tickets ?? 0;
          const short =
            upgradeBlockedReason(s, id) ??
            (s.money < cost ? shortOfMoney(cost, s.money, formatMoney) : null) ??
            (have < tickets ? `Thiếu ${tickets - have} Tem` : null);
          setAriaDisabled(buy, short !== null);
          setReason(why, buy, short);
        }
        showBuy(cost !== null && !confirming());
      },
    );
    // Icon of the current look tier.
    w.watch(
      (s) => upgradeTier(id, upgradeLevel(s, id)),
      (tier) => iconBox.replaceChildren(tierIcon(UPGRADE_ICONS[id], tier, { size: 32 })),
    );
    // "Mới" only in an empty label slot (not over "Mở ở cấp N" or "Tối đa").
    w.watch(
      () => fresh.has('upgrades', id) && badge.hidden,
      (on) => setFresh(newBadge, on),
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
