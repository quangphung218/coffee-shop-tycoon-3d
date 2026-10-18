/**
 * Entry of the game chunk: everything the menu does not need (sim, HUD,
 * panels, report, save.ts, audio). main.ts imports it once the menu has
 * painted, alongside the 3D scene chunk.
 */
import { dispatch } from './sim';
import { createNewGame } from './sim/state';
import type { GameState } from './sim/types';

export { createAudio } from './audio';
export { dispatch, step } from './sim';
export { createNewGame } from './sim/state';
export { registerPrepPanels } from './ui/panels';
export { registerReviewsPanel } from './ui/report';
export { mountGame } from './ui/screens/game';

/** A busy lunchtime shop that plays itself behind the main menu. */
export function createMenuScene(): GameState {
  const state = createNewGame('Coffee Shop', 'normal', Date.now() >>> 0);
  state.rating = 4.5;
  dispatch(state, { type: 'start_day' });
  state.minute = 11 * 60;
  state.events.length = 0;
  return state;
}
