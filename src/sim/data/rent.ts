import type { Difficulty } from '../types';

/**
 * Daily shop rent (tiền thuê mặt bằng), paid at the end of each day with the
 * wages: `base` at shop level 1, plus `perLevel` for each level above it (a
 * bigger shop pays for more floor). Tuning knobs for the economy (E-04).
 */
export const RENT: Readonly<Record<Difficulty, { base: number; perLevel: number }>> = {
  easy: { base: 250000, perLevel: 20000 },
  normal: { base: 400000, perLevel: 30000 },
  hard: { base: 550000, perLevel: 40000 },
};
