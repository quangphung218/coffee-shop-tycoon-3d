import { INGREDIENTS } from '../../sim/data/ingredients';
import { autoRestockSuggestion, ingredientPrice, stockOf } from '../../sim/inventory';
import type { GameState, IngredientDef, IngredientId } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { INGREDIENT_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { reasonLine, setIconText, setReason, shortOfMoney, stepper, withIcon, type Stepper } from './widgets';

/** Most packs of one ingredient a single purchase can hold. */
export const MAX_PACKS = 99;

type StockLevel = 'ok' | 'low' | 'out';

export function stockLevel(def: IngredientDef, qty: number): StockLevel {
  if (qty <= 0) return 'out';
  return qty < def.lowStock ? 'low' : 'ok';
}

/** Icon + word, so the level never rests on colour alone. */
const BADGES: Record<StockLevel, { cls: string; icon: IconId; text: string }> = {
  ok: { cls: 'badge badge-ok', icon: 'i-ok', text: 'Đủ' },
  low: { cls: 'badge badge-warn', icon: 'i-warning', text: 'Sắp hết' },
  out: { cls: 'badge badge-danger', icon: 'i-error', text: 'Hết' },
};

interface Row {
  def: IngredientDef;
  li: HTMLElement;
  step: Stepper;
  cost: HTMLElement;
  sug: HTMLElement;
}

/**
 * Kho: stock per ingredient with a low-stock badge, a pack stepper per line,
 * the order total and one "Nhập hàng" button. "Gợi ý nhập tự động" fills the
 * steppers from autoRestockSuggestion first so the player sees the amounts
 * before paying. The buy button is dimmed with the shortfall when money is short.
 */
export function renderInventoryPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();

  const status = h('div', { class: 'status-ok', hidden: true, attrs: { role: 'status' } });
  const suggestBtn = h(
    'button',
    { class: 'btn btn-secondary btn-block', attrs: { type: 'button', 'data-action': 'suggest' } },
    icon('i-sparkle'),
    'Gợi ý nhập tự động (Auto-restock)',
  );
  const total = h('b');
  const after = h('span');
  const buyText = h('span');
  const buyBtn = h('button', { class: 'btn btn-primary btn-lg btn-block', attrs: { type: 'button', 'data-action': 'buy' } }, icon('i-inventory'), buyText);
  const buyWhy = reasonLine();

  const rows: Row[] = INGREDIENTS.map((def) => {
    const badge = h('span');
    const meta = h('p', { class: 'item-meta' });
    const cost = h('span', { class: 'item-cost' });
    const sug = h('span', { class: 'sug', hidden: true }, ...withIcon('i-sparkle', 'gợi ý'));
    const step = stepper(
      `Số gói ${def.name}`,
      0,
      MAX_PACKS,
      () => {
        li.classList.remove('is-suggested');
        sug.hidden = true;
        const s = ctx.getState();
        if (s) refreshFoot(s);
      },
      def.name,
    );
    step.el.setAttribute('data-ingredient', def.id);
    const li = h(
      'li',
      { class: 'item', attrs: { 'data-ingredient': def.id } },
      h('span', { class: 'item-icon' }, icon(INGREDIENT_ICONS[def.id], { size: 32 })),
      h('div', {}, h('p', { class: 'item-title' }, def.name, ' ', sug), meta),
      badge,
      h('div', { class: 'item-actions' }, h('span', { class: 'stepper-label', text: `Nhập thêm (gói ${def.packSize} ${def.unit})` }), step.el, cost),
    );
    w.watch(
      (s) => stockOf(s, def.id),
      (qty, s) => {
        const b = BADGES[stockLevel(def, qty)];
        badge.className = b.cls;
        setIconText(badge, b.icon, b.text);
        meta.textContent = `Còn ${qty} ${def.unit} · ${formatMoney(ingredientPrice(s, def.id, def.packSize))}/gói`;
      },
    );
    return { def, li, step, cost, sug };
  });

  function order(s: GameState): { id: IngredientId; packs: number; cost: number }[] {
    return rows
      .filter((r) => r.step.value > 0)
      .map((r) => ({ id: r.def.id, packs: r.step.value, cost: ingredientPrice(s, r.def.id, r.step.value * r.def.packSize) }));
  }

  let footKey = '';
  function refreshFoot(s: GameState): void {
    const lines = order(s);
    const sum = lines.reduce((a, l) => a + l.cost, 0);
    const key = `${s.money}|${lines.map((l) => `${l.id}:${l.packs}`).join(',')}`;
    if (key === footKey) return;
    footKey = key;
    for (const r of rows) r.cost.textContent = r.step.value > 0 ? formatMoney(ingredientPrice(s, r.def.id, r.step.value * r.def.packSize)) : '';
    total.textContent = formatMoney(sum);
    after.textContent = formatMoney(s.money - sum);
    buyText.textContent = sum > 0 ? `Nhập hàng · ${formatMoney(sum)}` : 'Nhập hàng';
    let why: string | null = null;
    if (sum === 0) why = 'Chọn số gói cần nhập, hoặc bấm gợi ý nhập tự động.';
    else if (sum > s.money) why = `${shortOfMoney(sum, s.money, formatMoney)} Bớt số gói để vừa tiền.`;
    setAriaDisabled(buyBtn, why !== null);
    setReason(buyWhy, buyBtn, why);
    buyWhy.classList.toggle('reason-danger', sum > 0);
  }

  suggestBtn.addEventListener('click', () => {
    const s = ctx.getState();
    if (!s) return;
    const sug = autoRestockSuggestion(s);
    for (const r of rows) {
      const line = sug.items.find((l) => l.id === r.def.id);
      r.step.set(line ? Math.ceil(line.qty / r.def.packSize) : 0);
      r.li.classList.toggle('is-suggested', !!line);
      r.sug.hidden = !line;
    }
    status.hidden = false;
    setIconText(
      status,
      'i-sparkle',
      sug.items.length > 0
        ? `Đã điền gợi ý cho ${sug.items.length} mặt hàng (${formatMoney(sug.totalCost)}). Có thể sửa từng dòng trước khi nhập.`
        : 'Kho đã đủ cho ngày tới, không cần nhập thêm.',
      24,
    );
    refreshFoot(s);
  });

  buyBtn.addEventListener('click', () => {
    const s = ctx.getState();
    if (!s || isAriaDisabled(buyBtn)) return;
    const lines = order(s);
    let spent = 0;
    const bought: string[] = [];
    for (const l of lines) {
      const before = s.money;
      if (ctx.dispatch({ type: 'buy_ingredient', ingredientId: l.id, packs: l.packs })) {
        spent += before - s.money;
        bought.push(rows.find((r) => r.def.id === l.id)!.def.name);
        const row = rows.find((r) => r.def.id === l.id)!;
        row.step.set(0);
        row.li.classList.remove('is-suggested');
        row.sug.hidden = true;
      }
    }
    status.hidden = bought.length === 0;
    setIconText(status, 'i-ok', `Đã nhập ${bought.join(', ')}. −${formatMoney(spent)}. Còn ${formatMoney(s.money)}.`, 24);
    w.run(s);
    refreshFoot(s);
  });

  body.append(
    h(
      'div',
      { class: 'prep' },
      suggestBtn,
      h('p', { class: 'intro', text: 'Gợi ý tính theo lượng bán của ngày gần nhất và menu hôm nay, cộng thêm 20% dự phòng.' }),
      status,
      h('ul', { class: 'stack' }, ...rows.map((r) => r.li)),
      h(
        'div',
        { class: 'panel-foot' },
        h('div', { class: 'foot-sum' }, h('span', { text: 'Tổng nhập' }), total),
        h('div', { class: 'foot-sum' }, h('span', { text: 'Còn lại sau khi nhập' }), after),
        buyBtn,
        buyWhy,
      ),
    ),
  );
  const state = ctx.getState();
  if (state) {
    w.run(state);
    refreshFoot(state);
  }
  return {
    update(s) {
      w.run(s);
      refreshFoot(s);
    },
  };
}
