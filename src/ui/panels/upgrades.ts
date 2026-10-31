import { LEVELS, maxLevelBonus, upgradeUnlockLevel } from '../../sim/data/levels';
import { getUpgrade, levelEffect, UPGRADES, upgradeTier } from '../../sim/data/upgrades';
import { isUnlocked, weekDay } from '../../sim/progression';
import {
  DECOR_REFUND_SHARE,
  isRemovableDecor,
  maxUpgradeLevel,
  nextTicketUpgrade,
  nextUpgradeCost,
  nextUpgradeTicketCost,
  ownedPriceBonus,
  upgradeBlockedReason,
  upgradeLevel,
  upgradeLevelPrice,
} from '../../sim/upgrades';
import type { GameState, UpgradeDef, UpgradeEffect, UpgradeId } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, uid, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { fresh } from '../core/fresh';
import { UPGRADE_ICONS } from '../core/iconMap';
import { type IconId, loadTierAtlas, tierIcon } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { freshBadge, setFresh, unlockHint } from './menu';
import { inlineConfirm, keepFocus, reasonLine, sender, setIconText, setReason, shortOfMoney, TEM_SOURCES_TEXT, withIcon } from './widgets';

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
/** "6,5%": a percent kept to one decimal, for price bonuses. */
const pctDec = (v: number): string => `${String(Math.round(v * 1000) / 10).replace('.', ',')}%`;

/** Label of a row (or its next level) waiting on the shop level. */
export const needShopLevel = (level: number): string => `Cần cấp quán ${level}`;

/** Summary of the collapsed group holding the rows a later shop level opens. */
export const laterGroupTitle = (n: number): string => `Mở ở cấp sau (${n})`;

/** Not bought and waiting on the shop level: the row goes to "Mở ở cấp sau". */
export function waitsForLevel(state: GameState, id: UpgradeId): boolean {
  return upgradeLevel(state, id) === 0 && upgradeUnlockLevel(id) > state.shopLevel;
}

/** "mỗi cấp …", or "cấp N: …" when the next level (`canBuy`) is an extra one with its own effect. */
export function levelEffectText(def: UpgradeDef, level: number, canBuy: boolean): string {
  const next = level + 1;
  return canBuy && next > def.maxLevel && def.extraLevels?.[next - def.maxLevel - 1] ? `cấp ${next}: ${effectText(levelEffect(def, next))}` : `mỗi cấp ${effectText(def.effectPerLevel)}`;
}

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
  if (e.priceBonus) parts.push(`giá bán +${pctDec(e.priceBonus)}`);
  return parts.join(' · ');
}

/** Next shop level (4..10) that raises the upgrade's cap, or null when none is left. */
export function nextBonusShopLevel(state: GameState, id: UpgradeId): number | null {
  const now = maxLevelBonus(state.shopLevel, id);
  return LEVELS.find((def) => def.level > state.shopLevel && maxLevelBonus(def.level, id) > now)?.level ?? null;
}

/** "50.000đ" or "50.000đ + 5 Tem" for the next level's price. */
function priceText(cost: number, tickets: number): string {
  return tickets > 0 ? `${formatMoney(cost)} + ${tickets} Tem` : formatMoney(cost);
}

/** "Tem: 3/15 → Cây xanh · kiếm Tem từ …" (TEM_SOURCES_TEXT) toward the next level that costs Tem, or "Tem: 3 · …" when none does. */
export function ticketGoalText(state: GameState): string {
  const have = state.retention?.tickets ?? 0;
  const next = nextTicketUpgrade(state);
  return `${next ? `Tem: ${have}/${next.tickets} → ${getUpgrade(next.id).name}` : `Tem: ${have}`} · ${TEM_SOURCES_TEXT}`;
}

