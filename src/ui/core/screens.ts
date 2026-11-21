import { h, trapFocus } from './dom';

/** A full-screen layer (menu, form or overlay) shown one at a time. */
export interface Screen {
  readonly el: HTMLElement;
  /** Called each time the screen is shown, before focus moves into it. */
  onShow?(): void;
  /** Element that gets focus on show; defaults to the first button. */
  initialFocus?(): HTMLElement | null;
  /** Esc on this screen; return true when handled. */
  onEscape?(): boolean;
}

export interface ScreenOptions {
  /** 'scrim' darkens the scene behind (pause), 'menu' leaves it visible on the left. */
  variant?: 'plain' | 'scrim' | 'menu';
  /** Traps Tab inside the layer and marks it modal. */
  modal?: boolean;
  label: string;
}

/** Wraps screen content in a full-screen layer element. */
export function screenLayer(content: HTMLElement, options: ScreenOptions): HTMLElement {
  const variant = options.variant ?? 'plain';
  const layer = h('div', {
    class: `ui-screen${variant === 'plain' ? '' : ` is-${variant}`}`,
    hidden: true,
    attrs: options.modal ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': options.label } : { 'aria-label': options.label },
  });
  layer.append(content);
  if (options.modal) layer.addEventListener('keydown', (e) => trapFocus(layer, e));
  return layer;
}

/** Shows at most one registered screen at a time inside `root`. */
export class ScreenManager<Name extends string> {
  private readonly screens = new Map<Name, Screen>();
  private active: Name | null = null;
  private readonly listeners: ((name: Name | null) => void)[] = [];

  constructor(private readonly root: HTMLElement) {}

  add(name: Name, screen: Screen): void {
    this.screens.set(name, screen);
    screen.el.hidden = true;
    this.root.append(screen.el);
  }

  get current(): Name | null {
    return this.active;
  }

  get(name: Name): Screen | undefined {
    return this.screens.get(name);
  }

  /** Calls `fn` after every show(), with the screen now shown (null: none). */
  onChange(fn: (name: Name | null) => void): void {
    this.listeners.push(fn);
  }

  show(name: Name | null): void {
    for (const [n, s] of this.screens) if (n !== name) s.el.hidden = true;
    this.active = name;
    const screen = name === null ? undefined : this.screens.get(name);
    if (screen) screen.el.hidden = false;
    for (const fn of this.listeners) fn(name);
    if (!screen) return;
    screen.onShow?.();
    const target = screen.initialFocus?.() ?? screen.el.querySelector<HTMLElement>('button, input');
    target?.focus();
  }

  /** Routes Esc to the active screen. */
  escape(): boolean {
    if (this.active === null) return false;
    return this.screens.get(this.active)?.onEscape?.() ?? false;
  }
}
