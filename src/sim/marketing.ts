import { getCampaign } from './data/marketing';
import { payMarketing } from './economy';
import type { GameState, MarketingId } from './types';

/** Extra arrivals each marketer brings in at speed 1 (0.12 = +12%). */
export const MARKETER_BONUS = 0.12;

export type CampaignResult = { ok: true; cost: number } | { ok: false; reason: string };

function refuse(state: GameState, reason: string): CampaignResult {
  state.events.push({ type: 'notify', level: 'error', text: reason });
  return { ok: false, reason };
}

export function isCampaignActive(state: GameState, id: MarketingId): boolean {
  return state.campaigns.some((c) => c.id === id && c.daysLeft > 0);
}

/**
 * Starts a campaign during preparation: pays for it now and boosts arrivals
 * from today for `days` days. Refused outside preparation, while the same
 * campaign is still running, or when the money does not cover it.
 */
export function runCampaign(state: GameState, id: MarketingId): CampaignResult {
  const def = getCampaign(id);
  if (state.phase !== 'preparation') return refuse(state, 'Chỉ chạy marketing được khi chuẩn bị mở cửa');
  if (isCampaignActive(state, id)) return refuse(state, `${def.name} đang chạy`);
  if (!payMarketing(state, def.cost)) return refuse(state, `Không đủ tiền chạy ${def.name}`);
  state.campaigns.push({ id, daysLeft: def.days });
  state.events.push({ type: 'spend', kind: 'campaign', label: def.name, amount: def.cost, moneyLeft: state.money });
  state.events.push({ type: 'notify', level: 'success', text: `Đã chạy ${def.name} (${def.days} ngày)` });
  return { ok: true, cost: def.cost };
}

/** Called when a new day starts: yesterday counts as one campaign day; finished campaigns are dropped. */
export function advanceCampaigns(state: GameState): void {
  for (const c of state.campaigns) c.daysLeft -= 1;
  state.campaigns = state.campaigns.filter((c) => c.daysLeft > 0);
}

/** Arrival multiplier from running campaigns and staff on the marketer role. */
export function customerMultiplier(state: GameState): number {
  const campaigns = state.campaigns
    .filter((c) => c.daysLeft > 0)
    .reduce((m, c) => m * getCampaign(c.id).customerMult, 1);
  const marketers = state.staff
    .filter((s) => s.role === 'marketer')
    .reduce((sum, s) => sum + MARKETER_BONUS * s.speed, 0);
  return campaigns * (1 + marketers);
}
