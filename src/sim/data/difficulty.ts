import type { Difficulty, DifficultyDef } from '../types';

export const DIFFICULTIES: Readonly<Record<Difficulty, DifficultyDef>> = {
  easy: {
    id: 'easy',
    name: 'Dễ',
    startMoney: 3000000,
    customerMult: 1.2,
    patienceMult: 1.3,
    priceMult: 0.9,
    startRating: 3.5,
  },
  normal: {
    id: 'normal',
    name: 'Thường',
    startMoney: 2000000,
    customerMult: 1,
    patienceMult: 1,
    priceMult: 1,
    startRating: 3,
  },
  hard: {
    id: 'hard',
    name: 'Khó',
    startMoney: 1200000,
    customerMult: 0.8,
    patienceMult: 0.75,
    priceMult: 1.15,
    startRating: 2.5,
  },
};
