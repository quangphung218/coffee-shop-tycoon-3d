import { describe, expect, it } from 'vitest';
import { DOOR_POS, maybeAddOn, serveCustomer, spawnCustomer } from '../../src/sim/customers';
import { getMenuItem } from '../../src/sim/data/menu';
import { PERSONAS, PERSONA_IDS, addOnRoll, pickPersona } from '../../src/sim/data/personas';
import { dispatch } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { Customer, GameState, MenuItemId, PersonaId } from '../../src/sim/types';

/** A fresh open shop serving only `items`, with the stock topped up. */
function openShopWith(items: readonly MenuItemId[]): GameState {
  const s = createNewGame('Quán Persona', 'normal', 99);
  for (const m of s.menu) m.enabled = items.includes(m.id);
  for (const i of s.inventory) i.qty = 1000;
  dispatch(s, { type: 'start_day' });
  s.events = [];
  return s;
}

/** A waiting customer standing by the door, ready to be served. */
function waitingCustomer(s: GameState, fields: Partial<Customer> & { order: MenuItemId }): Customer {
  const c: Customer = {
    id: s.nextId++,
    state: 'waiting',
    pos: { ...DOOR_POS },
    target: null,
    patience: 40,
    maxPatience: 40,
    tableId: null,
    timer: 0,
    look: 0,
    ...fields,
  };
  s.customers.push(c);
  return c;
}

function mostCommon(counts: Partial<Record<PersonaId, number>>): PersonaId {
  return PERSONA_IDS.reduce((best, p) => ((counts[p] ?? 0) > (counts[best] ?? 0) ? p : best), PERSONA_IDS[0]!);
}

function average(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

describe('persona selection', () => {
  it('is deterministic for the same seed', () => {
    const run = (): (PersonaId | undefined)[] => {
      const s = createNewGame('Quán', 'normal', 2024);
      dispatch(s, { type: 'start_day' });
      return Array.from({ length: 30 }, () => spawnCustomer(s)?.persona);
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a.every((p) => p !== undefined)).toBe(true);
  });

  it('weights office in the morning and students in the afternoon', () => {
    const distribution = (minute: number): Partial<Record<PersonaId, number>> => {
      const counts: Partial<Record<PersonaId, number>> = {};
      for (let id = 1; id <= 3000; id++) {
        const p = pickPersona(777, id, minute, 'sunny');
        counts[p] = (counts[p] ?? 0) + 1;
      }
      return counts;
    };
    expect(mostCommon(distribution(8 * 60))).toBe('office');
    expect(mostCommon(distribution(16 * 60))).toBe('student');
  });
});

describe('persona patience', () => {
  it('sends the hurried office crowd off sooner than loyal regulars', () => {
    const s = createNewGame('Quán', 'normal', 55);
    dispatch(s, { type: 'start_day' });
    const byPersona: Partial<Record<PersonaId, number[]>> = {};
    for (let i = 0; i < 500; i++) {
      const c = spawnCustomer(s);
      if (!c?.persona) break;
      (byPersona[c.persona] ??= []).push(c.maxPatience);
    }
    expect(PERSONAS.office.patienceMult).toBeLessThan(PERSONAS.regular.patienceMult);
    expect(average(byPersona.office!)).toBeLessThan(average(byPersona.regular!));
  });
});

describe('food add-on', () => {
  it('adds a pastry, charges for it and uses its ingredients', () => {
    const s = openShopWith(['espresso', 'cake']);
    // An id whose deterministic roll falls under the family food chance.
    let id = s.nextId;
    while (addOnRoll(s.seed, id) >= PERSONAS.family.foodChance) id++;
    const flourBefore = s.inventory.find((i) => i.id === 'flour')!.qty;
    const c = waitingCustomer(s, { id, order: 'espresso', persona: 'family', tableId: null });
    s.nextId = id + 1;

    maybeAddOn(s, c);
    expect(c.extraItem).toBe('cake');
    expect(s.inventory.find((i) => i.id === 'flour')!.qty).toBe(flourBefore - getMenuItem('cake').ingredients.find((a) => a.id === 'flour')!.qty);

    for (const t of s.tables) t.trash = 1; // no clean seat, so the customer takes it away and pays now
    const money = s.money;
    serveCustomer(s, c, 'espresso');
    expect(s.money).toBe(money + getMenuItem('espresso').price + getMenuItem('cake').price);
    expect(s.today.sold.espresso).toBe(1);
    expect(s.today.sold.cake).toBe(1);
  });

  it('skips the add-on when the roll is above the persona food chance', () => {
    const s = openShopWith(['espresso', 'cake']);
    let id = s.nextId;
    while (addOnRoll(s.seed, id) < PERSONAS.family.foodChance) id++;
    const c = waitingCustomer(s, { id, order: 'espresso', persona: 'family' });
    maybeAddOn(s, c);
    expect(c.extraItem).toBeUndefined();
  });

  it('earns more from a customer who adds a pastry than one who does not', () => {
    const s = openShopWith(['espresso', 'cake']);
    for (const t of s.tables) t.trash = 1;
    const plain = waitingCustomer(s, { order: 'espresso' });
    const money0 = s.money;
    serveCustomer(s, plain, 'espresso');
    const plainGain = s.money - money0;

    const withFood = waitingCustomer(s, { order: 'espresso', extraItem: 'cake' });
    const money1 = s.money;
    serveCustomer(s, withFood, 'espresso');
    const foodGain = s.money - money1;

    expect(foodGain).toBeGreaterThan(plainGain);
    expect(foodGain - plainGain).toBe(getMenuItem('cake').price);
  });

  it('does nothing for a neutral customer from an old save', () => {
    const s = openShopWith(['espresso', 'cake']);
    const c = waitingCustomer(s, { order: 'espresso' }); // no persona field
    maybeAddOn(s, c);
    expect(c.extraItem).toBeUndefined();
  });
});
