import type { StaffTaskKind, StaffTraitId } from '../types';

export interface StaffTraitDef {
  id: StaffTraitId;
  name: string;
  description: string;
  /** Work speed multiplier per job kind; kinds left out work at 1. 'promote' scales the marketer's arrival bonus. */
  taskMult: Partial<Record<StaffTaskKind, number>>;
}

export const STAFF_TRAITS: Readonly<Record<StaffTraitId, StaffTraitDef>> = {
  quick: {
    id: 'quick',
    name: 'Nhanh nhẹn',
    description: 'Làm mọi việc nhanh hơn 6%.',
    taskMult: { brew: 1.06, take_order: 1.06, serve: 1.06, clean: 1.06, collect: 1.06, promote: 1.06 },
  },
  barista_pro: {
    id: 'barista_pro',
    name: 'Tay pha cứng',
    description: 'Pha đồ uống và nhận order nhanh hơn 10%.',
    taskMult: { brew: 1.1, take_order: 1.1 },
  },
  tidy: {
    id: 'tidy',
    name: 'Gọn gàng',
    description: 'Dọn bàn và thu tiền nhanh hơn 12%.',
    taskMult: { clean: 1.12, collect: 1.12 },
  },
  charming: {
    id: 'charming',
    name: 'Duyên dáng',
    description: 'Phục vụ nhanh hơn 10%; tiếp thị kéo khách hơn 10%.',
    taskMult: { serve: 1.1, promote: 1.1 },
  },
};

export const STAFF_TRAIT_IDS = Object.keys(STAFF_TRAITS) as StaffTraitId[];

const TRAIT_SALT = 0x165667b1;

/** A stable 32-bit hash of the seed and a staff id, independent of the game RNG (same mix as the persona hash). */
function staffHash(seed: number, id: number): number {
  let h = ((seed >>> 0) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ ((id + TRAIT_SALT) >>> 0), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h | 1, 0x27d4eb2f) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** The trait of staff member `id` in a game started from `seed`; never draws from rngState. */
export function staffTrait(seed: number, staffId: number): StaffTraitId {
  return STAFF_TRAIT_IDS[staffHash(seed, staffId) % STAFF_TRAIT_IDS.length]!;
}
