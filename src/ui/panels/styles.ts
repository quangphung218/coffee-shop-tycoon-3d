import { WEEK_CHALLENGES, CHALLENGE_FIRST_WEEK } from '../../sim/data/challenges';
import { STYLE_SLOTS, stylesOf, styleById, type StyleDef } from '../../sim/data/styles';
import { isStyleUnlocked, ownsStyle, styleBlockedReason, styleOf } from '../../sim/styles';
import type { GameState, StyleSlot } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, Watcher } from '../core/dom';
import { formatMoney } from '../core/format';
import type { PanelContext, PanelHandle } from '../hud/panels';
import { inlineConfirm, reasonLine, segmented, sender, setIconText, setReason, shortOfMoney } from './widgets';

export const STYLES_PANEL_ID = 'styles';

/** Tab label per slot, in STYLE_SLOTS order. */
export const SLOT_LABELS: Readonly<Record<StyleSlot, string>> = { wall: 'Tường', floor: 'Sàn', sign: 'Biển hiệu', awning: 'Mái hiên' };

/** "3.000.000đ + 5 Tem", or the money alone for a style without Tem. */
export function stylePriceText(style: StyleDef): string {
  return style.tickets > 0 ? `${formatMoney(style.price)} + ${style.tickets} Tem` : formatMoney(style.price);
}

/** Name of the weekly challenge whose reward unlocks `id`, or null. */
export function unlockChallengeName(id: string): string | null {
  return Object.values(WEEK_CHALLENGES).find((c) => c.reward.unlock?.id === id)?.name ?? null;
}

/** What the player does to open a challenge-gated style. */
export function lockedStyleText(id: string): string {
  const name = unlockChallengeName(id);
  return name
    ? `Hoàn thành thử thách tuần "${name}" để mở kiểu này (thử thách có từ tuần ${CHALLENGE_FIRST_WEEK}).`
    : `Hoàn thành thử thách tuần để mở kiểu này (có từ tuần ${CHALLENGE_FIRST_WEEK}).`;
}

/** Why "Mua" is dimmed, as something the player can do; null when the style can be bought now. */
export function styleBuyReason(state: GameState, style: StyleDef): string | null {
  if (!isStyleUnlocked(state, style.id)) return lockedStyleText(style.id);
  if (state.money < style.price) return shortOfMoney(style.price, state.money, formatMoney);
  const have = state.retention?.tickets ?? 0;
  if (have < style.tickets) return `Thiếu ${style.tickets - have} Tem (cần ${style.tickets}, có ${have}) · nhận từ Quà hằng ngày.`;
  return styleBlockedReason(state, style.id);
}

/** Two-tone block of a style: its main colour with the accent as a band. */
function swatch(style: StyleDef): HTMLElement {
  const el = h('span', { class: 'style-swatch', attrs: { 'aria-hidden': 'true', 'data-slot': style.slot } }, h('span', { class: 'style-accent' }));
  el.style.setProperty('--sw-main', `#${style.color.toString(16).padStart(6, '0')}`);
  el.style.setProperty('--sw-accent', `#${style.accent.toString(16).padStart(6, '0')}`);
  return el;
}

/**
 * Phong cách quán: four slot tabs (Tường, Sàn, Biển hiệu, Mái hiên) over the
 * slot's styles. Tapping a style shows it on the shop (ctx.previewStyle) and
 * opens its actions in the row: "Dùng kiểu này" for an owned one, "Mua" for
 * the rest, which asks for an in-place confirm before buy_style. A locked or
 * unaffordable style keeps "Mua" dimmed with what to do. One preview at a
 * time; switching tab, buying, using and closing the panel end it.
 */
