import { INGREDIENTS, getIngredient } from '../../sim/data/ingredients';
import { autoRestockSuggestion, canBuyOnCredit, ingredientPrice, stockOutlook, type StockLevel } from '../../sim/inventory';
import type { GameState, IngredientDef, IngredientId } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, uid, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import { INGREDIENT_ICONS } from '../core/iconMap';
import { icon, type IconId } from '../core/icons';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { setIconText, stepper, withIcon, type Stepper } from './widgets';

/** Most packs of one ingredient a single purchase can hold. */
export const MAX_PACKS = 99;

/** Shown in the foot hint while no pack is picked. */
export const PICK_HINT = 'Chọn số gói cần nhập, hoặc bấm gợi ý nhập tự động.';

/** Shown in the foot hint when "Gợi ý" finds nothing to buy. */
export const NOTHING_TO_BUY = 'Kho đã đủ cho ngày tới, không cần nhập thêm.';

/** The one line under "Gợi ý nhập tự động"; it never changes. */
const INTRO = 'Gợi ý theo lượng bán gần nhất, cộng 20% dự phòng.';

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
  sug: HTMLElement;
}

/**
 * Kho: one row per ingredient (icon | name + stock | Đủ/Sắp hết/Hết against
 * the demand left today | pack stepper), the order total and one "Nhập hàng"
 * button. "Gợi ý nhập tự động" fills the steppers from autoRestockSuggestion
 * and tags those rows "gợi ý", so the player sees the amounts before paying.
 * The buy button is dimmed while nothing is picked or money is short; the
 * hint under it always shows, so the foot never changes height. A purchase is
 * reported by the spend toast, never in the panel.
 */
export function renderInventoryPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();

  const intro = h('p', { class: 'intro kho-note', text: INTRO });
  // Set when Gợi ý found nothing to buy, until the player picks packs or buys.
  let nothingToBuy = false;
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
    // Off by class, not `hidden`: the tag keeps its room so the row never reflows.
    const sug = h('span', { class: 'sug is-off' }, ...withIcon('i-sparkle', 'gợi ý'));
    const step = stepper(
      `Số gói ${def.name}`,
      0,
      MAX_PACKS,
      () => {
        sug.classList.add('is-off');
        nothingToBuy = false;
        const s = ctx.getState();
        if (s) refreshFoot(s);
      },
      def.name,
    );
    step.el.setAttribute('data-ingredient', def.id);
    const li = h(
      'li',
      { class: 'item item-row', attrs: { 'data-ingredient': def.id } },
      h('span', { class: 'item-icon' }, icon(INGREDIENT_ICONS[def.id], { size: 32 })),
      h('div', { class: 'item-text' }, h('p', { class: 'item-title' }, def.name, ' ', sug), meta),
      badge,
      step.el,
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
        meta.textContent = `Còn ${o.qty} ${def.unit}${cups} · ${formatMoney(ingredientPrice(s, def.id, def.packSize))}/gói ${def.packSize} ${def.unit}`;
      },
    );
    badge.addEventListener('animationend', () => badge.classList.remove('is-level-changed'));
    return { def, li, step, sug };
  });

  function order(s: GameState): { id: IngredientId; packs: number; cost: number }[] {
    return rows
      .filter((r) => r.step.value > 0)
      .map((r) => ({ id: r.def.id, packs: r.step.value, cost: ingredientPrice(s, r.def.id, r.step.value * r.def.packSize) }));
  }

  /**
   * Walks the lines in buy order as the sim pays them: cash while it lasts,
   * else on credit (canBuyOnCredit). Short when a line gets neither.
   */
  function payment(s: GameState, lines: ReturnType<typeof order>): { short: boolean; credit: boolean } {
    let money = s.money;
    let credit = false;
    for (const l of lines) {
      if (money < l.cost) {
        if (!canBuyOnCredit(s, l.id, l.packs * getIngredient(l.id).packSize)) return { short: true, credit };
        credit = true;
      }
      money -= l.cost;
    }
    return { short: false, credit };
  }

  let footKey = '';
  function refreshFoot(s: GameState): void {
    const lines = order(s);
    const sum = lines.reduce((a, l) => a + l.cost, 0);
    const { short, credit } = payment(s, lines);
    const key = `${s.money}|${nothingToBuy}|${short}|${credit}|${lines.map((l) => `${l.id}:${l.packs}`).join(',')}`;
    if (key === footKey) return;
    footKey = key;
    total.textContent = formatMoney(sum);
    after.textContent = formatMoney(s.money - sum);
    buyText.textContent = sum > 0 ? `Nhập hàng · ${formatMoney(sum)}` : 'Nhập hàng';
    setAriaDisabled(buyBtn, sum === 0 || short);
    // One slot for every message, at most two lines, so the foot keeps its height.
    hint.classList.toggle('reason-danger', short);
    if (sum === 0) setIconText(hint, nothingToBuy ? 'i-ok' : 'i-info', nothingToBuy ? NOTHING_TO_BUY : PICK_HINT);
    else if (short) {
      // Name the costliest line: trimming it frees the most money.
      const top = lines.reduce((a, l) => (l.cost > a.cost ? l : a));
      setIconText(hint, 'i-lock', `Thiếu ${formatMoney(sum - s.money)}. Bớt ${getIngredient(top.id).name} để vừa tiền.`);
    }
    else if (credit) setIconText(hint, 'i-warning', `Nhập chịu 1 gói mỗi món sắp hết; tiền còn ${formatMoney(s.money - sum)}.`);
    else setIconText(hint, 'i-info', 'Kiểm tra số gói rồi bấm Nhập hàng.');
  }

  suggestBtn.addEventListener('click', () => {
    const s = ctx.getState();
    if (!s) return;
    const sug = autoRestockSuggestion(s);
    for (const r of rows) {
      const line = sug.items.find((l) => l.id === r.def.id);
      r.step.set(line ? Math.ceil(line.qty / r.def.packSize) : 0);
      r.sug.classList.toggle('is-off', !line);
    }
    nothingToBuy = sug.items.length === 0;
    refreshFoot(s);
  });

  buyBtn.addEventListener('click', () => {
    const s = ctx.getState();
    if (!s || isAriaDisabled(buyBtn)) return;
    // Each successful buy pushes a spend event; the HUD toasts it.
    for (const l of order(s)) {
      if (ctx.dispatch({ type: 'buy_ingredient', ingredientId: l.id, packs: l.packs })) {
        const row = rows.find((r) => r.def.id === l.id)!;
        row.step.set(0);
        row.sug.classList.add('is-off');
      }
    }
    nothingToBuy = false;
    w.run(s);
    refreshFoot(s);
  });

  body.append(
    h(
      'div',
      { class: 'prep' },
      suggestBtn,
      intro,
      h('ul', { class: 'stack item-rows' }, ...rows.map((r) => r.li)),
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
