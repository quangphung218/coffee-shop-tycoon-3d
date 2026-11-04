import { describe, expect, it, vi } from 'vitest';
import { SAVE_VERSION, migrate, saveGame, saveKey, slotConsent } from '../../src/save/save';
import { createMemoryStorage } from '../../src/save/storage';
import { createNewGame } from '../../src/sim/state';
import { GOATCOUNTER_ENDPOINT, GOATCOUNTER_SCRIPT, createAnalytics, type AnalyticsEnv } from '../../src/ui/analytics';

interface FakeScript {
  src: string;
  async: boolean;
  attrs: Record<string, string>;
  setAttribute(k: string, v: string): void;
}

/** Fake document/window: records script insertions and count calls; no network. */
function fakeEnv(loaded = true) {
  const scripts: FakeScript[] = [];
  const count = vi.fn();
  const createElement = (): FakeScript => {
    const el: FakeScript = {
      src: '',
      async: false,
      attrs: {},
      setAttribute(k, v) {
        el.attrs[k] = v;
      },
    };
    return el;
  };
  const head = {
    appendChild(el: FakeScript) {
      scripts.push(el);
      return el;
    },
  };
  const env: AnalyticsEnv = {
    document: { createElement, head } as unknown as AnalyticsEnv['document'],
    window: loaded ? { goatcounter: { count } } : {},
  };
  return { env, scripts, count };
}

describe('analytics track (E-23)', () => {
  it('does nothing without consent: 0 script insertions, 0 count calls', () => {
    for (const c of ['unasked', 'no'] as const) {
      const f = fakeEnv();
      const a = createAnalytics(() => f.env, c);
      a.track('/day/1', 'Day 1');
      a.track('/report', 'Report');
      expect(f.scripts).toHaveLength(0);
      expect(f.count).not.toHaveBeenCalled();
    }
  });

  it('with consent inserts count.js once and counts the path as an event', () => {
    const f = fakeEnv();
    const a = createAnalytics(() => f.env, 'yes');
    a.track('/day/1', 'Day 1');
    a.track('/report', 'Report');
    expect(f.scripts).toHaveLength(1);
    expect(f.scripts[0]!.src).toBe(GOATCOUNTER_SCRIPT);
    expect(GOATCOUNTER_SCRIPT).toBe('//gc.zgo.at/count.js');
    expect(f.scripts[0]!.attrs['data-goatcounter']).toBe('https://coffeeshop-qp.goatcounter.com/count');
    expect(GOATCOUNTER_ENDPOINT).toBe('https://coffeeshop-qp.goatcounter.com/count');
    expect(JSON.parse(f.scripts[0]!.attrs['data-goatcounter-settings']!)).toEqual({ no_onload: true });
    expect(f.count).toHaveBeenCalledWith({ path: '/day/1', title: 'Day 1', event: true });
    expect(f.count).toHaveBeenCalledWith({ path: '/report', title: 'Report', event: true });
  });

  it('dedups per path per session', () => {
    const f = fakeEnv();
    const a = createAnalytics(() => f.env, 'yes');
    a.track('/day/1', 'Day 1');
    a.track('/day/1', 'Day 1');
    a.track('/day/1', 'Again');
    expect(f.count).toHaveBeenCalledTimes(1);
  });

  it('revoking after consent stops sending', () => {
    const f = fakeEnv();
    const a = createAnalytics(() => f.env, 'unasked');
    a.setConsent('yes');
    a.track('/a', 'A');
    a.setConsent('no');
    a.track('/b', 'B');
    a.track('/c', 'C');
    expect(f.count).toHaveBeenCalledTimes(1);
    expect(f.count).toHaveBeenCalledWith({ path: '/a', title: 'A', event: true });
  });

  it('never throws: count throwing, script not loaded yet, no DOM', () => {
    const f = fakeEnv();
    f.count.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => createAnalytics(() => f.env, 'yes').track('/x', 'X')).not.toThrow();
    const g = fakeEnv(false);
    expect(() => createAnalytics(() => g.env, 'yes').track('/x', 'X')).not.toThrow();
    expect(g.scripts).toHaveLength(1);
    expect(() => createAnalytics(() => null, 'yes').track('/x', 'X')).not.toThrow();
    const broken = (): AnalyticsEnv => {
      throw new Error('no dom');
    };
    expect(() => createAnalytics(broken, 'yes').track('/x', 'X')).not.toThrow();
  });

  it('returns synchronously (nothing to await)', () => {
    const f = fakeEnv();
    expect(createAnalytics(() => f.env, 'yes').track('/x', 'X')).toBeUndefined();
  });
});

describe('analyticsConsent in the save (E-23)', () => {
  const state = () => createNewGame('Consent Cafe', 'normal', 7);

  it('is at SAVE_VERSION 7', () => {
    expect(SAVE_VERSION).toBe(7);
  });

  it('migrates v6 and older saves to analyticsConsent "unasked", state untouched', () => {
    const s = JSON.parse(JSON.stringify({ ...state(), events: [] }));
    for (const version of [6, 5, 4]) {
      const r = migrate(JSON.parse(JSON.stringify({ version, savedAt: 9, state: s })));
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.value.version).toBe(7);
      expect(r.value.analyticsConsent).toBe('unasked');
      expect(r.value.savedAt).toBe(9);
      expect(r.value.state.shopName).toBe('Consent Cafe');
      expect(r.value.state.money).toBe(s.money);
      expect('analyticsConsent' in r.value.state).toBe(false);
    }
  });

  it('round-trips yes/no and keeps the slot consent when none is given', () => {
    const storage = createMemoryStorage();
    expect(slotConsent('auto', storage)).toBe('unasked');
    saveGame(state(), 'auto', storage, 1, 'yes');
    expect(JSON.parse(storage.getItem(saveKey('auto'))!).analyticsConsent).toBe('yes');
    saveGame(state(), 'auto', storage, 2);
    expect(slotConsent('auto', storage)).toBe('yes');
    saveGame(state(), 'auto', storage, 3, 'no');
    expect(slotConsent('auto', storage)).toBe('no');
  });

  it('reads an unknown consent value as "unasked"', () => {
    const r = migrate(JSON.parse(JSON.stringify({ version: 7, savedAt: 1, analyticsConsent: 'maybe', state: { ...state(), events: [] } })));
    expect(r.ok && r.value.analyticsConsent).toBe('unasked');
  });
});