export function renderStylesPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  const send = sender(ctx, (s) => w.run(s));
  let slot: StyleSlot = STYLE_SLOTS[0]!;
  let preview: string | null = null;

  function setPreview(id: string | null): void {
    const prev = preview ? styleById(preview) : undefined;
    if (prev && prev.slot !== (id ? styleById(id)?.slot : prev.slot)) ctx.previewStyle?.(prev.slot, null);
    preview = id;
    const style = id ? styleById(id) : prev;
    if (style) ctx.previewStyle?.(style.slot, id);
    const s = ctx.getState();
    if (s) w.run(s);
  }

  function row(style: StyleDef): HTMLElement {
    const meta = h('span', { class: 'item-meta' });
    const badge = h('span', { class: 'badge badge-neutral', hidden: true });
    const opt = h(
      'button',
      { class: 'style-opt', attrs: { type: 'button', 'data-action': 'preview', 'aria-pressed': 'false' } },
      swatch(style),
      h('span', { class: 'style-text' }, h('span', { class: 'item-title', text: style.name }), meta),
      badge,
    );
    const act = h('button', { class: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-action': 'buy' } });
    const back = h('button', { class: 'btn btn-secondary btn-sm', attrs: { type: 'button', 'data-action': 'unpreview' }, text: 'Bỏ xem thử' });
    const why = reasonLine();
    const bar = h('div', { class: 'style-act' }, back, act);
    const more = h('div', { class: 'item-actions', hidden: true }, bar, why);
    const li = h('li', { class: 'item style-row', attrs: { 'data-style': style.id } }, opt, more);
    const confirming = (): boolean => !!li.querySelector('.confirm');

    opt.addEventListener('click', () => {
      const s = ctx.getState();
      if (!s) return;
      li.querySelector('.confirm')?.remove();
      // The style already worn needs no preview; tapping the previewed one again ends it.
      setPreview(preview === style.id || styleOf(s, style.slot).id === style.id ? null : style.id);
    });
    back.addEventListener('click', () => {
      setPreview(null);
      opt.focus();
    });
    act.addEventListener('click', () => {
      const s = ctx.getState();
      if (!s || isAriaDisabled(act)) return;
      if (ownsStyle(s, style.id)) {
        if (send({ type: 'select_style', styleId: style.id })) setPreview(null);
        opt.focus();
        return;
      }
      bar.hidden = true;
      why.hidden = true;
      more.append(
        inlineConfirm(
          `Mua ${style.name} với ${stylePriceText(style)}? Còn lại ${formatMoney(s.money - style.price)}.`,
          'Mua',
          'btn-primary',
          () => {
            bar.hidden = false;
            if (send({ type: 'buy_style', styleId: style.id })) setPreview(null);
            opt.focus();
          },
          () => {
            bar.hidden = false;
            const st = ctx.getState();
            if (st) w.run(st);
            act.focus();
          },
        ),
      );
    });

    w.watch(
      (s) =>
        `${styleOf(s, style.slot).id}|${ownsStyle(s, style.id) ? 1 : 0}|${isStyleUnlocked(s, style.id) ? 1 : 0}|${s.money >= style.price ? 1 : 0}|${s.retention?.tickets ?? 0}|${s.money}|${preview === style.id ? 1 : preview === null ? 0 : 2}`,
      (_, s) => {
        const worn = styleOf(s, style.slot).id === style.id;
        const owned = ownsStyle(s, style.id);
        const locked = !isStyleUnlocked(s, style.id);
        const shown = preview === style.id;
        opt.setAttribute('aria-pressed', String(shown || (preview === null && worn)));
        li.classList.toggle('is-worn', worn);
        li.classList.toggle('is-locked', locked);
        meta.textContent = worn ? (style.price > 0 ? 'Đã có' : 'Kiểu gốc') : owned ? 'Đã có · đổi miễn phí' : `Giá ${stylePriceText(style)}`;
        badge.hidden = !locked && !worn;
        if (worn) {
          badge.className = 'badge badge-ok';
          setIconText(badge, 'i-ok', 'Đang dùng');
        } else if (locked) {
          badge.className = 'badge badge-neutral';
          setIconText(badge, 'i-lock', 'Thử thách tuần');
        }
        more.hidden = !shown;
        if (!shown) {
          li.querySelector('.confirm')?.remove();
          bar.hidden = false;
        }
        if (owned) {
          act.textContent = 'Dùng kiểu này';
          setAriaDisabled(act, false);
          setReason(why, act, null);
        } else {
          act.textContent = 'Mua';
          const reason = styleBuyReason(s, style);
          setAriaDisabled(act, reason !== null);
          setReason(why, act, reason);
        }
        if (confirming()) why.hidden = true;
      },
    );
    return li;
  }

  const lists = new Map<StyleSlot, HTMLElement>(STYLE_SLOTS.map((sl) => [sl, h('ul', { class: 'stack', attrs: { 'data-slot': sl } }, ...stylesOf(sl).map(row))]));
  const tabs = segmented(
    'Phần quán',
    'style-slot',
    STYLE_SLOTS.map((sl) => ({ value: sl, label: SLOT_LABELS[sl] })),
    (next) => {
      slot = next;
      setPreview(null);
      for (const [sl, list] of lists) list.hidden = sl !== slot;
    },
  );
  tabs.set(slot);
  for (const [sl, list] of lists) list.hidden = sl !== slot;

  const tem = h('p', { attrs: { 'data-summary': 'tickets' } });
  w.watch(
    (s) => s.retention?.tickets ?? 0,
    (n) => (tem.textContent = `Tem: ${n} · nhận từ Quà hằng ngày`),
  );
  body.append(
    h(
      'div',
      { class: 'prep styles-panel' },
      h('div', { class: 'intro' }, h('p', { text: 'Bấm một kiểu để xem thử trên quán. Mua một lần bằng tiền và Tem, sau đó đổi qua lại miễn phí.' }), tem),
      tabs.el,
      ...lists.values(),
    ),
  );
  const state = ctx.getState();
  if (state) w.run(state);
  return {
    update: (s) => w.run(s),
    dispose: () => {
      if (preview) setPreview(null);
    },
  };
}
