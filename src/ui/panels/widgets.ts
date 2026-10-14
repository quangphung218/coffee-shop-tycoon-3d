/**
 * Small controls shared by the preparation panels, after design/t237-cartoon
 * (Kho) and design/p17-states: switch, quantity stepper, select-only dropdown
 * (menu sổ), in-place confirm. Disabled controls use aria-disabled so they
 * stay focusable and their reason stays readable.
 */
import type { Command, GameState } from '../../sim/types';
import { h, isAriaDisabled, setAriaDisabled, setChildren, uid } from '../core/dom';
import { icon, type IconId } from '../core/icons';
import type { PanelContext } from '../hud/panels';

/** Small icon + text, e.g. a badge or button label. */
export function withIcon(id: IconId, text: string, size: 16 | 24 = 16): (SVGSVGElement | string)[] {
  return [icon(id, { size }), text];
}

/** Sets `el` to [icon] text. */
export function setIconText(el: HTMLElement, id: IconId | null, text: string, size: 16 | 24 = 16): void {
  if (id) setChildren(el, ...withIcon(id, text, size));
  else el.textContent = text;
}

export interface Toggle {
  el: HTMLButtonElement;
  set(checked: boolean, disabled?: boolean, describedBy?: string): void;
}

/** role="switch" button with a text state ("Bán"/"Không"). */
export function toggle(label: string, onText: string, offText: string, onChange: (next: boolean) => void): Toggle {
  const state = h('span', { class: 'toggle-state' });
  const el = h(
    'button',
    {
      class: 'toggle',
      attrs: { type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': label },
      on: {
        click: () => {
          if (isAriaDisabled(el)) return;
          onChange(el.getAttribute('aria-checked') !== 'true');
        },
      },
    },
    h('span', { class: 'toggle-track', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'toggle-thumb' })),
    state,
  );
  return {
    el,
    set(checked, disabled = false, describedBy) {
      el.setAttribute('aria-checked', String(checked));
      state.textContent = checked ? onText : offText;
      setAriaDisabled(el, disabled);
      if (describedBy) el.setAttribute('aria-describedby', describedBy);
      else el.removeAttribute('aria-describedby');
    },
  };
}

export interface Stepper {
  el: HTMLElement;
  input: HTMLInputElement;
  readonly value: number;
  set(value: number): void;
}

/**
 * − [n] + with a typed-in field; ↑ ↓ in the field also step. Values are whole
 * numbers in [min, max]. `label` names the field ("Số gói Sữa tươi"); `name`
 * goes into the −/+ labels ("Thêm 1 gói Sữa tươi").
 */
export function stepper(label: string, min: number, max: number, onChange: (value: number) => void, name = label): Stepper {
  let value = min;
  const dec = h('button', { class: 'step-btn', attrs: { type: 'button', 'aria-label': `Bớt 1 gói ${name}` }, text: '−' });
  const inc = h('button', { class: 'step-btn', attrs: { type: 'button', 'aria-label': `Thêm 1 gói ${name}` }, text: '+' });
  const id = uid('step');
  const input = h('input', { id, class: 'step-input', attrs: { type: 'text', inputmode: 'numeric', autocomplete: 'off' }, props: { value: String(min) } });

  function set(next: number, notify: boolean): void {
    const v = Math.min(max, Math.max(min, Math.round(Number.isFinite(next) ? next : min)));
    const changed = v !== value;
    value = v;
    input.value = String(v);
    setAriaDisabled(dec, v <= min);
    setAriaDisabled(inc, v >= max);
    if (changed && notify) onChange(v);
  }
  dec.addEventListener('click', () => {
    if (!isAriaDisabled(dec)) set(value - 1, true);
  });
  inc.addEventListener('click', () => {
    if (!isAriaDisabled(inc)) set(value + 1, true);
  });
  input.addEventListener('change', () => set(Number.parseInt(input.value.replace(/\D/g, ''), 10) || 0, true));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      set(value + (e.key === 'ArrowUp' ? 1 : -1), true);
    }
  });
  set(min, false);

  const el = h(
    'div',
    { class: 'stepper', attrs: { role: 'group', 'aria-label': label } },
    dec,
    h('label', { class: 'sr-only', attrs: { for: id }, text: label }),
    input,
    inc,
  );
  return {
    el,
    input,
    get value() {
      return value;
    },
    set: (v) => set(v, false),
  };
}

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  icon?: IconId;
  note?: string;
}

export interface DropdownDisplay {
  text: string;
  icon?: IconId;
}

