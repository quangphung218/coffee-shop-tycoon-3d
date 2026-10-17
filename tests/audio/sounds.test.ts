import { describe, expect, it } from 'vitest';
import { soundForEvent, soundsForEvents } from '../../src/audio';
import type { GameEvent } from '../../src/sim/types';

const NO_UNLOCKS = { menu: [], upgrades: [], tools: [] };
const spend = (kind: 'restock' | 'upgrade' | 'campaign'): GameEvent => ({ type: 'spend', kind, label: 'x', amount: 100, moneyLeft: 0 });

describe('soundForEvent', () => {
  it('plays the level-up arpeggio on level_up', () => {
    expect(soundForEvent({ type: 'level_up', level: 2, unlocks: NO_UNLOCKS })).toBe('levelup');
  });

  it('plays the upgrade bell only for an upgrade spend', () => {
    expect(soundForEvent(spend('upgrade'))).toBe('upgrade');
    expect(soundForEvent(spend('restock'))).toBeNull();
    expect(soundForEvent(spend('campaign'))).toBeNull();
  });

  it('keeps the earlier mappings', () => {
    expect(soundForEvent({ type: 'doorbell', customerId: 1 })).toBe('doorbell');
    expect(soundForEvent({ type: 'cash', amount: 1, pos: { x: 0, z: 0 } })).toBe('cash');
    expect(soundForEvent({ type: 'dayEnded', day: 1 })).toBe('notify');
    expect(soundForEvent({ type: 'week_unlocks', day: 2, unlocks: NO_UNLOCKS })).toBeNull();
  });
});

describe('soundsForEvents', () => {
  it('lets a level-up replace the end-of-day notify in the same frame', () => {
    expect(soundsForEvents([{ type: 'dayEnded', day: 1 }, { type: 'level_up', level: 2, unlocks: NO_UNLOCKS }])).toEqual(['levelup']);
  });

  it('keeps notify without a level-up', () => {
    expect(soundsForEvents([{ type: 'dayEnded', day: 1 }, spend('upgrade')])).toEqual(['notify', 'upgrade']);
  });
});
