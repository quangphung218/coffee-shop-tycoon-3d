// E-30: seasonal styles (E-26) outside the Phong cách panel. The week-end
// summary names a season on the week it starts and warns on its last week;
// the Phong cách dock button carries the "Mới" mark while the season has a
// style the player has not bought and has the Tem for. Read-only on the state.
import { SEASONAL_STYLES, seasonFor } from '../sim/data/seasons';
import type { StyleDef } from '../sim/data/styles';
import { weekIndex } from '../sim/progression';
import { ownsStyle } from '../sim/styles';
import type { GameState } from '../sim/types';

/** The season styles on sale in `week` that the player does not own yet. */
export function seasonUnbought(state: GameState, week: number): StyleDef[] {
  const season = seasonFor(week);
  if (!season) return [];
  return SEASONAL_STYLES.filter((s) => s.season === season.set && !ownsStyle(state, s.id));
}

/**
 * Week-end line about week `nextWeek`: "Mùa X: N kiểu mới bằng Tem, bán tới hết
 * tuần M." when it starts a season, "Mùa X hết sau tuần này." when it is the
 * season's last; null otherwise or when every style of the season is owned.
 */
export function seasonWeekEndLine(state: GameState, nextWeek: number): { kind: 'start' | 'last'; text: string } | null {
  const season = seasonFor(nextWeek);
  if (!season) return null;
  const n = seasonUnbought(state, nextWeek).length;
  if (n === 0) return null;
  if (season.weeksLeft === 1) return { kind: 'last', text: `${season.name} hết sau tuần này.` };
  if (nextWeek === season.startWeek) return { kind: 'start', text: `${season.name}: ${n} kiểu mới bằng Tem, bán tới hết tuần ${season.endWeek}.` };
  return null;
}

/** Phong cách dock "Mới" mark: the running season has an unbought style the player has the Tem for. */
export function stylesNewMark(state: GameState): boolean {
  const have = state.retention?.tickets ?? 0;
  return seasonUnbought(state, weekIndex(state)).some((s) => have >= s.tickets);
}
