import { getIngredient } from '../../sim/data/ingredients';
import { MENU } from '../../sim/data/menu';
import { stockOf } from '../../sim/inventory';
import type { GameState, MenuItemDef } from '../../sim/types';
import { h, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { openOtherPanel, reasonLine, sender, setReason, toggle } from './widgets';

/** Why an item cannot be made from the stock, or null when it can. */
export function lockReason(state: GameState, item: MenuItemDef): string | null {
  const missing = item.ingredients.filter((need) => stockOf(state, need.id) < need.qty);
  if (missing.length === 0) return null;
  const parts = missing.map((need) => {
    const def = getIngredient(need.id);
    return `${def.name}: cần ${need.qty} ${def.unit}/ly, còn ${stockOf(state, need.id)} ${def.unit}`;
  });
  return `🔒 Thiếu ${parts.join('; ')}.`;
}

/** 0..1 popularity as five dots, e.g. ●●●○○. */
function popularityDots(p: number): string {
  const n = Math.max(1, Math.min(5, Math.round(p * 5)));
  return '●'.repeat(n) + '○'.repeat(5 - n);
}

/**
 * Menu hôm nay: the 10 items with price, cost, hot/cold, popularity and a
 * Bán/Không switch. Items the stock cannot make are locked with the missing
 * ingredient; an item already on sale can still be switched off.
 */
export function renderMenuPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  const send = sender(ctx, (s) => w.run(s));
  const intro = h('p', { class: 'intro' });
  w.text(intro, (s) => `Đang bán ${s.menu.filter((m) => m.enabled).length}/${MENU.length} món. Món thiếu nguyên liệu bị khóa cho tới khi nhập thêm.`);

  const rows = MENU.map((item) => {
    const why = reasonLine();
    const sw = toggle(`Bán ${item.name}`, 'Bán', 'Không', (next) => send({ type: 'set_menu_item', itemId: item.id, enabled: next }));
    const lockBadge = h('span', { class: 'badge badge-danger', hidden: true, text: '🔒 Khóa' });
    const meta = h('p', { class: 'item-meta' });
    const toStock = h('button', { class: 'link-btn', hidden: true, attrs: { type: 'button' }, on: { click: () => openOtherPanel('inventory') } }, 'Nhập ở Kho →');
    const li = h(
      'li',
      { class: 'item', attrs: { 'data-item': item.id } },
      h('span', { class: 'item-icon', attrs: { 'aria-hidden': 'true' }, text: item.icon }),
      h(
        'div',
        {},
        h('p', { class: 'item-title' }, item.name, ' ', lockBadge),
        meta,
        h(
          'p',
          { class: 'item-meta' },
          item.temperature === 'hot' ? '🔥 Nóng' : '🧊 Lạnh',
          ' · Phổ biến ',
          h('span', { attrs: { 'aria-hidden': 'true' }, text: popularityDots(item.popularity) }),
          h('span', { class: 'sr-only', text: `${Math.round(item.popularity * 5)}/5` }),
        ),
      ),
      sw.el,
      h('div', { class: 'item-actions' }, why, toStock),
    );
    w.watch(
      (s) => {
        const entry = s.menu.find((m) => m.id === item.id);
        return `${entry?.enabled ? 1 : 0}|${entry?.price ?? item.price}|${lockReason(s, item) ?? ''}`;
      },
      (_, s) => {
        const entry = s.menu.find((m) => m.id === item.id);
        const enabled = !!entry?.enabled;
        const price = entry?.price ?? item.price;
        const locked = lockReason(s, item);
        meta.textContent = `Giá ${formatMoney(price)} · vốn ${formatMoney(item.cost)} · lãi ${formatMoney(price - item.cost)}/ly`;
        li.classList.toggle('is-locked', !!locked);
        lockBadge.hidden = !locked;
        toStock.hidden = !locked;
        sw.set(enabled, !!locked && !enabled);
        setReason(why, sw.el, locked);
      },
    );
    return li;
  });

  body.append(h('div', { class: 'prep' }, intro, h('ul', { class: 'stack' }, ...rows)));
  const state = ctx.getState();
  if (state) w.run(state);
  return { update: (s) => w.run(s) };
}
