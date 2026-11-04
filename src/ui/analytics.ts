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
  /**
   * For a page that is going away (tab hidden): counts `path` right now
   * through count.js (which sends with navigator.sendBeacon) when consent is
   * 'yes' and the script is already loaded; otherwise does nothing, and never
   * inserts the script or queues. Same once-per-session rule as track.
   */
  beacon(path: string, title: string): void;
}

function browserEnv(): AnalyticsEnv | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  return { document, window: window as unknown as AnalyticsEnv['window'] };
}

export function createAnalytics(env: () => AnalyticsEnv | null = browserEnv, initial: AnalyticsConsent = 'unasked'): Analytics {
  let consent: AnalyticsConsent = initial;
  let inserted = false;
  let failed = false;
  const sent = new Set<string>();
  // Events tracked before count.js has loaded; flushed on the script's onload.
  let pending: { path: string; title: string }[] = [];

  function send(e: AnalyticsEnv, path: string, title: string): void {
    try {
      const gc = e.window.goatcounter;
      if (typeof gc?.count === 'function') gc.count({ path, title, event: true });
    } catch {
      // Analytics must never break the game.
    }
  }

  function flush(e: AnalyticsEnv): void {
    const queued = pending;
    pending = [];
    if (consent !== 'yes') return;
    for (const q of queued) send(e, q.path, q.title);
  }

  function insertScript(e: AnalyticsEnv): void {
    if (inserted) return;
    const s = e.document.createElement('script');
    s.async = true;
    s.src = GOATCOUNTER_SCRIPT;
    s.setAttribute('data-goatcounter', GOATCOUNTER_ENDPOINT);
    s.setAttribute('data-goatcounter-settings', GOATCOUNTER_SETTINGS);
    s.onload = () => flush(e);
    s.onerror = () => {
      // Blocked or offline: drop the queue silently and stop queueing.
      failed = true;
      pending = [];
    };
    e.document.head.appendChild(s);
    inserted = true;
  }

  return {
    setConsent(c) {
      consent = c;
      if (c !== 'yes') {
        // A revoke drops queued events; a later yes may count those paths again.
        for (const q of pending) sent.delete(q.path);
        pending = [];
      }
    },
    consent: () => consent,
    track(path, title) {
      if (consent !== 'yes' || failed) return;
      try {
        const e = env();
        if (!e) return;
        insertScript(e);
        if (sent.has(path)) return;
        sent.add(path);
        if (typeof e.window.goatcounter?.count === 'function') {
          if (pending.length > 0) flush(e);
          send(e, path, title);
        } else {
          pending.push({ path, title });
        }
      } catch {
        // Analytics must never break the game.
      }
    },
    beacon(path, title) {
      if (consent !== 'yes' || failed || sent.has(path)) return;
      try {
        const e = env();
        if (!e || typeof e.window.goatcounter?.count !== 'function') return;
        sent.add(path);
        send(e, path, title);
      } catch {
        // Analytics must never break the game.
      }
    },
  };
}

/** The game's shared instance; the shell sets consent from the save. */
export const analytics: Analytics = createAnalytics();