export interface Dropdown<T extends string> {
  el: HTMLElement;
  button: HTMLButtonElement;
  /** Shows `value`; `display` overrides the button content (e.g. i-auto "Tự động: Pha chế"). */
  set(value: T, opts?: { disabled?: boolean; warn?: boolean; display?: DropdownDisplay; describedBy?: string }): void;
  setNotes(notes: Partial<Record<T, string>>): void;
  readonly open: boolean;
  close(): void;
}

/**
 * Select-only combobox (APG): a button that opens a listbox in place.
 * ↑ ↓ Home End move, Enter/Space picks, Esc closes without leaving the panel.
 */
export function dropdown<T extends string>(label: string, options: readonly DropdownOption<T>[], onPick: (value: T) => void): Dropdown<T> {
  let current: T = options[0]!.value;
  let active = 0;
  const listId = uid('dd');
  const text = h('span', { class: 'dd-text' });
  const button = h(
    'button',
    { class: 'dd-btn', attrs: { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': label } },
    text,
    icon('i-chevron-down', { size: 16, class: 'dd-chevron' }),
  );
  const noteEls: HTMLElement[] = [];
  const optEls = options.map((o, i) => {
    const note = h('small', { text: o.note ?? '' });
    noteEls.push(note);
    return h(
      'li',
      {
        class: 'dd-opt',
        id: `${listId}-${i}`,
        attrs: { role: 'option', 'aria-selected': 'false', 'data-value': o.value },
        on: {
          click: () => pick(i),
          mousemove: () => setActive(i),
        },
      },
      o.icon ? icon(o.icon, { size: 16 }) : null,
      o.label,
      note,
    );
  });
  const list = h('ul', { class: 'dd-list', id: listId, hidden: true, attrs: { role: 'listbox', tabindex: '-1', 'aria-label': label } }, ...optEls);

  function setActive(i: number): void {
    active = Math.max(0, Math.min(options.length - 1, i));
    optEls.forEach((el, j) => el.classList.toggle('is-active', j === active));
    list.setAttribute('aria-activedescendant', optEls[active]!.id);
  }
  function openList(): void {
    if (isAriaDisabled(button)) return;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', listId);
    setActive(Math.max(0, options.findIndex((o) => o.value === current)));
    list.focus();
  }
  function close(refocus = true): void {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  }
  function pick(i: number): void {
    const o = options[i];
    close();
    if (o && o.value !== current) onPick(o.value);
  }

  button.addEventListener('click', () => (list.hidden ? openList() : close()));
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  });
  list.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        setActive(active + 1);
        break;
      case 'ArrowUp':
        setActive(active - 1);
        break;
      case 'Home':
        setActive(0);
        break;
      case 'End':
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        pick(active);
        break;
      case 'Escape':
        // Close only the list, not the whole panel.
        e.stopPropagation();
        close();
        break;
      case 'Tab':
        close(false);
        return;
      default:
        return;
    }
    e.preventDefault();
  });
  list.addEventListener('focusout', (e) => {
    const next = (e as FocusEvent).relatedTarget;
    if (!(next instanceof Node) || !el.contains(next)) close(false);
  });

  const el = h('div', { class: 'dd' }, button, list);
  return {
    el,
    button,
    set(value, opts = {}) {
      current = value;
      const o = options.find((x) => x.value === value);
      const shown = opts.display ?? { text: o?.label ?? value, icon: o?.icon };
      setIconText(text, shown.icon ?? null, shown.text);
      optEls.forEach((li, i) => li.setAttribute('aria-selected', String(options[i]!.value === value)));
      setAriaDisabled(button, !!opts.disabled);
      button.classList.toggle('is-warn', !!opts.warn);
      if (opts.describedBy) button.setAttribute('aria-describedby', opts.describedBy);
      else button.removeAttribute('aria-describedby');
      if (opts.disabled) close(false);
    },
    setNotes(notes) {
      options.forEach((o, i) => (noteEls[i]!.textContent = notes[o.value] ?? o.note ?? ''));
    },
    get open() {
      return !list.hidden;
    },
    close: () => close(false),
  };
}

/**
 * In-place confirmation row ("Mua với 900.000đ? Hủy · Mua"). Focus goes to
 * "Hủy" first. Returns the element; it removes itself on either choice.
 */
