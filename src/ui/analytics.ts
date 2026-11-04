/**
 * E-23: anonymous page/event counts through GoatCounter. Shell layer only; the
 * sim never imports this. Nothing is loaded or sent until the player says yes,
 * and every call is fire-and-forget: a blocked or failing counter never
 * reaches the game.
 */
import type { AnalyticsConsent } from '../save/save';

export const GOATCOUNTER_ENDPOINT = 'https://coffeeshop-qp.goatcounter.com/count';
export const GOATCOUNTER_SCRIPT = '//gc.zgo.at/count.js';
export const GOATCOUNTER_SETTINGS = '{"no_onload":true}';

interface GoatCounter {
  count?: (vars: { path: string; title: string; event: boolean }) => void;
}

export interface AnalyticsEnv {
  document: Pick<Document, 'createElement' | 'head'>;
  window: { goatcounter?: GoatCounter };
}

export interface Analytics {
  setConsent(consent: AnalyticsConsent): void;
  consent(): AnalyticsConsent;
  /** Counts `path` once per session, only when consent is 'yes'. Never throws. */
  track(path: string, title: string): void;
}

function browserEnv(): AnalyticsEnv | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  return { document, window: window as unknown as AnalyticsEnv['window'] };
}

export function createAnalytics(env: () => AnalyticsEnv | null = browserEnv, initial: AnalyticsConsent = 'unasked'): Analytics {
  let consent: AnalyticsConsent = initial;
  let inserted = false;
  const sent = new Set<string>();

  function insertScript(e: AnalyticsEnv): void {
    if (inserted) return;
    const s = e.document.createElement('script');
    s.async = true;
    s.src = GOATCOUNTER_SCRIPT;
    s.setAttribute('data-goatcounter', GOATCOUNTER_ENDPOINT);
    s.setAttribute('data-goatcounter-settings', GOATCOUNTER_SETTINGS);
    e.document.head.appendChild(s);
    inserted = true;
  }

  return {
    setConsent(c) {
      consent = c;
    },
    consent: () => consent,
    track(path, title) {
      if (consent !== 'yes') return;
      try {
        const e = env();
        if (!e) return;
        insertScript(e);
        if (sent.has(path)) return;
        // Until count.js has loaded there is nothing to call; the path stays unsent so a later call can count it.
        const count = e.window.goatcounter?.count;
        if (typeof count !== 'function') return;
        sent.add(path);
        count.call(e.window.goatcounter, { path, title, event: true });
      } catch {
        // Analytics must never break the game.
      }
    },
  };
}

/** The game's shared instance; the shell sets consent from the save. */
export const analytics: Analytics = createAnalytics();
