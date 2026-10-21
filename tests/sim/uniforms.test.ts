import { describe, expect, it } from 'vitest';
import { UNIFORMS, uniformById } from '../../src/sim/data/uniforms';
import { dispatch, uniformOf, unlockedUniforms } from '../../src/sim/index';
import { createNewGame } from '../../src/sim/state';
import type { GameEvent, GameState, UniformId } from '../../src/sim/types';

function newGame(level = 1): GameState {
  const state = createNewGame('Quán Đồng Phục', 'normal', 77);
  state.shopLevel = level;
  state.events = [];
  return state;
}

function notifies(events: GameEvent[]) {
  return events.filter((e) => e.type === 'notify');
}

describe('uniforms', () => {
  it('opens one uniform at shop levels 1, 3, 5 and 7', () => {
    expect(UNIFORMS.map((u) => [u.id, u.unlockLevel])).toEqual([
      ['classic', 1],
      ['mint', 3],
      ['latte', 5],
      ['coral', 7],
    ]);
    expect(unlockedUniforms(1).map((u) => u.id)).toEqual(['classic']);
    expect(unlockedUniforms(2).map((u) => u.id)).toEqual(['classic']);
    expect(unlockedUniforms(3).map((u) => u.id)).toEqual(['classic', 'mint']);
    expect(unlockedUniforms(6).map((u) => u.id)).toEqual(['classic', 'mint', 'latte']);
    expect(unlockedUniforms(10).map((u) => u.id)).toEqual(['classic', 'mint', 'latte', 'coral']);
  });

  it('keeps the classic uniform as today: cream shirt, no hat', () => {
    expect(uniformById('classic')).toMatchObject({ shirt: 0xfff9f0, hat: 'none' });
  });

  it('wears classic when the state has no uniform, as in older saves', () => {
    const state = newGame();
    expect(state.uniform).toBeUndefined();
    expect(uniformOf(state).id).toBe('classic');
    expect(uniformOf({ uniform: 'gold' as UniformId }).id).toBe('classic');
  });

  it('switches to an unlocked uniform and emits uniform_changed', () => {
    const state = newGame(3);
    expect(dispatch(state, { type: 'set_uniform', uniformId: 'mint' })).toBe(true);
    expect(state.uniform).toBe('mint');
    expect(uniformOf(state).hat).toBe('cap');
    expect(state.events).toEqual([{ type: 'uniform_changed', uniformId: 'mint' }]);
  });

  it('accepts the uniform already worn without a second event', () => {
    const state = newGame();
    expect(dispatch(state, { type: 'set_uniform', uniformId: 'classic' })).toBe(true);
    expect(state.events).toEqual([]);
  });

  it('refuses a uniform locked at this shop level, with a notify', () => {
    const state = newGame(4);
    expect(dispatch(state, { type: 'set_uniform', uniformId: 'latte' })).toBe(false);
    expect(state.uniform).toBeUndefined();
    expect(notifies(state.events)).toEqual([{ type: 'notify', level: 'error', text: 'Áo latte, mũ nồi mở ở cấp quán 5' }]);
    expect(state.events.some((e) => e.type === 'uniform_changed')).toBe(false);
  });

  it('refuses an unknown uniform id, with a notify', () => {
    const state = newGame(10);
    expect(dispatch(state, { type: 'set_uniform', uniformId: 'gold' as UniformId })).toBe(false);
    expect(state.uniform).toBeUndefined();
    expect(notifies(state.events)).toHaveLength(1);
  });

  it('works in every phase without touching money or the RNG', () => {
    const state = newGame(7);
    dispatch(state, { type: 'apply_restock' });
    const before = { money: state.money, rng: state.rngState };
    expect(dispatch(state, { type: 'set_uniform', uniformId: 'mint' })).toBe(true);
    expect(dispatch(state, { type: 'start_day' })).toBe(true);
    expect(state.phase).not.toBe('preparation');
    expect(dispatch(state, { type: 'set_uniform', uniformId: 'coral' })).toBe(true);
    expect(state.uniform).toBe('coral');
    expect(state.money).toBe(before.money);
    expect(state.rngState).toBe(before.rng);
  });

  it('survives a JSON round-trip', () => {
    const state = newGame(5);
    dispatch(state, { type: 'set_uniform', uniformId: 'latte' });
    const copy = JSON.parse(JSON.stringify(state)) as GameState;
    expect(copy.uniform).toBe('latte');
    expect(uniformOf(copy)).toBe(uniformOf(state));
  });
});
