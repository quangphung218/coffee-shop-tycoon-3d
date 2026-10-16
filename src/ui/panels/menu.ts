import { getIngredient } from '../../sim/data/ingredients';
import { menuUnlockLevel } from '../../sim/data/levels';
import { MENU } from '../../sim/data/menu';
import { sellPrice } from '../../sim/customers';
import { stockOf } from '../../sim/inventory';
import { policyLevel, PRICE_POLICY } from '../../sim/policies';
import { isUnlocked } from '../../sim/progression';
import type { GameState, MenuItemDef, PolicyLevel } from '../../sim/types';
import { h, uid, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { MENU_ICONS } from '../core/iconMap';
import { icon } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { linkBtn, reasonLine, segmented, sender, setReason, toggle, withIcon } from './widgets';

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

/** Why an item cannot be made from the stock, or null when it can. */
export function lockReason(state: GameState, item: MenuItemDef): string | null {
  const missing = item.ingredients.filter((need) => stockOf(state, need.id) < need.qty);
  if (missing.length === 0) return null;
  const parts = missing.map((need) => {
    const def = getIngredient(need.id);
    return `${def.name}: cần ${need.qty} ${def.unit}/ly, còn ${stockOf(state, need.id)} ${def.unit}`;
  });
  return `Thiếu ${parts.join('; ')}.`;
}

/** 0..1 popularity as five dot icons, filled then empty. */
function popularityDots(p: number): HTMLElement {
  const n = Math.max(1, Math.min(5, Math.round(p * 5)));
  return h('span', { class: 'dots', attrs: { 'aria-hidden': 'true' } }, ...[0, 1, 2, 3, 4].map((i) => icon(i < n ? 'i-dot' : 'i-dot-empty', { size: 16 })));
}

/**
 * Menu hôm nay: the Mức giá choice, then every item with the price at that
 * level, cost, hot/cold, popularity and a
 * Bán/Không switch. Items the stock cannot make are locked with the missing
 * ingredient; items above the shop level show "Mở ở cấp N" and stay off. An
 * item already on sale can still be switched off.
 */
export function renderMenuPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  const send = sender(ctx, (s) => w.run(s));
  const intro = h('p', { class: 'intro' });
  w.text(intro, (s) => `Đang bán ${s.menu.filter((m) => m.enabled).length}/${MENU.length} món. Món thiếu nguyên liệu bị khóa cho tới khi nhập thêm; món mới mở theo cấp quán.`);

  // Mức giá: a trade-off set in place; the hint names what it gains and costs.
  const priceTitleId = uid('price-policy');
  const priceSeg = segmented('Mức giá', 'price', PRICE_OPTIONS, (level) => send({ type: 'set_policy', policy: 'price', level }));
  priceSeg.el.removeAttribute('aria-label');
  priceSeg.el.setAttribute('aria-labelledby', priceTitleId);
  const priceHint = h('p', { class: 'item-meta', attrs: { 'data-hint': 'price' } });
  w.watch(
    (s) => policyLevel(s, 'price'),
    (level) => {
      priceSeg.set(level);
      priceHint.textContent = pricePolicyHint(level);
    },
  );
  const priceRow = h(
    'div',
    { class: 'setting', attrs: { 'data-policy': 'price' } },
    h('div', { class: 'setting-text' }, h('p', { class: 'item-title', id: priceTitleId }, ...withIcon('i-coin', 'Mức giá', 24)), priceHint),
    priceSeg.el,
  );

  const rows = MENU.map((item) => {
    const why = reasonLine();
    const sw = toggle(`Bán ${item.name}`, 'Bán', 'Không', (next) => send({ type: 'set_menu_item', itemId: item.id, enabled: next }));
    const lockBadge = h('span', { class: 'badge badge-danger', hidden: true }, ...withIcon('i-lock', 'Khóa'));
    // Below its unlock level: a flat "Mở ở cấp N" label (design/p20 §5), not a button.
    const need = menuUnlockLevel(item.id);
    const levelBadge = h('span', { class: 'badge badge-neutral', hidden: true, attrs: { 'data-lock': 'level' } }, ...withIcon('i-lock', `Mở ở cấp ${need}`));
    const meta = h('p', { class: 'item-meta' });
    const toStock = linkBtn('Nhập ở Kho', 'inventory');
    toStock.hidden = true;
    const li = h(
      'li',
      { class: 'item', attrs: { 'data-item': item.id } },
      h('span', { class: 'item-icon' }, icon(MENU_ICONS[item.id], { size: 32 })),
      h(
        'div',
        {},
        h('p', { class: 'item-title' }, item.name, ' ', lockBadge, levelBadge),
        meta,
        h(
          'p',
          { class: 'item-meta item-tags' },
          ...withIcon(item.temperature === 'hot' ? 'i-cup-hot' : 'i-cold', item.temperature === 'hot' ? 'Nóng' : 'Lạnh'),
          ' · Phổ biến ',
          popularityDots(item.popularity),
          h('span', { class: 'sr-only', text: `${Math.round(item.popularity * 5)}/5` }),
        ),
      ),
      sw.el,
      h('div', { class: 'item-actions' }, why, toStock),
    );
    w.watch(
      (s) => {
        const entry = s.menu.find((m) => m.id === item.id);
        return `${entry?.enabled ? 1 : 0}|${sellPrice(s, item.id)}|${lockReason(s, item) ?? ''}|${isUnlocked(s, 'menu', item.id)}`;
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
        meta.textContent = `Giá ${formatMoney(price)} · vốn ${formatMoney(item.cost)} · lãi ${formatMoney(price - item.cost)}/ly · biên ${margin}%`;
        li.classList.toggle('is-locked', levelLocked || !!locked);
        levelBadge.hidden = !levelLocked;
        lockBadge.hidden = !locked;
        toStock.hidden = !locked;
        sw.set(enabled, levelLocked || (!!locked && !enabled));
        setReason(why, sw.el, levelLocked ? `Mở khóa ở Cấp ${need}.` : locked, 'i-lock');
      },
    );
    return li;
  });

  body.append(h('div', { class: 'prep' }, intro, priceRow, h('ul', { class: 'stack' }, ...rows)));
  const state = ctx.getState();
  if (state) w.run(state);
  return { update: (s) => w.run(s) };
}