/** "Giá bán +6,5% nhờ nâng cấp": the sell-price bonus of every owned level; empty (line hidden) while it is 0. */
export function priceBonusText(state: GameState): string {
  const bonus = ownedPriceBonus(state);
  return bonus > 0 ? `Giá bán +${pctDec(bonus)} nhờ nâng cấp` : '';
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
 * level and the effect per level (or of the next extra level) | "Mở ngày N" /
 * "Cần cấp quán N" / "Tối đa" | Mua). Rows a later shop level opens sit in a
 * collapsed "Mở ở cấp sau (N)" group at the end, by unlock level. Icons come
 * from the atlas (UPGRADE_ICONS), never the emoji in the data's `icon` field. Mua is aria-disabled with the reason
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
    const badge = h('span', { class: 'badge', id: uid('lock'), hidden: true });
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
        // The level only; the look tier shows in the icon.
        meta.textContent = `${cost === null ? '' : `Giá ${priceText(cost, tickets)} · `}Cấp ${lv}/${max} · ${levelEffectText(def, lv, cost !== null)}`;
        // Not open yet: a flat "Mở ngày N" / "Cần cấp quán N" label, Mua disabled with the reason.
        const locked = lv === 0 && !isUnlocked(s, 'upgrade', id);
        li.classList.toggle('is-locked', locked);
        badge.hidden = !locked && cost !== null;
        if (locked) {
          const opens = unlockHint(s, 'upgrade', id);
          const byLevel = !opens.badge.startsWith('Mở ngày');
          const level = upgradeUnlockLevel(id);
          badge.className = 'badge badge-neutral';
          setIconText(badge, 'i-lock', byLevel ? needShopLevel(level) : opens.badge);
          setAriaDisabled(buy, true);
          // By level the label is the reason: Mua points at it, no second line.
          setReason(why, buy, byLevel ? null : opens.reason);
          if (byLevel) buy.setAttribute('aria-describedby', badge.id);
        } else if (cost === null) {
          // At the cap: a later shop level (4..10) may still raise it.
          const bonusAt = nextBonusShopLevel(s, id);
          badge.className = `badge ${bonusAt === null ? 'badge-ok' : 'badge-neutral'}`;
          setIconText(badge, bonusAt === null ? 'i-ok' : 'i-lock', bonusAt === null ? 'Tối đa' : needShopLevel(bonusAt));
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
    // "Mới" only in an empty label slot (not over "Cần cấp quán N" or "Tối đa").
    w.watch(
      () => fresh.has('upgrades', id) && badge.hidden,
      (on) => setFresh(newBadge, on),
    );
    return li;
  }

  const rows = new Map<UpgradeId, HTMLElement>(UPGRADES.map((u) => [u.id, row(u.id)]));
  const groups = UPGRADE_GROUPS.map((g) => {
    const list = h('ul', { class: 'stack' });
    const section = h('section', { class: 'stack', attrs: { 'aria-label': g.title } }, h('h3', { class: 'section-title' }, ...withIcon(g.icon, g.title, 24)), list);
    return { ids: g.ids, list, section };
  });
  // Collapsed by default (a native disclosure, not a dialog); opening it is the player's choice.
  const laterSummary = h('summary', { class: 'section-title' });
  const laterList = h('ul', { class: 'stack' });
  const later = h('details', { class: 'stack later-group', attrs: { 'data-group': 'later' } }, laterSummary, laterList);
  const laterOrder = UPGRADE_GROUPS.flatMap((g) => g.ids)
    .map((id, i) => ({ id, i }))
    .sort((a, b) => upgradeUnlockLevel(a.id) - upgradeUnlockLevel(b.id) || a.i - b.i)
    .map((u) => u.id);
  w.watch(
    (s) => laterOrder.filter((id) => waitsForLevel(s, id)).join(','),
    (key) => {
      const waiting = new Set(key ? (key.split(',') as UpgradeId[]) : []);
      for (const g of groups) {
        const open = g.ids.filter((id) => !waiting.has(id));
        g.list.replaceChildren(...open.map((id) => rows.get(id)!));
        g.section.hidden = open.length === 0;
      }
      laterList.replaceChildren(...laterOrder.filter((id) => waiting.has(id)).map((id) => rows.get(id)!));
      setIconText(laterSummary, 'i-lock', laterGroupTitle(waiting.size));
      later.hidden = waiting.size === 0;
    },
  );
  // Tem goal and the price bonus owned so far, above the groups.
  const ticketGoal = h('p', { attrs: { 'data-summary': 'tickets' } });
  const priceBonus = h('p', { attrs: { 'data-summary': 'price' } });
  w.watch(ticketGoalText, (text) => (ticketGoal.textContent = text));
  w.watch(priceBonusText, (text) => {
    priceBonus.textContent = text;
    priceBonus.hidden = text === '';
  });
  const summary = h('div', { class: 'intro' }, ticketGoal, priceBonus);
  body.append(h('div', { class: 'prep' }, summary, ...groups.map((g) => g.section), later));
  const state = ctx.getState();
  if (state) w.run(state);
  return { update: (s) => w.run(s) };
}
