/** Class on a scroll area while it is scrolling; scrollbar.css shows the thumb. */
export const SCROLLING_CLASS = 'is-scrolling';
/** The class comes off this long after the last scroll event, ms. */
export const SCROLL_IDLE_MS = 900;

/**
 * Marks any element under `doc` with .is-scrolling while it scrolls. One
 * passive capture listener covers every scroll area (scroll does not bubble);
 * each event only updates a timestamp, and a single timer sweeps idle areas.
 * Returns a function that stops tracking and clears the class.
 */
export function trackScrollActivity(doc: Document = document, idleMs = SCROLL_IDLE_MS): () => void {
  const lastScroll = new Map<Element, number>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function sweep(): void {
    timer = null;
    const now = Date.now();
    let next = Infinity;
    for (const [el, at] of lastScroll) {
      const due = at + idleMs;
      if (due <= now) {
        el.classList.remove(SCROLLING_CLASS);
        lastScroll.delete(el);
      } else if (due < next) {
        next = due;
      }
    }
    if (next !== Infinity) timer = setTimeout(sweep, next - now);
  }

  function onScroll(e: Event): void {
    const el = e.target;
    if (!(el instanceof Element)) return;
    if (!lastScroll.has(el)) el.classList.add(SCROLLING_CLASS);
    lastScroll.set(el, Date.now());
    if (timer === null) timer = setTimeout(sweep, idleMs);
  }

  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => {
    doc.removeEventListener('scroll', onScroll, { capture: true });
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const el of lastScroll.keys()) el.classList.remove(SCROLLING_CLASS);
    lastScroll.clear();
  };
}
