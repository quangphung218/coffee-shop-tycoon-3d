import type { GameState, PolicyId, PolicyLevel, Policies } from './types';

export const POLICY_LEVELS: readonly PolicyLevel[] = ['low', 'standard', 'high'];

export const DEFAULT_POLICIES: Readonly<Policies> = { price: 'standard', wage: 'standard' };

/** Price policy: sell price multiplier, stars added to each order's review and the day score, arrival multiplier. */
export const PRICE_POLICY: Readonly<Record<PolicyLevel, { priceMult: number; stars: number; arrivals: number }>> = {
  low: { priceMult: 0.9, stars: 0.15, arrivals: 1.06 },
  standard: { priceMult: 1, stars: 0, arrivals: 1 },
  high: { priceMult: 1.15, stars: -0.2, arrivals: 0.92 },
};

/** Wage policy: multiplier on every staff member's daily wage and on their work speed. */
export const WAGE_POLICY: Readonly<Record<PolicyLevel, { wageMult: number; speedMult: number }>> = {
  low: { wageMult: 0.85, speedMult: 0.88 },
  standard: { wageMult: 1, speedMult: 1 },
  high: { wageMult: 1.2, speedMult: 1.12 },
};

/** Level of a policy; saves without policies play at standard. */
export function policyLevel(state: GameState, policy: PolicyId): PolicyLevel {
  return state.policies?.[policy] ?? DEFAULT_POLICIES[policy];
}

export function sellPriceMult(state: GameState): number {
  return PRICE_POLICY[policyLevel(state, 'price')].priceMult;
}

export function priceStarBonus(state: GameState): number {
  return PRICE_POLICY[policyLevel(state, 'price')].stars;
}

export function priceArrivalMult(state: GameState): number {
  return PRICE_POLICY[policyLevel(state, 'price')].arrivals;
}

export function wageMult(state: GameState): number {
  return WAGE_POLICY[policyLevel(state, 'wage')].wageMult;
}

export function staffSpeedMult(state: GameState): number {
  return WAGE_POLICY[policyLevel(state, 'wage')].speedMult;
}

/**
 * Policies change only while preparing: work speed applies minute by minute
 * but wages and the star bonus are booked at the end of the day, so a switch
 * mid-day would get the upside of one level and pay the price of another.
 */
export function canChangePolicy(state: GameState): boolean {
  return state.phase === 'preparation';
}

/** Sets a policy level. Refused for an unknown policy or level, and outside preparation (with a notice). */
export function setPolicy(state: GameState, policy: PolicyId, level: PolicyLevel): boolean {
  if (!(policy in DEFAULT_POLICIES) || !POLICY_LEVELS.includes(level)) return false;
  if (!canChangePolicy(state)) {
    state.events.push({ type: 'notify', level: 'error', text: 'Chỉ đổi mức giá/lương lúc chuẩn bị' });
    return false;
  }
  state.policies = { ...DEFAULT_POLICIES, ...state.policies, [policy]: level };
  return true;
}
