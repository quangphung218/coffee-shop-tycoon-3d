import { getIngredient } from '../../sim/data/ingredients';
import { menuUnlockLevel, upgradeUnlockLevel } from '../../sim/data/levels';
import { MENU } from '../../sim/data/menu';
import { dayUnlockDay } from '../../sim/data/week';
import { sellPrice } from '../../sim/customers';
import { stockOf } from '../../sim/inventory';
import { canChangePolicy, policyLevel, PRICE_POLICY } from '../../sim/policies';
import { isUnlocked, weekDay } from '../../sim/progression';
import type { GameState, MenuItemDef, MenuItemId, PolicyLevel, UpgradeId } from '../../sim/types';
import { h, setAriaDisabled, uid, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { MENU_ICONS } from '../core/iconMap';
import { icon } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { linkBtn, reasonLine, segmented, sender, setIconText, setReason, toggle, withIcon } from './widgets';

const PRICE_OPTIONS: readonly { value: PolicyLevel; label: string }[] = [
  { value: 'low', label: 'Rẻ' },
  { value: 'standard', label: 'Chuẩn' },
  { value: 'high', label: 'Cao' },
];

const signedPct = (v: number): string => `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;
const signedDec = (v: number): string => `${v > 0 ? '+' : '−'}${String(Math.round(Math.abs(v) * 100) / 100).replace('.', ',')}`;

/** "Cao: +15% tiền mỗi ly, khách khó tính hơn (−0,2 sao), ít khách hơn (−8%)." */
export function pricePolicyHint(level: PolicyLevel): string {
  const p = PRICE_POLICY[level];
  if (level === 'standard') return 'Chuẩn: bán đúng giá gốc từng món, không đổi sao hay lượng khách.';
  const name = PRICE_OPTIONS.find((o) => o.value === level)!.label;
  const mood = p.stars > 0 ? 'khách dễ chịu hơn' : 'khách khó tính hơn';
  const crowd = p.arrivals > 1 ? 'đông khách hơn' : 'ít khách hơn';
  return `${name}: ${signedPct(p.priceMult - 1)} tiền mỗi ly, ${mood} (${signedDec(p.stars)} sao), ${crowd} (${signedPct(p.arrivals - 1)}).`;
}

/** Reason under a Mức giá / Mức lương choice that is locked for the day. */
export const POLICY_LOCKED_HINT = 'Đổi lúc chuẩn bị ngày mai.';

/**
 * Locks a Mức giá / Mức lương choice outside preparation (aria-disabled on the
 * group and its radios) with the reason under it; unlocks it while preparing.
 */
export function lockPolicyChoice(seg: HTMLElement, why: HTMLElement, state: GameState): void {
  const locked = !canChangePolicy(state);
  setAriaDisabled(seg, locked);
  for (const radio of seg.querySelectorAll<HTMLElement>('input')) setAriaDisabled(radio, locked);
  setReason(why, seg, locked ? POLICY_LOCKED_HINT : null);
}

/**
 * Badge and reason for an item or upgrade that is not open yet: "Mở ngày N"
 * while the week's calendar will open it on a later day, else "Mở ở cấp N".
 * Reaching the level first opens it, so a still-locked item waits for the day.
 */
export function unlockHint(state: GameState, kind: 'menu' | 'upgrade', id: MenuItemId | UpgradeId): { badge: string; reason: string } {
  const day = state.week ? dayUnlockDay(kind, id) : Infinity;
  if (day !== Infinity && day > weekDay(state)) return { badge: `Mở ngày ${day}`, reason: `Mở khóa vào ngày ${day} của tuần.` };
  const level = kind === 'menu' ? menuUnlockLevel(id as MenuItemId) : upgradeUnlockLevel(id as UpgradeId);
  return { badge: `Mở ở cấp ${level}`, reason: `Mở khóa ở Cấp ${level}.` };
}

/** Ingredients the stock lacks for one cup of `item`. */
function missingFor(state: GameState, item: MenuItemDef): MenuItemDef['ingredients'] {
  return item.ingredients.filter((need) => stockOf(state, need.id) < need.qty);
}

/** Why an item cannot be made from the stock, or null when it can. */
export function lockReason(state: GameState, item: MenuItemDef): string | null {
  const missing = missingFor(state, item);
  if (missing.length === 0) return null;
  const parts = missing.map((need) => {
    const def = getIngredient(need.id);
    return `${def.name}: cần ${need.qty} ${def.unit}/ly, còn ${stockOf(state, need.id)} ${def.unit}`;
  });
  return `Thiếu ${parts.join('; ')}.`;
}

/**
 * Short status label for an item the stock cannot make: "Thiếu Cam", or
 * "Thiếu Sữa tươi +1" so a long list never squeezes the row; the switch's
 * description (lockReason) names every ingredient.
 */
export function missingLabel(state: GameState, item: MenuItemDef): string | null {
  const [first, ...rest] = missingFor(state, item);
  if (!first) return null;
  return `Thiếu ${getIngredient(first.id).name}${rest.length > 0 ? ` +${rest.length}` : ''}`;
}

/**
 * Menu hôm nay: the Mức giá choice (locked outside preparation), then one row
 * per item (icon | name + price, margin, hot/cold, popularity | one status
 * label | Bán/Không switch). An item the stock cannot make shows "Thiếu Cam"
 * and a "Mở Kho" link (the amounts only in the switch's description); an item not open yet shows
 * "Mở ngày N" or "Mở ở cấp N" (unlockHint) and stays off. An item already on
 * sale can still be switched off.
 */
export function renderMenuPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  const send = sender(ctx, (s) => w.run(s));
  const intro = h('p', { class: 'intro' });
  w.text(intro, (s) => `Đang bán ${s.menu.filter((m) => m.enabled).length}/${MENU.length} món. Món thiếu nguyên liệu không bật được cho tới khi nhập thêm; món mới mở theo cấp quán.`);

  // Mức giá: a trade-off set in place; the hint names what it gains and costs.
  const priceTitleId = uid('price-policy');
  // Set while preparing only; once open the choice is locked with the reason under it.
  const priceSeg = segmented('Mức giá', 'price', PRICE_OPTIONS, (level) => {
    const s = ctx.getState();
    if (s && canChangePolicy(s)) send({ type: 'set_policy', policy: 'price', level });
    else if (s) priceSeg.set(policyLevel(s, 'price'));
  });
  priceSeg.el.removeAttribute('aria-label');
  priceSeg.el.setAttribute('aria-labelledby', priceTitleId);
  const priceHint = h('p', { class: 'item-meta', attrs: { 'data-hint': 'price' } });
  const priceWhy = reasonLine(false);
  w.watch(
    (s) => policyLevel(s, 'price'),
    (level) => {
      priceSeg.set(level);
      priceHint.textContent = pricePolicyHint(level);
    },
  );
  w.watch(
    (s) => canChangePolicy(s),
    (_, s) => lockPolicyChoice(priceSeg.el, priceWhy, s),
  );
  const priceRow = h(
    'div',
    { class: 'setting', attrs: { 'data-policy': 'price' } },
    h('div', { class: 'setting-text' }, h('p', { class: 'item-title', id: priceTitleId }, ...withIcon('i-coin', 'Mức giá', 24)), priceHint, priceWhy),
    priceSeg.el,
  );

  const rows = MENU.map((item) => {
    const why = reasonLine();
    const sw = toggle(`Bán ${item.name}`, 'Bán', 'Không', (next) => send({ type: 'set_menu_item', itemId: item.id, enabled: next }));
    // One flat label slot (design/p20 §5): "Thiếu Cam" or "Mở ngày N" / "Mở ở cấp N", never both; empty while sellable.
    const missBadge = h('span', { class: 'badge badge-danger', hidden: true, attrs: { 'data-lock': 'stock' } });
    const levelBadge = h('span', { class: 'badge badge-neutral', hidden: true, attrs: { 'data-lock': 'level' } });
    const meta = h('p', { class: 'item-meta' });
    const toStock = linkBtn('Mở Kho', 'inventory');
    toStock.hidden = true;
    const temp = item.temperature === 'hot' ? 'Nóng' : 'Lạnh';
    const popular = Math.max(1, Math.min(5, Math.round(item.popularity * 5)));
    const li = h(
      'li',
      { class: 'item item-row', attrs: { 'data-item': item.id } },
      h('span', { class: 'item-icon' }, icon(MENU_ICONS[item.id], { size: 32 })),
      h('div', { class: 'item-text' }, h('p', { class: 'item-title', text: item.name }), meta),
      h('span', { class: 'item-status' }, missBadge, levelBadge),
      sw.el,
      h('div', { class: 'item-actions' }, why, toStock),
    );
    w.watch(
      (s) => {
        const entry = s.menu.find((m) => m.id === item.id);
        return `${entry?.enabled ? 1 : 0}|${sellPrice(s, item.id)}|${lockReason(s, item) ?? ''}|${isUnlocked(s, 'menu', item.id)}|${weekDay(s)}`;
      },
      (_, s) => {
        const entry = s.menu.find((m) => m.id === item.id);
        const enabled = !!entry?.enabled;
        // What a cup sells for at the chosen Mức giá.
        const price = sellPrice(s, item.id);
        // An item already on sale (an old save's right) can still be switched off.
        const levelLocked = !isUnlocked(s, 'menu', item.id) && !enabled;
        const locked = levelLocked ? null : lockReason(s, item);
        const margin = price > 0 ? Math.round(((price - item.cost) / price) * 100) : 0;
        meta.textContent = `Giá ${formatMoney(price)} · lãi ${formatMoney(price - item.cost)}/ly (${margin}%) · ${temp} · phổ biến ${popular}/5`;
        // Dashed frame and lock icon mean "not open yet" only; missing stock is one warning label.
        li.classList.toggle('is-locked', levelLocked);
        const opens = levelLocked ? unlockHint(s, 'menu', item.id) : null;
        levelBadge.hidden = !opens;
        if (opens) setIconText(levelBadge, 'i-lock', opens.badge);
        missBadge.hidden = !locked;
        if (locked) setIconText(missBadge, 'i-warning', missingLabel(s, item)!);
        toStock.hidden = !locked;
        sw.set(enabled, levelLocked || (!!locked && !enabled));
        // The amounts stay in the switch's description for screen readers, off screen.
        why.classList.toggle('sr-only', !!locked);
        setReason(why, sw.el, opens ? opens.reason : locked, opens ? 'i-lock' : null);
      },
    );
    return li;
  });

  body.append(h('div', { class: 'prep' }, intro, priceRow, h('ul', { class: 'stack' }, ...rows)));
  const state = ctx.getState();
  if (state) w.run(state);
  return { update: (s) => w.run(s) };
}
