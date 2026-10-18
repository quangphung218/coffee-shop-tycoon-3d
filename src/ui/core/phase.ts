/** Day phase names, kept free of sim values so Settings can load without the HUD. */
import type { Phase } from '../../sim/types';

/** The four phases of a day, in order, as the HUD phase strip shows them. */
export const PHASE_STEPS: readonly { phase: Phase; label: string }[] = [
  { phase: 'preparation', label: 'Chuẩn bị' },
  { phase: 'opening', label: 'Mở cửa' },
  { phase: 'peak', label: 'Cao điểm' },
  { phase: 'closing', label: 'Đóng cửa' },
];

export function phaseLabel(phase: Phase): string {
  return phase === 'report' ? 'Tổng kết' : (PHASE_STEPS.find((s) => s.phase === phase)?.label ?? phase);
}