export function inlineConfirm(question: string, okText: string, okClass: string, onOk: () => void, onCancel: () => void): HTMLElement {
  const cancel = h('button', { class: 'btn btn-secondary btn-sm', attrs: { type: 'button', 'data-action': 'cancel' }, text: 'Hủy' });
  const ok = h('button', { class: `btn ${okClass} btn-sm`, attrs: { type: 'button', 'data-action': 'confirm' }, text: okText });
  const el = h('div', { class: 'confirm', attrs: { role: 'group', 'aria-label': question } }, h('p', { text: question }), cancel, ok);
  cancel.addEventListener('click', () => {
    el.remove();
    onCancel();
  });
  ok.addEventListener('click', () => {
    el.remove();
    onOk();
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      el.remove();
      onCancel();
    }
  });
  queueMicrotask(() => {
    if (el.isConnected) cancel.focus();
  });
  return el;
}

/** Reason line ([i-lock] text) wired to a control through aria-describedby. */
export function reasonLine(danger = true): HTMLElement {
  return h('p', { class: danger ? 'reason reason-danger' : 'reason', id: uid('why'), hidden: true });
}

/**
 * Shows or hides a reason line and points `control` at it. The icon defaults
 * to i-lock while the control is aria-disabled, so call this after
 * setAriaDisabled; pass `ic` for other lines (info, done).
 */
export function setReason(line: HTMLElement, control: HTMLElement, text: string | null, ic: IconId | null = isAriaDisabled(control) ? 'i-lock' : null): void {
  line.hidden = !text;
  setIconText(line, text ? ic : null, text ?? '');
  if (text) control.setAttribute('aria-describedby', line.id);
  else if (control.getAttribute('aria-describedby') === line.id) control.removeAttribute('aria-describedby');
}

/** Dispatch that refreshes the panel right away instead of waiting for the next frame. */
export function sender(ctx: PanelContext, refresh: (state: GameState) => void): (cmd: Command) => boolean {
  return (cmd) => {
    const ok = ctx.dispatch(cmd);
    const state = ctx.getState();
    if (state) refresh(state);
    return ok;
  };
}

const FOCUS_TARGET = 'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

function firstFocusable(root: Element, action: string | null): HTMLElement | null {
  const items = [...root.querySelectorAll<HTMLElement>(FOCUS_TARGET)].filter((el) => !el.hidden && !el.closest('[hidden]'));
  return items.find((el) => action !== null && el.getAttribute('data-action') === action) ?? items[0] ?? null;
}

/**
 * Runs `update` (hire, fire, buy…) and, if that removed or hid the focused
 * control, moves focus to the same row (matched by its data-* key when the
 * row was rebuilt), else the next row, else the previous one, else `scope`
 * itself. Without this, focus falls to <body> and Space opens Pause.
 */
export function keepFocus(row: HTMLElement, scope: HTMLElement, update: () => void): void {
  const list = row.parentElement;
  const index = list ? [...list.children].indexOf(row) : -1;
  const key = [...row.attributes].find((a) => a.name.startsWith('data-'));
  const active = document.activeElement;
  const action = active instanceof HTMLElement && row.contains(active) ? active.getAttribute('data-action') : null;
  update();

  const now = document.activeElement;
  if (now instanceof HTMLElement && now !== document.body && scope.contains(now) && !now.closest('[hidden]')) return;
  const rows = list ? [...list.children] : [];
  const same = row.isConnected ? row : key ? rows.find((r) => r.getAttribute(key.name) === key.value) : undefined;
  // A removed row's slot now holds the next row, so start there.
  const start = same ? rows.indexOf(same) : Math.max(0, index);
  const order = [...rows.slice(start), ...rows.slice(0, start).reverse()];
  for (const r of order) {
    const target = r && firstFocusable(r, action);
    if (target) {
      target.focus();
      return;
    }
  }
  if (!scope.hasAttribute('tabindex')) scope.setAttribute('tabindex', '-1');
  scope.focus();
}

/** Clicks the dock button of another panel (Task Board links "Mở Kho"). */
export function openOtherPanel(id: string): void {
  document.querySelector<HTMLButtonElement>(`.dock [data-panel="${id}"]`)?.click();
}

/** Text link to another panel: "Mở Kho" + forward arrow icon. */
export function linkBtn(text: string, panel: string): HTMLButtonElement {
  return h('button', { class: 'link-btn', attrs: { type: 'button', 'data-goto': panel }, on: { click: () => openOtherPanel(panel) } }, text, icon('i-forward', { size: 16 }));
}

/** "Thiếu 110.000đ (cần 1.850.000đ, có 1.740.000đ)." */
export function shortOfMoney(need: number, have: number, fmt: (n: number) => string): string {
  return `Thiếu ${fmt(need - have)} (cần ${fmt(need)}, có ${fmt(have)}).`;
}
