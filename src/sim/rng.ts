/** Anything that carries a mulberry32 state, normally the GameState itself. */
export interface RngHolder {
  rngState: number;
}

/** Normalises any number into a valid unsigned 32-bit seed. */
export function normalizeSeed(seed: number): number {
  return Math.floor(Math.abs(seed)) >>> 0;
}

/** One mulberry32 step: returns a value in [0, 1) and the next state. */
export function mulberry32(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: next };
}

/** Draws a float in [0, 1) and advances `holder.rngState`. */
export function random(holder: RngHolder): number {
  const r = mulberry32(holder.rngState);
  holder.rngState = r.state;
  return r.value;
}

/** Integer in [min, max] inclusive. */
export function randInt(holder: RngHolder, min: number, max: number): number {
  return min + Math.floor(random(holder) * (max - min + 1));
}

export function randRange(holder: RngHolder, min: number, max: number): number {
  return min + random(holder) * (max - min);
}

export function chance(holder: RngHolder, p: number): boolean {
  return random(holder) < p;
}

export function pick<T>(holder: RngHolder, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from empty list');
  return items[Math.floor(random(holder) * items.length)] as T;
}

/** Picks an index with probability proportional to its weight. */
export function weightedIndex(holder: RngHolder, weights: readonly number[]): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) return -1;
  let r = random(holder) * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i] ?? 0);
    if (r < 0) return i;
  }
  return weights.length - 1;
}
