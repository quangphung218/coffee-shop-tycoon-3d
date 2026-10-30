import { challengesToUnlock } from '../../sim/challenges';
import { CHALLENGE_FIRST_WEEK } from '../../sim/data/challenges';
import { STYLE_SLOTS, stylesOf, styleById, type StyleDef } from '../../sim/data/styles';
import { isStyleUnlocked, ownsStyle, styleBlockedReason, styleOf } from '../../sim/styles';
import type { GameState, StyleSlot } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, uid, Watcher } from '../core/dom';
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

/** What the player does to open a challenge-gated style: how many more weekly challenges, any of them (CHALLENGE_STYLE_ORDER). */
export function lockedStyleText(state: Pick<GameState, 'styles'>, id: string): string {
  const n = Math.max(1, challengesToUnlock(state, id));
  return `Hoàn thành thêm ${n} thử thách tuần bất kỳ để mở kiểu này (thử thách có từ tuần ${CHALLENGE_FIRST_WEEK}).`;
}

/** Why "Mua" is dimmed, as something the player can do; null when the style can be bought now. */
export function styleBuyReason(state: GameState, style: StyleDef): string | null {
  if (!isStyleUnlocked(state, style.id)) return lockedStyleText(state, style.id);
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

/** Widths where the panel spans the phone and would hide the previewed part: the preview collapses into a bar (UX-201). */
export const PREVIEW_BAR_MEDIA = '(max-width: 480px)';

/** The row's price line: what the style costs, or that it is owned. */
function styleMetaText(state: GameState, style: StyleDef): string {
  if (styleOf(state, style.slot).id === style.id) return style.price > 0 ? 'Đã có' : 'Kiểu gốc';
  return ownsStyle(state, style.id) ? 'Đã có · đổi miễn phí' : `Giá ${stylePriceText(style)}`;
}

/**
 * Phong cách quán: four slot tabs (Tường, Sàn, Biển hiệu, Mái hiên) over the
 * slot's styles. Tapping a style shows it on the shop (ctx.previewStyle) and
 * opens its actions in the row: "Dùng kiểu này" for an owned one, "Mua" for
 * the rest, which asks for an in-place confirm before buy_style. A locked or
 * unaffordable style keeps "Mua" dimmed with what to do. One preview at a
 * time; switching tab, buying, using and closing the panel end it.
 *
 * At PREVIEW_BAR_MEDIA a preview collapses the panel into a bar over the dock
 * (name, price, "Bỏ xem thử", "Mua") and the camera goes back to its home
 * view, so the previewed part is in sight; tapping the bar opens the list again.
 */
export function renderStylesPanel(body: HTMLElement, ctx: PanelContext): PanelHandle {
  const w = new Watcher<GameState>();
  const send = sender(ctx, (s) => w.run(s));
  let slot: StyleSlot = STYLE_SLOTS[0]!;
  let preview: string | null = null;
  /** The list was opened again from the bar during this preview. */
  let expanded = false;
  const narrowMq = typeof matchMedia === 'function' ? matchMedia(PREVIEW_BAR_MEDIA) : null;
  const opts = new Map<string, HTMLElement>();
  const acts = new Map<string, HTMLElement>();

  function setPreview(id: string | null): void {
    const prev = preview ? styleById(preview) : undefined;
    if (prev && prev.slot !== (id ? styleById(id)?.slot : prev.slot)) ctx.previewStyle?.(prev.slot, null);
    preview = id;
    expanded = false;
    const style = id ? styleById(id) : prev;
    if (style) ctx.previewStyle?.(style.slot, id);
    if (id && narrowMq?.matches) ctx.resetCamera?.();
    const s = ctx.getState();
    if (s) w.run(s);
  }

  function reopen(): void {
    expanded = true;
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
    opts.set(style.id, opt);
    acts.set(style.id, act);

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
        meta.textContent = styleMetaText(s, style);
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
  const list = h(
    'div',
    { class: 'style-list', id: uid('style-list') },
    h('div', { class: 'intro' }, h('p', { text: 'Bấm một kiểu để xem thử trên quán. Mua một lần bằng tiền và Tem, sau đó đổi qua lại miễn phí.' }), tem),
    tabs.el,
    ...lists.values(),
  );

  // The collapsed preview: tapping anywhere but its two buttons opens the list again.
  const barSwatch = h('span', { class: 'style-bar-swatch' });
  const barName = h('span', { class: 'item-title' });
  const barPrice = h('span', { class: 'item-meta' });
  const barOpen = h(
    'button',
    { class: 'style-bar-open', attrs: { type: 'button', 'data-action': 'reopen', 'aria-expanded': 'false', 'aria-controls': list.id } },
    barSwatch,
    h('span', { class: 'style-text' }, barName, barPrice),
    h('span', { class: 'style-bar-hint', text: 'Xem danh sách' }),
  );
  const barBack = h('button', { class: 'btn btn-secondary btn-sm', attrs: { type: 'button', 'data-action': 'unpreview' }, text: 'Bỏ xem thử' });
  const barBuy = h('button', { class: 'btn btn-primary btn-sm', attrs: { type: 'button', 'data-action': 'buy' } });
  const bar = h('div', { class: 'style-bar', hidden: true, attrs: { role: 'group', 'aria-label': 'Đang xem thử' } }, barOpen, h('div', { class: 'style-act' }, barBack, barBuy));
  bar.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('.style-act')) return;
    reopen();
    if (preview) opts.get(preview)?.focus();
  });
  barBack.addEventListener('click', () => {
    const id = preview;
    setPreview(null);
    if (id) opts.get(id)?.focus();
  });
  // "Mua" goes through the row: its in-place confirm (or its reason, when dimmed) shows in the list.
  barBuy.addEventListener('click', () => {
    const id = preview;
    const act = id ? acts.get(id) : undefined;
    if (!act) return;
    reopen();
    if (isAriaDisabled(act)) act.focus();
    else act.click();
    act.closest('li')?.scrollIntoView?.({ block: 'nearest' });
  });

  const root = h('div', { class: 'prep styles-panel' }, bar, list);
  w.watch(
    (s) => {
      const style = preview ? styleById(preview) : undefined;
      const collapsed = !!style && !expanded && !!narrowMq?.matches;
      return collapsed && style ? `${style.id}|${styleMetaText(s, style)}|${ownsStyle(s, style.id) ? 1 : 0}|${styleBuyReason(s, style) ?? ''}` : '';
    },
    (key, s) => {
      const style = key && preview ? styleById(preview) : undefined;
      const collapsed = !!style;
      root.classList.toggle('is-collapsed', collapsed);
      bar.hidden = !collapsed;
      list.hidden = collapsed;
      barOpen.setAttribute('aria-expanded', String(!collapsed));
      if (!style) return;
      barSwatch.replaceChildren(swatch(style));
      barName.textContent = style.name;
      barPrice.textContent = styleMetaText(s, style);
      const owned = ownsStyle(s, style.id);
      barBuy.textContent = owned ? 'Dùng kiểu này' : 'Mua';
      setAriaDisabled(barBuy, !owned && styleBuyReason(s, style) !== null);
      // The tapped row is hidden now; keep focus in the panel.
      if (list.contains(document.activeElement)) barOpen.focus({ preventScroll: true });
    },
  );
  const onMedia = (): void => {
    const s = ctx.getState();
    if (s) w.run(s);
  };
  narrowMq?.addEventListener?.('change', onMedia);

  body.append(root);
  const state = ctx.getState();
  if (state) w.run(state);
  return {
    update: (s) => w.run(s),
    dispose: () => {
      narrowMq?.removeEventListener?.('change', onMedia);
      if (preview) setPreview(null);
    },
  };
}
