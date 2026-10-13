import { dispatch, step } from '../../sim';
import { createNewGame } from '../../sim/state';
import type { StaffRole } from '../../sim/types';
import { createWorld } from '../scene';

/**
 * Dev-only page (open with ?preview=actors): the shop scene with a day that
 * plays itself from the lunch peak, so customers, staff and the player can
 * be watched without the game UI. Space pauses, 1/2/4 set the speed, R
 * resets the camera. Clicks on customers and tables are dispatched.
 */

/** Game minutes per real second at 1× (a 07:00–21:00 day in about 7 minutes). */
const GAME_MINUTES_PER_SECOND = 2;
const HIRE_ROLES: readonly StaffRole[] = ['barista', 'server', 'cleaner'];
const PREVIEW_START_MINUTE = 11 * 60;

export function startActorsPreview(canvas: HTMLCanvasElement, ui: HTMLElement | null): void {
  const state = createNewGame('Quán thử', 'normal', Date.now() >>> 0);
  state.candidates.slice(0, HIRE_ROLES.length).forEach((c, i) => {
    dispatch(state, { type: 'hire_staff', candidateId: c.id, role: HIRE_ROLES[i]! });
  });
  // A high rating brings a steady stream of customers; the peak starts at 11:00.
  state.rating = 4.5;
  dispatch(state, { type: 'start_day' });
  state.minute = PREVIEW_START_MINUTE;

  const world = createWorld(canvas);
  world.onCommand((cmd) => dispatch(state, cmd));

  const hud = document.createElement('div');
  hud.style.cssText =
    'position:absolute;left:12px;top:12px;padding:8px 12px;border-radius:8px;background:rgba(59,36,24,0.92);color:#fff9f0;font-size:14px;line-height:1.4;pointer-events:none;';
  ui?.appendChild(hud);

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') dispatch(state, { type: 'set_paused', paused: !state.paused });
    else if (e.key === '1' || e.key === '2' || e.key === '4') dispatch(state, { type: 'set_speed', speed: Number(e.key) });
    else if (e.key === 'r' || e.key === 'R') world.resetCamera();
  });

  let last = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    step(state, dt * GAME_MINUTES_PER_SECOND * state.speed);
    world.update(state, state.tickAccumulator);
    state.events.length = 0;
    const hh = String(Math.floor(state.minute / 60)).padStart(2, '0');
    const mm = String(Math.floor(state.minute % 60)).padStart(2, '0');
    hud.textContent = `Xem thử nhân vật · ${hh}:${mm} · ${state.paused ? 'Tạm dừng' : `${state.speed}×`} · ${state.customers.length} khách · Space dừng, 1/2/4 tốc độ, R đặt lại camera`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
