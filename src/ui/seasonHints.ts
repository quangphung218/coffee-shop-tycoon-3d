// E-30: seasonal styles (E-26) outside the Phong cách panel. The week-end
// summary names a season on the week it starts and warns on its last week;
// the Phong cách dock button carries the "Mới" mark while the season has a
// style the player has not bought and has the Tem for. Read-only on the state.
import { SEASONAL_STYLES, seasonFor, seasonalVariantsFor } from '../sim/data/seasons';
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

/** The colour variants (E-33) on sale in `week` that the player does not own yet; empty before week 48. */
export function seasonVariantsUnbought(state: GameState, week: number): StyleDef[] {
  return seasonalVariantsFor(week).filter((s) => !ownsStyle(state, s.id));
}

/**
 * Week-end line about week `nextWeek`: "Mùa X: N kiểu mới bằng Tem, bán tới hết
 * tuần M." when it starts a season (with "K bản màu mới từ T Tem" for unbought
 * colour variants, E-33), "Mùa X hết sau tuần này." when it is the season's
 * last; null otherwise or when every style and variant of the season is owned.
 */
export function seasonWeekEndLine(state: GameState, nextWeek: number): { kind: 'start' | 'last'; text: string } | null {
  const season = seasonFor(nextWeek);
  if (!season) return null;
  const n = seasonUnbought(state, nextWeek).length;
  const variants = seasonVariantsUnbought(state, nextWeek);
  if (n === 0 && variants.length === 0) return null;
  if (season.weeksLeft === 1) return { kind: 'last', text: `${season.name} hết sau tuần này.` };
  if (nextWeek !== season.startWeek) return null;
  const parts: string[] = [];
  if (n > 0) parts.push(`${n} kiểu mới bằng Tem`);
  if (variants.length > 0) parts.push(`${variants.length} bản màu mới từ ${Math.min(...variants.map((v) => v.tickets))} Tem`);
  return { kind: 'start', text: `${season.name}: ${parts.join(' và ')}, bán tới hết tuần ${season.endWeek}.` };
}

/** Phong cách dock "Mới" mark: the running season has an unbought style the player has the Tem for. */
export function stylesNewMark(state: GameState): boolean {
  const have = state.retention?.tickets ?? 0;
  return seasonUnbought(state, weekIndex(state)).some((s) => have >= s.tickets);
}
