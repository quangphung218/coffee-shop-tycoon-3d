/**
 * Tiny DOM helpers for the overlay UI. No framework: screens build their
 * elements once with h() and change them in place through Watchers, so a
 * frame where nothing changed touches no DOM at all.
 */

export type Child = Node | string | number | null | undefined | false;

type Listener = (e: Event) => void;

export interface Props {
  class?: string;
  id?: string;
  text?: string;
  hidden?: boolean;
  /** Attributes set with setAttribute (aria-*, role, type, for…). false/null skips. */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  /** Event listeners, e.g. { click: fn }. */
  on?: Record<string, Listener>;
  /** Plain DOM properties (value, checked, maxLength…). */
  props?: Record<string, unknown>;
}

/** Creates an element: h('button', { class: 'btn', on: { click } }, 'Lưu'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, p: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (p.class) el.className = p.class;
  if (p.id) el.id = p.id;
  if (p.hidden) el.hidden = true;
  if (p.attrs) {
    for (const [k, v] of Object.entries(p.attrs)) {
      if (v === false || v === null || v === undefined) continue;
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (p.props) Object.assign(el, p.props);
  if (p.on) for (const [type, fn] of Object.entries(p.on)) el.addEventListener(type, fn);
  if (p.text !== undefined) el.textContent = p.text;
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'number' ? String(c) : c);
  }
}

/** Replaces all children. */
export function setChildren(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

let idCounter = 0;
/** Unique id for label/aria wiring. */
export function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Runs `apply` only when the selected value changes. Screens register one
 * watch per dynamic bit of text or attribute and call run() once per frame.
 */
export class Watcher<S> {
  private readonly items: { select: (s: S) => unknown; apply: (v: never, s: S) => void; last: unknown; primed: boolean }[] = [];

  watch<V>(select: (s: S) => V, apply: (v: V, s: S) => void): this {
    this.items.push({ select, apply: apply as (v: never, s: S) => void, last: undefined, primed: false });
    return this;
  }

  /** Shortcut: keeps `el.textContent` equal to `select(s)`. */
  text(el: Node, select: (s: S) => string): this {
    return this.watch(select, (v) => {
      el.textContent = v;
    });
  }

  run(s: S): void {
    for (const item of this.items) {
      const v = item.select(s);
      if (item.primed && Object.is(v, item.last)) continue;
      item.last = v;
      item.primed = true;
      item.apply(v as never, s);
    }
  }

  /** Forgets the last values so the next run() applies everything again. */
  reset(): void {
    for (const item of this.items) item.primed = false;
  }
}

/** Marks a control disabled with aria-disabled so it stays focusable and its reason readable. */
export function setAriaDisabled(el: HTMLElement, disabled: boolean): void {
  if (disabled) el.setAttribute('aria-disabled', 'true');
  else el.removeAttribute('aria-disabled');
}

export function isAriaDisabled(el: Element): boolean {
  return el.getAttribute('aria-disabled') === 'true';
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside `container` (dialogs). */
export function trapFocus(container: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  const items = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && !el.closest('[hidden]'));
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !container.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/** True when keyboard input is going into a text field. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return type !== 'radio' && type !== 'checkbox' && type !== 'range' && type !== 'button';
  }
  return tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
