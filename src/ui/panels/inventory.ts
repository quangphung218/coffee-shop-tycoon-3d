import { INGREDIENTS } from '../../sim/data/ingredients';
import { autoRestockSuggestion, ingredientPrice, stockOutlook, type StockLevel } from '../../sim/inventory';
import type { GameState, IngredientDef, IngredientId } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, uid, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { INGREDIENT_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { setIconText, shortOfMoney, stepper, withIcon, type Stepper } from './widgets';

/** Most packs of one ingredient a single purchase can hold. */
export const MAX_PACKS = 99;

/** Shown in the foot hint while no pack is picked. */
export const PICK_HINT = 'Chọn số gói cần nhập, hoặc bấm gợi ý nhập tự động.';

/** Shown under "Gợi ý nhập tự động" until the player uses it or buys. */
const INTRO = 'Gợi ý tính theo lượng bán của ngày gần nhất và menu hôm nay, cộng thêm 20% dự phòng.';

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
 * Kho: stock per ingredient with a badge against the demand left today
 * (stockOutlook, refreshed as the sim runs), a pack stepper per line, the
 * order total and one "Nhập hàng" button. "Gợi ý nhập tự động" fills the
 * steppers from autoRestockSuggestion first so the player sees the amounts
 * before paying. The buy button is dimmed while nothing is picked or money is
 * short; the hint under it always shows, so the foot never changes height.
 * The note under "Gợi ý" holds the intro, then the last result, in a slot
 * three lines tall, so the stock list does not jump when it changes.
 */
export function renderInventoryPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();

  // One slot for the intro and the result of Gợi ý / Nhập hàng, so the list below never moves.
  const status = h('div', { class: 'status-ok kho-note is-idle', attrs: { role: 'status' } });
  setIconText(status, 'i-info', INTRO, 24);
  const report = (id: IconId, text: string): void => {
    status.classList.remove('is-idle');
    setIconText(status, id, text, 24);
  };
  const suggestBtn = h(
    'button',
    { class: 'btn btn-secondary btn-block', attrs: { type: 'button', 'data-action': 'suggest' } },
    icon('i-sparkle'),
    'Gợi ý nhập tự động (Auto-restock)',
  );
  const total = h('b');
  const after = h('span');
  const buyText = h('span');
  const hint = h('p', { class: 'reason foot-hint', id: uid('why') });
  const buyBtn = h(
    'button',
    { class: 'btn btn-primary btn-lg btn-block', attrs: { type: 'button', 'data-action': 'buy', 'aria-describedby': hint.id } },
    icon('i-inventory'),
    buyText,
  );

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
    let shown: StockLevel | null = null;
    // stockOutlook is cached, so this is the same object until stock, menu or clock bucket change.
    w.watch(
      (s) => stockOutlook(s)[def.id],
      (o, s) => {
        const b = BADGES[o.level];
        badge.className = b.cls;
        setIconText(badge, b.icon, b.text);
        if (shown !== null && shown !== o.level) {
          // Restart the pulse when levels change in quick succession.
          void badge.offsetWidth;
          badge.classList.add('is-level-changed');
        }
        shown = o.level;
        const cups = o.cups === null ? '' : ` · đủ khoảng ${o.cups} ly hôm nay`;
        meta.textContent = `Còn ${o.qty} ${def.unit}${cups} · ${formatMoney(ingredientPrice(s, def.id, def.packSize))}/gói`;
      },
    );
    badge.addEventListener('animationend', () => badge.classList.remove('is-level-changed'));
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
    const short = sum > s.money;
    setAriaDisabled(buyBtn, sum === 0 || short);
    // One slot for every message, so the foot keeps its height.
    hint.classList.toggle('reason-danger', short);
    if (sum === 0) setIconText(hint, 'i-info', PICK_HINT);
    else if (short) setIconText(hint, 'i-lock', `${shortOfMoney(sum, s.money, formatMoney)} Bớt số gói để vừa tiền.`);
    else setIconText(hint, 'i-info', 'Kiểm tra số gói rồi bấm Nhập hàng.');
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
    report(
      'i-sparkle',
      sug.items.length > 0
        ? `Đã điền gợi ý cho ${sug.items.length} mặt hàng (${formatMoney(sug.totalCost)}). Có thể sửa từng dòng trước khi nhập.`
        : 'Kho đã đủ cho ngày tới, không cần nhập thêm.',
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
    if (bought.length > 0) report('i-ok', `Đã nhập ${bought.join(', ')}. −${formatMoney(spent)}. Còn ${formatMoney(s.money)}.`);
    w.run(s);
    refreshFoot(s);
  });

  body.append(
    h(
      'div',
      { class: 'prep' },
      suggestBtn,
      status,
      h('ul', { class: 'stack' }, ...rows.map((r) => r.li)),
      h(
        'div',
        { class: 'panel-foot' },
        h('div', { class: 'foot-sum' }, h('span', { text: 'Tổng nhập' }), total),
        h('div', { class: 'foot-sum' }, h('span', { text: 'Còn lại sau khi nhập' }), after),
        buyBtn,
        hint,
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
